import { defaultExpression } from './presets'
import type { Expression, EyeShape } from './geometry'

export const eyeLookIds = [
  'neutral',
  'attentive',
  'happy',
  'tired',
  'sleeping',
  'intrigued',
] as const

export type EyeLookId = (typeof eyeLookIds)[number]

export const EYE_LOOK_TILT_DEG = 28

const openWidth = defaultExpression.widthLeft
const openHeight = defaultExpression.heightLeft

export const isEyeLookId = (value: unknown): value is EyeLookId =>
  typeof value === 'string' && eyeLookIds.includes(value as EyeLookId)

export const eyeShapeForLook = (look: EyeLookId): EyeShape =>
  look === 'happy' ? 'happyArc' : 'rounded'

export const gazeFollowsEyeLook = (look: EyeLookId | null) =>
  look !== 'happy' && look !== 'tired' && look !== 'sleeping'

export const applyEyeLook = (expression: Expression, look: EyeLookId): Expression => {
  const preserveShake = expression.eyeMotion === 'shake'
  const openMotion = preserveShake ? 'shake' : 'microSaccades'
  const stillMotion = preserveShake ? 'shake' : 'none'
  const next: Expression = {
    ...expression,
    widthLeft: openWidth,
    widthRight: openWidth,
    heightLeft: openHeight,
    heightRight: openHeight,
    leftAngle: 0,
    rightAngle: 0,
    eyeMotion: openMotion,
  }

  switch (look) {
    case 'neutral':
      return next
    case 'attentive':
      return { ...next, leftAngle: EYE_LOOK_TILT_DEG }
    case 'intrigued':
      return { ...next, rightAngle: EYE_LOOK_TILT_DEG }
    case 'happy':
      return {
        ...next,
        widthLeft: 32,
        widthRight: 32,
        heightLeft: 20,
        heightRight: 20,
        eyeMotion: stillMotion,
      }
    case 'tired':
      return {
        ...next,
        widthLeft: 42,
        widthRight: 42,
        heightLeft: 8,
        heightRight: 8,
        eyeMotion: stillMotion,
      }
    case 'sleeping':
      return {
        ...next,
        widthLeft: 54,
        widthRight: 54,
        heightLeft: 5,
        heightRight: 5,
        eyeMotion: stillMotion,
      }
  }
}
