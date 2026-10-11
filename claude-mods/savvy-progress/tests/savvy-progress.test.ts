import { describe, expect, mock, test } from 'claude-code/testing'

import { bar, elapsed, shortModel, taskProgress } from '../hooks/progress'

describe('progress math', () => {
  test('determinate bars fill by fraction', async () => {
    expect(bar(10, 0, 0)).toBe('░░░░░░░░░░')
    expect(bar(10, 0.5, 0)).toBe('█████░░░░░')
    expect(bar(10, 1, 0)).toBe('██████████')
    expect(bar(10, 2, 0)).toBe('██████████')
  })

  test('indeterminate bars sweep and keep their width', async () => {
    const frames = [0, 1, 2, 8, 12].map(f => bar(10, null, f))
    for (const f of frames) expect(f.length).toBe(10)
    expect(frames[0]).toBe('▓▓░░░░░░░░')
    expect(frames[3]).toBe('░░░░░░░░▓▓')
    expect(frames[4]).toBe('░░░░▓▓░░░░')
  })

  test('task counts and labels', async () => {
    const p = taskProgress([
      { id: '1', subject: 'a', status: 'completed', activeForm: null },
      { id: '2', subject: 'b', status: 'in_progress', activeForm: 'Writing b' },
      { id: '3', subject: 'c', status: 'pending', activeForm: null },
    ])
    expect([p.done, p.total, p.active?.activeForm]).toEqual([1, 3, 'Writing b'])
    expect(taskProgress([]).fraction).toBeNull()
    expect(elapsed(125_000)).toBe('2m 05s')
    expect(shortModel('claude-haiku-5-5-20260101')).toBe('haiku-5-5')
  })
})

const USAGE = { input_tokens: 100, output_tokens: 500, cache_read_input_tokens: 20_000, cache_creation_input_tokens: 0, model: 'claude-haiku-5-5' }
const BAND = { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 120 } as never

describe('band', () => {
  test('shows the bar, tasks and a live sub-agent row', async ($, on) => {
    mock.clock(on)
    on('session.model', () => ({ value: 'claude-main' }))
    on('agent.list', () => ({ value: [{ id: 'ag1', description: 'Find auth code', type: 'Explore', status: 'running' as const }] }))
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.step', async function* ($, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'tool_use' as const, usage: USAGE }
    })
    on('tool.call', { tool: 'TaskCreate' }, ($, e) => ({ result: { task: { id: 't1', subject: e.subject } } }))
    on('tool.call', { tool: 'Grep' }, () => ({ result: { mode: 'files_with_matches' as const, filenames: [], numFiles: 0 } }))

    await $.turn.start({ text: 'go', turnId: 'T' })
    for await (const _ of $.turn.step({ turnId: 'T', index: 0, model: 'claude-main', messageCount: 1 })) void _
    await $.tool.call({ tool: 'TaskCreate', subject: 'Write tests', description: 'd', activeForm: 'Writing tests' })
    for await (const _ of $.turn.step({ turnId: 'S', index: 0, model: 'claude-haiku-5-5', messageCount: 1, agentId: 'ag1' })) void _

    const ui = await $.ui.mount({ plugin: 'savvy-progress', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    expect(await ui.find({ type: 'Text', text: /0\/1 tasks/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /haiku-5-5 · thinking · step 1 · ctx 20k · out 500/ })).toBeDefined()
    await ui.unmount()
  })

  test('stays out of the way when idle with no agents', async ($, on) => {
    mock.clock(on)
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return h(Text, null, 'engine band') as never
    })
    const ui = await $.ui.mount({ plugin: 'savvy-progress', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 120 } as never })
    expect(await ui.find({ type: 'Text', text: /step/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
    await ui.unmount()
  })
})
