import { normalizeFace, unitToSigned } from '../normalization'

describe('face normalization', () => {
  it('maps the image center to the origin after mirroring', () => {
    const perception = normalizeFace([{ x: 0.5, y: 0.5 }])
    expect(perception.normalizedFaceX).toBeCloseTo(0)
    expect(perception.normalizedFaceY).toBeCloseTo(0)
  })

  it('uses a signed range from -1 to 1', () => {
    expect(unitToSigned(0)).toBe(-1)
    expect(unitToSigned(1)).toBe(1)
    expect(unitToSigned(0.5)).toBe(0)
  })

  it('mirrors x so a face on the camera-right looks left on screen', () => {
    const perception = normalizeFace([{ x: 0.9, y: 0.5 }], { mirrorX: true })
    expect(perception.normalizedFaceX).toBeCloseTo(-0.8)
  })

  it('treats a face near the top of the frame as looking up', () => {
    const perception = normalizeFace([{ x: 0.5, y: 0.15 }])
    expect(perception.normalizedFaceY).toBeGreaterThan(0.5)
  })
})
