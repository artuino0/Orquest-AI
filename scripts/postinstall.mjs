// node-pty trae para macOS un ayudante (`spawn-helper`) sin permiso de ejecución:
// sin él ninguna terminal abre ("posix_spawnp failed"). Se le da al instalar.
import { chmodSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const prebuilds = join('node_modules', 'node-pty', 'prebuilds')
if (existsSync(prebuilds)) {
  for (const dir of readdirSync(prebuilds)) {
    const helper = join(prebuilds, dir, 'spawn-helper')
    if (existsSync(helper)) chmodSync(helper, 0o755)
  }
}
