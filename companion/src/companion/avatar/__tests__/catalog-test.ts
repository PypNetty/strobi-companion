import {
  bundledAvatarName,
  companionAvatar,
  companionBehavior,
  loadBundledDocument,
  sequenceIdForState,
} from '../catalog'
import { sequenceIdForMood, type MoodName } from '../../voice/intents'

describe('companion sequences', () => {
  it('uses a companion-owned Strobi, not the lab sphere', () => {
    expect(bundledAvatarName).toBe('Strobi')
    const document = loadBundledDocument()
    const lab = document.library.avatars.find(avatar => avatar.id === 'strobi')
    const avatar = companionAvatar(document)
    expect(avatar.name).toBe('Strobi')
    expect(avatar.colors.body).not.toBe(lab?.colors.body)
    expect(avatar.body.primary.type).not.toBe(lab?.body.primary.type)
    expect(avatar.body.nodes.length).toBeGreaterThan(0)
  })

  it('uses a stable listening pose while watching so idle head yaw cannot fight gaze', () => {
    expect(sequenceIdForState('watching')).toBe('listening')
    expect(sequenceIdForState('idle')).toBe('idle')
    expect(sequenceIdForState('curious')).toBe('curious')
  })

  it('maps spoken moods onto sequences that exist in the bundled library', () => {
    const document = loadBundledDocument()
    const avatar = companionAvatar(document)
    const behavior = companionBehavior(document, avatar)
    const ids = new Set(behavior.sequences.map(sequence => sequence.id))
    const moods: MoodName[] = ['laugh', 'angry', 'happy', 'sad', 'surprised', 'sleepy']
    for (const mood of moods) {
      expect(ids.has(sequenceIdForMood(mood))).toBe(true)
    }
  })
})
