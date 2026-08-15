import { createRoot, type Root } from 'react-dom/client'
import { Panel } from './Panel'
import cssText from './panel.css?inline'

const HOST_ID = 'summarize-ai-host'
let root: Root | null = null

function getVideoId(): string | null {
  if (!location.pathname.startsWith('/watch')) return null
  return new URLSearchParams(location.search).get('v')
}

function waitFor(selector: string, timeoutMs: number): Promise<Element | null> {
  return new Promise((resolve) => {
    const found = document.querySelector(selector)
    if (found) return resolve(found)
    const started = Date.now()
    const timer = setInterval(() => {
      const el = document.querySelector(selector)
      if (el || Date.now() - started > timeoutMs) {
        clearInterval(timer)
        resolve(el)
      }
    }, 250)
  })
}

async function mountPanel() {
  const videoId = getVideoId()
  if (!videoId) {
    root?.render(null)
    return
  }
  let host = document.getElementById(HOST_ID)
  if (!host) {
    // 이전 호스트가 DOM에서 제거된 경우 남은 React 트리를 정리한다
    root?.unmount()
    root = null
    const secondary = await waitFor('#secondary', 10000)
    if (!secondary) {
      console.warn('[SummarizeAI] 패널 삽입 지점(#secondary)을 찾지 못했습니다')
      return
    }
    host = document.createElement('div')
    host.id = HOST_ID
    secondary.prepend(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = cssText
    shadow.appendChild(style)
    const container = document.createElement('div')
    shadow.appendChild(container)
    root = createRoot(container)
  }
  // key=videoId로 영상 전환 시 패널 상태 리셋
  root?.render(<Panel key={videoId} videoId={videoId} />)
}

window.addEventListener('yt-navigate-finish', () => void mountPanel())
void mountPanel()
