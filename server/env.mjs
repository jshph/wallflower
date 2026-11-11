// Settings come from WALLFLOWER_* environment variables. The names from before the rename
// (ROOMBOARD_*) still work, and so does an existing ~/.roomboard folder.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const env = (key) => process.env[`WALLFLOWER_${key}`] ?? process.env[`ROOMBOARD_${key}`]

export function homeDir() {
  const current = path.join(os.homedir(), '.wallflower')
  const old = path.join(os.homedir(), '.roomboard')
  return !fs.existsSync(current) && fs.existsSync(old) ? old : current
}
