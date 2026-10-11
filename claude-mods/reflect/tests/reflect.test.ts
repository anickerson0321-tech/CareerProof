import { describe, expect, mock, test } from 'claude-code/testing'

import { SECTION, cleanDraft, detectFeedback, draftRuleLocally, insertRule } from '../hooks/detect'

describe('detectFeedback', () => {
  test('catches corrections, prohibitions and preferences', async () => {
    expect(detectFeedback("no, don't touch the lockfile")).toBe('prohibition')
    expect(detectFeedback('Please never commit directly to main.')).toBe('prohibition')
    expect(detectFeedback('stop adding comments to every line')).toBe('prohibition')
    expect(detectFeedback("That's wrong, the tests live in spec/")).toBe('correction')
    expect(detectFeedback('I said tabs, not spaces')).toBe('correction')
    expect(detectFeedback('use pnpm instead')).toBe('preference')
    expect(detectFeedback('I prefer named exports')).toBe('preference')
  })

  test('ignores ordinary requests and thanks', async () => {
    expect(detectFeedback('No problem, thanks!')).toBeNull()
    expect(detectFeedback('Add a button so users can stop the upload')).toBeNull()
    expect(detectFeedback('Make it so users don\'t see the banner twice')).toBeNull()
    expect(detectFeedback('/reflect')).toBeNull()
    expect(detectFeedback('Looks good, ship it')).toBeNull()
  })
})

describe('drafting', () => {
  test('local drafts trim the lead-in and keep one sentence', async () => {
    expect(draftRuleLocally('no, use pnpm instead of npm. it is faster')).toBe('Use pnpm instead of npm.')
    expect(draftRuleLocally("please don't reformat unrelated files!!")).toBe("Don't reformat unrelated files.")
  })

  test('model drafts are cleaned, and NONE means no rule', async () => {
    expect(cleanDraft('- "Use pnpm for installs."\n')).toBe('Use pnpm for installs.')
    expect(cleanDraft('NONE')).toBeNull()
  })
})

describe('insertRule', () => {
  test('creates the section at the end', async () => {
    expect(insertRule('# Project\n\nNotes.\n', 'Use pnpm.')).toBe(`# Project\n\nNotes.\n\n${SECTION}\n\n- Use pnpm.\n`)
    expect(insertRule('', 'Use pnpm.')).toBe(`${SECTION}\n\n- Use pnpm.\n`)
  })

  test('appends inside an existing section, before the next heading', async () => {
    const md = `# P\n\n${SECTION}\n\n- One.\n\n## Other\n\ntext\n`
    expect(insertRule(md, 'Two.')).toBe(`# P\n\n${SECTION}\n\n- One.\n- Two.\n\n## Other\n\ntext\n`)
  })

  test('skips duplicates regardless of case and punctuation', async () => {
    expect(insertRule(`${SECTION}\n\n- Use pnpm.\n`, 'use PNPM')).toBeNull()
  })
})

describe('banner', () => {
  test('feedback becomes a drafted rule that Save writes to CLAUDE.md', async ($, on) => {
    const clock = mock.clock(on)
    mock.env(on, { HOME: '/home/me' })
    const session = mock.session(on)
    const writes: Record<string, string> = {}
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('ui.toast', () => ({ value: undefined }))
    on('session.root', () => ({ value: '/repo' }))
    on('session.model', () => ({ value: 'claude-test' }))
    on('session.messages', () => ({ value: [{ role: 'assistant' as const, text: 'Ran npm install.', toolUses: [] }] }))
    on('model.complete', () => ({ value: { isAnswered: true as const, text: 'Use pnpm, not npm, to install packages.', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }))
    on('fs.exists', () => ({ value: true }))
    on('fs.read', () => ({ value: '# Repo\n' }))
    on('fs.write', ($, e) => {
      writes[e.path] = e.text
      return { value: undefined }
    })

    await $.prompt.submit({ text: 'no, use pnpm instead of npm', wait: false, origin: { kind: 'composer' } } as never)
    await clock.advance(0)

    const props = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100 } as never
    const ui = await $.ui.mount({ plugin: 'reflect', surface: 'terminal', component: 'AbovePrompt', props })
    expect(await ui.find({ type: 'Text', text: /Use pnpm, not npm/ })).toBeDefined()
    await ui.press({ key: 'save' })
    expect(writes['/repo/CLAUDE.md']).toBe(`# Repo\n\n${SECTION}\n\n- Use pnpm, not npm, to install packages.\n`)
    expect(JSON.stringify(session.appended())).toContain('Follow it from now on')
    await ui.unmount()
  })
})
