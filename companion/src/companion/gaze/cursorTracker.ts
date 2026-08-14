import { gazeFromScreenCursor, type ScreenPoint } from './cursorMath'
import type { PointerGaze } from './gazeController'
import { WindowMotionEstimator } from './windowMotion'

const isTauri = () => '__TAURI_INTERNALS__' in window

export type CursorSample = {
  pointer: PointerGaze
  motion: PointerGaze
}

const idlePointer: PointerGaze = { active: false, x: 0, y: 0 }

export class CursorTracker {
  private last: ScreenPoint = { x: 0, y: 0 }
  private lastMovedAt = 0
  private primed = false
  private stillMs: number
  private moveThreshold: number
  private motionEstimator = new WindowMotionEstimator()
  private originAt = 0
  private size: { width: number; height: number } | null = null
  private pointer: PointerGaze = idlePointer
  private unlistenMoved: (() => void) | null = null
  private startGeneration = 0

  constructor(options: { stillMs?: number; moveThreshold?: number } = {}) {
    this.stillMs = options.stillMs ?? 1600
    this.moveThreshold = options.moveThreshold ?? 0.035
  }

  get currentPointer() {
    return this.pointer
  }

  motionGaze(now = Date.now()) {
    return this.motionEstimator.gaze(now)
  }

  async start() {
    if (!isTauri() || this.unlistenMoved) return
    const generation = ++this.startGeneration
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      if (generation !== this.startGeneration) return
      const current = getCurrentWindow()
      this.unlistenMoved = await current.onMoved(({ payload }) => {
        this.noteOrigin({ x: payload.x, y: payload.y }, Date.now())
      })
    } catch {
      return
    }
  }

  stop() {
    this.startGeneration += 1
    this.unlistenMoved?.()
    this.unlistenMoved = null
  }

  async sample(now = Date.now()): Promise<CursorSample | null> {
    if (!isTauri()) return null
    try {
      const { cursorPosition, getCurrentWindow } = await import('@tauri-apps/api/window')
      const current = getCurrentWindow()
      const [cursor, origin, size] = await Promise.all([
        cursorPosition(),
        current.outerPosition(),
        current.outerSize(),
      ])
      this.size = { width: size.width, height: size.height }
      this.noteOrigin({ x: origin.x, y: origin.y }, now)
      const windowOrigin = this.motionEstimator.origin ?? origin
      const next = gazeFromScreenCursor(cursor, {
        x: windowOrigin.x,
        y: windowOrigin.y,
        width: size.width,
        height: size.height,
      })
      if (this.primed) {
        if (Math.hypot(next.x - this.last.x, next.y - this.last.y) > this.moveThreshold) {
          this.lastMovedAt = now
        }
      } else {
        this.primed = true
      }
      this.last = next
      this.pointer = {
        active: this.lastMovedAt > 0 && now - this.lastMovedAt < this.stillMs,
        x: next.x,
        y: next.y,
      }
      return {
        pointer: this.pointer,
        motion: this.motionEstimator.gaze(now),
      }
    } catch {
      return null
    }
  }

  private noteOrigin(origin: ScreenPoint, at: number) {
    if (at < this.originAt) return
    this.originAt = at
    this.motionEstimator.push(origin, at)
  }
}
