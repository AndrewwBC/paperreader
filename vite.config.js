import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  plugins: [react(), viteStaticCopy({ targets: ['cmaps', 'standard_fonts', 'wasm'].map(dir => ({
    src: `node_modules/pdfjs-dist/${dir}/*`, dest: dir, rename: { stripBase: true },
  })) })],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})