// Run the board server and the Vite client together.
import { spawn } from 'node:child_process'
import fs from 'node:fs'

// Local settings (ports, hosts, data directory) for both processes; see README.
if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local')
const env = { ...process.env, WALLFLOWER_DEV: '1' }

const procs = [
  spawn('node', ['--watch-path=server', 'server/index.mjs'], { stdio: 'inherit', env }),
  spawn('npm', ['exec', '--', 'vite'], { stdio: 'inherit', env }),
]
const stop = () => { for (const p of procs) p.kill(); process.exit() }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const p of procs) p.on('exit', stop)
