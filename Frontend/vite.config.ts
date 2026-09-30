import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const entorno = loadEnv(mode, '..', '');
  return {
  envDir: '..',
  plugins: [react(), tailwindcss()],
  // El contrato es CommonJS para Nest; los workspaces enlazados no se
  // precompilan automáticamente en desarrollo como las dependencias externas.
  optimizeDeps: { include: ['@ambie/contrato'] },
  server: {
    host: true,
    proxy: { '/api': { target: entorno.API_PROXY_TARGET || 'http://localhost:3000', changeOrigin: true, ws: true } },
  },
  }
})
