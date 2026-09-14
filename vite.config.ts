import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// base './' -> todos os caminhos gerados ficam relativos, requisito pra abrir
// o index.html direto do disco (file://) no Chromebook.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
})
