import type { AvatarColors, AvatarEyeDefaults } from '@avatar-lab/features/avatar/avatars'
import type { BodyNode, BodyVector } from '@avatar-lab/features/avatar/body'
import type { SurfaceConfig } from '@avatar-lab/features/avatar/surfaces'
import {
  accessory,
  blush,
  creatureRecipes,
  eyes,
  surface,
  type AnimalRecipeId,
  type CreatureRecipe,
} from './recipes'

export const foldSpoken = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’`]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const recipeAliases: Record<string, AnimalRecipeId> = {
  lapin: 'lapin',
  lapine: 'lapin',
  lapins: 'lapin',
  bunny: 'lapin',
  rabbit: 'lapin',
  chat: 'chat',
  chatte: 'chat',
  chaton: 'chat',
  minou: 'chat',
  cat: 'chat',
  chien: 'chien',
  chienne: 'chien',
  chiens: 'chien',
  chein: 'chien',
  toutou: 'chien',
  wouaf: 'chien',
  dog: 'chien',
  ours: 'ours',
  ourse: 'ours',
  ourson: 'ours',
  bear: 'ours',
  oiseau: 'oiseau',
  oiseaux: 'oiseau',
  piaf: 'oiseau',
  bird: 'oiseau',
  poisson: 'poisson',
  poissons: 'poisson',
  fish: 'poisson',
  blob: 'blob',
  slime: 'blob',
  gelee: 'blob',
  gelatine: 'blob',
}

type ExtraKind =
  | 'ears-long'
  | 'ears-pointy'
  | 'ears-round'
  | 'ears-floppy'
  | 'horn'
  | 'horns'
  | 'wings'
  | 'snout'
  | 'beak'
  | 'tail'
  | 'tail-fin'
  | 'spikes'
  | 'antenna'
  | 'drip'
  | 'leaf'
  | 'rays'
  | 'petals'
  | 'bolts'

type CategoryLook = {
  words: readonly string[]
  primary: SurfaceConfig
  extras: readonly ExtraKind[]
  colors: AvatarColors
  eyes: AvatarEyeDefaults
  blush?: boolean
}

const categoryLooks: readonly CategoryLook[] = [
  {
    words: ['dragon', 'dragons', 'drake', 'wyverne'],
    primary: surface('sphere', 210, 188, 176),
    extras: ['horns', 'wings', 'spikes', 'snout'],
    colors: { body: '#3d8b6e', eyes: '#1a120c' },
    eyes: eyes(24, 28, 36, -2),
  },
  {
    words: ['robot', 'robots', 'androide', 'cyborg', 'mecano'],
    primary: surface('cube', 188, 188, 168, { roundness: 0.28 }),
    extras: ['antenna', 'bolts'],
    colors: { body: '#8a9aa8', eyes: '#102028' },
    eyes: eyes(22, 22, 40, 4),
  },
  {
    words: ['fleur', 'fleurs', 'tulipe', 'marguerite', 'lys', 'pivoine'],
    primary: surface('sphere', 176, 176, 160),
    extras: ['petals', 'leaf'],
    colors: { body: '#f4a4c8', eyes: '#3a1828' },
    eyes: eyes(24, 26, 30, 2),
    blush: true,
  },
  {
    words: ['fantome', 'fantomes', 'spectre', 'ghost'],
    primary: surface('capsule', 168, 220, 150),
    extras: ['drip'],
    colors: { body: '#e8eef6', eyes: '#243044' },
    eyes: eyes(28, 34, 28, -8),
  },
  {
    words: ['licorne', 'licornes', 'unicorn'],
    primary: surface('sphere', 188, 196, 168),
    extras: ['horn', 'ears-long', 'tail'],
    colors: { body: '#e8d5f5', eyes: '#3a2450' },
    eyes: eyes(24, 28, 32, -4),
    blush: true,
  },
  {
    words: ['soleil', 'sun'],
    primary: surface('sphere', 200, 200, 180),
    extras: ['rays'],
    colors: { body: '#f5c542', eyes: '#3a2408' },
    eyes: eyes(26, 26, 34, 0),
  },
  {
    words: ['alien', 'aliens', 'extraterrestre', 'martien'],
    primary: surface('sphere', 176, 200, 168),
    extras: ['antenna'],
    colors: { body: '#9be36a', eyes: '#142018' },
    eyes: eyes(36, 42, 22, -12),
  },
  {
    words: ['fraise', 'fraises', 'strawberry'],
    primary: surface('sphere', 176, 188, 160),
    extras: ['leaf', 'spikes'],
    colors: { body: '#e24b4b', eyes: '#2a1010' },
    eyes: eyes(22, 24, 28, 4),
    blush: true,
  },
  {
    words: ['demon', 'demons', 'diable', 'diables'],
    primary: surface('sphere', 196, 178, 170),
    extras: ['horns', 'tail'],
    colors: { body: '#c45c3a', eyes: '#1a0808' },
    eyes: eyes(22, 30, 34, -4),
  },
  {
    words: ['ange', 'anges', 'angel'],
    primary: surface('sphere', 186, 186, 168),
    extras: ['wings'],
    colors: { body: '#f4f0e4', eyes: '#2c2830' },
    eyes: eyes(26, 26, 32, 0),
    blush: true,
  },
  {
    words: ['papillon', 'papillons', 'butterfly'],
    primary: surface('sphere', 160, 168, 148),
    extras: ['wings', 'antenna'],
    colors: { body: '#f2a65a', eyes: '#24180c' },
    eyes: eyes(24, 24, 28, -4),
  },
  {
    words: ['fee', 'fees', 'fairy'],
    primary: surface('sphere', 158, 170, 146),
    extras: ['wings', 'antenna'],
    colors: { body: '#d8b4fe', eyes: '#3b0764' },
    eyes: eyes(22, 24, 26, -6),
    blush: true,
  },
  {
    words: ['fusee', 'fusees', 'rocket'],
    primary: surface('cone', 140, 230, 140, { roundness: 0.2, morphRoundness: 0.15, tipRoundness: 0.4 }),
    extras: ['bolts'],
    colors: { body: '#dfe7f2', eyes: '#1e293b' },
    eyes: eyes(20, 20, 36, 28),
  },
  {
    words: ['etoile', 'etoiles', 'star'],
    primary: surface('diamond', 200, 200, 120, { roundness: 0.15 }),
    extras: ['rays'],
    colors: { body: '#f4d35e', eyes: '#3a2a08' },
    eyes: eyes(22, 22, 28, 8),
  },
  {
    words: ['cactus'],
    primary: surface('cylinder', 150, 210, 150, { roundness: 0.55, morphRoundness: 0.1 }),
    extras: ['spikes'],
    colors: { body: '#5aae61', eyes: '#142414' },
    eyes: eyes(22, 22, 32, -8),
  },
  {
    words: ['lion', 'lions'],
    primary: surface('sphere', 210, 190, 188),
    extras: ['ears-round', 'snout', 'rays'],
    colors: { body: '#e0a04a', eyes: '#2a1808' },
    eyes: eyes(24, 26, 38, 2),
  },
  {
    words: ['renard', 'renarde', 'fox'],
    primary: surface('sphere', 180, 176, 168),
    extras: ['ears-pointy', 'snout', 'tail'],
    colors: { body: '#e07a3a', eyes: '#2a1408' },
    eyes: eyes(22, 28, 32, -4),
  },
  {
    words: ['loup', 'loups', 'wolf'],
    primary: surface('sphere', 198, 178, 180),
    extras: ['ears-pointy', 'snout', 'tail'],
    colors: { body: '#9aa4b2', eyes: '#1c1c24' },
    eyes: eyes(24, 26, 36, 0),
  },
  {
    words: ['serpent', 'serpents', 'snake'],
    primary: surface('capsule', 240, 120, 120),
    extras: ['drip'],
    colors: { body: '#5d9a5a', eyes: '#142014' },
    eyes: eyes(18, 22, 48, 0),
  },
  {
    words: ['elephant', 'elephants'],
    primary: surface('sphere', 230, 200, 210),
    extras: ['ears-floppy', 'snout'],
    colors: { body: '#b7b3c2', eyes: '#1f1b24' },
    eyes: eyes(22, 24, 44, 8),
  },
  {
    words: ['abeille', 'abeilles', 'bee'],
    primary: surface('sphere', 168, 150, 150),
    extras: ['wings', 'antenna'],
    colors: { body: '#f2c85a', eyes: '#1c140c' },
    eyes: eyes(22, 22, 30, 0),
  },
  {
    words: ['dinosaure', 'dinosaures', 'dino', 't rex', 'trex'],
    primary: surface('sphere', 220, 186, 190),
    extras: ['spikes', 'snout', 'tail'],
    colors: { body: '#6a9a4a', eyes: '#1a180c' },
    eyes: eyes(22, 26, 36, 2),
  },
  {
    words: ['voiture', 'voitures', 'auto', 'car'],
    primary: surface('cube', 230, 120, 150, { roundness: 0.7 }),
    extras: ['bolts'],
    colors: { body: '#5b7fe5', eyes: '#101828' },
    eyes: eyes(20, 18, 52, -8),
  },
  {
    words: ['avion', 'avions', 'airplane'],
    primary: surface('capsule', 220, 110, 110),
    extras: ['wings'],
    colors: { body: '#c5d4e8', eyes: '#1e293b' },
    eyes: eyes(18, 18, 40, 0),
  },
  {
    words: ['lune', 'moon'],
    primary: surface('sphere', 200, 200, 188),
    extras: ['drip'],
    colors: { body: '#e7e2c9', eyes: '#3a3828' },
    eyes: eyes(26, 26, 34, 4),
  },
  {
    words: ['nuage', 'nuages', 'cloud'],
    primary: surface('sphere', 220, 150, 170, { roundness: 1.4 }),
    extras: ['drip'],
    colors: { body: '#f4f6fb', eyes: '#334155' },
    eyes: eyes(24, 22, 36, 6),
  },
  {
    words: ['champignon', 'champignons', 'mushroom'],
    primary: surface('sphere', 210, 140, 190),
    extras: ['drip', 'bolts'],
    colors: { body: '#e24b4b', eyes: '#2a1010' },
    eyes: eyes(22, 22, 40, 16),
  },
  {
    words: ['arbre', 'arbres', 'tree'],
    primary: surface('sphere', 200, 210, 180),
    extras: ['leaf', 'spikes'],
    colors: { body: '#3f7a45', eyes: '#142014' },
    eyes: eyes(22, 22, 34, 4),
  },
  {
    words: ['monstre', 'monstres', 'monster'],
    primary: surface('sphere', 214, 188, 190),
    extras: ['horns', 'spikes', 'drip'],
    colors: { body: '#7c5cbf', eyes: '#1a1028' },
    eyes: eyes(32, 28, 30, -6),
  },
  {
    words: ['coeur', 'coeurs', 'heart'],
    primary: surface('sphere', 188, 176, 160),
    extras: ['drip'],
    colors: { body: '#f472b6', eyes: '#4a1030' },
    eyes: eyes(24, 24, 30, 4),
    blush: true,
  },
  {
    words: ['chauve souris', 'chauvesouris', 'bat'],
    primary: surface('sphere', 170, 160, 150),
    extras: ['wings', 'ears-pointy'],
    colors: { body: '#4b4458', eyes: '#f0f2f7' },
    eyes: eyes(26, 22, 28, -2),
  },
]

const extraKinds: readonly ExtraKind[] = [
  'ears-long',
  'ears-pointy',
  'ears-round',
  'ears-floppy',
  'horn',
  'horns',
  'wings',
  'snout',
  'beak',
  'tail',
  'tail-fin',
  'spikes',
  'antenna',
  'drip',
  'leaf',
  'rays',
  'petals',
  'bolts',
]

const bodyTypes = ['sphere', 'cube', 'capsule', 'diamond'] as const

const pair = (
  id: 'ear' | 'wing' | 'antenna' | 'bolt' | 'horn',
  name: string,
  nextSurface: SurfaceConfig,
  left: BodyVector,
  right: BodyVector,
  leftRotation: BodyVector = [0, 0, 0],
  rightRotation: BodyVector = [0, 0, 0]
): BodyNode[] => [
  accessory(`${id}-left`, `${name} gauche`, nextSurface, left, leftRotation),
  accessory(`${id}-right`, `${name} droite`, nextSurface, right, rightRotation),
]

const nodesFor = (kind: ExtraKind, seed: number): BodyNode[] => {
  switch (kind) {
    case 'ears-long':
      return pair(
        'ear',
        'Oreille',
        surface('capsule', 28, 118, 20),
        [-44, -126, -10],
        [44, -126, -10],
        [10, 0, -24],
        [10, 0, 24]
      )
    case 'ears-pointy':
      return pair(
        'ear',
        'Oreille',
        surface('cone', 44, 60, 18, { roundness: 0, morphRoundness: 0.2, tipRoundness: 0.2 }),
        [-58, -96, -8],
        [58, -96, -8],
        [6, 0, -32],
        [6, 0, 32]
      )
    case 'ears-round':
      return pair('ear', 'Oreille', surface('sphere', 52, 44, 30), [-80, -90, -12], [80, -90, -12])
    case 'ears-floppy':
      return pair(
        'ear',
        'Oreille',
        surface('capsule', 42, 88, 18),
        [-78, -48, -6],
        [78, -48, -6],
        [18, 12, -58],
        [18, -12, 58]
      )
    case 'horn':
      return [
        accessory(
          'horn',
          'Corne',
          surface('cone', 24, 88, 24, { roundness: 0, morphRoundness: 0.12, tipRoundness: 0.4 }),
          [0, -128, 10],
          [18, 0, 0]
        ),
      ]
    case 'horns':
      return pair(
        'horn',
        'Corne',
        surface('cone', 26, 72, 26, { roundness: 0, morphRoundness: 0.1, tipRoundness: 0.35 }),
        [-32, -118, -4],
        [32, -118, -4],
        [14, 0, -16],
        [14, 0, 16]
      )
    case 'wings':
      return pair(
        'wing',
        'Aile',
        surface('diamond', 78, 102, 16, { roundness: 0.4 }),
        [-112, 8, -28],
        [112, 8, -28],
        [16, 18, -32],
        [16, -18, 32]
      )
    case 'snout':
      return [accessory('snout', 'Museau', surface('sphere', 78, 54, 70), [0, 38, 86])]
    case 'beak':
      return [
        accessory(
          'beak',
          'Bec',
          surface('cone', 40, 52, 34, { roundness: 0, morphRoundness: 0.15, tipRoundness: 0.35 }),
          [0, 22, 86],
          [-88, 0, 0]
        ),
      ]
    case 'tail':
      return [
        accessory('tail', 'Queue', surface('capsule', 26, 92, 26), [78, 70, -76], [32, -20, 40]),
      ]
    case 'tail-fin':
      return [
        accessory(
          'tail',
          'Queue',
          surface('diamond', 70, 88, 18, { roundness: 0.35 }),
          [0, 8, -102],
          [8, 0, 0]
        ),
      ]
    case 'spikes':
      return [0, 1, 2, 3].map(index => {
        const angle = -50 + index * 34 + (seed % 7)
        const x = Math.round(Math.sin((angle * Math.PI) / 180) * 70)
        const y = Math.round(-108 + Math.cos((angle * Math.PI) / 180) * 8)
        return accessory(
          `spike-${index}`,
          'Pic',
          surface('cone', 16, 38, 16, { roundness: 0, morphRoundness: 0.1, tipRoundness: 0.45 }),
          [x, y, -6],
          [8, 0, angle * 0.15]
        )
      })
    case 'antenna':
      return [
        ...pair(
          'antenna',
          'Antenne',
          surface('capsule', 10, 62, 10),
          [-22, -118, 4],
          [22, -118, 4],
          [0, 0, -18],
          [0, 0, 18]
        ),
        accessory('antenna-bulb-left', 'Boule gauche', surface('sphere', 18, 18, 18), [-34, -150, 4]),
        accessory('antenna-bulb-right', 'Boule droite', surface('sphere', 18, 18, 18), [34, -150, 4]),
      ]
    case 'drip':
      return [accessory('drip', 'Goutte', surface('sphere', 54, 72, 52), [38, 108, 22])]
    case 'leaf':
      return [
        accessory(
          'leaf',
          'Feuille',
          surface('diamond', 56, 40, 14, { roundness: 0.45 }),
          [0, -108, 8],
          [12, 0, 0]
        ),
      ]
    case 'rays':
      return [0, 1, 2, 3, 4, 5].map(index => {
        const angle = index * 60 + (seed % 11)
        const rad = (angle * Math.PI) / 180
        return accessory(
          `spike-${index}`,
          'Rayon',
          surface('cone', 14, 46, 14, { roundness: 0, morphRoundness: 0.08, tipRoundness: 0.5 }),
          [Math.round(Math.sin(rad) * 108), Math.round(Math.cos(rad) * -108), -12],
          [10, 0, angle]
        )
      })
    case 'petals':
      return [0, 1, 2, 3, 4].map(index => {
        const angle = -70 + index * 35
        const rad = (angle * Math.PI) / 180
        return accessory(
          `petal-${index}`,
          'Petale',
          surface('sphere', 48, 70, 22),
          [Math.round(Math.sin(rad) * 78), Math.round(Math.cos(rad) * -92), -8],
          [8, 0, angle * 0.4]
        )
      })
    case 'bolts':
      return pair('bolt', 'Boulon', surface('cylinder', 22, 22, 22, { roundness: 0.2 }), [-88, 8, 40], [
        88,
        8,
        40,
      ])
  }
}

const blushNodes = (): BodyNode[] => [blush(-1), blush(1)]

const assemble = (
  id: string,
  label: string,
  primary: SurfaceConfig,
  extras: readonly ExtraKind[],
  colors: AvatarColors,
  nextEyes: AvatarEyeDefaults,
  seed: number,
  withBlush: boolean
): CreatureRecipe => ({
  id,
  label,
  body: {
    primary: { ...primary },
    nodes: [
      ...extras.flatMap(kind => nodesFor(kind, seed)),
      ...(withBlush ? blushNodes() : []),
    ],
  },
  colors: { ...colors },
  eyes: { ...nextEyes },
})

const hashName = (text: string) => {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const hslToHex = (hue: number, saturation: number, lightness: number) => {
  const s = saturation / 100
  const l = lightness / 100
  const chroma = s * Math.min(l, 1 - l)
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12
    const mix = l - chroma * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * mix)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

const colorFromSeed = (seed: number) =>
  hslToHex(seed % 360, 38 + (seed % 28), 46 + ((seed >>> 9) % 16))

const pickExtraKinds = (seed: number): ExtraKind[] => {
  const count = 2 + (seed % 3)
  const start = seed % extraKinds.length
  const chosen: ExtraKind[] = []
  for (let offset = 0; offset < extraKinds.length && chosen.length < count; offset += 1) {
    const kind = extraKinds[(start + offset * 3) % extraKinds.length]
    if (kind && !chosen.includes(kind)) chosen.push(kind)
  }
  return chosen
}

const aliasFor = (folded: string): AnimalRecipeId | null => {
  const direct = recipeAliases[folded]
  if (direct) return direct
  for (const token of folded.split(' ').filter(Boolean)) {
    const aliased = recipeAliases[token]
    if (aliased) return aliased
  }
  return null
}

const categoryFor = (folded: string): CategoryLook | null => {
  const compact = folded.replace(/ /g, '')
  for (const look of categoryLooks) {
    if (look.words.some(word => word === folded || word === compact)) return look
    if (folded.split(' ').some(token => look.words.includes(token))) return look
  }
  return null
}

const proceduralRecipe = (folded: string, seed: number): CreatureRecipe => {
  const type = bodyTypes[seed % bodyTypes.length] ?? 'sphere'
  const width = 168 + (seed % 61)
  const height = 156 + ((seed >>> 6) % 55)
  const depth = 148 + ((seed >>> 12) % 49)
  const primary = surface(type, width, height, depth, {
    roundness: type === 'cube' ? 0.35 + ((seed >>> 4) % 40) / 100 : 0.85 + ((seed >>> 5) % 50) / 100,
  })
  const extras = pickExtraKinds(seed)
  const withBlush = seed % 5 !== 0
  const eyeSize = 20 + (seed % 16)
  return assemble(
    folded,
    folded,
    primary,
    extras,
    { body: colorFromSeed(seed), eyes: seed % 7 === 0 ? '#f0f2f7' : '#1a1c20' },
    eyes(eyeSize, eyeSize + (seed % 8), 24 + (seed % 22), -8 + (seed % 17)),
    seed,
    withBlush
  )
}

export const creatureFromName = (name: string): CreatureRecipe => {
  const folded = foldSpoken(name)
  if (!folded) return creatureRecipes.strobi
  const aliased = aliasFor(folded)
  if (aliased) return creatureRecipes[aliased]
  const category = categoryFor(folded)
  if (category) {
    return assemble(
      folded,
      folded,
      category.primary,
      category.extras,
      category.colors,
      category.eyes,
      hashName(folded),
      Boolean(category.blush)
    )
  }
  return proceduralRecipe(folded, hashName(folded))
}
