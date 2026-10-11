export type Run = {
  turnId: string
  startedAt: number
  endedAt: number | null
  model: string
  steps: number
  toolsDone: number
  toolsRunning: number
  currentTool: string | null
  contextTokens: number
  outputTokens: number
}

export type TaskItem = { id: string; subject: string; status: 'pending' | 'in_progress' | 'completed'; activeForm: string | null }

export type AgentRow = {
  id: string
  label: string
  type: string
  model: string
  stage: 'starting' | 'thinking' | 'tool' | 'done' | 'failed'
  currentTool: string | null
  steps: number
  toolsDone: number
  contextTokens: number
  outputTokens: number
  startedAt: number
  endedAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'savvy-progress': {
      run: Run | null
      tasks: TaskItem[]
      agents: AgentRow[]
      tick: number
      isPaneOpen: boolean
    }
  }
}
