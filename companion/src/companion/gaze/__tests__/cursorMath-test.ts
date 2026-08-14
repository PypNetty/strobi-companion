import { gazeFromScreenCursor, gazeFromWindowDelta } from '../cursorMath'

describe('cursor gaze', () => {
  it('looks right when the cursor is to the right of the window', () => {
    const gaze = gazeFromScreenCursor(
      { x: 800, y: 200 },
      { x: 100, y: 100, width: 280, height: 320 },
      480
    )
    expect(gaze.x).toBeGreaterThan(0.5)
    expect(gaze.y).toBeLessThan(0.2)
  })

  it('looks up when the cursor is above the window', () => {
    const gaze = gazeFromScreenCursor(
      { x: 240, y: 0 },
      { x: 100, y: 100, width: 280, height: 320 },
      480
    )
    expect(gaze.y).toBeGreaterThan(0.2)
  })

  it('looks less to the side when the window moves toward the cursor', () => {
    const cursor = { x: 800, y: 200 }
    const far = gazeFromScreenCursor(cursor, { x: 100, y: 100, width: 280, height: 320 }, 480)
    const near = gazeFromScreenCursor(cursor, { x: 700, y: 100, width: 280, height: 320 }, 480)
    expect(Math.abs(near.x)).toBeLessThan(Math.abs(far.x))
  })
})

describe('window motion gaze', () => {
  it('looks right when the window moves right', () => {
    const gaze = gazeFromWindowDelta(80, 0)
    expect(gaze.x).toBeGreaterThan(0.4)
    expect(Math.abs(gaze.y)).toBeLessThan(0.05)
  })

  it('looks left when the window moves left', () => {
    const gaze = gazeFromWindowDelta(-80, 0)
    expect(gaze.x).toBeLessThan(-0.4)
  })

  it('looks up when the window moves up', () => {
    const gaze = gazeFromWindowDelta(0, -80)
    expect(gaze.y).toBeGreaterThan(0.4)
  })

  it('looks down when the window moves down', () => {
    const gaze = gazeFromWindowDelta(0, 80)
    expect(gaze.y).toBeLessThan(-0.4)
  })
})
