// Pure shell analysis for Blast Radius: no `$`, so tests run it directly.
// It finds the parts of a command that can destroy or overwrite data and
// names their targets. Resolving those targets on disk happens in register.ts.

export type Word = {
  /** The word with quotes and escapes removed. */
  value: string
  /** An unquoted glob character (`*`, `?`, `[`): the shell would expand it. */
  hasGlob: boolean
  /** An unquoted `$` or backtick: the target depends on runtime values. */
  isDynamic: boolean
  /** Starts with an unquoted `~`. */
  hasTilde: boolean
}

export type Redirect = { op: string; target: Word }

export type Segment = { words: Word[]; redirects: Redirect[] }

export type Finding =
  | { kind: 'remove'; label: string; targets: Word[]; isRecursive: boolean }
  | { kind: 'stdin-targets'; label: string }
  | { kind: 'find-delete'; label: string; findArgs: string[] }
  | { kind: 'git-reset-hard'; label: string; gitArgs: string[]; ref: string }
  | { kind: 'git-clean'; label: string; gitArgs: string[]; flags: string[]; paths: string[] }
  | { kind: 'git-discard'; label: string; gitArgs: string[]; paths: string[] }
  | { kind: 'git-stash-drop'; label: string; gitArgs: string[]; isAll: boolean; ref?: string }
  | { kind: 'git-branch-delete'; label: string; gitArgs: string[]; branches: string[] }
  | { kind: 'git-push-force'; label: string; gitArgs: string[]; pushArgs: string[] }
  | { kind: 'overwrite'; label: string; targets: Word[] }
  | { kind: 'move-copy'; label: string; sources: Word[]; dest: Word; isDestDir: boolean }

export type Analysis = {
  findings: Finding[]
  /** The command changes directory before a finding, so relative paths may resolve elsewhere. */
  changesDirectory: boolean
}

const OPERATORS = ['&&', '||', ';;', ';', '|&', '|', '&', '\n']

/** Splits a command into simple commands (segments), tracking quoting per word. */
export function tokenize(command: string): Segment[] {
  const segments: Segment[] = []
  let words: Word[] = []
  let redirects: Redirect[] = []
  let pendingRedirect: string | null = null
  let cur: Word | null = null
  let i = 0

  const pushWord = () => {
    if (cur === null) return
    if (pendingRedirect !== null) {
      redirects.push({ op: pendingRedirect, target: cur })
      pendingRedirect = null
    } else {
      words.push(cur)
    }
    cur = null
  }
  const endSegment = () => {
    pushWord()
    if (words.length > 0 || redirects.length > 0) segments.push({ words, redirects })
    words = []
    redirects = []
    pendingRedirect = null
  }
  const current = (): Word | null => cur
  const ensure = (): Word => {
    if (cur === null) cur = { value: '', hasGlob: false, isDynamic: false, hasTilde: false }
    return cur
  }

  while (i < command.length) {
    const c = command[i]!

    if (c === '#' && cur === null) {
      while (i < command.length && command[i] !== '\n') i++
      continue
    }
    if (c === ' ' || c === '\t') {
      pushWord()
      i++
      continue
    }
    if (c === '\\' && command[i + 1] === '\n') {
      i += 2
      continue
    }
    const op = OPERATORS.find(o => command.startsWith(o, i))
    if (op !== undefined && !(op === '&' && command[i + 1] === '>')) {
      endSegment()
      i += op.length
      continue
    }
    // Redirections: [n]> [n]>| [n]>> &> &>> < <<
    const redir = /^(\d*>>|\d*>\||\d*>&\d*-?|&>>|&>|\d*>|\d*<<-?|\d*<&\d*-?|\d*<)/.exec(command.slice(i))
    if (redir !== null) {
      const pending = current()
      const isFd = pending !== null && /^\d+$/.test(pending.value) && !pending.isDynamic
      const fd = isFd ? pending.value : ''
      if (isFd) cur = null
      else pushWord()
      const text = redir[1]!
      i += text.length
      if (/>&\d*-?$/.test(text) || /<&/.test(text)) continue // fd duplication, no file
      pendingRedirect = fd + text
      continue
    }
    if (c === "'") {
      const end = command.indexOf("'", i + 1)
      const stop = end === -1 ? command.length : end
      ensure().value += command.slice(i + 1, stop)
      i = stop + 1
      continue
    }
    if (c === '"') {
      const w = ensure()
      i++
      while (i < command.length && command[i] !== '"') {
        const d = command[i]!
        if (d === '\\' && i + 1 < command.length && '"\\$`\n'.includes(command[i + 1]!)) {
          w.value += command[i + 1]
          i += 2
          continue
        }
        if (d === '$' || d === '`') w.isDynamic = true
        w.value += d
        i++
      }
      i++
      continue
    }
    if (c === '\\') {
      ensure().value += command[i + 1] ?? ''
      i += 2
      continue
    }
    if (c === '$' && command[i + 1] === '(') {
      // Keep a command substitution whole inside the word.
      const w = ensure()
      w.isDynamic = true
      let depth = 0
      while (i < command.length) {
        const d = command[i]!
        w.value += d
        i++
        if (d === '(') depth++
        if (d === ')' && --depth === 0) break
      }
      continue
    }
    if (c === '`') {
      const w = ensure()
      w.isDynamic = true
      const end = command.indexOf('`', i + 1)
      const stop = end === -1 ? command.length : end + 1
      w.value += command.slice(i, stop)
      i = stop
      continue
    }
    const w = ensure()
    if (c === '$') w.isDynamic = true
    if (c === '*' || c === '?' || c === '[') w.hasGlob = true
    if (c === '~' && w.value === '') w.hasTilde = true
    w.value += c
    i++
  }
  endSegment()
  return segments
}

const WRAPPERS = new Set(['sudo', 'doas', 'command', 'builtin', 'nohup', 'time', 'exec', 'nice', 'env', 'stdbuf', 'timeout'])
const WRAPPER_ARG_FLAGS: Record<string, Set<string>> = {
  sudo: new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-U']),
  nice: new Set(['-n']),
  timeout: new Set(['-s', '-k', '--signal', '--kill-after']),
  stdbuf: new Set(['-i', '-o', '-e']),
}

const base = (word: string) => word.slice(word.lastIndexOf('/') + 1)
const isAssignment = (w: Word) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(w.value)

/** Drops leading assignments and wrappers (`sudo`, `env`, `nice -n 5`), returning the real command words. */
function unwrap(words: readonly Word[]): Word[] {
  let rest = [...words]
  for (;;) {
    while (rest.length > 0 && isAssignment(rest[0]!)) rest.shift()
    const head = rest[0]
    if (head === undefined || !WRAPPERS.has(base(head.value))) return rest
    const name = base(head.value)
    rest.shift()
    const argFlags = WRAPPER_ARG_FLAGS[name] ?? new Set<string>()
    while (rest.length > 0 && (rest[0]!.value.startsWith('-') || (name === 'env' && isAssignment(rest[0]!)))) {
      const flag = rest.shift()!
      if (argFlags.has(flag.value)) rest.shift()
    }
    if (name === 'timeout' && rest.length > 0 && /^\d/.test(rest[0]!.value)) rest.shift()
  }
}

/** Splits arguments into flags and operands, honouring `--`. */
function splitArgs(args: readonly Word[], flagsWithValue: ReadonlySet<string> = new Set()) {
  const flags: string[] = []
  const operands: Word[] = []
  let isEndOfFlags = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (!isEndOfFlags && a.value === '--') {
      isEndOfFlags = true
      continue
    }
    if (!isEndOfFlags && a.value.startsWith('-') && a.value !== '-') {
      flags.push(a.value)
      if (flagsWithValue.has(a.value)) i++
      continue
    }
    operands.push(a)
  }
  return { flags, operands }
}

const hasShortFlag = (flags: readonly string[], letter: string) =>
  flags.some(f => /^-[A-Za-z]+$/.test(f) && f.includes(letter))

const shown = (words: readonly Word[]) => words.map(w => w.value).join(' ')

const FIND_ACTIONS = new Set(['-delete', '-exec', '-execdir', '-ok', '-okdir'])
const REMOVERS = new Set(['rm', 'unlink', 'rmdir', 'shred'])

function analyzeGit(args: Word[], label: string, out: Finding[]) {
  const gitArgs: string[] = []
  let i = 0
  while (i < args.length && args[i]!.value.startsWith('-')) {
    const v = args[i]!.value
    if (v === '-C' || v === '-c' || v === '--git-dir' || v === '--work-tree') {
      gitArgs.push(v, args[i + 1]?.value ?? '')
      i += 2
      continue
    }
    gitArgs.push(v)
    i++
  }
  const sub = args[i]?.value
  const rest = args.slice(i + 1)
  const { flags, operands } = splitArgs(rest)
  const values = rest.map(w => w.value)

  if (sub === 'reset' && flags.includes('--hard')) {
    out.push({ kind: 'git-reset-hard', label, gitArgs, ref: operands[0]?.value ?? 'HEAD' })
  } else if (sub === 'clean') {
    const isForced = flags.includes('--force') || hasShortFlag(flags, 'f')
    const isDryRun = flags.includes('--dry-run') || hasShortFlag(flags, 'n')
    if (isForced && !isDryRun) {
      const kept: string[] = []
      if (hasShortFlag(flags, 'd')) kept.push('-d')
      if (hasShortFlag(flags, 'x')) kept.push('-x')
      if (hasShortFlag(flags, 'X')) kept.push('-X')
      if (flags.filter(f => f === '-f' || f === '--force').length > 1 || /^-[a-zA-Z]*f[a-zA-Z]*f/.test(flags.join(''))) kept.push('-f')
      out.push({ kind: 'git-clean', label, gitArgs, flags: kept, paths: operands.map(w => w.value) })
    }
  } else if (sub === 'checkout') {
    const dash = values.indexOf('--')
    if (dash !== -1) {
      out.push({ kind: 'git-discard', label, gitArgs, paths: values.slice(dash + 1) })
    } else if (operands.length === 1 && operands[0]!.value === '.') {
      out.push({ kind: 'git-discard', label, gitArgs, paths: ['.'] })
    } else if (flags.includes('-f') || flags.includes('--force')) {
      out.push({ kind: 'git-discard', label, gitArgs, paths: [] })
    }
  } else if (sub === 'restore') {
    const touchesWorktree = flags.includes('--worktree') || flags.includes('-W') || !(flags.includes('--staged') || flags.includes('-S'))
    if (touchesWorktree) {
      const { operands: paths } = splitArgs(rest, new Set(['-s', '--source']))
      out.push({ kind: 'git-discard', label, gitArgs, paths: paths.map(w => w.value) })
    }
  } else if (sub === 'stash' && (operands[0]?.value === 'drop' || operands[0]?.value === 'clear')) {
    const isAll = operands[0]!.value === 'clear'
    const ref = operands[1]?.value
    out.push(ref === undefined ? { kind: 'git-stash-drop', label, gitArgs, isAll } : { kind: 'git-stash-drop', label, gitArgs, isAll, ref })
  } else if (sub === 'branch') {
    const isForceDelete = flags.includes('-D') || (flags.some(f => f === '-d' || f === '--delete') && flags.some(f => f === '-f' || f === '--force'))
    if (isForceDelete) out.push({ kind: 'git-branch-delete', label, gitArgs, branches: operands.map(w => w.value) })
  } else if (sub === 'push') {
    const isForced = flags.some(f => f === '--force' || f === '-f' || f.startsWith('--force-with-lease') || f === '--mirror' || f === '--delete' || f === '-d') ||
      operands.some(w => w.value.startsWith('+') || w.value.startsWith(':'))
    if (isForced) out.push({ kind: 'git-push-force', label, gitArgs, pushArgs: values })
  }
}

/** Finds destructive operations in a shell command. */
export function analyzeCommand(command: string, depth = 0): Analysis {
  const findings: Finding[] = []
  let changesDirectory = false
  let sawCd = false

  for (const segment of tokenize(command)) {
    const words = unwrap(segment.words)
    const label = shown(segment.words).slice(0, 160)
    const before = findings.length

    // Output redirections truncate their target (>> appends and is left alone).
    const truncated = segment.redirects
      .filter(r => />/.test(r.op) && !/>>/.test(r.op) && !/^\/dev\//.test(r.target.value))
      .map(r => r.target)
    if (truncated.length > 0) findings.push({ kind: 'overwrite', label: `${label} ${segment.redirects.map(r => `${r.op} ${r.target.value}`).join(' ')}`.trim(), targets: truncated })

    const head = words[0]
    if (head === undefined) continue
    const name = base(head.value)
    const args = words.slice(1)

    if (name === 'cd' || name === 'pushd' || name === 'popd') sawCd = true

    if ((name === 'bash' || name === 'sh' || name === 'zsh' || name === 'dash') && depth < 3) {
      const c = args.findIndex(a => /^-[a-z]*c$/.test(a.value))
      const script = c === -1 ? undefined : args[c + 1]
      if (script !== undefined) {
        const inner = analyzeCommand(script.value, depth + 1)
        findings.push(...inner.findings)
        changesDirectory ||= inner.changesDirectory
      }
    } else if (name === 'eval' && depth < 3) {
      const inner = analyzeCommand(args.map(a => a.value).join(' '), depth + 1)
      findings.push(...inner.findings)
    } else if (name === 'xargs') {
      const target = unwrap(args.filter(a => !a.value.startsWith('-')))
      if (target[0] !== undefined && REMOVERS.has(base(target[0].value))) {
        findings.push({ kind: 'stdin-targets', label })
      }
    } else if (REMOVERS.has(name)) {
      const { flags, operands } = splitArgs(args)
      const isRecursive = name === 'rm' && (flags.includes('--recursive') || hasShortFlag(flags, 'r') || hasShortFlag(flags, 'R'))
      findings.push({ kind: 'remove', label, targets: operands, isRecursive })
    } else if (name === 'find') {
      const values = args.map(a => a.value)
      const at = values.findIndex(v => FIND_ACTIONS.has(v))
      if (at !== -1) {
        const action = values[at]!
        const runs = values[at + 1] ?? ''
        if (action === '-delete' || REMOVERS.has(base(runs))) {
          findings.push({ kind: 'find-delete', label, findArgs: values.slice(0, at) })
        }
      }
    } else if (name === 'git') {
      analyzeGit(args, label, findings)
    } else if (name === 'mv' || name === 'cp') {
      const { flags, operands } = splitArgs(args, new Set(['-t', '--target-directory', '-S', '--suffix']))
      const isNoClobber = flags.some(f => f === '-n' || f === '--no-clobber' || f === '-i' || f === '--interactive' || f === '--update=none') || hasShortFlag(flags, 'n')
      const tIndex = args.findIndex(a => a.value === '-t' || a.value === '--target-directory')
      const tInline = flags.find(f => f.startsWith('--target-directory='))
      if (!isNoClobber) {
        if (tIndex !== -1 && args[tIndex + 1] !== undefined) {
          findings.push({ kind: 'move-copy', label, sources: operands, dest: args[tIndex + 1]!, isDestDir: true })
        } else if (tInline !== undefined) {
          findings.push({ kind: 'move-copy', label, sources: operands, dest: { value: tInline.slice(tInline.indexOf('=') + 1), hasGlob: false, isDynamic: false, hasTilde: false }, isDestDir: true })
        } else if (operands.length >= 2) {
          findings.push({ kind: 'move-copy', label, sources: operands.slice(0, -1), dest: operands[operands.length - 1]!, isDestDir: operands.length > 2 })
        }
      }
    } else if (name === 'dd') {
      const of = args.find(a => a.value.startsWith('of='))
      if (of !== undefined) findings.push({ kind: 'overwrite', label, targets: [{ ...of, value: of.value.slice(3) }] })
    } else if (name === 'truncate') {
      const { operands } = splitArgs(args, new Set(['-s', '--size', '-r', '--reference']))
      findings.push({ kind: 'overwrite', label, targets: operands })
    } else if (name === 'tee') {
      const { flags, operands } = splitArgs(args)
      if (!flags.some(f => f === '-a' || f === '--append') && !hasShortFlag(flags, 'a')) {
        const files = operands.filter(w => !/^\/dev\//.test(w.value))
        if (files.length > 0) findings.push({ kind: 'overwrite', label, targets: files })
      }
    } else if (name === 'sed' || name === 'perl') {
      const isInPlace = args.some(a => /^-[a-zA-Z]*i/.test(a.value) || a.value.startsWith('--in-place'))
      if (isInPlace) {
        const { operands } = splitArgs(args, new Set(['-e', '-f', '--expression', '--file']))
        const hasScriptFlag = args.some(a => a.value === '-e' || a.value === '--expression' || a.value === '-f')
        const files = hasScriptFlag ? operands : operands.slice(1)
        if (files.length > 0) findings.push({ kind: 'overwrite', label: `${label} (in-place edit)`, targets: files })
      }
    }

    if (sawCd && findings.length > before) changesDirectory = true
  }
  return { findings, changesDirectory }
}
