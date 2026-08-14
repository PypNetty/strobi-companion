import {
  applyEyeLook,
  EYE_LOOK_TILT_DEG,
  eyeShapeForLook,
  gazeFollowsEyeLook,
} from '@/features/avatar/eyeLooks'
import { poseFromExpression, renderAvatar } from '@/features/avatar/geometry'
import { defaultExpression } from '@/features/avatar/presets'
import { surfacePresets } from '@/features/avatar/surfaces'

const posed = (look: Parameters<typeof applyEyeLook>[1]) => applyEyeLook(defaultExpression, look)

describe('eye looks', () => {
  it('draws neutre as upright open bars', () => {
    const look = posed('neutral')
    expect(look.widthLeft).toBeLessThan(look.heightLeft)
    expect(look.widthRight).toBeLessThan(look.heightRight)
    expect(look.leftAngle).toBe(0)
    expect(look.rightAngle).toBe(0)
    expect(eyeShapeForLook('neutral')).toBe('rounded')
    expect(gazeFollowsEyeLook('neutral')).toBe(true)
  })

  it('tilts only the left eye for attentive / |', () => {
    const look = posed('attentive')
    expect(look.leftAngle).toBe(EYE_LOOK_TILT_DEG)
    expect(look.rightAngle).toBe(0)
    expect(look.heightLeft).toBeGreaterThan(look.widthLeft)
    expect(gazeFollowsEyeLook('attentive')).toBe(true)
  })

  it('tilts only the right eye for intrigued | /', () => {
    const look = posed('intrigued')
    expect(look.leftAngle).toBe(0)
    expect(look.rightAngle).toBe(EYE_LOOK_TILT_DEG)
    expect(gazeFollowsEyeLook('intrigued')).toBe(true)
  })

  it('uses a happy arc path for contente ∩ ∩', () => {
    const look = posed('happy')
    expect(look.widthLeft).toBeGreaterThan(look.heightLeft)
    expect(eyeShapeForLook('happy')).toBe('happyArc')
    expect(gazeFollowsEyeLook('happy')).toBe(false)
    const rounded = renderAvatar(poseFromExpression(look), surfacePresets.sphere, 1, {
      includeWire: false,
    }).leftPath
    const arc = renderAvatar(poseFromExpression(look), surfacePresets.sphere, 1, {
      includeWire: false,
      eyeShape: 'happyArc',
    }).leftPath
    expect(arc).not.toBe(rounded)
    expect(arc.startsWith('M')).toBe(true)
  })

  it('flattens tired eyes into short dashes and sleeping into longer lids', () => {
    const tired = posed('tired')
    const sleeping = posed('sleeping')
    expect(tired.widthLeft).toBeGreaterThan(tired.heightLeft)
    expect(sleeping.widthLeft).toBeGreaterThan(tired.widthLeft)
    expect(sleeping.heightLeft).toBeLessThan(tired.heightLeft)
    expect(gazeFollowsEyeLook('tired')).toBe(false)
    expect(gazeFollowsEyeLook('sleeping')).toBe(false)
    expect(gazeFollowsEyeLook(null)).toBe(true)
  })

  it('keeps dizzy shake when overlaying an open look', () => {
    const look = applyEyeLook({ ...defaultExpression, eyeMotion: 'shake' }, 'neutral')
    expect(look.eyeMotion).toBe('shake')
  })
})
