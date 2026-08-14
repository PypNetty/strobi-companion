import { createListenPauseGate, shouldAckHeardVoice } from '../listen'

describe('voice activity fallback', () => {
  it('acks when Windows dictation is off or failed', () => {
    expect(
      shouldAckHeardVoice({
        listening: false,
        listenFailed: false,
        speaking: false,
        answering: false,
        missedVad: 1,
      })
    ).toBe(true)
    expect(
      shouldAckHeardVoice({
        listening: true,
        listenFailed: true,
        speaking: false,
        answering: false,
        missedVad: 1,
      })
    ).toBe(true)
  })

  it('waits for a few missed phrases before talking over a live listener', () => {
    expect(
      shouldAckHeardVoice({
        listening: true,
        listenFailed: false,
        speaking: false,
        answering: false,
        missedVad: 2,
      })
    ).toBe(false)
    expect(
      shouldAckHeardVoice({
        listening: true,
        listenFailed: false,
        speaking: false,
        answering: false,
        missedVad: 3,
      })
    ).toBe(true)
  })

  it('stays quiet while she is already speaking or answering', () => {
    expect(
      shouldAckHeardVoice({
        listening: false,
        listenFailed: true,
        speaking: true,
        answering: false,
        missedVad: 4,
      })
    ).toBe(false)
    expect(
      shouldAckHeardVoice({
        listening: false,
        listenFailed: true,
        speaking: false,
        answering: true,
        missedVad: 4,
      })
    ).toBe(false)
  })
})

describe('listen pause gate', () => {
  it('resumes even if a pause call finishes after resume was requested', async () => {
    const calls: string[] = []
    let finishPause: (() => void) | undefined
    const gate = createListenPauseGate({
      pause: () =>
        new Promise(resolve => {
          calls.push('pause')
          finishPause = resolve
        }),
      resume: async () => {
        calls.push('resume')
      },
    })
    const pausing = gate.pause()
    await Promise.resolve()
    await Promise.resolve()
    const resuming = gate.resume()
    finishPause?.()
    await pausing
    await resuming
    expect(calls).toEqual(['pause', 'resume'])
  })
})
