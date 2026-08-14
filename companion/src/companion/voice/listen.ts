export type TranscriptPayload = {
  text: string
  confidence?: number
}

export type VoiceStack = {
  tts: 'piper' | 'sapi'
  brain: 'ollama' | 'keywords'
  model?: string | null
  listening: boolean
}

export type NativeListenerOptions = {
  onTranscript: (payload: TranscriptPayload) => void
  onSpeechStart?: () => void
  onStack?: (stack: VoiceStack) => void
  onError?: (message: string) => void
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const shouldAckHeardVoice = (input: {
  listening: boolean
  listenFailed: boolean
  speaking: boolean
  answering: boolean
  missedVad: number
}) => {
  if (input.speaking || input.answering) return false
  if (!input.listening || input.listenFailed) return true
  return input.missedVad >= 3
}

export const createListenPauseGate = (driver: {
  pause: () => Promise<void>
  resume: () => Promise<void>
}) => {
  let desired = false
  let actual = false
  let chain = Promise.resolve()

  const sync = () => {
    chain = chain
      .then(async () => {
        if (desired === actual) return
        if (desired) {
          await driver.pause()
          actual = true
          if (!desired) {
            await driver.resume()
            actual = false
          }
        } else {
          await driver.resume()
          actual = false
        }
      })
      .catch(() => undefined)
    return chain
  }

  return {
    pause() {
      desired = true
      return sync()
    },
    resume() {
      desired = false
      return sync()
    },
    reset() {
      desired = false
      actual = false
      chain = Promise.resolve()
    },
  }
}

export class NativeListener {
  private unlisten: Array<() => void> = []
  private running = false
  private readonly pauseGate = createListenPauseGate({
    pause: async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('pause_listening').catch(() => undefined)
    },
    resume: async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('resume_listening').catch(() => undefined)
    },
  })

  get active() {
    return this.running
  }

  async start(options: NativeListenerOptions) {
    if (!isTauri() || this.running) return this.running
    try {
      const [{ listen }, { invoke }] = await Promise.all([
        import('@tauri-apps/api/event'),
        import('@tauri-apps/api/core'),
      ])
      if (this.unlisten.length === 0) {
        this.unlisten.push(
          await listen<TranscriptPayload>('companion://transcript', event => {
            if (event.payload?.text) options.onTranscript(event.payload)
          })
        )
        this.unlisten.push(
          await listen('companion://speech-start', () => options.onSpeechStart?.())
        )
        this.unlisten.push(
          await listen<VoiceStack>('companion://voice-stack', event => {
            if (event.payload) options.onStack?.(event.payload)
          })
        )
        this.unlisten.push(
          await listen<string>('companion://listen-error', event => {
            this.running = false
            const message =
              typeof event.payload === 'string' && event.payload.trim()
                ? event.payload
                : 'Écoute locale indisponible. Rien n’est envoyé.'
            options.onError?.(message)
          })
        )
      }
      await invoke('start_listening')
      this.running = true
      this.pauseGate.reset()
      try {
        const stack = await invoke<VoiceStack>('voice_stack')
        options.onStack?.(stack)
      } catch {
        options.onStack?.({ tts: 'sapi', brain: 'keywords', listening: true })
      }
    } catch (error) {
      this.running = false
      options.onError?.(
        error instanceof Error
          ? error.message
          : 'Écoute locale indisponible. Rien n’est envoyé.'
      )
    }
    return this.running
  }

  async pause() {
    if (!isTauri() || !this.running) return
    await this.pauseGate.pause()
  }

  async resume() {
    if (!isTauri() || !this.running) return
    await this.pauseGate.resume()
  }

  async stop() {
    this.running = false
    this.pauseGate.reset()
    this.unlisten.forEach(stop => stop())
    this.unlisten = []
    if (!isTauri()) return
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('stop_listening').catch(() => undefined)
  }
}

export const askLocalBrain = async (text: string, time: string) => {
  if (!isTauri()) return ''
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const reply = await invoke<string>('answer', { text, time })
    return (reply ?? '').trim()
  } catch {
    return ''
  }
}
