import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  // crx plugin cast to any due to type conflict between vitest's bundled vite and standalone @crxjs/vite-plugin
  plugins: [react(), crx({ manifest }) as any],
  test: {
    environment: 'node',
  },
})
