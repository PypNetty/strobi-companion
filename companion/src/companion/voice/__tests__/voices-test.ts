import { pickLocalVoice } from '../voices'

describe('pickLocalVoice', () => {
  it('prefers a named French Windows voice', () => {
    const voice = pickLocalVoice([
      { lang: 'en-US', name: 'Microsoft Zira', localService: true },
      { lang: 'fr-FR', name: 'Microsoft Hortense Desktop', localService: true },
      { lang: 'fr-FR', name: 'Google français', localService: false },
    ])
    expect(voice?.name).toBe('Microsoft Hortense Desktop')
  })

  it('falls back to any French voice', () => {
    const voice = pickLocalVoice([
      { lang: 'en-GB', name: 'George', localService: true },
      { lang: 'fr-FR', name: 'voix locale', localService: true },
    ])
    expect(voice?.lang).toBe('fr-FR')
  })

  it('returns undefined when no voices are loaded yet', () => {
    expect(pickLocalVoice([])).toBeUndefined()
  })
})
