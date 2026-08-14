import { bundledAvatarName, sequenceIdForState } from '../catalog'

describe('companion sequences', () => {
  it('uses the bundled Strobi avatar', () => {
    expect(bundledAvatarName).toBe('Strobi')
  })

  it('uses a stable listening pose while watching so idle head yaw cannot fight gaze', () => {
    expect(sequenceIdForState('watching')).toBe('listening')
    expect(sequenceIdForState('idle')).toBe('idle')
    expect(sequenceIdForState('curious')).toBe('curious')
  })
})
