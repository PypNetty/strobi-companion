import type { EyeLookId } from '@avatar-lab/features/avatar/eyeLooks'
import type { CompanionState } from '../behavior/companionState'
import type { MoodName } from '../voice/intents'

export type { EyeLookId }

export type EyeLookContext = {
  state: CompanionState
  mood: MoodName | null
  gazeX: number
  heard?: boolean
  previous?: EyeLookId | null
}

const watchingGazeThreshold = 0.12
const watchingHoldThreshold = 0.08

const watchingLook = (gazeX: number, previous: EyeLookId | null | undefined): EyeLookId => {
  if (previous === 'intrigued' && gazeX > -watchingHoldThreshold) return 'intrigued'
  if (previous === 'attentive' && gazeX < watchingHoldThreshold) return 'attentive'
  return gazeX > watchingGazeThreshold ? 'intrigued' : 'attentive'
}

export const eyeLookForCompanion = ({
  state,
  mood,
  gazeX,
  heard = false,
  previous = null,
}: EyeLookContext): EyeLookId | null => {
  if (mood === 'happy' || mood === 'laugh') return 'happy'
  if (mood === 'sleepy' || state === 'sleeping') return 'sleeping'
  if (mood === 'angry' || mood === 'sad' || mood === 'surprised') return null
  if (state === 'waking') return 'tired'
  if (state === 'curious' || heard) return 'intrigued'
  if (state === 'watching') return watchingLook(gazeX, previous)
  return 'neutral'
}
