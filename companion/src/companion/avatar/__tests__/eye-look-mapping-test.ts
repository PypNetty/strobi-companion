import { eyeLookForCompanion } from '../eyeLookMapping'
import type { CompanionState } from '../../behavior/companionState'
import type { MoodName } from '../../voice/intents'

const look = (
  state: CompanionState,
  extras: {
    mood?: MoodName | null
    gazeX?: number
    heard?: boolean
    previous?: 'attentive' | 'intrigued' | null
  } = {}
) =>
  eyeLookForCompanion({
    state,
    mood: extras.mood ?? null,
    gazeX: extras.gazeX ?? 0,
    heard: extras.heard,
    previous: extras.previous,
  })

describe('companion eye look mapping', () => {
  it('maps idle to neutre | |', () => {
    expect(look('idle')).toBe('neutral')
  })

  it('maps watching to attentive / | or intrigued | / from gaze', () => {
    expect(look('watching', { gazeX: -0.4 })).toBe('attentive')
    expect(look('watching', { gazeX: 0 })).toBe('attentive')
    expect(look('watching', { gazeX: 0.4 })).toBe('intrigued')
  })

  it('holds the watching tilt across small gaze wobble', () => {
    expect(look('watching', { gazeX: 0.05, previous: 'intrigued' })).toBe('intrigued')
    expect(look('watching', { gazeX: -0.05, previous: 'attentive' })).toBe('attentive')
  })

  it('maps curious and heard voice to intrigued | /', () => {
    expect(look('curious')).toBe('intrigued')
    expect(look('idle', { heard: true })).toBe('intrigued')
    expect(look('watching', { heard: true, gazeX: -0.5 })).toBe('intrigued')
  })

  it('maps happy and laugh moods to contente ∩ ∩', () => {
    expect(look('idle', { mood: 'happy' })).toBe('happy')
    expect(look('watching', { mood: 'laugh' })).toBe('happy')
  })

  it('maps tired waking to fatiguée - -', () => {
    expect(look('waking')).toBe('tired')
  })

  it('maps sleeping and dodo to endormie ― ―', () => {
    expect(look('sleeping')).toBe('sleeping')
    expect(look('idle', { mood: 'sleepy' })).toBe('sleeping')
    expect(look('watching', { mood: 'sleepy' })).toBe('sleeping')
  })

  it('leaves angry, sad and surprised moods on their sequence eyes', () => {
    expect(look('idle', { mood: 'angry' })).toBeNull()
    expect(look('watching', { mood: 'sad' })).toBeNull()
    expect(look('curious', { mood: 'surprised' })).toBeNull()
  })
})
