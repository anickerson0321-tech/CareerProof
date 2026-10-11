export type Candidate = {
  id: string
  feedback: string
  kind: 'prohibition' | 'correction' | 'preference'
  rule: string | null
  isDrafting: boolean
  isEditing: boolean
}

export type SavedRule = { rule: string; path: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    reflect: { candidate: Candidate | null; saved: SavedRule[]; isOff: boolean }
  }
}
