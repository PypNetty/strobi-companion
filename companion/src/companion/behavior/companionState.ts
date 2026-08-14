export const companionStates = ['idle', 'watching', 'curious', 'sleeping', 'waking'] as const

export type CompanionState = (typeof companionStates)[number]

export const isCompanionState = (value: unknown): value is CompanionState =>
  typeof value === 'string' && companionStates.includes(value as CompanionState)
