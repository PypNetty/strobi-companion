import { avatarFromRecipe, creatureRecipes, earNodesOf } from '../recipes'
import { companionAvatar } from '../catalog'

describe('creature recipes', () => {
  it('gives the lapin recipe two ear primitives', () => {
    expect(earNodesOf(creatureRecipes.lapin)).toHaveLength(2)
    expect(creatureRecipes.lapin.body.nodes.map(node => node.id)).toEqual(
      expect.arrayContaining(['ear-left', 'ear-right'])
    )
  })

  it('returns the companion default look when resetting to Strobi', () => {
    const reset = avatarFromRecipe(creatureRecipes.strobi)
    const fallback = companionAvatar()
    expect(reset.body).toEqual(fallback.body)
    expect(reset.colors).toEqual(fallback.colors)
    expect(reset.eyes).toEqual(fallback.eyes)
    expect(reset.body.primary.type).toBe('cube')
    expect(reset.colors.body).toBe('#6fc4b0')
  })

  it('keeps animal recipes distinct from the default dumpling', () => {
    expect(creatureRecipes.chat.body.nodes.some(node => node.id === 'tail')).toBe(true)
    expect(creatureRecipes.ours.body.primary.width).toBeGreaterThan(
      creatureRecipes.strobi.body.primary.width
    )
    expect(creatureRecipes.blob.body.nodes.some(node => node.id === 'drip')).toBe(true)
    expect(avatarFromRecipe(creatureRecipes.lapin).body).not.toEqual(
      avatarFromRecipe(creatureRecipes.strobi).body
    )
  })
})
