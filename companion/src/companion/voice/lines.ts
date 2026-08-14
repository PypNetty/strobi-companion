export type SpeechCue =
  | 'greeting'
  | 'waking'
  | 'curious'
  | 'watching'
  | 'noticed'
  | 'carried'
  | 'shaken'
  | 'heard'
  | 'idle'
  | 'sleeping'

const NAME = 'Strobi'
const murmurChance = 0.12
const isMurmur = (line: string) => line.startsWith('Hmm')

export const speechLines: Record<SpeechCue, readonly string[]> = {
  greeting: [`Coucou, je suis ${NAME}.`, `C’est ${NAME}.`, 'Me voilà.'],
  waking: [`Rebonjour, c’est ${NAME}.`, 'Oh, te revoilà.', 'Coucou.'],
  curious: ['Tu es là ?', `${NAME} te voit.`, 'Tiens.', 'Hmm ?'],
  watching: [`${NAME} te voit.`, `C’est ${NAME}.`, 'Je te vois.', 'Tu es là ?', 'Hmm.'],
  noticed: [`C’est ${NAME} ?`, 'Tu es là ?', 'Hmm ?'],
  carried: ['Wouh !', 'Oh !'],
  shaken: ['Arrête !', 'Wouh !', 'Oh là là !'],
  heard: ['Oui ?', 'Je t’écoute.', 'Hmm ?'],
  idle: [`C’est ${NAME}.`, 'Je suis là.', 'Hmm.'],
  sleeping: ['Bonne nuit.', 'Dodo.'],
}

const lastSaid: Partial<Record<SpeechCue, string>> = {}

export const resetSpeechLineMemory = () => {
  for (const cue of Object.keys(lastSaid) as SpeechCue[]) delete lastSaid[cue]
}

export const pickSpeechLine = (cue: SpeechCue, random = Math.random) => {
  const lines = speechLines[cue]
  const previous = lastSaid[cue]
  if (previous === undefined) {
    const first = lines[0]
    if (first) lastSaid[cue] = first
    return first
  }
  const named = lines.filter(line => !isMurmur(line))
  const source = named.length > 0 && random() >= murmurChance ? named : lines
  const pool = source.filter(line => line !== previous)
  const choices = pool.length > 0 ? pool : source
  const picked = choices[Math.floor(random() * choices.length)] ?? lines[0]
  if (picked) lastSaid[cue] = picked
  return picked
}
