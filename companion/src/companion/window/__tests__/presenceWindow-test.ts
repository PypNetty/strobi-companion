import { applyPresenceWindow, companionWindow } from '../presenceWindow'

describe('presenceWindow', () => {
  it('keeps a full-size OS window so CSS scale can shrink the avatar in place', () => {
    expect(companionWindow).toEqual({ width: 280, height: 320 })
  })

  it('does not resize the OS window when presence changes', async () => {
    await expect(applyPresenceWindow(true)).resolves.toBeUndefined()
    await expect(applyPresenceWindow(false)).resolves.toBeUndefined()
  })
})
