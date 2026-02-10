import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true, // Listen on all addresses (0.0.0.0)
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3333',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://127.0.0.1:3333',
        ws: true
      }
    }
  }
})
