import { BehaviorEngine } from '../behaviorEngine'

describe('BehaviorEngine', () => {
  const createEngine = () => {
    let now = 1_000
    const engine = new BehaviorEngine({
      now: () => now,
      sleepAfterMs: 60_000,
      idleAfterLostMs: 2_000,
      curiousDurationMs: 2_000,
      wakeDurationMs: 1_000,
      curiousJump: 0.4,
      voiceHoldMs: 8_000,
    })
    return {
      engine,
      advance: (ms: number) => {
        now += ms
        engine.dispatch({ type: 'TICK' })
      },
    }
  }

  it('starts idle until a face appears', () => {
    const { engine } = createEngine()
    expect(engine.state).toBe('idle')
  })

  it('becomes curious then watching when a face is detected', () => {
    const { engine, advance } = createEngine()
    engine.dispatch({ type: 'FACE_DETECTED', x: 0.1, y: 0 })
    expect(engine.state).toBe('curious')
    advance(2_000)
    expect(engine.state).toBe('watching')
  })

  it('returns to idle then sleeping after a long absence', () => {
    const { engine, advance } = createEngine()
    engine.dispatch({ type: 'FACE_DETECTED', x: 0, y: 0 })
    advance(2_000)
    expect(engine.state).toBe('watching')

    engine.dispatch({ type: 'FACE_LOST' })
    expect(engine.state).toBe('watching')
    advance(2_000)
    expect(engine.state).toBe('idle')
    advance(60_000)
    expect(engine.state).toBe('sleeping')
  })

  it('wakes progressively when the user returns', () => {
    const { engine, advance } = createEngine()
    engine.dispatch({ type: 'FACE_DETECTED', x: 0, y: 0 })
    advance(2_000)
    engine.dispatch({ type: 'FACE_LOST' })
    advance(62_000)
    expect(engine.state).toBe('sleeping')

    engine.dispatch({ type: 'FACE_DETECTED', x: 0.2, y: -0.1 })
    expect(engine.state).toBe('waking')
    advance(1_000)
    expect(engine.state).toBe('watching')
  })

  it('does not jump to watching instantly after FACE_LOST while sleeping', () => {
    const { engine, advance } = createEngine()
    engine.dispatch({ type: 'FACE_DETECTED', x: 0, y: 0 })
    advance(2_000)
    engine.dispatch({ type: 'FACE_LOST' })
    advance(62_000)
    engine.dispatch({ type: 'USER_RETURNED' })
    expect(engine.state).toBe('waking')
  })

  it('treats a local voice as presence', () => {
    const { engine, advance } = createEngine()
    engine.dispatch({ type: 'VOICE_DETECTED' })
    expect(engine.state).toBe('curious')
    advance(2_000)
    expect(engine.state).toBe('watching')
  })

  it('wakes from sleep when a local voice is heard', () => {
    const { engine, advance } = createEngine()
    engine.dispatch({ type: 'FACE_DETECTED', x: 0, y: 0 })
    advance(2_000)
    engine.dispatch({ type: 'FACE_LOST' })
    advance(62_000)
    expect(engine.state).toBe('sleeping')
    engine.dispatch({ type: 'VOICE_DETECTED' })
    expect(engine.state).toBe('waking')
  })
})
