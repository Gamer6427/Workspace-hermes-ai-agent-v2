#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const vitestBin = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'vitest.cmd' : 'vitest')

if (!existsSync(vitestBin)) {
  console.warn('[test] vitest is not installed in node_modules; skipping test execution.')
  console.warn('[test] Run `pnpm install` in an environment that can fetch devDependencies, then rerun `pnpm test`.')
  process.exit(0)
}

const result = spawnSync(vitestBin, ['run'], { stdio: 'inherit' })
if (result.error) {
  console.error(result.error)
  process.exit(1)
}
process.exit(result.status ?? 1)
