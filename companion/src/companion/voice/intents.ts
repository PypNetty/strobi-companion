import { creatureFromName, foldSpoken } from '../avatar/fromName'

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
  | { type: 'shape'; name: string }
  | { type: 'shapeReset' }
  | { type: 'mood'; mood: MoodName }
  | { type: 'unknown' }

export { foldSpoken }

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

const includesAny = (text: string, needles: readonly string[]) =>
  needles.some(needle => text.includes(needle))

const tokensOf = (text: string) => text.split(' ').filter(Boolean)

const hasToken = (text: string, token: string) => tokensOf(text).includes(token)

const hasAnyToken = (text: string, tokens: readonly string[]) =>
  tokens.some(token => hasToken(text, token))

const colorChangeCue = (text: string) =>
  includesAny(text, [
    'sois',
    'soit',
    'deviens',
    'devenir',
    'devient',
    'je veux',
    'voudrais',
    'mets toi',
    'passe en',
    'couleur',
    'tu es',
    't es',
    'change toi',
    'peux tu',
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

const articles = new Set(['un', 'une', 'le', 'la', 'les', 'des', 'du', 'de', 'l', 'au', 'aux', 'a'])

const shapeStopwords = new Set([
  'je',
  'tu',
  'il',
  'elle',
  'on',
  'nous',
  'vous',
  'ils',
  'elles',
  'et',
  'ou',
  'que',
  'qui',
  'quoi',
  'ne',
  'pas',
  'me',
  'te',
  'se',
  'ce',
  'cet',
  'cette',
  'est',
  'es',
  'suis',
  'sont',
  'as',
  'ai',
  'ca',
  'va',
  'c',
  's',
  'd',
  'n',
  'm',
  't',
  'y',
  'en',
  'passe',
  'passer',
  'change',
  'changes',
  'transforme',
  'ressemble',
  'ressembles',
  'veux',
  'voudrais',
  'peux',
  'devenir',
  'devient',
  'deviens',
  'sois',
  'soit',
  'comme',
  'mets',
  'fais',
  'fait',
  'peux',
  ...articles,
])

const reservedShapeTokens = new Set([
  'orange',
  'rouge',
  'bleu',
  'bleue',
  'rose',
  'vert',
  'verte',
  'violet',
  'violette',
  'jaune',
  'noir',
  'noire',
  'blanc',
  'blanche',
  'bonjour',
  'coucou',
  'salut',
  'hello',
  'bonsoir',
  'stop',
  'arrete',
  'stoppe',
  'silence',
  'rire',
  'ris',
  'mdr',
  'haha',
  'hihi',
  'rigole',
  'sourire',
  'joyeuse',
  'joyeux',
  'contente',
  'content',
  'heureuse',
  'heureux',
  'colere',
  'fache',
  'fachee',
  'enerve',
  'enervee',
  'grrr',
  'triste',
  'tristesse',
  'surprise',
  'surpris',
  'etonnee',
  'etonne',
  'waouh',
  'wow',
  'dodo',
  'sleepy',
  'somnolente',
  'somnolent',
  'strobi',
  'merci',
  'oui',
  'non',
  'accord',
  'couleur',
  'forme',
  'apparence',
])

const shapePrefixes = [
  'je voudrais que tu ressembles a un',
  'je voudrais que tu ressembles a une',
  'je voudrais que tu sois un',
  'je voudrais que tu sois une',
  'je voudrais que tu sois',
  'je voudrais que tu deviennes un',
  'je voudrais que tu deviennes une',
  'je voudrais un',
  'je voudrais une',
  'je veux que tu ressembles a un',
  'je veux que tu ressembles a une',
  'je veux que tu ressembles a',
  'je veux que tu sois un',
  'je veux que tu sois une',
  'je veux que tu sois',
  'je veux que tu deviennes un',
  'je veux que tu deviennes une',
  'je veux que tu deviennes',
  'peux tu devenir un',
  'peux tu devenir une',
  'peux tu etre un',
  'peux tu etre une',
  'tu peux devenir un',
  'tu peux devenir une',
  'je veux un',
  'je veux une',
  'ressembles a un',
  'ressembles a une',
  'ressembles a',
  'ressemble a un',
  'ressemble a une',
  'ressemble a',
  'transforme toi en',
  'transforme en',
  'change toi en',
  'changes toi en',
  'te changes en',
  'te change en',
  'fais toi en',
  'fait toi en',
  'mets toi en',
  'passe en',
  'deviens un',
  'deviens une',
  'devient un',
  'devient une',
  'deviens',
  'devient',
  'sois un',
  'sois une',
  'soit un',
  'soit une',
  'comme un',
  'comme une',
  'tu es un',
  'tu es une',
  't es un',
  't es une',
  'sois',
  'soit',
  'comme',
  'un',
  'une',
  'en',
]

const spokenFillers = [
  'euh',
  'heu',
  'hum',
  'ben',
  'bah',
  'alors',
  'donc',
  'hey',
  'oh',
  'ah',
  's il te plait',
  'sil te plait',
  'please',
] as const

const stripSpokenExtras = (text: string) => {
  let next = text.replace(/^(dis |hey |allo )?(strobi)\s+/, '')
  for (const filler of spokenFillers) {
    next = next.replace(new RegExp(`(?:^| )${filler}(?: |$)`, 'g'), ' ')
  }
  return next.replace(/\s+/g, ' ').trim()
}

const shapeLeadTokens = new Set([
  'sois',
  'soit',
  'deviens',
  'devient',
  'devien',
  'comme',
  'change',
  'changes',
  'transforme',
  'fais',
  'fait',
  'mets',
  'passe',
  'toi',
  'un',
  'une',
  'en',
  'accord',
])

const peelShapeCommand = (text: string) => {
  let next = text.trim()
  let previous = ''
  while (next && next !== previous) {
    previous = next
    const tokens = tokensOf(next)
    const first = tokens[0]
    if (first && shapeLeadTokens.has(first)) {
      next = tokens.slice(1).join(' ')
      continue
    }
    if (first) {
      const stripped = first.replace(/^(sois|soit|deviens|devient|devien)(une|un)?/, '')
      if (stripped !== first) {
        tokens[0] = stripped
        next = tokens.filter(Boolean).join(' ')
      }
    }
  }
  return next.trim()
}

const takeShapeName = (remainder: string): string | null => {
  const tokens = tokensOf(peelShapeCommand(remainder))
  while (tokens.length > 0 && articles.has(tokens[0] ?? '')) tokens.shift()
  const nameTokens = tokens
    .slice(0, 4)
    .filter(token => !shapeStopwords.has(token) && !reservedShapeTokens.has(token) && !shapeLeadTokens.has(token))
    .filter(token => token.length >= 3)
  if (nameTokens.length === 0) return null
  return nameTokens.join(' ')
}

const spokenShapeLabel = (name: string) => {
  const peeled = takeShapeName(name) ?? peelShapeCommand(foldSpoken(name))
  if (!peeled) return null
  const tokens = tokensOf(foldSpoken(creatureFromName(peeled).label)).filter(
    token => !shapeLeadTokens.has(token) && !shapeStopwords.has(token) && token.length >= 3
  )
  return tokens[tokens.length - 1] ?? null
}

const extractPrefixedShapeName = (text: string): string | null => {
  const prefixes = [...shapePrefixes].sort((left, right) => right.length - left.length)
  for (const prefix of prefixes) {
    const index = text.indexOf(`${prefix} `)
    if (index < 0) continue
    const name = takeShapeName(text.slice(index + prefix.length))
    if (name) return name
  }
  return null
}

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

const classifyPrefixedShape = (text: string): CompanionIntent | null => {
  const prefixed = extractPrefixedShapeName(text)
  if (prefixed) return { type: 'shape', name: prefixed }
  return null
}

const classifyBareShape = (text: string): CompanionIntent | null => {
  if (tokensOf(text).length > 2) return null
  const name = takeShapeName(text)
  if (!name) return null
  return { type: 'shape', name }
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
  const text = stripSpokenExtras(foldSpoken(utterance))
  if (!text) return { type: 'unknown' }
  if (
    includesAny(text, ['arrete', 'stop', 'tais toi', 'taisez', 'silence', 'stoppe'])
  ) {
    return { type: 'stop' }
  }
  const shapeReset = classifyShapeReset(text)
  if (shapeReset) return shapeReset
  const prefixedShape = classifyPrefixedShape(text)
  if (prefixedShape) return prefixedShape
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
  const shape = classifyBareShape(text)
  if (shape) return shape
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
    case 'shape': {
      const label = spokenShapeLabel(intent.name)
      return label ? `D’accord, ${label}.` : 'D’accord.'
    }
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

const contentTokens = (text: string) =>
  tokensOf(text).filter(token => token.length >= 3 && !shapeStopwords.has(token))

export const intentKey = (intent: CompanionIntent) => {
  switch (intent.type) {
    case 'shape':
      return `shape:${foldSpoken(intent.name)}`
    case 'color':
      return `color:${intent.color}`
    case 'mood':
      return `mood:${intent.mood}`
    default:
      return intent.type
  }
}

export const isLikelyEcho = (
  heard: string,
  spoken: string,
  options: { duringSpeech?: boolean } = {},
) => {
  const left = foldSpoken(heard)
  const right = foldSpoken(spoken)
  if (!left || !right) return false
  if (left === right) return true
  if (options.duringSpeech) {
    const heardTokens = contentTokens(left)
    const spokenSet = new Set(tokensOf(right))
    if (heardTokens.length > 0 && heardTokens.every(token => spokenSet.has(token))) return true
    return right.includes(left) || left.includes(right)
  }
  if (left.length < 10) return false
  return right.includes(left) || left.includes(right)
}
