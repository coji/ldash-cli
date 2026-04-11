import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

if (!existsSync('src/generated/api.ts')) {
  execSync('pnpm generate', { stdio: 'inherit' })
}
