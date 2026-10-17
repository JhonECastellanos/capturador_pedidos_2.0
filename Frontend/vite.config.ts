import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { resolve } from 'node:path'

export default defineConfig(({ mode }) => {
  const entorno = loadEnv(mode, '..', '');
  const operador = mode === 'operador';
  return {
  root: operador ? resolve(import.meta.dirname, '../Control') : import.meta.dirname,
  publicDir: resolve(import.meta.dirname, 'public'),
  base: operador ? '/operador/' : '/',
  build: { outDir: resolve(import.meta.dirname, operador ? 'dist-operador' : 'dist'), emptyOutDir: true },
  envDir: '..',
  plugins: [react(), tailwindcss()],
  // El contrato es CommonJS para Nest; los workspaces enlazados no se
  // precompilan automáticamente en desarrollo como las dependencias externas.
  optimizeDeps: { include: ['@abinova/contrato'] },
  server: {
    host: true,
    proxy: { '/api/v1/agentes/audio/conversar': { target: entorno.VOICE_PROXY_TARGET || 'http://localhost:7860', changeOrigin: true, ws: true, rewrite: ruta => ruta.replace('/api/v1/agentes/audio/conversar', '/conversar') }, '/api': { target: entorno.API_PROXY_TARGET || 'http://localhost:3000', changeOrigin: true, ws: true } },
  },
  }
})
