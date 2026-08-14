import defaultStudioDocument from '@avatar-lab/features/studio/defaultStudioDocument.json'
import {
  resolveAvatarBehavior,
  type AvatarBehaviorLibrary,
  type StudioAvatar,
} from '@avatar-lab/features/avatar/avatars'
import type { CompanionState } from '../behavior/companionState'
import {
  parseStudioDocument,
  type StudioDocument,
} from '@avatar-lab/features/studio/studioDocument'

const snapshot = defaultStudioDocument as StudioDocument

export const loadBundledDocument = (): StudioDocument => parseStudioDocument(snapshot, snapshot)

export const companionAvatar = (document: StudioDocument): StudioAvatar =>
  document.library.avatars.find(avatar => avatar.id === 'strobi') ?? document.library.avatars[0]

export const bundledAvatarName = companionAvatar(snapshot).name

export const companionBehavior = (
  document: StudioDocument,
  avatar: StudioAvatar
): AvatarBehaviorLibrary =>
  resolveAvatarBehavior(avatar, {
    expressions: document.expressions,
    sequences: document.sequences,
  })

export const sequenceIdForState = (state: CompanionState): string => {
  switch (state) {
    case 'curious':
      return 'curious'
    case 'sleeping':
      return 'sleeping'
    case 'waking':
      return 'waking'
    case 'watching':
      return 'listening'
    default:
      return 'idle'
  }
}
