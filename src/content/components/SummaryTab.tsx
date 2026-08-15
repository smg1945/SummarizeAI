import { usePortStream } from '../usePortStream'
import type { TabProps } from '../Panel'

export function SummaryTab({ transcript, meta }: TabProps) {
  const { text, status, error, start } = usePortStream()

  const run = () => start({ kind: 'summarize', transcript, meta })

  if (status === 'idle') {
    return (
      <button className="primary-btn" onClick={run}>
        이 영상 요약하기
      </button>
    )
  }
  if (status === 'error') {
    return (
      <div>
        <p className="error">{error}</p>
        <button className="primary-btn" onClick={run}>
          다시 시도
        </button>
      </div>
    )
  }
  return (
    <div>
      {text || <span className="muted">요약 생성 중...</span>}
      {status === 'streaming' && text && <span className="muted"> ▍</span>}
    </div>
  )
}
