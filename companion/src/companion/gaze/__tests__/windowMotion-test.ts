import { detectWindowShake, WindowMotionEstimator } from '../windowMotion'

describe('WindowMotionEstimator', () => {
  it('looks in the direction of window travel while moving', () => {
    const motion = new WindowMotionEstimator({ stillMs: 200, lookbackMs: 90, moveThresholdPx: 8 })
    motion.push({ x: 100, y: 100 }, 0)
    const gaze = motion.push({ x: 160, y: 100 }, 80)
    expect(gaze.active).toBe(true)
    expect(gaze.x).toBeGreaterThan(0.4)
    expect(Math.abs(gaze.y)).toBeLessThan(0.2)
  })

  it('looks up when carried upward', () => {
    const motion = new WindowMotionEstimator({ stillMs: 200, lookbackMs: 90, moveThresholdPx: 8 })
    motion.push({ x: 40, y: 400 }, 0)
    const gaze = motion.push({ x: 40, y: 300 }, 80)
    expect(gaze.active).toBe(true)
    expect(gaze.y).toBeGreaterThan(0.4)
  })

  it('releases motion after the window stops', () => {
    const motion = new WindowMotionEstimator({ stillMs: 180, lookbackMs: 90, moveThresholdPx: 8 })
    motion.push({ x: 0, y: 0 }, 0)
    motion.push({ x: 50, y: 0 }, 80)
    expect(motion.gaze(80).active).toBe(true)
    expect(motion.gaze(300).active).toBe(false)
  })

  it('ignores tiny origin jitter', () => {
    const motion = new WindowMotionEstimator({ stillMs: 200, lookbackMs: 90, moveThresholdPx: 8 })
    motion.push({ x: 10, y: 10 }, 0)
    const gaze = motion.push({ x: 12, y: 11 }, 16)
    expect(gaze.active).toBe(false)
  })

  it('does not treat a slow reposition as a shake', () => {
    const motion = new WindowMotionEstimator({ shakeHoldMs: 400 })
    motion.push({ x: 0, y: 0 }, 0)
    motion.push({ x: 40, y: 0 }, 200)
    motion.push({ x: 80, y: 0 }, 400)
    expect(motion.gaze(400).shaking).toBe(false)
  })

  it('detects a rapid back-and-forth shake', () => {
    const motion = new WindowMotionEstimator({ shakeHoldMs: 400 })
    motion.push({ x: 0, y: 0 }, 0)
    motion.push({ x: 90, y: 0 }, 40)
    motion.push({ x: 0, y: 0 }, 80)
    motion.push({ x: 95, y: 0 }, 120)
    expect(motion.gaze(120).shaking).toBe(true)
    expect(motion.gaze(700).shaking).toBe(false)
  })
})

describe('detectWindowShake', () => {
  it('requires reversals, not just a fast one-way fling', () => {
    const flung = [
      { t: 0, x: 0, y: 0 },
      { t: 40, x: 180, y: 0 },
      { t: 80, x: 360, y: 0 },
    ]
    expect(detectWindowShake(flung)).toBe(false)
  })
})
