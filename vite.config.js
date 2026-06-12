import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Android Chrome'da kamera için HTTPS gerekebilir
  server: {
    host: true,
    port: 5173
  }
})
