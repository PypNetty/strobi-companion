import { creatureFromName } from '../fromName'
import { creatureRecipes } from '../recipes'

describe('creatureFromName', () => {
  it('maps chien aliases onto the dog kit with a snout', () => {
    expect(creatureFromName('chien').body.nodes.some(node => node.id === 'snout')).toBe(true)
    expect(creatureFromName('chein').body.nodes.some(node => node.id === 'snout')).toBe(true)
    expect(creatureFromName('toutou').id).toBe('chien')
    expect(creatureFromName('chien').body).toEqual(creatureRecipes.chien.body)
  })

  it('builds distinct dumplings for two unknown nouns', () => {
    const left = creatureFromName('xylophone')
    const right = creatureFromName('kermesse')
    expect(left.id).not.toBe(right.id)
    expect(left.colors.body).not.toBe(right.colors.body)
    expect(left.body).not.toEqual(right.body)
  })

  it('gives fraise, robot and dragon inspired kits', () => {
    const fraise = creatureFromName('fraise')
    const robot = creatureFromName('robot')
    const dragon = creatureFromName('dragon')
    expect(fraise.colors.body).toBe('#e24b4b')
    expect(fraise.body.nodes.some(node => node.id === 'leaf')).toBe(true)
    expect(robot.body.primary.type).toBe('cube')
    expect(robot.body.nodes.some(node => node.id.startsWith('antenna'))).toBe(true)
    expect(dragon.body.nodes.some(node => node.id.startsWith('horn'))).toBe(true)
    expect(dragon.body.nodes.some(node => node.id.startsWith('wing'))).toBe(true)
  })
})
