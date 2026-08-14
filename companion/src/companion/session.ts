import { BehaviorEngine } from './behavior/behaviorEngine'
import { PresenceBody } from './behavior/presenceBody'
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
import { avatarFromRecipe, creatureRecipes } from './avatar/recipes'
import { creatureFromName } from './avatar/fromName'
import { eyeLookForCompanion, type EyeLookId } from './avatar/eyeLookMapping'
import { mountCompanionAvatar, type CompanionRuntime } from './avatar/runtime'
import { CompanionSpeech } from './voice/speech'
import { VoiceActivityDetector } from './voice/activity'
import { NativeListener, shouldAckHeardVoice, type VoiceStack } from './voice/listen'
import {
  classifyIntent,
  colorOverrideFor,
  foldSpoken,
  intentKey,
  isLikelyEcho,
  replyForIntent,
  sequenceIdForMood,
  type CompanionIntent,
  type ColorName,
  type MoodName,
} from './voice/intents'
import { pickSpeechLine } from './voice/lines'
import { applyPresenceWindow } from './window/presenceWindow'

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
  expanded: boolean
  localOnly: true
  error?: string
  listenError?: string
}

export type CompanionSessionOptions = {
  onStatus?: (status: CompanionStatus) => void
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export class CompanionSession {
  private engine = new BehaviorEngine()
  private presence = new PresenceBody()
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
  private greetedUntil = 0
  private moodSequence: string | null = null
  private mood: MoodName | null = null
  private lastEyeLook: EyeLookId | null = 'neutral'
  private listenError?: string
  private missedVad = 0
  private lastListenRetry = 0
  private pendingUtterance: string | null = null
  private lastColor: ColorName | null = null
  private lastHeardFold = ''
  private lastHeardAt = 0
  private lastIntentKey = ''
  private lastIntentAt = 0
  private echoGuardUntil = 0

  constructor(host: HTMLElement, options: CompanionSessionOptions = {}) {
    this.onStatus = options.onStatus
    this.speech = new CompanionSpeech({
      onSpeaking: speaking => {
        this.speaking = speaking
        if (speaking) {
          void this.listener.pause()
        } else {
          this.echoGuardUntil = Date.now() + 400
          this.answering = false
          void this.listener.resume()
          this.flushPendingUtterance()
        }
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
      this.listenError = undefined
      this.missedVad = 0
      this.emitStatus()
      return
    }
    this.unlockInteraction()
    await this.ensureListener()
    await this.ensureVoice()
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
      await this.ensureListener()
      await this.ensureVoice()
    }
  }

  setPointer(pointer: PointerGaze) {
    if (isTauri()) return
    this.pointer = pointer
    if (pointer.active) this.noticePresence()
  }

  unlockInteraction() {
    this.noticePresence()
    this.speech.unlock()
    void this.voiceDetector?.resume()
    if (this.voiceEnabled) void this.ensureListener()
    if (this.voiceEnabled && !this.voiceDetector?.active) void this.ensureVoice()
    this.emitStatus()
  }

  async start() {
    const generation = ++this.startGeneration
    await this.cursor.start()
    if (this.tracking) await this.ensureTracker()
    if (this.voiceEnabled) await this.ensureListener()
    if (this.voiceEnabled) await this.ensureVoice()
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
        const grew = this.noticePresence()
        if (this.speaking || this.answering) return
        if (!grew) {
          this.missedVad += 1
          if (
            shouldAckHeardVoice({
              listening: this.listening,
              listenFailed: Boolean(this.listenError),
              speaking: this.speaking,
              answering: this.answering,
              missedVad: this.missedVad,
            })
          ) {
            this.missedVad = 0
            this.speech.speak('heard')
            if (!this.listener.active) void this.ensureListener()
          }
        }
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
        if (this.speaking || this.answering) return
        this.voicePresentUntil = Date.now() + 1_800
        this.engine.dispatch({ type: 'VOICE_DETECTED' })
        this.noticePresence()
        this.syncRuntime()
      },
      onStack: stack => this.onVoiceStack(stack),
      onError: message => {
        this.listenError = message
        this.listening = false
        this.emitStatus()
      },
    })
    this.listening = started
    if (started) this.listenError = undefined
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
    const intent = classifyIntent(text)
    const now = Date.now()
    const busy = this.speaking || this.answering
    const guardingEcho = busy || now < this.echoGuardUntil
    if (intent.type === 'stop') {
      this.pendingUtterance = null
      this.speech.cancel()
      void this.replyTo(text)
      return
    }
    if (isLikelyEcho(text, this.lastSpoken, { duringSpeech: guardingEcho })) return
    const folded = foldSpoken(text)
    if (busy) {
      if (folded && folded !== this.lastHeardFold) this.pendingUtterance = text
      return
    }
    if (folded && folded === this.lastHeardFold && now - this.lastHeardAt < 1_800) return
    if (folded) {
      this.lastHeardFold = folded
      this.lastHeardAt = now
    }
    this.listenError = undefined
    this.missedVad = 0
    this.listening = true
    this.voicePresentUntil = Date.now() + 2_400
    this.engine.dispatch({ type: 'VOICE_DETECTED' })
    this.noticePresence()
    void this.replyTo(text)
  }

  private async replyTo(text: string) {
    if (this.answering) {
      this.pendingUtterance = text
      return
    }
    this.answering = true
    try {
      const intent = classifyIntent(text)
      const key = intentKey(intent)
      const now = Date.now()
      const repeat = key === this.lastIntentKey && now - this.lastIntentAt < 2_000
      this.applyAppearance(intent)
      if (repeat) return
      this.lastIntentKey = key
      this.lastIntentAt = now
      const reply = replyForIntent(intent)
      this.lastSpoken = reply
      this.speech.speakText(reply)
    } finally {
      if (!this.speaking && !this.speech.isSpeaking) {
        this.answering = false
        this.flushPendingUtterance()
      }
      this.syncRuntime()
      this.emitStatus()
    }
  }

  private flushPendingUtterance() {
    const queued = this.pendingUtterance
    this.pendingUtterance = null
    if (!queued || this.answering || this.speaking) return
    if (isLikelyEcho(queued, this.lastSpoken, { duringSpeech: true })) return
    if (foldSpoken(queued) === this.lastHeardFold) return
    void this.replyTo(queued)
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
    this.noticePresenceFromFace(state.faceDetected)
    this.tracker?.setReducedRate(this.engine.state === 'sleeping')
    this.syncRuntime()
    this.emitStatus()
  }

  private loop = (time = performance.now()) => {
    if (this.destroyed) return
    if (time - this.lastEngineTick >= 250) {
      this.engine.dispatch({ type: 'TICK' })
      this.lastEngineTick = time
      if (
        this.voiceEnabled &&
        !this.suspended &&
        !this.listener.active &&
        time - this.lastListenRetry >= 4_000
      ) {
        this.lastListenRetry = time
        void this.ensureListener()
      }
    }
    const motion = this.cursor.motionGaze(Date.now())
    const pollMs = motion.active || motion.shaking ? 32 : 80
    if (time - this.lastCursorPoll >= pollMs) {
      this.lastCursorPoll = time
      void this.cursor.sample(Date.now()).then(sample => {
        if (sample && !this.destroyed) {
          this.pointer = sample.pointer
          if (sample.pointer.active) {
            this.engine.dispatch({ type: 'CURSOR_MOVED' })
            this.noticePresence()
          }
        }
      })
    }
    this.syncRuntime()
    this.frame = requestAnimationFrame(this.loop)
  }

  private syncRuntime() {
    const state = this.engine.state
    if (state !== this.lastState) {
      if (state === 'sleeping' || state === 'waking') {
        this.moodSequence = null
        this.mood = null
      }
      this.runtime.setSequence(this.moodSequence ?? sequenceIdForState(state))
      if (state === 'idle') this.restPresence()
      if (state === 'sleeping') this.restPresence()
      this.lastState = state
      this.emitStatus()
    }
    const now = Date.now()
    const motion = this.cursor.motionGaze(now)
    this.refreshAttentionCues(motion)
    const voicePresent = now < this.voicePresentUntil
    const gaze = this.gaze.update(this.perception, this.pointer, state, voicePresent, motion)
    const eyeLook = eyeLookForCompanion({
      state,
      mood: this.mood,
      gazeX: gaze.x,
      heard: voicePresent,
      previous: this.lastEyeLook,
    })
    this.lastEyeLook = eyeLook
    this.runtime.setEyeLook(eyeLook)
    this.runtime.setGaze(gaze, {
      followHead: shouldFollowHead(this.pointer, this.perception, state, voicePresent, motion),
      speaking: this.speaking,
      dizzy: Boolean(motion.shaking),
    })
  }

  private refreshAttentionCues(motion: PointerGaze) {
    if (motion.shaking || motion.active) this.noticePresence()
    if (Date.now() < this.greetedUntil) {
      this.dragSpoken = true
      this.shakeSpoken = true
      this.pointerWasActive = this.pointer.active
      return
    }
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
    }
    this.pointerWasActive = this.pointer.active
  }

  private noticePresenceFromFace(faceDetected: boolean) {
    if (faceDetected) this.noticePresence()
  }

  private noticePresence() {
    if (!this.presence.notice()) return false
    this.greetedUntil = Date.now() + 2_400
    if (this.voiceEnabled) {
      const hello = pickSpeechLine('greeting')
      if (hello) {
        this.lastSpoken = hello
        this.speech.speakText(hello)
      }
    }
    void applyPresenceWindow(true)
    this.emitStatus()
    return true
  }

  private restPresence() {
    if (!this.presence.rest()) return
    void applyPresenceWindow(false)
    this.emitStatus()
  }

  private applyAppearance(intent: CompanionIntent) {
    if (intent.type === 'color') {
      this.lastColor = intent.color
      this.runtime.setColors(colorOverrideFor(intent.color))
      return
    }
    if (intent.type === 'colorReset') {
      this.lastColor = null
      this.runtime.setColors(null)
      return
    }
    if (intent.type === 'shape') {
      this.runtime.setAvatar(avatarFromRecipe(creatureFromName(intent.name)))
      this.runtime.setColors(this.lastColor ? colorOverrideFor(this.lastColor) : null)
      return
    }
    if (intent.type === 'shapeReset') {
      this.runtime.setAvatar(avatarFromRecipe(creatureRecipes.strobi))
      this.runtime.setColors(this.lastColor ? colorOverrideFor(this.lastColor) : null)
      return
    }
    if (intent.type === 'mood') {
      this.mood = intent.mood
      this.moodSequence = sequenceIdForMood(intent.mood)
      this.runtime.setSequence(this.moodSequence)
      return
    }
    if (intent.type === 'sleep') {
      this.mood = null
      this.moodSequence = null
      this.runtime.setSequence(sequenceIdForState(this.engine.state))
    }
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
      expanded: this.presence.isFull,
      localOnly: true,
      error: this.error,
      listenError: this.listenError,
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
      previous.expanded === status.expanded &&
      previous.error === status.error &&
      previous.listenError === status.listenError
    ) {
      return
    }
    this.lastStatus = status
    this.onStatus?.(status)
  }
}
