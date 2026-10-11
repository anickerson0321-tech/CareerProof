import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow, Run, TaskItem } from '../types'
import { STAGE_MARK, bar, elapsed, isActive, shortModel, stageText, taskProgress, tokens } from './progress'

const run = atom({ plugin: 'savvy-progress', key: 'run' } as const, null)
const tasks = atom({ plugin: 'savvy-progress', key: 'tasks' } as const, [])
const agents = atom({ plugin: 'savvy-progress', key: 'agents' } as const, [])
const tick = atom({ plugin: 'savvy-progress', key: 'tick' } as const, 0)
const isPaneOpen = atom({ plugin: 'savvy-progress', key: 'isPaneOpen' } as const, false)

const PANE = 'savvy-progress-agents'

function patchAgent(list: readonly AgentRow[], id: string, now: number, fn: (a: AgentRow) => AgentRow): AgentRow[] {
  const found = list.find(a => a.id === id)
  const base: AgentRow = found ?? {
    id, label: id.slice(0, 8), type: 'agent', model: '', stage: 'starting', currentTool: null,
    steps: 0, toolsDone: 0, contextTokens: 0, outputTokens: 0, startedAt: now, endedAt: null,
  }
  const next = fn(base)
  return found === undefined ? [...list, next].slice(-40) : list.map(a => (a.id === id ? next : a))
}

async function openPane($: EngineInterface) {
  const { isPlaced } = await $.ui.open({ id: PANE, title: 'Agents' })
  await update($, isPaneOpen, () => isPlaced)
  return isPlaced
}

async function refreshAgents($: EngineInterface) {
  const now = await $.clock.now()
  const tracked = await read($, agents)
  const isBusy = (await read($, run))?.endedAt === null || tracked.some(isActive)
  if (!isBusy) return
  await update($, tick, () => now)
  if (tracked.length === 0) return
  const infos = await $.agent.list()
  await update($, agents, list =>
    list.map(a => {
      const info = infos.find(i => i.id === a.id)
      if (info === undefined) return a
      const failed = info.status === 'failed' || info.status === 'killed'
      const ended = failed || info.status === 'completed'
      return {
        ...a,
        label: info.description || info.name || a.label,
        type: info.type || a.type,
        stage: failed ? 'failed' : ended ? 'done' : a.stage,
        endedAt: ended ? (a.endedAt ?? now) : a.endedAt,
      }
    }),
  )
}

function recordTaskResult(e: { tool: string; [k: string]: unknown }, result: unknown, list: readonly TaskItem[]): TaskItem[] {
  if (e.tool === 'TodoWrite') {
    const todos = (e.todos as { content: string; status: TaskItem['status']; activeForm: string }[] | undefined) ?? []
    return todos.map((t, i) => ({ id: `todo-${i}`, subject: t.content, status: t.status, activeForm: t.activeForm }))
  }
  if (e.tool === 'TaskCreate') {
    const task = (result as { task?: { id: string; subject: string } } | undefined)?.task
    if (task === undefined) return [...list]
    const activeForm = typeof e.activeForm === 'string' ? e.activeForm : null
    return [...list.filter(t => !t.id.startsWith('todo-')), { id: task.id, subject: task.subject, status: 'pending', activeForm }]
  }
  if (e.tool === 'TaskUpdate') {
    const id = String(e.taskId)
    if (e.status === 'deleted') return list.filter(t => t.id !== id)
    return list.map(t =>
      t.id !== id ? t : {
        ...t,
        status: (e.status as TaskItem['status'] | undefined) ?? t.status,
        subject: typeof e.subject === 'string' ? e.subject : t.subject,
        activeForm: typeof e.activeForm === 'string' ? e.activeForm : t.activeForm,
      },
    )
  }
  return [...list]
}

export const register: Register = (on, options) => {
  const autoOpen = options.autoOpenPanel !== false
  let canDock = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'progress', description: 'Savvy Progress: open the live agent and task panel' })
    $.clock.every(1000, () => {
      void refreshAgents($)
    })
    return next(e)
  })

  on('command.run', { command: 'progress' }, async $ => {
    const isPlaced = await openPane($)
    return { text: isPlaced ? 'Agent panel opened.' : 'This surface cannot place the agent panel; the band above the prompt shows the same rows.' }
  })

  on('turn.start', async ($, e, next) => {
    const now = await $.clock.now()
    const fresh: Run = {
      turnId: e.turnId, startedAt: now, endedAt: null, model: await $.session.model(), steps: 0,
      toolsDone: 0, toolsRunning: 0, currentTool: null, contextTokens: 0, outputTokens: 0,
    }
    await update($, run, () => fresh)
    await update($, agents, list => list.filter(isActive))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    if (e.agentId === undefined) {
      await update($, run, r => (r === null ? r : { ...r, endedAt: now, toolsRunning: 0, currentTool: null }))
    } else {
      const id = e.agentId
      await update($, agents, list => patchAgent(list, id, now, a => ({ ...a, stage: e.isAborted ? 'failed' : 'done', currentTool: null, endedAt: now })))
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const now = await $.clock.now()
    const agentId = e.agentId
    if (agentId === undefined) {
      await update($, run, r => (r === null ? r : { ...r, steps: r.steps + 1, model: e.model }))
    } else {
      const isNew = !(await read($, agents)).some(a => a.id === agentId)
      await update($, agents, list => patchAgent(list, agentId, now, a => ({ ...a, model: e.model, stage: 'thinking', steps: a.steps + 1 })))
      if (isNew && autoOpen && canDock && !(await read($, isPaneOpen))) await openPane($)
    }
    const result = yield* next(e)
    const u = result.usage
    if (u !== null) {
      const context = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      if (agentId === undefined) {
        await update($, run, r => (r === null ? r : { ...r, contextTokens: context, outputTokens: r.outputTokens + u.output_tokens }))
      } else {
        await update($, agents, list => patchAgent(list, agentId, now, a => ({ ...a, contextTokens: context, outputTokens: a.outputTokens + u.output_tokens })))
      }
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    const now = await $.clock.now()
    const agentId = e.agentId
    if (agentId === undefined) {
      await update($, run, r => (r === null ? r : { ...r, toolsRunning: r.toolsRunning + 1, currentTool: e.tool }))
    } else {
      await update($, agents, list => patchAgent(list, agentId, now, a => ({ ...a, stage: 'tool', currentTool: e.tool })))
    }
    const ran = await next(e)
    if (agentId === undefined) {
      await update($, run, r => (r === null ? r : { ...r, toolsRunning: Math.max(0, r.toolsRunning - 1), toolsDone: r.toolsDone + 1, currentTool: r.toolsRunning > 1 ? r.currentTool : null }))
    } else {
      await update($, agents, list => patchAgent(list, agentId, now, a => ({ ...a, stage: 'thinking', currentTool: null, toolsDone: a.toolsDone + 1 })))
    }
    if (agentId === undefined && ran.deny === undefined && ran.isError !== true && (e.tool === 'TodoWrite' || e.tool === 'TaskCreate' || e.tool === 'TaskUpdate')) {
      await update($, tasks, list => recordTaskResult(e as unknown as { tool: string }, ran.result, list))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    canDock = e.viewport?.isFullscreen === true
    const r = await read($, run)
    const list = await read($, agents)
    const active = list.filter(isActive)
    if (e.props.hasSurvey || r === null || (!e.props.isWorking && active.length === 0)) return next(e)

    const now = await read($, tick)
    const { Box, Text } = $.ui.resolve(e)
    const width = Math.min(32, Math.max(8, e.props.bodyColumns - 60))
    const tp = taskProgress(await read($, tasks))
    const frame = Math.floor((now - r.startedAt) / 1000)
    const what = tp.active?.activeForm ?? tp.active?.subject ?? (r.currentTool !== null ? `running ${r.currentTool}` : 'thinking')
    const counts = tp.total > 0 ? `${tp.done}/${tp.total} tasks · ` : ''
    const time = elapsed((r.endedAt ?? Math.max(now, r.startedAt)) - r.startedAt)
    const rows = Math.max(0, e.props.maxRows - 2)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text color="claude">{bar(width, tp.fraction, frame)}</Text>
          <Text wrap="truncate-end">
            {counts}
            <Text bold>{what}</Text>
            <Text dimColor> · step {r.steps} · {r.toolsDone} tools · ctx {tokens(r.contextTokens)} · {time}</Text>
          </Text>
        </Box>
        {active.slice(0, rows).map(a => (
          <Text key={a.id} wrap="truncate-end">
            <Text color={a.stage === 'tool' ? 'warning' : 'suggestion'}>{STAGE_MARK[a.stage]} </Text>
            <Text bold>{a.label}</Text>
            <Text dimColor> · {a.type} · {shortModel(a.model) || 'model pending'} · {stageText(a)} · step {a.steps} · ctx {tokens(a.contextTokens)} · out {tokens(a.outputTokens)} · {elapsed(Math.max(now, a.startedAt) - a.startedAt)}</Text>
          </Text>
        ))}
        {active.length > rows && <Text dimColor>+{active.length - rows} more agents · /progress for the panel</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, agents)
    const r = await read($, run)
    const now = await read($, tick)
    const tl = await read($, tasks)
    const total = list.reduce((s, a) => s + a.outputTokens, r?.outputTokens ?? 0)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>Main thread</Text>
          {r === null ? (
            <Text dimColor>Idle. Send a prompt to see progress.</Text>
          ) : (
            <Text dimColor wrap="wrap">
              {shortModel(r.model)} · {r.endedAt === null ? (r.currentTool !== null ? `running ${r.currentTool}` : 'thinking') : 'done'} · step {r.steps} · {r.toolsDone} tools · ctx {tokens(r.contextTokens)} · out {tokens(r.outputTokens)}
            </Text>
          )}
        </Box>
        <Box flexDirection="column">
          <Text bold>Agents ({list.filter(isActive).length} active, {list.length} this turn)</Text>
          {list.length === 0 && <Text dimColor>No sub-agents yet.</Text>}
          {list.map(a => (
            <Box key={a.id} flexDirection="column">
              <Text wrap="truncate-end">
                <Text color={a.stage === 'failed' ? 'error' : a.stage === 'done' ? 'success' : 'suggestion'}>{STAGE_MARK[a.stage]} </Text>
                <Text bold>{a.label}</Text>
                <Text dimColor> ({a.type})</Text>
              </Text>
              <Text dimColor wrap="wrap">
                {'  '}{shortModel(a.model) || 'model pending'} · {stageText(a)} · step {a.steps} · {a.toolsDone} tools · ctx {tokens(a.contextTokens)} · out {tokens(a.outputTokens)} · {elapsed((a.endedAt ?? Math.max(now, a.startedAt)) - a.startedAt)}
              </Text>
            </Box>
          ))}
        </Box>
        {tl.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Tasks ({taskProgress(tl).done}/{tl.length})</Text>
            {tl.map(t => (
              <Text key={t.id} dimColor={t.status === 'completed'} wrap="truncate-end">
                {t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '▸' : '·'} {t.subject}
              </Text>
            ))}
          </Box>
        )}
        <Text dimColor>Token figures are estimates from each request's reported usage: ctx is the latest request's input, out is output summed. Session output so far: {tokens(total)}.</Text>
      </Box>
    )
  })
}
