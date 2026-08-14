import type {
  AvatarColors,
  AvatarEyeDefaults,
  StudioAvatar,
} from '@avatar-lab/features/avatar/avatars'
import type { AvatarBody, BodyNode, BodyVector } from '@avatar-lab/features/avatar/body'
import type { SurfaceConfig } from '@avatar-lab/features/avatar/surfaces'

export const creatureRecipeIds = [
  'strobi',
  'lapin',
  'chat',
  'ours',
  'oiseau',
  'poisson',
  'blob',
] as const

export type CreatureRecipeId = (typeof creatureRecipeIds)[number]

export type CreatureRecipe = {
  id: CreatureRecipeId
  label: string
  body: AvatarBody
  colors: AvatarColors
  eyes: AvatarEyeDefaults
}

const surface = (
  type: SurfaceConfig['type'],
  width: number,
  height: number,
  depth: number,
  extras: Partial<Omit<SurfaceConfig, 'type' | 'width' | 'height' | 'depth'>> = {}
): SurfaceConfig => ({
  type,
  width,
  height,
  depth,
  roundness: extras.roundness ?? 1,
  ...extras,
})

const accessory = (
  id: string,
  name: string,
  nextSurface: SurfaceConfig,
  position: BodyVector,
  rotation: BodyVector = [0, 0, 0]
): BodyNode => ({
  id,
  name,
  surface: nextSurface,
  position,
  rotation,
})

const eyes = (
  width: number,
  height: number,
  spacing: number,
  positionY: number
): AvatarEyeDefaults => ({
  widthLeft: width,
  widthRight: width,
  heightLeft: height,
  heightRight: height,
  spacing,
  positionXLeft: 0,
  positionXRight: 0,
  positionYLeft: positionY,
  positionYRight: positionY,
  leftAngle: 0,
  rightAngle: 0,
})

const blush = (side: -1 | 1): BodyNode =>
  accessory(
    side < 0 ? 'blush-left' : 'blush-right',
    side < 0 ? 'Rougeur gauche' : 'Rougeur droite',
    surface('sphere', 30, 16, 22),
    [side * 62, 46, 58]
  )

export const defaultCreatureRecipeId: CreatureRecipeId = 'strobi'

export const creatureRecipes: Record<CreatureRecipeId, CreatureRecipe> = {
  strobi: {
    id: 'strobi',
    label: 'Strobi',
    body: {
      primary: surface('cube', 198, 184, 164, { roundness: 1.52 }),
      nodes: [blush(-1), blush(1)],
    },
    colors: { body: '#6fc4b0', eyes: '#16302c' },
    eyes: eyes(28, 28, 26, 6),
  },
  lapin: {
    id: 'lapin',
    label: 'lapin',
    body: {
      primary: surface('sphere', 188, 198, 168),
      nodes: [
        accessory(
          'ear-left',
          'Oreille gauche',
          surface('capsule', 30, 122, 22),
          [-44, -126, -10],
          [10, 0, -24]
        ),
        accessory(
          'ear-right',
          'Oreille droite',
          surface('capsule', 30, 122, 22),
          [44, -126, -10],
          [10, 0, 24]
        ),
        blush(-1),
        blush(1),
      ],
    },
    colors: { body: '#f0d2bf', eyes: '#3a2418' },
    eyes: eyes(24, 30, 32, -4),
  },
  chat: {
    id: 'chat',
    label: 'chat',
    body: {
      primary: surface('sphere', 186, 178, 170),
      nodes: [
        accessory(
          'ear-left',
          'Oreille gauche',
          surface('cone', 46, 62, 20, { roundness: 0, morphRoundness: 0.2, tipRoundness: 0.2 }),
          [-58, -96, -8],
          [6, 0, -32]
        ),
        accessory(
          'ear-right',
          'Oreille droite',
          surface('cone', 46, 62, 20, { roundness: 0, morphRoundness: 0.2, tipRoundness: 0.2 }),
          [58, -96, -8],
          [6, 0, 32]
        ),
        accessory(
          'tail',
          'Queue',
          surface('capsule', 28, 96, 28),
          [82, 64, -72],
          [42, -18, 48]
        ),
      ],
    },
    colors: { body: '#efb36a', eyes: '#2a1c12' },
    eyes: eyes(22, 34, 34, -6),
  },
  ours: {
    id: 'ours',
    label: 'ours',
    body: {
      primary: surface('sphere', 228, 208, 214),
      nodes: [
        accessory('ear-left', 'Oreille gauche', surface('sphere', 52, 44, 30), [-80, -90, -12]),
        accessory('ear-right', 'Oreille droite', surface('sphere', 52, 44, 30), [80, -90, -12]),
      ],
    },
    colors: { body: '#c48a5a', eyes: '#24160f' },
    eyes: eyes(22, 24, 46, 8),
  },
  oiseau: {
    id: 'oiseau',
    label: 'oiseau',
    body: {
      primary: surface('sphere', 168, 178, 150),
      nodes: [
        accessory(
          'beak',
          'Bec',
          surface('cone', 40, 52, 34, { roundness: 0, morphRoundness: 0.15, tipRoundness: 0.35 }),
          [0, 22, 86],
          [-88, 0, 0]
        ),
      ],
    },
    colors: { body: '#f2c85a', eyes: '#1c140c' },
    eyes: eyes(26, 26, 36, -10),
  },
  poisson: {
    id: 'poisson',
    label: 'poisson',
    body: {
      primary: surface('sphere', 228, 138, 96),
      nodes: [
        accessory(
          'tail',
          'Queue',
          surface('diamond', 70, 88, 18, { roundness: 0.35 }),
          [0, 8, -102],
          [8, 0, 0]
        ),
        accessory(
          'fin',
          'Nageoire',
          surface('cone', 28, 46, 14, { roundness: 0, morphRoundness: 0.1 }),
          [0, -78, -8]
        ),
      ],
    },
    colors: { body: '#4eb8c9', eyes: '#102228' },
    eyes: eyes(20, 24, 22, 0),
  },
  blob: {
    id: 'blob',
    label: 'blob',
    body: {
      primary: surface('sphere', 214, 188, 200),
      nodes: [
        accessory('drip', 'Goutte', surface('sphere', 54, 72, 52), [38, 108, 22]),
      ],
    },
    colors: { body: '#8be07a', eyes: '#143018' },
    eyes: eyes(36, 36, 24, 8),
  },
}

const cloneVector = (value: BodyVector): BodyVector => [value[0], value[1], value[2]]

export const earNodesOf = (recipe: CreatureRecipe) =>
  recipe.body.nodes.filter(node => node.id.startsWith('ear-'))

export const avatarFromRecipe = (recipe: CreatureRecipe): StudioAvatar => ({
  id: 'strobi',
  name: 'Strobi',
  body: {
    primary: { ...recipe.body.primary },
    nodes: recipe.body.nodes.map(node => ({
      ...node,
      surface: { ...node.surface },
      position: cloneVector(node.position),
      rotation: cloneVector(node.rotation),
    })),
  },
  colors: { ...recipe.colors },
  eyes: { ...recipe.eyes },
})
