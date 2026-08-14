import { pickSpeechLine, resetSpeechLineMemory, speechLines } from '../lines'

describe('speech lines', () => {
  beforeEach(() => {
    resetSpeechLineMemory()
  })

  it('has a French repertoire that names Strobi', () => {
    const all = Object.values(speechLines).flat()
    expect(all).toEqual(
      expect.arrayContaining([
        'Coucou, je suis Strobi.',
        'Strobi te voit.',
        'C’est Strobi.',
        'Rebonjour, c’est Strobi.',
        'Hmm.',
        'Bonne nuit.',
        'Arrête !',
      ])
    )
    expect(all.filter(line => line.includes('Strobi')).length).toBeGreaterThan(3)
    expect(all.filter(line => line.toLowerCase().includes('oui')).length).toBeLessThan(all.length / 2)
  })

  it('opens a cue with the first named line, then rotates', () => {
    const first = pickSpeechLine('greeting', () => 0)
    const second = pickSpeechLine('greeting', () => 0)
    expect(first).toBe('Coucou, je suis Strobi.')
    expect(first).not.toBe(second)
    expect(speechLines.greeting).toContain(second)
  })

  it('keeps Hmm as a rare murmur, not the first watching line', () => {
    const first = pickSpeechLine('watching', () => 0.5)
    expect(first).toBe('Strobi te voit.')
    expect(first.startsWith('Hmm')).toBe(false)
  })

  it('opens a shake burst with Arrête', () => {
    expect(pickSpeechLine('shaken', () => 0)).toBe('Arrête !')
  })
})
