export type PresenceSize = 'tiny' | 'full'

export class PresenceBody {
  private current: PresenceSize = 'tiny'

  get size(): PresenceSize {
    return this.current
  }

  get isTiny() {
    return this.current === 'tiny'
  }

  get isFull() {
    return this.current === 'full'
  }

  notice() {
    if (this.current === 'full') return false
    this.current = 'full'
    return true
  }

  rest() {
    if (this.current === 'tiny') return false
    this.current = 'tiny'
    return true
  }
}
