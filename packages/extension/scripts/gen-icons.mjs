/**
 * Generate PNG icons from icon.svg.
 * Run: node scripts/gen-icons.mjs
 * Requires: npm install -D sharp
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dir, '../public/icons')

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error('Install sharp first: npm install -D sharp')
  process.exit(1)
}

const svgBuf = readFileSync(join(publicDir, 'icon.svg'))

for (const size of [16, 32, 48, 128]) {
  await sharp(svgBuf)
    .resize(size, size)
    .png()
    .toFile(join(publicDir, `icon-${size}.png`))
  console.log(`✓ icon-${size}.png`)
}
