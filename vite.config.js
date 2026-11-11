import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { env } from './server/env.mjs'

const server = `http://127.0.0.1:${env('PORT') ?? 8787}`
const allowed = (env('ALLOWED_HOSTS') ?? '').split(',').map((h) => h.trim()).filter(Boolean)

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(env('UI_PORT') ?? 5173),
    host: env('HOST') ?? '127.0.0.1',
    allowedHosts: allowed.includes('all') ? true : allowed,
    proxy: {
      '/api': server,
      '/ws': { target: server.replace('http', 'ws'), ws: true },
    },
  },
})
