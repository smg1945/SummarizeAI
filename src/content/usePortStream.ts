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
      let finished = false
      port.onMessage.addListener((msg: PortResponse) => {
        switch (msg.kind) {
          case 'delta':
            setText((t) => t + msg.text)
            break
          case 'done':
            finished = true
            setText(msg.text)
            setStatus('done')
            onDone?.(msg.text)
            port.disconnect()
            break
          case 'chapters':
            finished = true
            setChapters(msg.chapters)
            setStatus('done')
            port.disconnect()
            break
          case 'error':
            finished = true
            setError(
              msg.code === 'LLM_UNREACHABLE'
                ? 'LLM 서버에 연결할 수 없습니다. 로컬 모드라면 LM Studio 서버(Developer > Start Server)가 켜져 있는지 확인해 주세요.'
                : msg.code === 'AUTH_FAILED'
                  ? 'API 키가 올바르지 않습니다. 확장 옵션에서 API 키를 확인해 주세요.'
                  : msg.code === 'PARSE_FAILED'
                    ? '챕터 생성에 실패했습니다. 다시 시도해 주세요.'
                    : `오류가 발생했습니다: ${msg.message}`,
            )
            setStatus('error')
            port.disconnect()
            break
        }
      })
      // 백그라운드(서비스 워커) 쪽에서 먼저 연결이 끊긴 경우 — 정상 종료(done/chapters/error) 없이
      // 끊기면 UI가 'streaming' 상태로 멈추므로 에러로 전환한다.
      // abort()/cleanup에 의한 로컬 disconnect()는 이 리스너를 트리거하지 않지만,
      // 언마운트 등으로 portRef가 이미 교체된 경우까지 대비해 현재 포트 여부도 함께 확인한다.
      port.onDisconnect.addListener(() => {
        if (!finished && portRef.current === port) {
          finished = true
          setError('백그라운드 연결이 끊겼습니다. 다시 시도해 주세요.')
          setStatus('error')
          portRef.current = null
        }
      })
      port.postMessage(req)
    },
    [abort],
  )

  return { text, chapters, status, error, start, abort }
}
