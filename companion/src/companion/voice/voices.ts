export type SpeechVoiceInfo = {
  lang: string
  name: string
  localService?: boolean
}

const frenchName = /hortense|julie|denise|claude|madame|french|français|francais/i

export const pickLocalVoice = <T extends SpeechVoiceInfo>(voices: readonly T[], lang = 'fr') => {
  const prefix = lang.toLowerCase()
  const matching = voices.filter(voice => voice.lang.toLowerCase().startsWith(prefix))
  const named = matching.find(voice => frenchName.test(voice.name))
  return (
    named ??
    matching.find(voice => voice.localService !== false) ??
    matching[0] ??
    voices.find(voice => voice.localService) ??
    voices[0]
  )
}
