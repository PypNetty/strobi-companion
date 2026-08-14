import { GazeController } from '../gazeController'
import { emptyPerception } from '../../perception/perceptionState'
import { exponentialApproach } from '../smoothing'

describe('gaze smoothing', () => {
  it('approaches the target without snapping in one step', () => {
    const next = exponentialApproach(0, 1, 16, 280)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(0.2)
  })
})

describe('GazeController', () => {
  it('follows the pointer before the face', () => {
    let now = 0
    const gaze = new GazeController({
      now: () => now,
      random: () => 0,
      smoothingMs: 1,
      reactionMs: 0,
      lookAwayEveryMinMs: 60_000,
      lookAwayEveryMaxMs: 60_000,
    })
    now = 16
    const result = gaze.update(
      { faceDetected: true, normalizedFaceX: 1, normalizedFaceY: 0 },
      { active: true, x: -0.5, y: 0.2 },
      'watching'
    )
    expect(result.x).toBeLessThan(0)
    expect(result.y).toBeGreaterThan(0)
  })

  it('does not copy the face position instantly', () => {
    let now = 0
    const gaze = new GazeController({
      now: () => now,
      random: () => 0,
      smoothingMs: 400,
      reactionMs: 80,
      lookAwayEveryMinMs: 60_000,
      lookAwayEveryMaxMs: 60_000,
    })
    now = 16
    const first = gaze.update(
      { faceDetected: true, normalizedFaceX: 1, normalizedFaceY: 0 },
      { active: false, x: 0, y: 0 },
      'watching'
    )
    expect(Math.abs(first.x)).toBeLessThan(0.15)
  })

  it('rests the gaze while sleeping', () => {
    let now = 0
    const gaze = new GazeController({
      now: () => now,
      random: () => 0,
      smoothingMs: 1,
      reactionMs: 0,
    })
    now = 32
    const result = gaze.update(
      { faceDetected: true, normalizedFaceX: 1, normalizedFaceY: -1 },
      { active: true, x: 1, y: -1 },
      'sleeping'
    )
    expect(result.x).toBeCloseTo(0, 1)
    expect(result.y).toBeGreaterThan(0)
  })

  it('keeps an idle wander when nobody is present', () => {
    let now = 1_000
    const gaze = new GazeController({
      now: () => now,
      random: () => 0,
      smoothingMs: 1,
      reactionMs: 0,
      lookAwayEveryMinMs: 60_000,
      lookAwayEveryMaxMs: 60_000,
    })
    now = 1_032
    const result = gaze.update(emptyPerception(), { active: false, x: 0, y: 0 }, 'idle')
    expect(Math.abs(result.x) + Math.abs(result.y)).toBeGreaterThan(0)
  })

  it('falls back to the face when the pointer is still', () => {
    let now = 0
    const gaze = new GazeController({
      now: () => now,
      random: () => 0,
      smoothingMs: 1,
      reactionMs: 0,
      lookAwayEveryMinMs: 60_000,
      lookAwayEveryMaxMs: 60_000,
    })
    now = 32
    const result = gaze.update(
      { faceDetected: true, normalizedFaceX: 0.7, normalizedFaceY: -0.2 },
      { active: false, x: -1, y: 1 },
      'watching'
    )
    expect(result.x).toBeGreaterThan(0.4)
    expect(result.y).toBeLessThan(0)
  })

  it('follows window motion before the pointer', () => {
    let now = 0
    const gaze = new GazeController({
      now: () => now,
      random: () => 0,
      smoothingMs: 1,
      reactionMs: 0,
      lookAwayEveryMinMs: 60_000,
      lookAwayEveryMaxMs: 60_000,
    })
    now = 16
    const result = gaze.update(
      { faceDetected: true, normalizedFaceX: 1, normalizedFaceY: 0 },
      { active: true, x: -0.8, y: 0.4 },
      'watching',
      false,
      { active: true, x: 0.7, y: -0.2 }
    )
    expect(result.x).toBeGreaterThan(0.3)
    expect(result.y).toBeLessThan(0)
  })

  it('returns to the pointer after window motion ends', () => {
    let now = 0
    const gaze = new GazeController({
      now: () => now,
      random: () => 0,
      smoothingMs: 1,
      reactionMs: 0,
      lookAwayEveryMinMs: 60_000,
      lookAwayEveryMaxMs: 60_000,
    })
    now = 16
    gaze.update(emptyPerception(), { active: true, x: 0.6, y: 0 }, 'watching', false, {
      active: true,
      x: -0.8,
      y: 0,
    })
    now = 48
    const result = gaze.update(
      emptyPerception(),
      { active: true, x: 0.6, y: 0 },
      'watching',
      false,
      { active: false, x: -0.8, y: 0 }
    )
    expect(result.x).toBeGreaterThan(0.3)
  })

  it('spins the gaze while the window is shaken', () => {
    let now = 0
    const gaze = new GazeController({
      now: () => now,
      random: () => 0,
      smoothingMs: 1,
      reactionMs: 0,
      lookAwayEveryMinMs: 60_000,
      lookAwayEveryMaxMs: 60_000,
    })
    now = 16
    const first = gaze.update(emptyPerception(), { active: false, x: 0, y: 0 }, 'watching', false, {
      active: true,
      x: 0.7,
      y: 0,
      shaking: true,
    })
    now = 80
    const second = gaze.update(emptyPerception(), { active: false, x: 0, y: 0 }, 'watching', false, {
      active: true,
      x: 0.7,
      y: 0,
      shaking: true,
    })
    expect(Math.abs(first.x) + Math.abs(first.y)).toBeGreaterThan(0.2)
    expect(first.x).not.toBeCloseTo(second.x, 1)
  })
})
