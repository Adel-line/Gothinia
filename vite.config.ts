import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // the drawn experience (SVG) is the site
        main: 'index.html',
        // the earlier 3D version, kept for reference
        '3d': '3d.html',
      },
    },
  },
})
