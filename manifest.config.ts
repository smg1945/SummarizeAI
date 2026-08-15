import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'SummarizeAI',
  version: '0.1.0',
  description: '로컬 LLM(LM Studio)으로 유튜브 영상을 요약합니다',
  permissions: ['storage'],
  host_permissions: ['http://localhost/*', 'http://127.0.0.1/*'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      js: ['src/content/index.tsx'],
      matches: ['https://www.youtube.com/*'],
      run_at: 'document_idle',
    },
  ],
  options_page: 'src/options/index.html',
})
