import { creatureRecipes, type CreatureRecipeId } from '../avatar/recipes'

export type ColorName =
  | 'orange'
  | 'rouge'
  | 'bleu'
  | 'rose'
  | 'vert'
  | 'violet'
  | 'jaune'
  | 'noir'
  | 'blanc'

export type MoodName = 'laugh' | 'angry' | 'happy' | 'sad' | 'surprised' | 'sleepy'

export type AnimalRecipeId = Exclude<CreatureRecipeId, 'strobi'>

export type CompanionIntent =
  | { type: 'name' }
  | { type: 'hello' }
  | { type: 'wellbeing' }
  | { type: 'presence' }
  | { type: 'time' }
  | { type: 'sleep' }
  | { type: 'stop' }
  | { type: 'color'; color: ColorName }
  | { type: 'colorReset' }
  | { type: 'shape'; recipe: AnimalRecipeId }
  | { type: 'shapeReset' }
  | { type: 'mood'; mood: MoodName }
  | { type: 'unknown' }

export type CompanionColorOverride = {
  body?: string
  eyes?: string
}

export const colorHex: Record<ColorName, string> = {
  orange: '#f5a623',
  rouge: '#e24b4b',
  bleu: '#5b7fe5',
  rose: '#f472b6',
  vert: '#34a853',
  violet: '#8b5cf6',
  jaune: '#f4c430',
  noir: '#1a1c20',
  blanc: '#f4f6fb',
}

const colorTokens: Record<ColorName, readonly string[]> = {
  orange: ['orange'],
  rouge: ['rouge'],
  bleu: ['bleu', 'bleue'],
  rose: ['rose'],
  vert: ['vert', 'verte'],
  violet: ['violet', 'violette'],
  jaune: ['jaune'],
  noir: ['noir', 'noire'],
  blanc: ['blanc', 'blanche'],
}

const colorOrder: readonly ColorName[] = [
  'orange',
  'rouge',
  'violet',
  'jaune',
  'bleu',
  'rose',
  'vert',
  'noir',
  'blanc',
]

export const colorOverrideFor = (color: ColorName): CompanionColorOverride =>
  color === 'noir'
    ? { body: colorHex.noir, eyes: '#f0f2f7' }
    : { body: colorHex[color] }

export const sequenceIdForMood = (mood: MoodName) => {
  switch (mood) {
    case 'laugh':
      return 'laughing'
    case 'angry':
      return 'angry'
    case 'happy':
      return 'happy'
    case 'sad':
      return 'sad'
    case 'surprised':
      return 'surprised'
    case 'sleepy':
      return 'drowsy'
  }
}

const fold = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’`]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const includesAny = (text: string, needles: readonly string[]) =>
  needles.some(needle => text.includes(needle))

const tokensOf = (text: string) => text.split(' ').filter(Boolean)

const hasToken = (text: string, token: string) => tokensOf(text).includes(token)

const hasAnyToken = (text: string, tokens: readonly string[]) =>
  tokens.some(token => hasToken(text, token))

const colorChangeCue = (text: string) =>
  includesAny(text, [
    'sois',
    'deviens',
    'devenir',
    'je veux',
    'mets toi',
    'passe en',
    'couleur',
    'tu es',
    't es',
  ])

const namedColor = (text: string): ColorName | null => {
  for (const color of colorOrder) {
    if (hasAnyToken(text, colorTokens[color])) return color
  }
  return null
}

const classifyColor = (text: string): CompanionIntent | null => {
  if (
    includesAny(text, [
      'reviens a ta couleur',
      'reviens a tes couleurs',
      'ta couleur d origine',
      'couleur d origine',
      'couleur normale',
      'couleur par defaut',
      'ta couleur',
    ])
  ) {
    return { type: 'colorReset' }
  }
  const color = namedColor(text)
  if (!color) return null
  if (colorChangeCue(text) || tokensOf(text).length <= 2) return { type: 'color', color }
  return null
}

const animalTokens: Record<AnimalRecipeId, readonly string[]> = {
  lapin: ['lapin', 'lapine', 'lapins'],
  chat: ['chat', 'chatte', 'chaton', 'minou'],
  ours: ['ours', 'ourse', 'ourson'],
  oiseau: ['oiseau', 'oiseaux', 'piaf'],
  poisson: ['poisson', 'poissons'],
  blob: ['blob', 'slime', 'gelee', 'gelatine'],
}

const animalOrder: readonly AnimalRecipeId[] = [
  'lapin',
  'chat',
  'ours',
  'oiseau',
  'poisson',
  'blob',
]

const namedAnimal = (text: string): AnimalRecipeId | null => {
  for (const recipe of animalOrder) {
    if (hasAnyToken(text, animalTokens[recipe])) return recipe
  }
  return null
}

const shapeChangeCue = (text: string) =>
  includesAny(text, [
    'ressembl',
    'comme un',
    'comme une',
    'sois un',
    'sois une',
    'deviens un',
    'deviens une',
    'transforme',
    'en lapin',
    'en chat',
    'en ours',
    'en oiseau',
    'en poisson',
    'en blob',
    'je veux',
    'mets toi',
    'tu es un',
    't es un',
  ])

const classifyShapeReset = (text: string): CompanionIntent | null => {
  if (
    includesAny(text, [
      'reviens a toi',
      'reviens a toi meme',
      'redeviens strobi',
      'redeviens toi',
      'reviens strobi',
      'forme d origine',
      'forme normale',
      'ta vraie forme',
      'ton apparence d origine',
    ])
  ) {
    return { type: 'shapeReset' }
  }
  return null
}

const classifyShape = (text: string): CompanionIntent | null => {
  const recipe = namedAnimal(text)
  if (!recipe) return null
  if (shapeChangeCue(text) || tokensOf(text).length <= 3) return { type: 'shape', recipe }
  return null
}

const classifyMood = (text: string): CompanionIntent | null => {
  if (
    hasAnyToken(text, ['sourire', 'joyeuse', 'joyeux', 'contente', 'content', 'heureuse', 'heureux'])
  ) {
    return { type: 'mood', mood: 'happy' }
  }
  if (hasAnyToken(text, ['rire', 'ris', 'mdr', 'haha', 'hihi', 'rigole'])) {
    return { type: 'mood', mood: 'laugh' }
  }
  if (
    hasAnyToken(text, ['colere', 'fache', 'fachee', 'enerve', 'enervee', 'grrr']) ||
    includesAny(text, ['en colere', 'fache toi'])
  ) {
    return { type: 'mood', mood: 'angry' }
  }
  if (hasAnyToken(text, ['triste', 'tristesse'])) {
    return { type: 'mood', mood: 'sad' }
  }
  if (hasAnyToken(text, ['surprise', 'surpris', 'etonnee', 'etonne', 'waouh', 'wow'])) {
    return { type: 'mood', mood: 'surprised' }
  }
  if (
    hasAnyToken(text, ['dodo', 'sleepy', 'somnolente', 'somnolent']) ||
    includesAny(text, ['fais dodo', 'tu as sommeil', 'as sommeil'])
  ) {
    return { type: 'mood', mood: 'sleepy' }
  }
  return null
}

export const classifyIntent = (utterance: string): CompanionIntent => {
  const text = fold(utterance)
  if (!text) return { type: 'unknown' }
  if (
    includesAny(text, ['arrete', 'stop', 'tais toi', 'taisez', 'silence', 'stoppe'])
  ) {
    return { type: 'stop' }
  }
  const shapeReset = classifyShapeReset(text)
  if (shapeReset) return shapeReset
  const shape = classifyShape(text)
  if (shape) return shape
  const color = classifyColor(text)
  if (color) return color
  const mood = classifyMood(text)
  if (mood) return mood
  if (
    includesAny(text, [
      'qui es tu',
      'qui est tu',
      't es qui',
      'tes qui',
      'comment tu t appelle',
      'comment tu t appelles',
      'comment t appelles tu',
      'comment t appelle tu',
      'ton nom',
      'tu t appelle',
      'c est qui strobi',
      'tu es strobi',
    ])
  ) {
    return { type: 'name' }
  }
  if (includesAny(text, ['bonne nuit', 'va dormir']) || hasToken(text, 'dors')) {
    return { type: 'sleep' }
  }
  if (
    includesAny(text, ['quelle heure', 'il est quelle heure', 'l heure', 'c est quelle heure'])
  ) {
    return { type: 'time' }
  }
  if (includesAny(text, ['tu me vois', 'tu es la', 't es la', 'tu m entends'])) {
    return { type: 'presence' }
  }
  if (
    includesAny(text, ['ca va', 'comment tu vas', 'comment vas tu', 'tu vas bien', 'la forme'])
  ) {
    return { type: 'wellbeing' }
  }
  if (includesAny(text, ['bonjour', 'coucou', 'salut', 'hello', 'bonsoir'])) {
    return { type: 'hello' }
  }
  return { type: 'unknown' }
}

export const formatLocalTime = (date = new Date()) => {
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours} h ${minutes}`
}

const unknownReplies = ['Je n’ai pas compris.', 'Tu peux répéter ?'] as const

export const replyForIntent = (
  intent: CompanionIntent,
  options: { random?: () => number; now?: Date } = {}
) => {
  const random = options.random ?? Math.random
  const now = options.now ?? new Date()
  switch (intent.type) {
    case 'name':
      return 'Je suis Strobi.'
    case 'hello':
      return 'Coucou, je suis Strobi.'
    case 'wellbeing':
      return 'Ça va bien, merci !'
    case 'presence':
      return 'Oui, je te vois.'
    case 'time':
      return `Il est ${formatLocalTime(now)}.`
    case 'sleep':
      return 'D’accord, bonne nuit.'
    case 'stop':
      return 'D’accord, j’arrête.'
    case 'color':
      return `D’accord, ${intent.color}.`
    case 'colorReset':
      return 'D’accord, je reviens.'
    case 'shape':
      return `D’accord, ${creatureRecipes[intent.recipe].label}.`
    case 'shapeReset':
      return 'D’accord, je redeviens moi.'
    case 'mood':
      return moodReply(intent.mood)
    case 'unknown':
      return unknownReplies[Math.floor(random() * unknownReplies.length)] ?? unknownReplies[0]
  }
}

const moodReply = (mood: MoodName) => {
  switch (mood) {
    case 'laugh':
      return 'Hihi.'
    case 'angry':
      return 'Grrr.'
    case 'happy':
      return 'Youpi !'
    case 'sad':
      return 'Snif.'
    case 'surprised':
      return 'Oh !'
    case 'sleepy':
      return 'Zzz.'
  }
}

export const replyFromUtterance = (
  utterance: string,
  options: { random?: () => number; now?: Date } = {}
) => replyForIntent(classifyIntent(utterance), options)

export const isLikelyEcho = (heard: string, spoken: string) => {
  const left = fold(heard)
  const right = fold(spoken)
  if (!left || !right) return false
  return left === right || right.includes(left) || left.includes(right)
}
