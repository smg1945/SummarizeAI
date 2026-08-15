import { handleRequest } from './router'
import { checkConnection } from './llm'
import { loadSettings } from '../shared/settings'
import { PORT_NAME, type PortRequest, type RuntimeRequest, type RuntimeResponse } from '../shared/messages'

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return
  const controller = new AbortController()
  port.onDisconnect.addListener(() => controller.abort())
  port.onMessage.addListener((req: PortRequest) => {
    void (async () => {
      const settings = await loadSettings()
      await handleRequest(
        req,
        settings,
        (msg) => {
          try {
            port.postMessage(msg)
          } catch {
            // 포트가 이미 닫힘 (페이지 이동 등) — 무시
          }
        },
        controller.signal,
      )
    })()
  })
})

chrome.runtime.onMessage.addListener(
  (req: RuntimeRequest, _sender, sendResponse: (res: RuntimeResponse) => void) => {
    if (req.kind !== 'checkConnection') return
    void (async () => {
      const settings = await loadSettings()
      sendResponse({ connected: await checkConnection(settings) })
    })()
    return true // 비동기 sendResponse 유지
  },
)
