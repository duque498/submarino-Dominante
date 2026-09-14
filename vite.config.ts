import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// base './' -> todos os caminhos gerados ficam relativos, requisito pra abrir
// o index.html direto do disco (file://) no Chromebook.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: {
    // Os PNGs das formas precisam virar data URI: imagem carregada por caminho
    // de arquivo via file:// contamina o canvas e o getImageData lança
    // SecurityError. 10 MB cobre a pasta src/formas inteira com folga.
    assetsInlineLimit: 10 * 1024 * 1024,
  },
})
