export type ReplyIntent =
  | 'name'
  | 'hello'
  | 'wellbeing'
  | 'presence'
  | 'time'
  | 'sleep'
  | 'stop'
  | 'unknown'

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

export const classifyIntent = (utterance: string): ReplyIntent => {
  const text = fold(utterance)
  if (!text) return 'unknown'
  if (
    includesAny(text, [
      'arrete',
      'stop',
      'tais toi',
      'taisez',
      'silence',
      'stoppe',
    ])
  ) {
    return 'stop'
  }
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
    return 'name'
  }
  if (includesAny(text, ['bonne nuit', 'dors', 'va dormir', 'fais dodo', 'dodo'])) {
    return 'sleep'
  }
  if (
    includesAny(text, [
      'quelle heure',
      'il est quelle heure',
      'l heure',
      'c est quelle heure',
    ])
  ) {
    return 'time'
  }
  if (
    includesAny(text, [
      'tu me vois',
      'tu es la',
      't es la',
      'tu m entends',
      'tu es la',
    ])
  ) {
    return 'presence'
  }
  if (
    includesAny(text, [
      'ca va',
      'comment tu vas',
      'comment vas tu',
      'tu vas bien',
      'la forme',
    ])
  ) {
    return 'wellbeing'
  }
  if (includesAny(text, ['bonjour', 'coucou', 'salut', 'hello', 'bonsoir'])) {
    return 'hello'
  }
  return 'unknown'
}

export const formatLocalTime = (date = new Date()) => {
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours} h ${minutes}`
}

const unknownReplies = ['Je n’ai pas compris.', 'Tu peux répéter ?'] as const

export const replyForIntent = (
  intent: ReplyIntent,
  options: { random?: () => number; now?: Date } = {}
) => {
  const random = options.random ?? Math.random
  const now = options.now ?? new Date()
  switch (intent) {
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
    case 'unknown':
      return unknownReplies[Math.floor(random() * unknownReplies.length)] ?? unknownReplies[0]
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
