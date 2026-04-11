/**
 * Fix duplicate operation IDs in the generated OpenAPI types.
 *
 * Lightdash's swagger.json defines both v1 (deprecated) and v2 endpoints
 * that share the same operation ID. This causes TypeScript duplicate-identifier
 * errors. We rename the v2 operations to unique names.
 *
 * Fails loudly on any mismatch: if upstream renames or removes these
 * endpoints, we want to know immediately rather than silently producing
 * broken types.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'src/generated/api.ts'
let content = readFileSync(file, 'utf-8')

const renames = [
  // v2 paths reference these operation names
  [
    'get: operations["getSavedChartSchedulers"];',
    'get: operations["getSavedChartSchedulersV2"];',
    '/api/v2/saved/',
  ],
  [
    'get: operations["getDashboardSchedulers"];',
    'get: operations["getDashboardSchedulersV2"];',
    '/api/v2/dashboards/',
  ],
]

// Rename path references (only the v2 ones)
for (const [from, to, marker] of renames) {
  const markerIdx = content.indexOf(`"${marker}`)
  if (markerIdx === -1) {
    throw new Error(`patch-generated: marker not found: ${marker}`)
  }
  const refIdx = content.indexOf(from, markerIdx)
  if (refIdx === -1) {
    throw new Error(
      `patch-generated: reference not found after ${marker}: ${from}`,
    )
  }
  content = content.slice(0, refIdx) + to + content.slice(refIdx + from.length)
}

// Rename the second (duplicate) operation definitions
const opRenames = ['getSavedChartSchedulers', 'getDashboardSchedulers']

for (const name of opRenames) {
  const first = content.indexOf(`    ${name}: {`)
  if (first === -1) {
    throw new Error(`patch-generated: first definition not found: ${name}`)
  }
  const second = content.indexOf(`    ${name}: {`, first + 1)
  if (second === -1) {
    throw new Error(`patch-generated: duplicate definition not found: ${name}`)
  }
  content =
    content.slice(0, second) +
    `    ${name}V2: {` +
    content.slice(second + `    ${name}: {`.length)
}

writeFileSync(file, content)
console.log('Patched duplicate operation IDs in generated types.')
