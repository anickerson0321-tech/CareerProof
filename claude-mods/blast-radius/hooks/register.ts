import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Decision } from '../types'
import { analyzeCommand } from './analyze'
import type { Finding, Word } from './analyze'

const decisions = atom({ plugin: 'blast-radius', key: 'decisions' } as const, [])
const isPaused = atom({ plugin: 'blast-radius', key: 'isPaused' } as const, false)

const RUN = 'Run it'
const CANCEL = 'Cancel'

type Preview = { lines: string[]; fileCount: number; isConfirmNeeded: boolean }

const joinPath = (dir: string, p: string) => (p.startsWith('/') ? p : `${dir.replace(/\/$/, '')}/${p}`)

const kb = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`

const linesOf = (out: string) => out.split('\n').filter(l => l.length > 0)

async function expand($: EngineInterface, cwd: string, home: string, words: readonly Word[]) {
  const paths: string[] = []
  const unresolved: string[] = []
  for (const w of words) {
    if (w.isDynamic) {
      unresolved.push(w.value)
      continue
    }
    const value = w.hasTilde ? home + w.value.slice(1) : w.value
    if (!w.hasGlob) {
      paths.push(value)
      continue
    }
    // Glob expansion without evaluating anything: the pattern is a positional
    // parameter, expanded unquoted with IFS empty (no splitting, no substitution).
    const r = await $.process.run(
      ['bash', '-c', 'shopt -s nullglob dotglob; IFS=; for p in "$@"; do for f in $p; do printf "%s\\n" "$f"; done; done', '_', value],
      { cwd, timeoutMs: 5000 },
    )
    const matched = linesOf(r.stdout)
    if (matched.length === 0) unresolved.push(`${value} (matches nothing)`)
    paths.push(...matched)
  }
  return { paths, unresolved }
}

async function describePath($: EngineInterface, cwd: string, p: string, isRecursive: boolean, out: string[], maxFiles: number) {
  const full = joinPath(cwd, p)
  if (!(await $.fs.exists(full))) {
    out.push(`    ${p} (does not exist)`)
    return 0
  }
  const st = await $.fs.stat(full)
  if (st.kind !== 'dir') {
    out.push(`    ${p} (${kb(st.size)}${st.isLink ? ', symlink' : ''})`)
    return 1
  }
  if (!isRecursive) {
    out.push(`    ${p}/ (directory; only removed if empty)`)
    return 0
  }
  const r = await $.process.run(['find', full, '-mindepth', '1', '-not', '-type', 'd'], { timeoutMs: 10000 })
  const files = linesOf(r.stdout)
  const more = r.isStdoutTruncated ? '+' : ''
  out.push(`    ${p}/ (directory, ${files.length}${more} files)`)
  for (const f of files.slice(0, maxFiles)) out.push(`      ${f.startsWith(cwd + '/') ? f.slice(cwd.length + 1) : f}`)
  if (files.length > maxFiles) out.push(`      … and ${files.length - maxFiles}${more} more`)
  return files.length
}

async function git($: EngineInterface, cwd: string, gitArgs: readonly string[], args: readonly string[]) {
  const r = await $.process.run(['git', ...gitArgs, ...args], { cwd, timeoutMs: 10000 })
  return r.exitCode === 0 ? linesOf(r.stdout) : null
}

function listInto(out: string[], items: readonly string[], empty: string, maxFiles: number) {
  if (items.length === 0) out.push(`    ${empty}`)
  for (const it of items.slice(0, maxFiles)) out.push(`    ${it}`)
  if (items.length > maxFiles) out.push(`    … and ${items.length - maxFiles} more`)
}

async function preview($: EngineInterface, cwd: string, finding: Finding, maxFiles: number): Promise<Preview> {
  const home = (await $.env.get('HOME')) ?? '~'
  const lines: string[] = []
  let fileCount = 0
  let isConfirmNeeded = true

  switch (finding.kind) {
    case 'remove': {
      lines.push(`  Delete${finding.isRecursive ? ' (recursive)' : ''}: ${finding.label}`)
      const { paths, unresolved } = await expand($, cwd, home, finding.targets)
      for (const p of paths) fileCount += await describePath($, cwd, p, finding.isRecursive, lines, maxFiles)
      for (const u of unresolved) lines.push(`    ${u}  ← resolved only when the command runs; cannot preview`)
      break
    }
    case 'stdin-targets':
      lines.push(`  Delete via xargs: ${finding.label}`, '    Targets arrive on stdin when the command runs; cannot preview them.')
      break
    case 'find-delete': {
      lines.push(`  Delete via find: ${finding.label}`)
      const unsafe = finding.findArgs.some(a => /^-(fprint|fprintf|fls|exec|execdir|ok|okdir|delete)$/.test(a))
      if (unsafe) {
        lines.push('    The find expression has other actions; not dry-running it.')
      } else {
        const r = await $.process.run(['find', ...finding.findArgs, '-print'], { cwd, timeoutMs: 10000 })
        const matched = linesOf(r.stdout)
        fileCount += matched.length
        listInto(lines, matched, '(matches nothing right now)', maxFiles)
      }
      break
    }
    case 'git-reset-hard': {
      lines.push(`  Discard uncommitted changes (git reset --hard ${finding.ref}):`)
      const changed = await git($, cwd, finding.gitArgs, ['diff', '--name-status', finding.ref])
      const staged = await git($, cwd, finding.gitArgs, ['diff', '--cached', '--name-status', finding.ref])
      const all = [...new Set([...(changed ?? []), ...(staged ?? [])])]
      if (changed === null) lines.push('    Could not read git status here.')
      else listInto(lines, all, '(no tracked changes would be lost)', maxFiles)
      fileCount += all.length
      if (finding.ref !== 'HEAD') {
        const commits = await git($, cwd, finding.gitArgs, ['log', '--oneline', `${finding.ref}..HEAD`])
        if (commits !== null && commits.length > 0) {
          lines.push(`  Commits moved off the branch (${commits.length}):`)
          listInto(lines, commits, '', maxFiles)
        }
      }
      break
    }
    case 'git-clean': {
      lines.push(`  Delete untracked files (${finding.label}):`)
      const dry = await git($, cwd, finding.gitArgs, ['clean', '-n', ...finding.flags, ...(finding.paths.length > 0 ? ['--', ...finding.paths] : [])])
      const items = (dry ?? []).map(l => l.replace(/^Would remove /, ''))
      fileCount += items.length
      if (dry === null) lines.push('    Could not dry-run git clean here.')
      else listInto(lines, items, '(nothing to clean)', maxFiles)
      break
    }
    case 'git-discard': {
      lines.push(`  Discard working-tree changes (${finding.label}):`)
      const items = await git($, cwd, finding.gitArgs, ['diff', '--name-status', '--', ...finding.paths])
      fileCount += items?.length ?? 0
      if (items === null) lines.push('    Could not read git status here.')
      else listInto(lines, items, '(no unstaged changes would be lost)', maxFiles)
      if (items !== null && items.length === 0 && finding.paths.length > 0) isConfirmNeeded = false
      break
    }
    case 'git-stash-drop': {
      lines.push(`  Drop stash ${finding.isAll ? 'entries (all)' : (finding.ref ?? 'stash@{0}')}:`)
      const list = (await git($, cwd, finding.gitArgs, ['stash', 'list'])) ?? []
      const items = finding.isAll ? list : list.filter(l => l.startsWith(finding.ref ?? 'stash@{0}'))
      fileCount += items.length
      listInto(lines, items, '(no matching stash entries)', maxFiles)
      break
    }
    case 'git-branch-delete': {
      lines.push(`  Force-delete branches: ${finding.branches.join(', ')}`)
      for (const b of finding.branches) {
        const unmerged = await git($, cwd, finding.gitArgs, ['log', '--oneline', b, '--not', '--remotes', 'HEAD'])
        lines.push(`    ${b}: ${unmerged === null ? 'not found' : `${unmerged.length} commit(s) not on any remote or HEAD`}`)
        for (const c of (unmerged ?? []).slice(0, 5)) lines.push(`      ${c}`)
      }
      break
    }
    case 'git-push-force':
      lines.push(`  Force push / remote delete: git push ${finding.pushArgs.join(' ')}`, '    Remote history may be overwritten; this cannot be previewed locally.')
      break
    case 'overwrite':
    case 'move-copy': {
      const targets: string[] = []
      const notes: string[] = []
      if (finding.kind === 'overwrite') {
        const { paths, unresolved } = await expand($, cwd, home, finding.targets)
        targets.push(...paths)
        notes.push(...unresolved)
      } else {
        const { paths: dest, unresolved } = await expand($, cwd, home, [finding.dest])
        notes.push(...unresolved)
        const d = dest[0]
        if (d !== undefined) {
          const full = joinPath(cwd, d)
          const isDir = (await $.fs.exists(full)) && (await $.fs.stat(full)).kind === 'dir'
          if (isDir || finding.isDestDir) {
            const { paths: sources } = await expand($, cwd, home, finding.sources)
            for (const s of sources) targets.push(`${d.replace(/\/$/, '')}/${s.slice(s.lastIndexOf('/') + 1)}`)
          } else {
            targets.push(d)
          }
        }
      }
      const existing: string[] = []
      for (const t of targets) {
        const full = joinPath(cwd, t)
        if ((await $.fs.exists(full)) && (await $.fs.stat(full)).kind === 'file') existing.push(t)
      }
      if (existing.length === 0 && notes.length === 0) {
        isConfirmNeeded = false
        break
      }
      lines.push(`  Overwrite existing files: ${finding.label}`)
      for (const t of existing) fileCount += await describePath($, cwd, t, false, lines, maxFiles)
      for (const n of notes) lines.push(`    ${n}  ← resolved only when the command runs; cannot preview`)
      break
    }
  }
  return { lines, fileCount, isConfirmNeeded }
}

async function confirm($: EngineInterface, tool: string, summary: string, body: readonly string[]) {
  const question = [`Blast Radius: ${tool} will change or delete data.`, ...body, '', 'Run it?'].join('\n')
  let answer: string
  try {
    answer = await $.ui.ask(question, { header: 'Blast radius', options: [RUN, CANCEL] })
  } catch {
    answer = '(dismissed or no one to ask)'
  }
  const isApproved = answer === RUN
  const decision: Decision = { at: await $.clock.now(), tool, summary: summary.slice(0, 200), isApproved }
  await update($, decisions, list => [...list, decision].slice(-50))
  return { isApproved, answer }
}

export const register: Register = (on, options) => {
  const maxFiles = Math.max(5, Number(options.maxPreviewFiles ?? 25))
  const confirmOverwrites = options.confirmOverwrites !== false

  const denial = (answer: string) =>
    `Blast Radius: the user did not confirm this destructive operation (answer: ${answer}). Nothing ran. Do not retry it or work around it; ask the user how to proceed.`

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (await read($, isPaused)) return next(e)
    const analysis = analyzeCommand(e.command)
    if (analysis.findings.length === 0) return next(e)

    const cwd = await $.session.cwd()
    const body: string[] = [`  $ ${e.command.length > 300 ? e.command.slice(0, 300) + ' …' : e.command}`, `  in ${cwd}`]
    if (analysis.changesDirectory) body.push('  Note: the command changes directory first; relative paths below are resolved from the directory above.')
    let isConfirmNeeded = false
    let fileCount = 0
    for (const f of analysis.findings) {
      if ((f.kind === 'overwrite' || f.kind === 'move-copy') && !confirmOverwrites) continue
      const p = await preview($, cwd, f, maxFiles)
      if (!p.isConfirmNeeded) continue
      isConfirmNeeded = true
      fileCount += p.fileCount
      body.push(...p.lines)
    }
    if (!isConfirmNeeded) return next(e)
    body.push(`  ${fileCount} file(s) affected in total.`)

    const { isApproved, answer } = await confirm($, 'Bash', e.command, body)
    return isApproved ? next(e) : { deny: denial(answer) }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'Blast Radius could not check this command, so it was blocked. Ask the user to run it or to pause Blast Radius with /blast-radius pause.' },
  )

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    if (!confirmOverwrites || (await read($, isPaused))) return next(e)
    const cwd = await $.session.cwd()
    const full = joinPath(cwd, e.file_path)
    if (!(await $.fs.exists(full))) return next(e)
    const st = await $.fs.stat(full)
    if (st.kind !== 'file') return next(e)
    const old = await $.fs.read(full)
    if (old === e.content) return next(e)
    const oldLines = old.split('\n').length
    const newLines = e.content.split('\n').length
    const body = [
      `  Overwrite ${e.file_path}`,
      `    now: ${oldLines} lines, ${kb(st.size)}`,
      `    after: ${newLines} lines, ${kb(new TextEncoder().encode(e.content).length)}`,
      '  The whole file is replaced; this is not an in-place edit.',
    ]
    const { isApproved, answer } = await confirm($, 'Write', e.file_path, body)
    return isApproved ? next(e) : { deny: denial(answer) }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'Blast Radius could not check this overwrite, so it was blocked. Ask the user how to proceed.' },
  )

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'blast-radius',
      description: 'Blast Radius: show recent confirmations, or pause/resume checks (pause | resume)',
      argumentHint: '[pause|resume]',
    })
    return next(e)
  })

  on('command.run', { command: 'blast-radius' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'pause') {
      await update($, isPaused, () => true)
      return { text: 'Blast Radius paused for this session. Destructive commands run without confirmation until /blast-radius resume.' }
    }
    if (arg === 'resume') {
      await update($, isPaused, () => false)
      return { text: 'Blast Radius resumed: destructive commands and overwrites need your confirmation.' }
    }
    const list = await read($, decisions)
    const paused = await read($, isPaused)
    const now = await $.clock.now()
    const rows = list.slice(-15).reverse().map(d => {
      const mins = Math.round((now - d.at) / 60000)
      return `  ${d.isApproved ? 'approved' : 'blocked '}  ${d.tool.padEnd(5)}  ${mins}m ago  ${d.summary.slice(0, 90)}`
    })
    return {
      text: [
        `Blast Radius is ${paused ? 'PAUSED' : 'on'}. Checks: rm/unlink/rmdir/shred, find -delete, xargs rm, git reset --hard, git clean -f, git checkout/restore discards, git stash drop/clear, git branch -D, force pushes, and overwrites (> redirects, tee, dd, truncate, sed -i, mv/cp onto existing files, Write onto existing files).`,
        rows.length > 0 ? 'Recent decisions:' : 'No confirmations yet this session.',
        ...rows,
      ].join('\n'),
    }
  })
}
