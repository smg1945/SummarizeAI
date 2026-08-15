import { usePortStream } from '../usePortStream'
import { formatTime } from '../../shared/format'
import type { TabProps } from '../Panel'

function seekTo(sec: number) {
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video')
  if (video) video.currentTime = sec
}

export function ChaptersTab({ transcript, meta }: TabProps) {
  const { chapters, status, error, start } = usePortStream()

  const run = () => start({ kind: 'chapters', transcript, meta })

  if (status === 'idle') {
    return (
      <button className="primary-btn" onClick={run}>
        챕터 만들기
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
  if (status === 'streaming') {
    return <span className="muted">챕터 생성 중... (구간별 분석에 시간이 걸립니다)</span>
  }
  return (
    <div>
      {(chapters ?? []).map((c) => (
        <div key={c.startTime} className="chapter" onClick={() => seekTo(c.startTime)}>
          <span className="chapter-time">{formatTime(c.startTime)}</span>
          <strong>{c.title}</strong>
          <div className="muted">{c.summary}</div>
        </div>
      ))}
    </div>
  )
}
