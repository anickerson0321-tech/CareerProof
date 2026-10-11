import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Candidate, SavedRule } from '../types'
import { cleanDraft, detectFeedback, draftRuleLocally, insertRule } from './detect'
import type { FeedbackKind } from './detect'

const candidate = atom({ plugin: 'reflect', key: 'candidate' } as const, null)
const saved = atom({ plugin: 'reflect', key: 'saved' } as const, [])
const isOff = atom({ plugin: 'reflect', key: 'isOff' } as const, false)

type Target = 'project' | 'global'

const DRAFT_SYSTEM =
  'You turn a developer\'s feedback to a coding assistant into one standing rule for the assistant\'s CLAUDE.md instructions file. ' +
  'Write a single imperative sentence of at most 25 words that generalizes the feedback beyond this one moment (name the tool, file type or situation it applies to). ' +
  'Keep the developer\'s intent exactly; do not add requirements. If the feedback only concerns this one moment and would not make a lasting rule, reply NONE. Reply with the rule alone.'

async function claudeMdPath($: EngineInterface, target: Target) {
  if (target === 'global') {
    const home = (await $.env.get('HOME')) ?? ''
    return `${home}/.claude/CLAUDE.md`
  }
  return `${await $.session.root()}/CLAUDE.md`
}

async function draft($: EngineInterface, c: Candidate, useModel: boolean) {
  let rule: string | null = draftRuleLocally(c.feedback)
  if (useModel) {
    const messages = await $.session.messages()
    const previous = [...messages].reverse().find(m => m.role === 'assistant' && m.text.trim().length > 0)
    const context = previous === undefined ? '' : `The assistant's previous reply (excerpt):\n${previous.text.slice(-1500)}\n\n`
    const r = await $.model.complete({
      model: await $.session.model(),
      system: DRAFT_SYSTEM,
      prompt: `${context}The developer's feedback:\n${c.feedback}`,
      maxTokens: 120,
      timeoutMs: 20_000,
    })
    if (r.isAnswered) rule = cleanDraft(r.text)
  }
  await update($, candidate, cur => {
    if (cur === null || cur.id !== c.id) return cur
    return rule === null ? null : { ...cur, rule, isDrafting: false }
  })
}

async function saveRule($: EngineInterface, rule: string, target: Target) {
  const path = await claudeMdPath($, target)
  const existing = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
  const next = insertRule(existing, rule)
  if (next === null) {
    $.ui.toast(`Reflect: that rule is already in ${path}.`)
  } else {
    await $.fs.write(path, next)
    const entry: SavedRule = { rule, path, at: await $.clock.now() }
    await update($, saved, list => [...list, entry].slice(-50))
    // CLAUDE.md is read at session start: tell the model now so the rule applies in this session too.
    await $.session.append({
      message: { type: 'user', content: [{ type: 'text', text: `The user approved a standing rule and it was saved to ${path}. Follow it from now on: ${rule}` }] },
    })
    $.ui.toast(`Reflect: rule saved to ${path}.`)
  }
  await update($, candidate, () => null)
}

export const register: Register = (on, options) => {
  const defaultTarget: Target = options.target === 'global' ? 'global' : 'project'
  const useModel = options.draftWithModel !== false

  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    if (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge') return result
    if (await read($, isOff)) return result
    const kind: FeedbackKind | null = detectFeedback(e.text)
    if (kind === null) return result
    const c: Candidate = { id: String(await $.clock.now()), feedback: e.text.trim(), kind, rule: null, isDrafting: true, isEditing: false }
    await update($, candidate, () => c)
    // Draft outside this dispatch so the prompt is never held up.
    $.clock.after(0, () => {
      void draft($, c, useModel).catch(() => update($, candidate, cur => (cur?.id === c.id ? { ...cur, rule: draftRuleLocally(c.feedback), isDrafting: false } : cur)))
    })
    return result
  }).catch(($, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'reflect',
      description: 'Reflect: list saved rules, add one (/reflect add <rule>), or turn detection off/on',
      argumentHint: '[add <rule>|off|on]',
    })
    return next(e)
  })

  on('command.run', { command: 'reflect' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off' || arg === 'on') {
      await update($, isOff, () => arg === 'off')
      if (arg === 'off') await update($, candidate, () => null)
      return { text: arg === 'off' ? 'Reflect paused: it will not suggest rules this session.' : 'Reflect is listening for corrections again.' }
    }
    if (arg.startsWith('add ')) {
      const rule = arg.slice(4).trim()
      if (rule.length === 0) return { text: 'Usage: /reflect add <rule>' }
      await saveRule($, rule, defaultTarget)
      return { text: `Added to ${await claudeMdPath($, defaultTarget)}: ${rule}` }
    }
    const list = await read($, saved)
    const off = await read($, isOff)
    return {
      text: [
        `Reflect is ${off ? 'paused' : 'on'}; approved rules go to ${await claudeMdPath($, defaultTarget)} by default.`,
        list.length === 0 ? 'No rules saved this session.' : 'Saved this session:',
        ...list.map(s => `  - ${s.rule}  (${s.path})`),
      ].join('\n'),
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const c = await read($, candidate)
    if (c === null || e.props.hasSurvey) return next(e)
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    const dismiss = () => void update($, candidate, () => null)

    if (c.isDrafting || c.rule === null) {
      if (e.props.isWorking) return next(e)
      return (
        <Box>
          <Text dimColor>Reflect · drafting a rule from your feedback…</Text>
        </Box>
      )
    }
    const rule = c.rule

    if (c.isEditing && 'Input' in elements) {
      const { Input } = elements
      return (
        <Box flexDirection="column">
          <Text color="suggestion">Reflect · edit the rule, then press Enter to save it to CLAUDE.md</Text>
          <Input key="rule" value={rule} autoFocus submitLabel="Save" onSubmit={value => void (value.trim().length > 0 ? saveRule($, value.trim(), defaultTarget) : undefined)} />
          <Button key="cancel" label="Cancel" role="dismiss" onPress={dismiss} />
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Text color="suggestion" wrap="wrap">
          Reflect · Save this as a rule? “{rule}”
        </Text>
        <Box flexDirection="row" gap={1}>
          <Button key="save" variant="primary" hotkey="s" label={defaultTarget === 'project' ? 'Save to project CLAUDE.md' : 'Save to ~/.claude/CLAUDE.md'} onPress={() => void saveRule($, rule, defaultTarget)} />
          <Button key="other" label={defaultTarget === 'project' ? 'Save globally' : 'Save to project'} onPress={() => void saveRule($, rule, defaultTarget === 'project' ? 'global' : 'project')} />
          {'Input' in elements && <Button key="edit" hotkey="e" label="Edit" onPress={() => void update($, candidate, cur => (cur === null ? cur : { ...cur, isEditing: true }))} />}
          <Button key="dismiss" label="Dismiss" role="dismiss" onPress={dismiss} />
        </Box>
      </Box>
    )
  })
}
