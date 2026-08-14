import type { CompanionState } from '../behavior/companionState'
import type { PerceptionState } from '../perception/perceptionState'
import { clampUnit, exponentialApproach } from './smoothing'

export type GazePoint = { x: number; y: number }

export type PointerGaze = {
  active: boolean
  x: number
  y: number
  shaking?: boolean
}

export type GazeControllerOptions = {
  now?: () => number
  random?: () => number
  smoothingMs?: number
  reactionMs?: number
  lookAwayEveryMinMs?: number
  lookAwayEveryMaxMs?: number
  lookAwayDurationMinMs?: number
  lookAwayDurationMaxMs?: number
  lookAwayAmount?: number
  limit?: number
}

const idleWander = (now: number): GazePoint => ({
  x: Math.sin(now / 4300) * 0.18 + Math.sin(now / 9100) * 0.08,
  y: Math.cos(now / 5100) * 0.1 + Math.sin(now / 7600) * 0.05,
})

const idleMotion: PointerGaze = { active: false, x: 0, y: 0 }
const dizzySmoothingMs = 55

export const dizzyGaze = (now: number): GazePoint => ({
  x: Math.sin(now / 48) * 0.95,
  y: Math.cos(now / 61) * 0.42 + Math.sin(now / 27) * 0.18,
})

export const isShaking = (motion: PointerGaze) => Boolean(motion.shaking)

export const shouldFollowHead = (
  pointer: PointerGaze,
  perception: PerceptionState,
  state: CompanionState,
  voicePresent: boolean,
  motion: PointerGaze = idleMotion
) =>
  isShaking(motion) ||
  (state !== 'sleeping' &&
    (motion.active || pointer.active || perception.faceDetected || voicePresent))

export class GazeController {
  private now: () => number
  private random: () => number
  private smoothingMs: number
  private reactionMs: number
  private lookAwayEveryMinMs: number
  private lookAwayEveryMaxMs: number
  private lookAwayDurationMinMs: number
  private lookAwayDurationMaxMs: number
  private lookAwayAmount: number
  private limit: number
  private current: GazePoint = { x: 0, y: 0 }
  private intended: GazePoint = { x: 0, y: 0 }
  private pending: GazePoint | null = null
  private pendingSince = 0
  private lastTick = 0
  private nextLookAwayAt = 0
  private lookAwayUntil = 0
  private lookAwayOffset: GazePoint = { x: 0, y: 0 }

  constructor(options: GazeControllerOptions = {}) {
    this.now = options.now ?? Date.now
    this.random = options.random ?? Math.random
    this.smoothingMs = options.smoothingMs ?? 280
    this.reactionMs = options.reactionMs ?? 90
    this.lookAwayEveryMinMs = options.lookAwayEveryMinMs ?? 4200
    this.lookAwayEveryMaxMs = options.lookAwayEveryMaxMs ?? 8200
    this.lookAwayDurationMinMs = options.lookAwayDurationMinMs ?? 220
    this.lookAwayDurationMaxMs = options.lookAwayDurationMaxMs ?? 520
    this.lookAwayAmount = options.lookAwayAmount ?? 0.28
    this.limit = options.limit ?? 0.82
    const now = this.now()
    this.lastTick = now
    this.scheduleLookAway(now)
  }

  get gaze(): GazePoint {
    return this.current
  }

  update(
    perception: PerceptionState,
    pointer: PointerGaze,
    state: CompanionState,
    voicePresent = false,
    motion: PointerGaze = idleMotion
  ): GazePoint {
    const now = this.now()
    const dt = Math.min(now - this.lastTick, 80)
    this.lastTick = now
    const shaking = isShaking(motion)
    this.refreshLookAway(now, state, motion.active || shaking)

    const desired = this.desiredTarget(perception, pointer, state, now, voicePresent, motion)
    if (shaking) {
      this.pending = desired
      this.intended = desired
    } else if (
      !this.pending ||
      Math.hypot(desired.x - this.pending.x, desired.y - this.pending.y) > 0.04
    ) {
      this.pending = desired
      this.pendingSince = now
    }
    if (!shaking && now - this.pendingSince >= this.reactionMs) this.intended = this.pending

    const target = this.applyLookAway(this.intended, state, now, motion.active || shaking)
    const smoothing = shaking ? Math.min(this.smoothingMs, dizzySmoothingMs) : this.smoothingMs
    const limit = shaking ? 1 : this.limit
    this.current = {
      x: clampUnit(exponentialApproach(this.current.x, target.x, dt, smoothing), limit),
      y: clampUnit(exponentialApproach(this.current.y, target.y, dt, smoothing), limit),
    }
    return this.current
  }

  private desiredTarget(
    perception: PerceptionState,
    pointer: PointerGaze,
    state: CompanionState,
    now: number,
    voicePresent: boolean,
    motion: PointerGaze
  ): GazePoint {
    if (isShaking(motion)) return dizzyGaze(now)
    if (state === 'sleeping') return { x: 0, y: 0.12 }
    if (motion.active) return { x: motion.x, y: motion.y }
    if (pointer.active) return { x: pointer.x, y: pointer.y }
    if (perception.faceDetected) {
      return {
        x: perception.normalizedFaceX,
        y: perception.normalizedFaceY,
      }
    }
    if (voicePresent) return { x: 0, y: 0.05 }
    return idleWander(now)
  }

  private applyLookAway(
    target: GazePoint,
    state: CompanionState,
    now: number,
    motionActive: boolean
  ): GazePoint {
    if (state === 'sleeping' || motionActive || now >= this.lookAwayUntil) return target
    return {
      x: clampUnit(target.x + this.lookAwayOffset.x, this.limit),
      y: clampUnit(target.y + this.lookAwayOffset.y, this.limit),
    }
  }

  private refreshLookAway(now: number, state: CompanionState, motionActive: boolean) {
    if (state === 'sleeping' || motionActive) return
    if (now < this.lookAwayUntil) return
    if (now < this.nextLookAwayAt) return
    const duration =
      this.lookAwayDurationMinMs +
      this.random() * (this.lookAwayDurationMaxMs - this.lookAwayDurationMinMs)
    const angle = this.random() * Math.PI * 2
    const amount = 0.12 + this.random() * this.lookAwayAmount
    this.lookAwayOffset = { x: Math.cos(angle) * amount, y: Math.sin(angle) * amount * 0.65 }
    this.lookAwayUntil = now + duration
    this.scheduleLookAway(this.lookAwayUntil)
  }

  private scheduleLookAway(from: number) {
    const wait =
      this.lookAwayEveryMinMs + this.random() * (this.lookAwayEveryMaxMs - this.lookAwayEveryMinMs)
    this.nextLookAwayAt = from + wait
  }
}
