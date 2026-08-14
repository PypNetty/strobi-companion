import { CompanionSpeech, type SpeechDriver, type SpeechUtteranceRequest } from '../speech'

const silentDriver = (hooks: {
  speak?: (request: SpeechUtteranceRequest) => void
  cancel?: () => void
} = {}): SpeechDriver => ({
  getVoices: () => [{ lang: 'fr-FR', name: 'Test', localService: true }],
  speak: request => hooks.speak?.(request),
  cancel: () => hooks.cancel?.(),
  resume: () => undefined,
})

describe('CompanionSpeech busy recovery', () => {
  it('clears speaking when onend never fires so the next line can play', () => {
    vi.useFakeTimers()
    const spoken: string[] = []
    const requests: SpeechUtteranceRequest[] = []
    const speech = new CompanionSpeech({
      driver: silentDriver({
        speak: request => {
          spoken.push(request.text)
          requests.push(request)
          request.onstart()
        },
      }),
      random: () => 0,
      now: () => Date.now(),
      globalCooldownMs: 0,
      busyTimeoutMs: 8_000,
    })
    speech.unlock()
    speech.speak('curious')
    expect(speech.isSpeaking).toBe(true)
    vi.advanceTimersByTime(8_000)
    expect(speech.isSpeaking).toBe(false)
    vi.advanceTimersByTime(12_000)
    speech.speak('waking')
    expect(spoken.length).toBe(2)
    vi.useRealTimers()
  })

  it('keeps speaking after the first line finishes', () => {
    const spoken: string[] = []
    const speech = new CompanionSpeech({
      driver: silentDriver({
        speak: request => {
          spoken.push(request.text)
          request.onstart()
          request.onend()
        },
      }),
      random: () => 0,
      now: () => Date.now(),
      globalCooldownMs: 0,
    })
    speech.unlock()
    speech.speak('heard')
    speech.speak('watching')
    speech.speak('waking')
    expect(spoken.length).toBe(3)
    expect(speech.isSpeaking).toBe(false)
  })

  it('does not cancel a playing line when a later cue arrives', () => {
    const cancelled: number[] = []
    const speech = new CompanionSpeech({
      driver: silentDriver({
        speak: request => request.onstart(),
        cancel: () => cancelled.push(1),
      }),
      random: () => 0,
      now: () => 1_000,
      globalCooldownMs: 0,
      busyTimeoutMs: 8_000,
    })
    speech.unlock()
    speech.speak('curious', 1_000)
    speech.speak('waking', 20_000)
    expect(cancelled).toEqual([])
    expect(speech.hasQueued).toBe(true)
  })
})
