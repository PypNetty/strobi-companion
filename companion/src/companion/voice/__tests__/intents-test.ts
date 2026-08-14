import {
  classifyIntent,
  colorOverrideFor,
  intentKey,
  isLikelyEcho,
  replyFromUtterance,
  sequenceIdForMood,
} from '../intents'

describe('intent replies', () => {
  it('names Strobi', () => {
    expect(classifyIntent('Comment tu t’appelles ?')).toEqual({ type: 'name' })
    expect(replyFromUtterance('qui es-tu')).toBe('Je suis Strobi.')
  })

  it('answers wellbeing, presence, time and sleep', () => {
    expect(replyFromUtterance('ça va ?')).toBe('Ça va bien, merci !')
    expect(replyFromUtterance('tu me vois')).toBe('Oui, je te vois.')
    expect(replyFromUtterance('tu m’entends')).toBe('Oui, je te vois.')
    expect(replyFromUtterance('il est quelle heure', { now: new Date(2026, 7, 14, 11, 42) })).toBe(
      'Il est 11 h 42.'
    )
    expect(replyFromUtterance('bonne nuit')).toBe('D’accord, bonne nuit.')
  })

  it('does not answer unknown questions with oui only', () => {
    const reply = replyFromUtterance('pourquoi le ciel est bleu', { random: () => 0 })
    expect(reply.toLowerCase().includes('oui')).toBe(false)
    expect(['Je n’ai pas compris.', 'Tu peux répéter ?']).toContain(reply)
  })
})

describe('appearance intents', () => {
  it('turns orange from spoken color commands', () => {
    expect(classifyIntent('je veux que tu sois orange')).toEqual({ type: 'color', color: 'orange' })
    expect(classifyIntent('sois rouge')).toEqual({ type: 'color', color: 'rouge' })
    expect(classifyIntent('deviens bleue')).toEqual({ type: 'color', color: 'bleu' })
    expect(classifyIntent('en rose')).toEqual({ type: 'color', color: 'rose' })
    expect(classifyIntent('vert')).toEqual({ type: 'color', color: 'vert' })
    expect(classifyIntent('passe en violet')).toEqual({ type: 'color', color: 'violet' })
    expect(classifyIntent('couleur jaune')).toEqual({ type: 'color', color: 'jaune' })
    expect(classifyIntent('sois noire')).toEqual({ type: 'color', color: 'noir' })
    expect(classifyIntent('tu es blanche')).toEqual({ type: 'color', color: 'blanc' })
    expect(replyFromUtterance('je veux que tu sois orange')).toBe('D’accord, orange.')
  })

  it('resets color without treating a random bleu mention as a paint command', () => {
    expect(classifyIntent('reviens à ta couleur')).toEqual({ type: 'colorReset' })
    expect(classifyIntent('couleur normale')).toEqual({ type: 'colorReset' })
    expect(replyFromUtterance('reviens à ta couleur')).toBe('D’accord, je reviens.')
    expect(classifyIntent('pourquoi le ciel est bleu')).toEqual({ type: 'unknown' })
    expect(classifyIntent('la porte est ouverte')).toEqual({ type: 'unknown' })
  })

  it('rebuilds Strobi from spoken names and resets her own look', () => {
    expect(classifyIntent('je veux que tu ressembles à un lapin')).toEqual({
      type: 'shape',
      name: 'lapin',
    })
    expect(classifyIntent('ressembles à un lapin')).toEqual({ type: 'shape', name: 'lapin' })
    expect(classifyIntent('sois un chat')).toEqual({ type: 'shape', name: 'chat' })
    expect(classifyIntent('soit un chein')).toEqual({ type: 'shape', name: 'chein' })
    expect(classifyIntent('soit')).toEqual({ type: 'unknown' })
    expect(classifyIntent('soitundragon')).toEqual({ type: 'shape', name: 'dragon' })
    expect(replyFromUtterance('soit un chein')).toBe('D’accord, chien.')
    expect(replyFromUtterance('soit')).not.toBe('D’accord, soit.')
    expect(replyFromUtterance('dragon')).toBe('D’accord, dragon.')
    expect(classifyIntent('sois un chien')).toEqual({ type: 'shape', name: 'chien' })
    expect(classifyIntent('un chien')).toEqual({ type: 'shape', name: 'chien' })
    expect(classifyIntent('deviens un ours')).toEqual({ type: 'shape', name: 'ours' })
    expect(classifyIntent('un blob')).toEqual({ type: 'shape', name: 'blob' })
    expect(classifyIntent('comme un oiseau')).toEqual({ type: 'shape', name: 'oiseau' })
    expect(classifyIntent('en poisson')).toEqual({ type: 'shape', name: 'poisson' })
    expect(classifyIntent('dragon')).toEqual({ type: 'shape', name: 'dragon' })
    expect(classifyIntent('fraise')).toEqual({ type: 'shape', name: 'fraise' })
    expect(classifyIntent('robot')).toEqual({ type: 'shape', name: 'robot' })
    expect(classifyIntent('euh sois un dragon')).toEqual({ type: 'shape', name: 'dragon' })
    expect(classifyIntent('Strobi, change-toi en fraise')).toEqual({
      type: 'shape',
      name: 'fraise',
    })
    expect(classifyIntent('je voudrais que tu sois un robot')).toEqual({
      type: 'shape',
      name: 'robot',
    })
    expect(classifyIntent('peux tu devenir un chat')).toEqual({ type: 'shape', name: 'chat' })
    expect(classifyIntent('alors sois un chien orange')).toEqual({ type: 'shape', name: 'chien' })
    expect(classifyIntent('reviens à toi')).toEqual({ type: 'shapeReset' })
    expect(classifyIntent('redeviens Strobi')).toEqual({ type: 'shapeReset' })
    expect(replyFromUtterance('je veux que tu ressembles à un lapin')).toBe('D’accord, lapin.')
    expect(replyFromUtterance('soit un chein')).toBe('D’accord, chien.')
    expect(replyFromUtterance('dragon')).toBe('D’accord, dragon.')
    expect(replyFromUtterance('reviens à toi')).toBe('D’accord, je redeviens moi.')
  })

  it('keeps reserved words from turning into shapes', () => {
    expect(classifyIntent('orange')).toEqual({ type: 'color', color: 'orange' })
    expect(classifyIntent('bonjour')).toEqual({ type: 'hello' })
    expect(classifyIntent('rire')).toEqual({ type: 'mood', mood: 'laugh' })
    expect(classifyIntent('stop')).toEqual({ type: 'stop' })
    expect(classifyIntent('strobi')).toEqual({ type: 'unknown' })
  })

  it('maps moods onto bundled sequences with short French acks', () => {
    expect(classifyIntent('rire')).toEqual({ type: 'mood', mood: 'laugh' })
    expect(classifyIntent('sourire')).toEqual({ type: 'mood', mood: 'happy' })
    expect(classifyIntent('sois joyeuse')).toEqual({ type: 'mood', mood: 'happy' })
    expect(classifyIntent('colère')).toEqual({ type: 'mood', mood: 'angry' })
    expect(classifyIntent('en colère')).toEqual({ type: 'mood', mood: 'angry' })
    expect(classifyIntent('triste')).toEqual({ type: 'mood', mood: 'sad' })
    expect(classifyIntent('surprise')).toEqual({ type: 'mood', mood: 'surprised' })
    expect(classifyIntent('fais dodo')).toEqual({ type: 'mood', mood: 'sleepy' })
    expect(classifyIntent('dodo')).toEqual({ type: 'mood', mood: 'sleepy' })
    expect(classifyIntent('bonne nuit')).toEqual({ type: 'sleep' })
    expect(replyFromUtterance('rire')).toBe('Hihi.')
    expect(replyFromUtterance('colère')).toBe('Grrr.')
    expect(replyFromUtterance('joyeuse')).toBe('Youpi !')
    expect(replyFromUtterance('triste')).toBe('Snif.')
    expect(replyFromUtterance('surprise')).toBe('Oh !')
    expect(replyFromUtterance('dodo')).toBe('Zzz.')
    expect(sequenceIdForMood('laugh')).toBe('laughing')
    expect(sequenceIdForMood('angry')).toBe('angry')
    expect(sequenceIdForMood('happy')).toBe('happy')
    expect(sequenceIdForMood('sad')).toBe('sad')
    expect(sequenceIdForMood('surprised')).toBe('surprised')
    expect(sequenceIdForMood('sleepy')).toBe('drowsy')
  })

  it('keeps dark-body eyes visible when painting black', () => {
    expect(colorOverrideFor('orange')).toEqual({ body: '#f5a623' })
    expect(colorOverrideFor('noir')).toEqual({ body: '#1a1c20', eyes: '#f0f2f7' })
  })

  it('does not treat a command as an echo of her last hello', () => {
    expect(isLikelyEcho('sois orange', 'C’est Strobi.')).toBe(false)
    expect(isLikelyEcho('strobi', 'Coucou, je suis Strobi.')).toBe(false)
    expect(isLikelyEcho('C’est Strobi.', 'C’est Strobi.')).toBe(true)
  })

  it('treats her own ack as echo while she is still speaking', () => {
    expect(isLikelyEcho('dragon', 'D’accord, dragon.', { duringSpeech: true })).toBe(true)
    expect(isLikelyEcho('d’accord dragon', 'D’accord, dragon.', { duringSpeech: true })).toBe(true)
    expect(isLikelyEcho('un dragon', 'D’accord, dragon.', { duringSpeech: true })).toBe(true)
    expect(isLikelyEcho('sois orange', 'D’accord, dragon.', { duringSpeech: true })).toBe(false)
    expect(classifyIntent('d’accord dragon')).toEqual({ type: 'unknown' })
    expect(intentKey({ type: 'shape', name: 'dragon' })).toBe('shape:dragon')
  })
})
