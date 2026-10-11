export type LastRequest = { at: number; contextTokens: number; model: string }

export type KeepWarm = {
  until: number
  pings: number
  readTokens: number
  lastPingAt: number | null
  stoppedReason: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'cache-tax': {
      last: LastRequest | null
      keepWarm: KeepWarm | null
      isRunning: boolean
      isHidden: boolean
      tick: number
    }
  }
}
