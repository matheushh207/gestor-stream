import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Mesmo padrão do Supabase (Site URL / Redirect): http://localhost:3000
    port: 3000,
    strictPort: true,
  },
})
