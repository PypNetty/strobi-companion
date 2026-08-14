import { pickSpeechLine, type SpeechCue } from './lines'
import { pickLocalVoice, type SpeechVoiceInfo } from './voices'

export type SpeechUtteranceRequest = {
  text: string
  lang: string
  rate: number
  pitch: number
  volume: number
  voice?: SpeechVoiceInfo
  onstart: () => void
  onend: () => void
  onerror: (error: string) => void
}

export type SpeechDriver = {
  getVoices: () => SpeechVoiceInfo[]
  speak: (request: SpeechUtteranceRequest) => void
  cancel: () => void
  resume: () => void
  onVoicesChanged?: (listener: () => void) => () => void
}

export type CompanionSpeechOptions = {
  onSpeaking?: (speaking: boolean) => void
  random?: () => number
  now?: () => number
  driver?: SpeechDriver | null
  globalCooldownMs?: number
  busyTimeoutMs?: number
}

const cueCooldownMs: Record<SpeechCue, number> = {
  greeting: 16_000,
  waking: 8_000,
  curious: 10_000,
  watching: 8_000,
  noticed: 16_000,
  carried: 10_000,
  shaken: 6_000,
  heard: 12_000,
  idle: 40_000,
  sleeping: 20_000,
}

const urgentCues = new Set<SpeechCue>(['shaken'])
const BUSY_TIMEOUT_MS = 8_000

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const browserSpeechDriver = (): SpeechDriver | null => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const synth = window.speechSynthesis
  return {
    getVoices: () => [...synth.getVoices()],
    speak: request => {
      const utterance = new SpeechSynthesisUtterance(request.text)
      utterance.lang = request.lang
      utterance.rate = request.rate
      utterance.pitch = request.pitch
      utterance.volume = request.volume
      const voices = synth.getVoices()
      const match = request.voice
        ? voices.find(
            voice => voice.name === request.voice?.name && voice.lang === request.voice?.lang
          )
        : undefined
      if (match) utterance.voice = match
      utterance.onstart = () => request.onstart()
      utterance.onend = () => request.onend()
      utterance.onerror = event => request.onerror(event.error)
      synth.speak(utterance)
    },
    cancel: () => synth.cancel(),
    resume: () => synth.resume(),
    onVoicesChanged: listener => {
      synth.addEventListener('voiceschanged', listener)
      return () => synth.removeEventListener('voiceschanged', listener)
    },
  }
}

const speakWithBrowser = (request: SpeechUtteranceRequest) => {
  const browser = browserSpeechDriver()
  if (!browser) {
    request.onerror('no-engine')
    return
  }
  browser.speak(request)
}

const nativeSpeechDriver = (): SpeechDriver => ({
  getVoices: () => [{ lang: 'fr-FR', name: 'Windows SAPI', localService: true }],
  speak: request => {
    request.onstart()
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('speak', { text: request.text }))
      .then(() => request.onend())
      .catch(() =>
        speakWithBrowser({
          ...request,
          onstart: () => undefined,
        })
      )
  },
  cancel: () => {
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('stop_speaking'))
      .catch(() => browserSpeechDriver()?.cancel())
  },
  resume: () => browserSpeechDriver()?.resume(),
})

const defaultSpeechDriver = (): SpeechDriver | null =>
  isTauri() ? nativeSpeechDriver() : browserSpeechDriver()

export class CompanionSpeech {
  private enabled = true
  private speaking = false
  private unlocked = false
  private queued: SpeechCue | null = null
  private queuedText: string | null = null
  private playing: SpeechCue | 'answer' | null = null
  private playToken = 0
  private lastAt: Partial<Record<SpeechCue, number>> = {}
  private lastAnyAt = 0
  private stopVoices: (() => void) | null = null
  private busyWatch: ReturnType<typeof setTimeout> | null = null
  private onSpeaking?: (speaking: boolean) => void
  private random: () => number
  private now: () => number
  private driver: SpeechDriver | null
  private globalCooldownMs: number
  private busyTimeoutMs: number

  constructor(options: CompanionSpeechOptions = {}) {
    this.onSpeaking = options.onSpeaking
    this.random = options.random ?? Math.random
    this.now = options.now ?? Date.now
    this.driver = options.driver === undefined ? defaultSpeechDriver() : options.driver
    this.globalCooldownMs = options.globalCooldownMs ?? 8_000
    this.busyTimeoutMs = options.busyTimeoutMs ?? 14_000
    this.unlocked = isTauri()
    this.listenForVoices()
  }

  get isEnabled() {
    return this.enabled
  }

  get isSpeaking() {
    return this.speaking
  }

  get isUnlocked() {
    return this.unlocked
  }

  get hasQueued() {
    return this.queued !== null || this.queuedText !== null || this.playing !== null
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (!enabled) this.cancel()
  }

  unlock() {
    this.unlocked = true
    this.driver?.resume()
    if (this.playing && !this.speaking) this.releaseBusy()
    if (!this.playing) this.playQueued()
  }

  speak(cue: SpeechCue, now = this.now()) {
    if (!this.enabled || !this.driver) return
    if (this.playing === cue) return
    if (!this.canSpeak(cue, now)) return
    if (this.speaking || this.playing) {
      this.queued = cue
      this.queuedText = null
      return
    }
    this.queued = cue
    this.queuedText = null
    this.playQueued()
  }

  speakText(text: string) {
    const trimmed = text.trim()
    if (!this.enabled || !this.driver || !trimmed) return
    this.cancel()
    this.queued = null
    this.queuedText = trimmed
    this.playQueued()
  }

  cancel() {
    this.playToken += 1
    this.clearBusyWatch()
    this.queued = null
    this.queuedText = null
    this.playing = null
    this.driver?.cancel()
    this.setSpeaking(false)
  }

  destroy() {
    this.cancel()
    this.stopVoices?.()
    this.stopVoices = null
  }

  private canSpeak(cue: SpeechCue, now: number) {
    const last = this.lastAt[cue] ?? 0
    if (now - last < cueCooldownMs[cue]) return false
    if (!urgentCues.has(cue) && now - this.lastAnyAt < this.globalCooldownMs) return false
    return true
  }

  private listenForVoices() {
    const driver = this.driver
    if (!driver?.onVoicesChanged) return
    this.stopVoices = driver.onVoicesChanged(() => {
      if (this.queued && !this.speaking && !this.playing) this.playQueued()
    })
  }

  private releaseBusy() {
    this.clearBusyWatch()
    this.playing = null
    this.setSpeaking(false)
  }

  private playQueued() {
    const driver = this.driver
    const raw = this.queuedText
    const cue = this.queued
    if (!this.enabled || !driver || this.speaking || this.playing) return
    const now = this.now()
    let text = raw
    let playing: SpeechCue | 'answer' = 'answer'
    if (raw) {
      this.queuedText = null
      this.queued = null
    } else {
      if (!cue) return
      if (!this.canSpeak(cue, now) && (this.lastAt[cue] ?? 0) > 0) {
        this.queued = null
        return
      }
      text = pickSpeechLine(cue, this.random)
      if (!text) {
        this.queued = null
        return
      }
      this.queued = null
      playing = cue
    }
    if (!text) return
    this.playing = playing
    const token = ++this.playToken
    driver.resume()
    const voice = pickLocalVoice(driver.getVoices())
    driver.speak({
      text,
      lang: 'fr-FR',
      rate: 1.02,
      pitch: 1.15,
      volume: 0.85,
      voice,
      onstart: () => {
        if (token !== this.playToken) return
        if (playing !== 'answer') this.lastAt[playing] = this.now()
        this.lastAnyAt = this.now()
        this.setSpeaking(true)
      },
      onend: () => {
        if (token !== this.playToken) return
        this.finishUtterance()
      },
      onerror: () => {
        if (token !== this.playToken) return
        this.finishUtterance()
      },
    })
    this.armBusyTimeout(token)
  }

  private armBusyTimeout(token: number) {
    this.clearBusyWatch()
    this.busyWatch = setTimeout(() => {
      this.busyWatch = null
      if (token !== this.playToken) return
      this.driver?.cancel()
      this.releaseBusy()
      if (this.queued || this.queuedText) this.playQueued()
    }, this.busyTimeoutMs)
  }

  private finishUtterance() {
    this.releaseBusy()
    if (this.queued || this.queuedText) this.playQueued()
  }

  private clearBusyWatch() {
    if (this.busyWatch === null) return
    clearTimeout(this.busyWatch)
    this.busyWatch = null
  }

  private setSpeaking(value: boolean) {
    if (this.speaking === value) return
    this.speaking = value
    this.onSpeaking?.(value)
  }
}
