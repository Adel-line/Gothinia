import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        // prototype: the rose as an animated drawing (SVG)
        svg: 'svg.html',
      },
    },
  },
})
