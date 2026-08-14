import { PresenceBody } from '../presenceBody'

describe('PresenceBody', () => {
  it('starts tiny', () => {
    const body = new PresenceBody()
    expect(body.size).toBe('tiny')
    expect(body.notice()).toBe(true)
    expect(body.size).toBe('full')
  })

  it('does not greet twice while already full', () => {
    const body = new PresenceBody()
    expect(body.notice()).toBe(true)
    expect(body.notice()).toBe(false)
    expect(body.isFull).toBe(true)
  })

  it('shrinks back after a rest so the next hello can happen', () => {
    const body = new PresenceBody()
    body.notice()
    expect(body.rest()).toBe(true)
    expect(body.isTiny).toBe(true)
    expect(body.notice()).toBe(true)
  })

  it('does nothing when resting while already tiny', () => {
    const body = new PresenceBody()
    expect(body.rest()).toBe(false)
  })
})
