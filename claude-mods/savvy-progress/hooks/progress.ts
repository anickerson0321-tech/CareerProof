// Pure progress arithmetic and formatting for Savvy Progress (no `$`).
import type { AgentRow, TaskItem } from '../types'

export function bar(width: number, fraction: number | null, frame: number): string {
  const w = Math.max(6, Math.floor(width))
  if (fraction !== null) {
    const f = Math.min(1, Math.max(0, fraction))
    const full = Math.round(f * w)
    return '█'.repeat(full) + '░'.repeat(w - full)
  }
  // Indeterminate: a block of a quarter of the width sweeping back and forth.
  const block = Math.max(2, Math.floor(w / 4))
  const span = w - block
  const period = span * 2
  const p = period === 0 ? 0 : frame % period
  const at = p <= span ? p : period - p
  return '░'.repeat(at) + '▓'.repeat(block) + '░'.repeat(w - block - at)
}

export function taskProgress(tasks: readonly TaskItem[]) {
  const total = tasks.length
  const done = tasks.filter(t => t.status === 'completed').length
  const active = tasks.find(t => t.status === 'in_progress') ?? null
  return { total, done, fraction: total === 0 ? null : done / total, active }
}

export const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)

export function elapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export const shortModel = (model: string) => model.replace(/^claude-/, '').replace(/-\d{8}$/, '')

export function stageText(a: AgentRow) {
  switch (a.stage) {
    case 'starting': return 'starting'
    case 'thinking': return 'thinking'
    case 'tool': return `running ${a.currentTool ?? 'a tool'}`
    case 'done': return 'done'
    case 'failed': return 'failed'
  }
}

export const STAGE_MARK: Record<AgentRow['stage'], string> = { starting: '○', thinking: '◐', tool: '◑', done: '●', failed: '✕' }

export const isActive = (a: AgentRow) => a.stage !== 'done' && a.stage !== 'failed'
