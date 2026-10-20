import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset paths so the build works under GitHub Pages' /<repo>/ subpath
  // (routing is hash-based, so there are no deep URLs to break).
  base: './',
  plugins: [react()],
})
