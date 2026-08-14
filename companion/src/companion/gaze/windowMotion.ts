import { gazeFromWindowDelta, type ScreenPoint } from './cursorMath'
import type { PointerGaze } from './gazeController'

export type MotionSample = { t: number; x: number; y: number }

export type WindowMotionOptions = {
  stillMs?: number
  moveThresholdPx?: number
  lookbackMs?: number
  scalePx?: number
  shakeLookbackMs?: number
  shakeHoldMs?: number
  minShakePathPx?: number
  minShakeSpeedPxPerSec?: number
  minShakeReversals?: number
  shakeReversalPx?: number
}

export type ShakeDetectOptions = {
  minPathPx?: number
  minSpeedPxPerSec?: number
  minReversals?: number
  reversalPx?: number
  whipSpeedPxPerSec?: number
  whipPathPx?: number
}

const inactive = (gaze: PointerGaze): PointerGaze =>
  gaze.active || gaze.shaking ? { ...gaze, active: false, shaking: false } : gaze

const sampleInWindow = (history: readonly MotionSample[], now: number, lookbackMs: number) => {
  let oldest = history[history.length - 1]
  for (const sample of history) {
    if (now - sample.t <= lookbackMs) {
      oldest = sample
      break
    }
  }
  return oldest
}

export const detectWindowShake = (
  samples: readonly MotionSample[],
  options: ShakeDetectOptions = {}
) => {
  const minPathPx = options.minPathPx ?? 180
  const minSpeedPxPerSec = options.minSpeedPxPerSec ?? 620
  const minReversals = options.minReversals ?? 2
  const reversalPx = options.reversalPx ?? 36
  const whipSpeedPxPerSec = options.whipSpeedPxPerSec ?? 1_350
  const whipPathPx = options.whipPathPx ?? 260
  if (samples.length < 3) return false

  let path = 0
  let accX = 0
  let accY = 0
  let signX = 0
  let signY = 0
  let reversals = 0
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]!
    const next = samples[index]!
    const dx = next.x - previous.x
    const dy = next.y - previous.y
    path += Math.hypot(dx, dy)
    accX += dx
    accY += dy
    if (Math.abs(accX) >= reversalPx) {
      const sign = Math.sign(accX)
      if (signX !== 0 && sign !== signX) reversals += 1
      signX = sign
      accX = 0
    }
    if (Math.abs(accY) >= reversalPx) {
      const sign = Math.sign(accY)
      if (signY !== 0 && sign !== signY) reversals += 1
      signY = sign
      accY = 0
    }
  }

  const durationMs = Math.max(samples[samples.length - 1]!.t - samples[0]!.t, 1)
  const speed = path / (durationMs / 1000)
  const oscillated = reversals >= minReversals && path >= minPathPx && speed >= minSpeedPxPerSec
  const whipped = reversals >= 1 && path >= whipPathPx && speed >= whipSpeedPxPerSec
  return oscillated || whipped
}

export class WindowMotionEstimator {
  private stillMs: number
  private moveThresholdPx: number
  private lookbackMs: number
  private scalePx: number
  private shakeLookbackMs: number
  private shakeHoldMs: number
  private shakeOptions: ShakeDetectOptions
  private history: MotionSample[] = []
  private last: ScreenPoint | null = null
  private lastAt = 0
  private held: PointerGaze = { active: false, x: 0, y: 0 }
  private heldUntil = 0
  private shakingUntil = 0

  constructor(options: WindowMotionOptions = {}) {
    this.stillMs = options.stillMs ?? 220
    this.moveThresholdPx = options.moveThresholdPx ?? 8
    this.lookbackMs = options.lookbackMs ?? 90
    this.scalePx = options.scalePx ?? 72
    this.shakeLookbackMs = options.shakeLookbackMs ?? 320
    this.shakeHoldMs = options.shakeHoldMs ?? 480
    this.shakeOptions = {
      minPathPx: options.minShakePathPx,
      minSpeedPxPerSec: options.minShakeSpeedPxPerSec,
      minReversals: options.minShakeReversals,
      reversalPx: options.shakeReversalPx,
    }
  }

  get origin() {
    return this.last
  }

  push(origin: ScreenPoint, now: number): PointerGaze {
    this.last = origin
    this.lastAt = now
    this.history.push({ t: now, x: origin.x, y: origin.y })
    const keepMs = Math.max(this.lookbackMs, this.shakeLookbackMs)
    while (this.history.length > 1 && this.history[0]!.t < now - keepMs) {
      this.history.shift()
    }
    const oldest = sampleInWindow(this.history, now, this.lookbackMs) ?? origin
    const dx = origin.x - oldest.x
    const dy = origin.y - oldest.y
    if (Math.hypot(dx, dy) >= this.moveThresholdPx) {
      const gaze = gazeFromWindowDelta(dx, dy, this.scalePx)
      this.held = { active: true, x: gaze.x, y: gaze.y, shaking: false }
      this.heldUntil = now + this.stillMs
    }
    const shakeSamples = this.history.filter(sample => now - sample.t <= this.shakeLookbackMs)
    if (detectWindowShake(shakeSamples, this.shakeOptions)) {
      this.shakingUntil = now + this.shakeHoldMs
    }
    return this.gaze(now)
  }

  gaze(now = this.lastAt): PointerGaze {
    const shaking = now < this.shakingUntil
    if (!this.held.active || now >= this.heldUntil) {
      this.held = inactive(this.held)
      return { ...this.held, shaking }
    }
    return { ...this.held, shaking }
  }
}
