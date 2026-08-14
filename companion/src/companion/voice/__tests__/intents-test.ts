import { classifyIntent, replyFromUtterance } from '../intents'

describe('intent replies', () => {
  it('names Strobi', () => {
    expect(classifyIntent('Comment tu t’appelles ?')).toBe('name')
    expect(replyFromUtterance('qui es-tu')).toBe('Je suis Strobi.')
  })

  it('answers wellbeing, presence, time and sleep', () => {
    expect(replyFromUtterance('ça va ?')).toBe('Ça va bien, merci !')
    expect(replyFromUtterance('tu me vois')).toBe('Oui, je te vois.')
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
