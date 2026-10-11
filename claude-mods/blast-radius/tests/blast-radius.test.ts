import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { analyzeCommand, tokenize } from '../hooks/analyze'

const kinds = (command: string) => analyzeCommand(command).findings.map(f => f.kind)

describe('analyzeCommand', () => {
  test('flags rm and its wrappers', async () => {
    expect(kinds('rm -rf build')).toEqual(['remove'])
    expect(kinds('sudo rm -f /tmp/x')).toEqual(['remove'])
    expect(kinds('FOO=1 command rm a b')).toEqual(['remove'])
    expect(kinds('cd src && /bin/rm old.ts')).toEqual(['remove'])
    expect(analyzeCommand('cd src && rm old.ts').changesDirectory).toBe(true)
    const f = analyzeCommand('rm -r -- "my dir" *.log').findings[0]
    expect(f?.kind === 'remove' && f.isRecursive).toBe(true)
    expect(f?.kind === 'remove' && f.targets.map(t => [t.value, t.hasGlob])).toEqual([['my dir', false], ['*.log', true]])
  })

  test('flags git operations that lose work', async () => {
    expect(kinds('git reset --hard')).toEqual(['git-reset-hard'])
    expect(kinds('git reset --soft HEAD~1')).toEqual([])
    expect(kinds('git clean -fdx')).toEqual(['git-clean'])
    expect(kinds('git clean -n')).toEqual([])
    expect(kinds('git checkout -- src/a.ts')).toEqual(['git-discard'])
    expect(kinds('git checkout main')).toEqual([])
    expect(kinds('git restore --staged a.ts')).toEqual([])
    expect(kinds('git restore a.ts')).toEqual(['git-discard'])
    expect(kinds('git stash drop')).toEqual(['git-stash-drop'])
    expect(kinds('git branch -D feature')).toEqual(['git-branch-delete'])
    expect(kinds('git push --force origin main')).toEqual(['git-push-force'])
    expect(kinds('git push origin main')).toEqual([])
    expect(kinds('git -C ../other reset --hard origin/main')).toEqual(['git-reset-hard'])
  })

  test('flags overwrites but not appends or fd duplication', async () => {
    expect(kinds('echo hi > notes.txt')).toEqual(['overwrite'])
    expect(kinds('echo hi >> notes.txt')).toEqual([])
    expect(kinds('make 2>&1 | tee build.log')).toEqual(['overwrite'])
    expect(kinds('make 2>&1 | tee -a build.log')).toEqual([])
    expect(kinds('ls > /dev/null 2>&1')).toEqual([])
    expect(kinds('sed -i "s/a/b/" file.txt')).toEqual(['overwrite'])
    expect(kinds('mv a.txt b.txt')).toEqual(['move-copy'])
    expect(kinds('cp -n a.txt b.txt')).toEqual([])
    expect(kinds('dd if=/dev/zero of=disk.img bs=1M count=1')).toEqual(['overwrite'])
  })

  test('looks inside bash -c, find and xargs', async () => {
    expect(kinds('bash -c "rm -rf dist"')).toEqual(['remove'])
    expect(kinds('find . -name "*.tmp" -delete')).toEqual(['find-delete'])
    expect(kinds('find . -name "*.tmp" -exec rm {} \\;')).toEqual(['find-delete'])
    expect(kinds('find . -name "*.tmp" -print')).toEqual([])
    expect(kinds('git ls-files | xargs rm')).toEqual(['stdin-targets'])
  })

  test('leaves read-only commands alone', async () => {
    expect(kinds('ls -la && git status && cat README.md | grep rm')).toEqual([])
    expect(kinds('echo "rm -rf /"')).toEqual([])
    expect(kinds('npm run format # rm nothing')).toEqual([])
  })

  test('marks dynamic targets', async () => {
    const [seg] = tokenize('rm -rf "$DIR"/cache $(cat list)')
    expect(seg?.words.slice(2).map(w => w.isDynamic)).toEqual([true, true])
  })
})

const NO_OUTPUT = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

function engine(on: On, answer: string, files: Record<string, number> = {}) {
  const ran: string[] = []
  const asked: string[] = []
  mock.env(on, { HOME: '/home/me' })
  mock.clock(on)
  on('session.cwd', () => ({ value: '/work' }))
  on('fs.exists', ($, e) => ({ value: e.path in files }))
  on('fs.stat', ($, e) => ({ value: { kind: 'file' as const, size: files[e.path] ?? 0, mtimeMs: 0, isLink: false } }))
  on('fs.read', () => ({ value: 'old line\n' }))
  on('process.run', () => ({ value: NO_OUTPUT }))
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const question = e.questions[0]?.question ?? ''
    asked.push(question)
    return { result: { questions: e.questions, answers: { [question]: answer } } }
  })
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    ran.push(e.command)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  on('tool.call', { tool: 'Write' }, ($, e) => {
    ran.push(`write ${e.file_path}`)
    return { result: { type: 'update' as const, filePath: e.file_path, content: e.content, structuredPatch: [], originalFile: null } }
  })
  return { ran, asked }
}

describe('confirmation', () => {
  test('runs a destructive command only after "Run it"', async ($, on) => {
    const { ran, asked } = engine(on, 'Run it', { '/work/notes.txt': 2048 })
    await $.tool.call({ tool: 'Bash', command: 'rm notes.txt' })
    expect(ran).toEqual(['rm notes.txt'])
    expect(asked[0]).toContain('notes.txt (2.0 KB)')
    expect(asked[0]).toContain('1 file(s) affected')
  })

  test('blocks the command when the user cancels', async ($, on) => {
    const { ran } = engine(on, 'Cancel', { '/work/notes.txt': 10 })
    const r = await $.tool.call({ tool: 'Bash', command: 'rm notes.txt' })
    expect(ran).toEqual([])
    expect(JSON.stringify(r)).toContain('did not confirm')
  })

  test('treats free-text answers as a refusal', async ($, on) => {
    const { ran } = engine(on, 'maybe later')
    await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })
    expect(ran).toEqual([])
  })

  test('names targets it cannot resolve', async ($, on) => {
    const { asked } = engine(on, 'Cancel')
    await $.tool.call({ tool: 'Bash', command: 'rm -rf "$BUILD_DIR"' })
    expect(asked[0]).toContain('cannot preview')
  })

  test('does not ask for a redirect into a new file', async ($, on) => {
    const { ran, asked } = engine(on, 'Cancel')
    await $.tool.call({ tool: 'Bash', command: 'echo hi > fresh.txt' })
    expect(asked).toEqual([])
    expect(ran).toEqual(['echo hi > fresh.txt'])
  })

  test('asks before Write replaces an existing file', async ($, on) => {
    const { ran, asked } = engine(on, 'Cancel', { '/work/a.txt': 9 })
    await $.tool.call({ tool: 'Write', file_path: '/work/a.txt', content: 'new\n' })
    expect(ran).toEqual([])
    expect(asked[0]).toContain('Overwrite /work/a.txt')
  })

  test('lets Write create a new file without asking', async ($, on) => {
    const { ran, asked } = engine(on, 'Cancel')
    await $.tool.call({ tool: 'Write', file_path: '/work/new.txt', content: 'x' })
    expect(asked).toEqual([])
    expect(ran).toEqual(['write /work/new.txt'])
  })
})
