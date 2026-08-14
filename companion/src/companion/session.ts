import { BehaviorEngine } from './behavior/behaviorEngine'
import type { CompanionState } from './behavior/companionState'
import { GazeController, shouldFollowHead, type PointerGaze } from './gaze/gazeController'
import { CursorTracker } from './gaze/cursorTracker'
import { FaceTracker } from './perception/faceTracker'
import { emptyPerception, type PerceptionState } from './perception/perceptionState'
import {
  companionAvatar,
  companionBehavior,
  loadBundledDocument,
  sequenceIdForState,
} from './avatar/catalog'
import { mountCompanionAvatar, type CompanionRuntime } from './avatar/runtime'
import { CompanionSpeech } from './voice/speech'
import { VoiceActivityDetector } from './voice/activity'
import { askLocalBrain, NativeListener, type VoiceStack } from './voice/listen'
import {
  classifyIntent,
  formatLocalTime,
  isLikelyEcho,
  replyFromUtterance,
} from './voice/intents'

export type CompanionStatus = {
  state: CompanionState
  tracking: boolean
  faceDetected: boolean
  voiceEnabled: boolean
  voiceUnlocked: boolean
  speaking: boolean
  listening: boolean
  ttsEngine: 'piper' | 'sapi'
  brain: 'ollama' | 'keywords'
  brainModel?: string | null
  cameraLabel?: string
  cameraPreferred?: boolean
  localOnly: true
  error?: string
}

export type CompanionSessionOptions = {
  onStatus?: (status: CompanionStatus) => void
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const watchingGapMs = () => 10_000 + Math.floor(Math.random() * 8_000)

export class CompanionSession {
  private engine = new BehaviorEngine()
  private gaze = new GazeController()
  private cursor = new CursorTracker()
  private perception: PerceptionState = emptyPerception()
  private pointer: PointerGaze = { active: false, x: 0, y: 0 }
  private tracker: FaceTracker | null = null
  private voiceDetector: VoiceActivityDetector | null = null
  private listener = new NativeListener()
  private speech: CompanionSpeech
  private runtime: CompanionRuntime
  private tracking = true
  private voiceEnabled = true
  private speaking = false
  private listening = false
  private answering = false
  private lastSpoken = ''
  private ttsEngine: 'piper' | 'sapi' = 'sapi'
  private brain: 'ollama' | 'keywords' = 'keywords'
  private brainModel: string | null = null
  private voicePresentUntil = 0
  private frame: number | null = null
  private lastState: CompanionState
  private onStatus?: (status: CompanionStatus) => void
  private error?: string
  private cameraLabel?: string
  private cameraPreferred?: boolean
  private lastEngineTick = 0
  private lastCursorPoll = 0
  private lastStatus: CompanionStatus | null = null
  private destroyed = false
  private startGeneration = 0
  private suspended = false
  private pointerWasActive = false
  private dragSpoken = false
  private shakeSpoken = false
  private nextWatchingSpeechAt = 0

  constructor(host: HTMLElement, options: CompanionSessionOptions = {}) {
    this.onStatus = options.onStatus
    this.speech = new CompanionSpeech({
      onSpeaking: speaking => {
        this.speaking = speaking
        if (speaking) void this.listener.pause()
        else void this.listener.resume()
        this.emitStatus()
      },
    })
    const document = loadBundledDocument()
    const avatar = companionAvatar(document)
    this.runtime = mountCompanionAvatar(host, avatar, companionBehavior(document, avatar), {
      size: 240,
    })
    this.lastState = this.engine.state
    void this.cursor.start()
    this.loop()
    this.emitStatus()
  }

  get element() {
    return this.runtime.element
  }

  get isTracking() {
    return this.tracking
  }

  get isVoiceEnabled() {
    return this.voiceEnabled
  }

  async setTracking(enabled: boolean) {
    this.tracking = enabled
    this.error = undefined
    if (!enabled) {
      await this.tracker?.stop()
      this.tracker = null
      this.perception = emptyPerception()
      this.engine.dispatch({ type: 'FACE_LOST' })
      this.emitStatus()
      return
    }
    await this.ensureTracker()
    this.emitStatus()
  }

  async setVoiceEnabled(enabled: boolean) {
    this.voiceEnabled = enabled
    this.speech.setEnabled(enabled)
    if (!enabled) {
      await this.voiceDetector?.stop()
      this.voiceDetector = null
      await this.listener.stop()
      this.listening = false
      this.speaking = false
      this.emitStatus()
      return
    }
    this.unlockInteraction()
    await this.ensureVoice()
    await this.ensureListener()
    this.emitStatus()
  }

  async setSuspended(suspended: boolean) {
    this.suspended = suspended
    if (suspended) {
      await this.tracker?.stop()
      await this.voiceDetector?.stop()
      await this.listener.pause()
      this.speech.cancel()
      return
    }
    if (this.tracking) await this.ensureTracker()
    if (this.voiceEnabled) {
      await this.ensureVoice()
      await this.ensureListener()
    }
  }

  setPointer(pointer: PointerGaze) {
    if (isTauri()) return
    this.pointer = pointer
  }

  unlockInteraction() {
    const first = !this.speech.isUnlocked
    if (this.voiceEnabled && first && !this.speech.hasQueued) this.speech.speak('greeting')
    this.speech.unlock()
    void this.voiceDetector?.resume()
    if (this.voiceEnabled && !this.voiceDetector?.active) void this.ensureVoice()
    if (this.voiceEnabled) void this.ensureListener()
    this.emitStatus()
  }

  async start() {
    const generation = ++this.startGeneration
    await this.cursor.start()
    if (this.tracking) await this.ensureTracker()
    if (this.voiceEnabled) await this.ensureVoice()
    if (this.voiceEnabled) await this.ensureListener()
    if (this.voiceEnabled) this.speech.speak('greeting')
    if (generation !== this.startGeneration || this.destroyed) {
      await this.tracker?.stop()
      await this.voiceDetector?.stop()
      await this.listener.stop()
    }
  }

  async destroy() {
    this.destroyed = true
    this.startGeneration += 1
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.cursor.stop()
    this.speech.destroy()
    await this.listener.stop()
    await this.voiceDetector?.stop()
    await this.tracker?.stop()
    this.runtime.destroy()
  }

  private async ensureTracker() {
    if (this.destroyed || this.suspended || this.tracker?.active) return
    this.tracker = new FaceTracker({
      fps: 15,
      sleepingFps: 5,
      onPerception: state => this.onPerception(state),
      onDevice: info => {
        this.cameraLabel = info.label
        this.cameraPreferred = info.preferred
        this.emitStatus()
      },
      onError: message => {
        this.error = message
        this.tracking = false
        this.perception = emptyPerception()
        this.engine.dispatch({ type: 'FACE_LOST' })
        this.emitStatus()
      },
    })
    await this.tracker.start()
  }

  private async ensureVoice() {
    if (this.destroyed || this.suspended || !this.voiceEnabled || this.voiceDetector?.active) return
    this.voiceDetector = new VoiceActivityDetector({
      onVoice: () => {
        this.voicePresentUntil = Date.now() + 1_600
        this.engine.dispatch({ type: 'VOICE_DETECTED' })
        if (this.speaking) this.speech.cancel()
        if (!this.listening) this.speech.speak('heard')
        this.syncRuntime()
        this.emitStatus()
      },
      onError: message => {
        this.error = this.error ?? message
        this.emitStatus()
      },
    })
    await this.voiceDetector.start()
  }

  private async ensureListener() {
    if (this.destroyed || this.suspended || !this.voiceEnabled || this.listener.active) return
    const started = await this.listener.start({
      onTranscript: payload => this.onTranscript(payload.text),
      onSpeechStart: () => {
        this.voicePresentUntil = Date.now() + 1_800
        this.engine.dispatch({ type: 'VOICE_DETECTED' })
        if (this.speaking) this.speech.cancel()
        this.syncRuntime()
      },
      onStack: stack => this.onVoiceStack(stack),
      onError: message => {
        this.error = this.error ?? message
        this.emitStatus()
      },
    })
    this.listening = started
    this.emitStatus()
  }

  private onVoiceStack(stack: VoiceStack) {
    this.ttsEngine = stack.tts
    this.brain = stack.brain
    this.brainModel = stack.model ?? null
    this.listening = stack.listening || this.listener.active
    this.emitStatus()
  }

  private onTranscript(text: string) {
    if (!this.voiceEnabled || this.destroyed) return
    if (isLikelyEcho(text, this.lastSpoken)) return
    this.voicePresentUntil = Date.now() + 2_400
    this.engine.dispatch({ type: 'VOICE_DETECTED' })
    void this.replyTo(text)
  }

  private async replyTo(text: string) {
    if (this.answering) return
    this.answering = true
    this.speech.cancel()
    try {
      const intent = classifyIntent(text)
      let reply =
        intent === 'unknown' ? await askLocalBrain(text, formatLocalTime()) : ''
      if (!reply) reply = replyFromUtterance(text)
      this.lastSpoken = reply
      this.speech.speakText(reply)
    } finally {
      this.answering = false
      this.syncRuntime()
      this.emitStatus()
    }
  }

  private onPerception(state: PerceptionState) {
    this.perception = state
    if (state.faceDetected) {
      this.engine.dispatch({
        type: 'FACE_DETECTED',
        x: state.normalizedFaceX,
        y: state.normalizedFaceY,
        distance: state.approximateDistance,
      })
    } else {
      this.engine.dispatch({ type: 'FACE_LOST' })
    }
    this.tracker?.setReducedRate(this.engine.state === 'sleeping')
    this.syncRuntime()
    this.emitStatus()
  }

  private loop = (time = performance.now()) => {
    if (this.destroyed) return
    if (time - this.lastEngineTick >= 250) {
      this.engine.dispatch({ type: 'TICK' })
      this.lastEngineTick = time
    }
    const motion = this.cursor.motionGaze(Date.now())
    const pollMs = motion.active || motion.shaking ? 32 : 80
    if (time - this.lastCursorPoll >= pollMs) {
      this.lastCursorPoll = time
      void this.cursor.sample(Date.now()).then(sample => {
        if (sample && !this.destroyed) this.pointer = sample.pointer
      })
    }
    this.syncRuntime()
    this.frame = requestAnimationFrame(this.loop)
  }

  private syncRuntime() {
    const state = this.engine.state
    if (state !== this.lastState) {
      this.runtime.setSequence(sequenceIdForState(state))
      if (state === 'waking') this.speech.speak('waking')
      if (state === 'curious') this.speech.speak('curious')
      if (state === 'idle') this.speech.speak('idle')
      if (state === 'sleeping') this.speech.speak('sleeping')
      if (state === 'watching') this.nextWatchingSpeechAt = Date.now() + watchingGapMs()
      this.lastState = state
      this.emitStatus()
    }
    const now = Date.now()
    if (
      state === 'watching' &&
      !this.speaking &&
      !this.answering &&
      now >= this.nextWatchingSpeechAt
    ) {
      this.speech.speak('watching')
      this.nextWatchingSpeechAt = now + watchingGapMs()
    }
    const motion = this.cursor.motionGaze(now)
    this.refreshAttentionCues(motion)
    const voicePresent = now < this.voicePresentUntil
    const gaze = this.gaze.update(this.perception, this.pointer, state, voicePresent, motion)
    this.runtime.setGaze(gaze, {
      followHead: shouldFollowHead(this.pointer, this.perception, state, voicePresent, motion),
      speaking: this.speaking,
      dizzy: Boolean(motion.shaking),
    })
  }

  private refreshAttentionCues(motion: PointerGaze) {
    if (motion.shaking) {
      if (!this.shakeSpoken) {
        this.speech.speak('shaken')
        this.shakeSpoken = true
      }
      this.dragSpoken = true
    } else if (motion.active) {
      if (!this.dragSpoken) {
        this.speech.speak('carried')
        this.dragSpoken = true
      }
    } else {
      this.dragSpoken = false
      this.shakeSpoken = false
      if (this.pointer.active && !this.pointerWasActive) this.speech.speak('noticed')
    }
    this.pointerWasActive = this.pointer.active
  }

  private emitStatus() {
    const status: CompanionStatus = {
      state: this.engine.state,
      tracking: this.tracking,
      faceDetected: this.perception.faceDetected,
      voiceEnabled: this.voiceEnabled,
      voiceUnlocked: this.speech.isUnlocked,
      speaking: this.speaking,
      listening: this.listening,
      ttsEngine: this.ttsEngine,
      brain: this.brain,
      brainModel: this.brainModel,
      cameraLabel: this.cameraLabel,
      cameraPreferred: this.cameraPreferred,
      localOnly: true,
      error: this.error,
    }
    const previous = this.lastStatus
    if (
      previous &&
      previous.state === status.state &&
      previous.tracking === status.tracking &&
      previous.faceDetected === status.faceDetected &&
      previous.voiceEnabled === status.voiceEnabled &&
      previous.voiceUnlocked === status.voiceUnlocked &&
      previous.speaking === status.speaking &&
      previous.listening === status.listening &&
      previous.ttsEngine === status.ttsEngine &&
      previous.brain === status.brain &&
      previous.brainModel === status.brainModel &&
      previous.cameraLabel === status.cameraLabel &&
      previous.cameraPreferred === status.cameraPreferred &&
      previous.error === status.error
    ) {
      return
    }
    this.lastStatus = status
    this.onStatus?.(status)
  }
}
