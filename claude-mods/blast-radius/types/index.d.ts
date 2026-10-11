export type Decision = { at: number; tool: string; summary: string; isApproved: boolean }

declare module 'claude-code' {
  interface PluginState {
    'blast-radius': { decisions: Decision[]; isPaused: boolean }
  }
}
