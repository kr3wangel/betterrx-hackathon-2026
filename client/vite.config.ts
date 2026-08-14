import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const clientDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(clientDir, 'src'),
    },
  },
  server: {
    // Bind to 0.0.0.0 so /driver and /caregiver open on a real phone over the venue LAN —
    // the driver view needs a real camera, and the caregiver view reads as a phone
    // because it is one.
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
