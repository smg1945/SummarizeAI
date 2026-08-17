import { usePortStream } from '../usePortStream'
import { formatTime } from '../../shared/format'
import type { TabProps } from '../Panel'
import type { Chapter } from '../../shared/types'

function seekTo(sec: number) {
  const video = document.querySelector<HTMLVideoElement>('video.html5-main-video')
  if (video) video.currentTime = sec
}

export function ChaptersTab({ transcript, meta, initialChapters }: TabProps & { initialChapters?: Chapter[] }) {
  const { chapters, status, error, start } = usePortStream()

  const run = () => start({ kind: 'chapters', transcript, meta })

  if (status === 'idle' && !initialChapters?.length) {
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
  // done이면 방금 생성한 챕터, idle이면 복원된 챕터
  return (
    <div>
      {(chapters ?? initialChapters ?? []).map((c) => (
        <div key={c.startTime} className="chapter" onClick={() => seekTo(c.startTime)}>
          <span className="chapter-time">{formatTime(c.startTime)}</span>
          <strong>{c.title}</strong>
          <div className="muted">{c.summary}</div>
        </div>
      ))}
    </div>
  )
}
