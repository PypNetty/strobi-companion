import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const size = 64
const bytes = Buffer.alloc(size * size * 4)

const put = (x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= size || y >= size) return
  const i = (y * size + x) * 4
  bytes[i] = r
  bytes[i + 1] = g
  bytes[i + 2] = b
  bytes[i + 3] = a
}

const cx = 31.5
const cy = 33
for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const dx = x - cx
    const dy = y - cy
    if (dx * dx + dy * dy <= 26 * 26) put(x, y, 91, 127, 229)
  }
}

const eye = (ex, ey) => {
  for (let y = -7; y <= 7; y += 1) {
    for (let x = -3; x <= 3; x += 1) {
      if (x * x / 9 + y * y / 49 <= 1) put(Math.round(ex + x), Math.round(ey + y), 17, 19, 22)
    }
  }
}
eye(24, 26)
eye(40, 26)

const raw = Buffer.alloc((size * 4 + 1) * size)
for (let y = 0; y < size; y += 1) {
  raw[y * (size * 4 + 1)] = 0
  bytes.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
}

const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c >>> 0
}
const crc32 = data => {
  let c = 0xffffffff
  for (const value of data) c = crcTable[(c ^ value) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const typeBuf = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([length, typeBuf, data, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(size, 0)
ihdr.writeUInt32BE(size, 4)
ihdr[8] = 8
ihdr[9] = 6

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

const xor = Buffer.alloc(size * size * 4)
for (let y = 0; y < size; y += 1) {
  const srcY = size - 1 - y
  for (let x = 0; x < size; x += 1) {
    const src = (srcY * size + x) * 4
    const dest = (y * size + x) * 4
    xor[dest] = bytes[src + 2]
    xor[dest + 1] = bytes[src + 1]
    xor[dest + 2] = bytes[src]
    xor[dest + 3] = bytes[src + 3]
  }
}

const andRowBytes = Math.ceil(size / 32) * 4
const andMask = Buffer.alloc(andRowBytes * size)
const dibHeader = Buffer.alloc(40)
dibHeader.writeUInt32LE(40, 0)
dibHeader.writeInt32LE(size, 4)
dibHeader.writeInt32LE(size * 2, 8)
dibHeader.writeUInt16LE(1, 12)
dibHeader.writeUInt16LE(32, 14)
dibHeader.writeUInt32LE(0, 16)
dibHeader.writeUInt32LE(xor.length, 20)

const image = Buffer.concat([dibHeader, xor, andMask])
const icoHeader = Buffer.alloc(22)
icoHeader.writeUInt16LE(0, 0)
icoHeader.writeUInt16LE(1, 2)
icoHeader.writeUInt16LE(1, 4)
icoHeader.writeUInt8(size === 256 ? 0 : size, 6)
icoHeader.writeUInt8(size === 256 ? 0 : size, 7)
icoHeader.writeUInt8(0, 8)
icoHeader.writeUInt8(0, 9)
icoHeader.writeUInt16LE(1, 10)
icoHeader.writeUInt16LE(32, 12)
icoHeader.writeUInt32LE(image.length, 14)
icoHeader.writeUInt32LE(22, 18)
const ico = Buffer.concat([icoHeader, image])

const destDir = join(root, 'src-tauri/icons')
mkdirSync(destDir, { recursive: true })
writeFileSync(join(destDir, 'icon.png'), png)
writeFileSync(join(destDir, 'icon.ico'), ico)
writeFileSync(join(root, 'public/icon.png'), png)
console.log('Wrote companion icons.')
