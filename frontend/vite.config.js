import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 8282,
    host: '0.0.0.0',
    watch: {
      usePolling: true,
    }
  }
})
