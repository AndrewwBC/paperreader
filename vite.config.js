import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { existsSync, cpSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

function copyPdfjsAssets() {
  return {
    name: 'copy-pdfjs-assets',
    writeBundle() {
      const srcFonts = resolve(__dirname, 'node_modules/pdfjs-dist/standard_fonts')
      const srcCmaps = resolve(__dirname, 'node_modules/pdfjs-dist/cmaps')
      const destFonts = resolve(__dirname, 'dist/standard_fonts')
      const destCmaps = resolve(__dirname, 'dist/cmaps')

      if (existsSync(srcFonts)) {
        cpSync(srcFonts, destFonts, { recursive: true })
      }
      if (existsSync(srcCmaps)) {
        cpSync(srcCmaps, destCmaps, { recursive: true })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), copyPdfjsAssets()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
