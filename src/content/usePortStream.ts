import { useCallback, useEffect, useRef, useState } from 'react'
import { PORT_NAME, type PortRequest, type PortResponse } from '../shared/messages'
import type { Chapter } from '../shared/types'

export type StreamStatus = 'idle' | 'streaming' | 'done' | 'error'

export function usePortStream() {
  const [text, setText] = useState('')
  const [chapters, setChapters] = useState<Chapter[] | null>(null)
  const [status, setStatus] = useState<StreamStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const portRef = useRef<chrome.runtime.Port | null>(null)

  const abort = useCallback(() => {
    portRef.current?.disconnect()
    portRef.current = null
  }, [])

  // 언마운트(영상 전환 등) 시 포트를 닫아 백그라운드 작업을 중단시킨다
  useEffect(() => abort, [abort])

  const start = useCallback(
    (req: PortRequest, onDone?: (finalText: string) => void) => {
      abort()
      setText('')
      setChapters(null)
      setError(null)
      setStatus('streaming')
      const port = chrome.runtime.connect({ name: PORT_NAME })
      portRef.current = port
      port.onMessage.addListener((msg: PortResponse) => {
        switch (msg.kind) {
          case 'delta':
            setText((t) => t + msg.text)
            break
          case 'done':
            setText(msg.text)
            setStatus('done')
            onDone?.(msg.text)
            port.disconnect()
            break
          case 'chapters':
            setChapters(msg.chapters)
            setStatus('done')
            port.disconnect()
            break
          case 'error':
            setError(
              msg.code === 'LLM_UNREACHABLE'
                ? 'LM Studio에 연결할 수 없습니다. LM Studio를 실행하고 서버(Developer > Start Server)를 켜 주세요.'
                : msg.code === 'PARSE_FAILED'
                  ? '챕터 생성에 실패했습니다. 다시 시도해 주세요.'
                  : `오류가 발생했습니다: ${msg.message}`,
            )
            setStatus('error')
            port.disconnect()
            break
        }
      })
      port.postMessage(req)
    },
    [abort],
  )

  return { text, chapters, status, error, start, abort }
}
