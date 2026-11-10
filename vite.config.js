import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const server = `http://127.0.0.1:${process.env.ROOMBOARD_PORT ?? 8787}`
const allowed = (process.env.ROOMBOARD_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean)

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.ROOMBOARD_UI_PORT ?? 5173),
    host: process.env.ROOMBOARD_HOST ?? '127.0.0.1',
    allowedHosts: allowed.includes('all') ? true : allowed,
    proxy: {
      '/api': server,
      '/ws': { target: server.replace('http', 'ws'), ws: true },
    },
  },
})
