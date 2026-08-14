import type { CompanionState } from './companionState'
import type { CompanionEvent } from './events'

export type BehaviorEngineOptions = {
  now?: () => number
  sleepAfterMs?: number
  idleAfterLostMs?: number
  curiousDurationMs?: number
  wakeDurationMs?: number
  curiousJump?: number
  voiceHoldMs?: number
}

export type BehaviorSnapshot = {
  state: CompanionState
  faceDetected: boolean
  lastSeenAt: number | null
  lastLostAt: number | null
  lastFaceX: number
  lastFaceY: number
  lastHeardAt: number | null
  enteredStateAt: number
}

const hypot = (x: number, y: number) => Math.hypot(x, y)

export class BehaviorEngine {
  private now: () => number
  private sleepAfterMs: number
  private idleAfterLostMs: number
  private curiousDurationMs: number
  private wakeDurationMs: number
  private curiousJump: number
  private voiceHoldMs: number
  private current: CompanionState = 'idle'
  private faceDetected = false
  private lastSeenAt: number | null = null
  private lastLostAt: number | null = null
  private lastFaceX = 0
  private lastFaceY = 0
  private lastHeardAt: number | null = null
  private enteredStateAt: number
  private sawFaceOnce = false

  constructor(options: BehaviorEngineOptions = {}) {
    this.now = options.now ?? Date.now
    this.sleepAfterMs = options.sleepAfterMs ?? 60_000
    this.idleAfterLostMs = options.idleAfterLostMs ?? 2_400
    this.curiousDurationMs = options.curiousDurationMs ?? 2_200
    this.wakeDurationMs = options.wakeDurationMs ?? 1_600
    this.curiousJump = options.curiousJump ?? 0.42
    this.voiceHoldMs = options.voiceHoldMs ?? 1_800
    this.enteredStateAt = this.now()
  }

  get state(): CompanionState {
    return this.current
  }

  snapshot(): BehaviorSnapshot {
    return {
      state: this.current,
      faceDetected: this.faceDetected,
      lastSeenAt: this.lastSeenAt,
      lastLostAt: this.lastLostAt,
      lastFaceX: this.lastFaceX,
      lastFaceY: this.lastFaceY,
      lastHeardAt: this.lastHeardAt,
      enteredStateAt: this.enteredStateAt,
    }
  }

  dispatch(event: CompanionEvent): CompanionState {
    const now = this.now()
    switch (event.type) {
      case 'FACE_DETECTED':
        this.onFaceDetected(now, event.x, event.y)
        break
      case 'USER_RETURNED':
        this.onFaceDetected(now, this.lastFaceX, this.lastFaceY)
        break
      case 'VOICE_DETECTED':
      case 'CURSOR_MOVED':
        this.onSoftPresence(now)
        break
      case 'FACE_LOST':
      case 'USER_IDLE':
        this.onFaceLost(now)
        break
      case 'TICK':
        break
    }
    this.advanceTimers(now)
    return this.current
  }

  private onFaceDetected(now: number, x: number, y: number) {
    const jump = hypot(x - this.lastFaceX, y - this.lastFaceY)
    const returning = !this.faceDetected
    this.faceDetected = true
    this.lastSeenAt = now
    this.lastLostAt = null
    this.lastFaceX = x
    this.lastFaceY = y

    if (this.current === 'sleeping' || this.current === 'waking') {
      if (this.current !== 'waking') this.enter('waking', now)
      this.sawFaceOnce = true
      return
    }

    if (returning && this.sawFaceOnce) {
      this.enter('curious', now)
      return
    }

    if (!this.sawFaceOnce) {
      this.sawFaceOnce = true
      this.enter('curious', now)
      return
    }

    if (this.current === 'watching' && jump >= this.curiousJump) {
      this.enter('curious', now)
      return
    }

    if (this.current === 'idle') this.enter('curious', now)
  }

  private isPresent(now: number) {
    return (
      this.faceDetected ||
      (this.lastHeardAt !== null && now - this.lastHeardAt < this.voiceHoldMs)
    )
  }

  private onSoftPresence(now: number) {
    this.lastHeardAt = now
    this.lastLostAt = null
    if (this.current === 'sleeping') {
      this.enter('waking', now)
      return
    }
    if (this.current === 'idle') this.enter('curious', now)
  }

  private onFaceLost(now: number) {
    this.faceDetected = false
    if (this.isPresent(now)) return
    if (this.lastLostAt !== null) return
    this.lastLostAt = now
    if (this.current === 'waking') this.enter('idle', now)
  }

  private advanceTimers(now: number) {
    const present = this.isPresent(now)
    if (this.current === 'curious' && now - this.enteredStateAt >= this.curiousDurationMs) {
      this.enter(present ? 'watching' : 'idle', now)
    }

    if (this.current === 'waking' && now - this.enteredStateAt >= this.wakeDurationMs) {
      this.enter(present ? 'watching' : 'idle', now)
    }

    if (!present) {
      if (this.lastLostAt === null) this.lastLostAt = now
      const absent = now - this.lastLostAt
      if (
        (this.current === 'watching' || this.current === 'curious') &&
        absent >= this.idleAfterLostMs
      ) {
        this.enter('idle', now)
      }
      if (this.current === 'idle' && absent >= this.sleepAfterMs) {
        this.enter('sleeping', now)
      }
    } else {
      this.lastLostAt = null
    }
  }

  private enter(state: CompanionState, now: number) {
    if (this.current === state) return
    this.current = state
    this.enteredStateAt = now
  }
}
