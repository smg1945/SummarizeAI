import { useEffect, useState } from 'react'
import { fetchTranscript } from './transcript'
import type { RuntimeRequest, RuntimeResponse } from '../shared/messages'
import type { TranscriptSegment, VideoMeta } from '../shared/types'

export type TabKey = 'summary' | 'chapters' | 'chat'

export interface TabProps {
  transcript: TranscriptSegment[]
  meta: VideoMeta
}

export function Panel({ videoId }: { videoId: string }) {
  const [tab, setTab] = useState<TabKey>('summary')
  const [connected, setConnected] = useState(false)
  const [data, setData] = useState<{ segments: TranscriptSegment[]; meta: VideoMeta } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const req: RuntimeRequest = { kind: 'checkConnection' }
    chrome.runtime.sendMessage(req, (res: RuntimeResponse) => setConnected(res?.connected ?? false))
  }, [videoId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData(null)
    fetchTranscript(videoId)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [videoId])

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'summary', label: '요약' },
    { key: 'chapters', label: '챕터' },
    { key: 'chat', label: '채팅' },
  ]

  return (
    <div className="panel">
      <div className="header">
        <span className={`status-dot${connected ? ' connected' : ''}`} title={connected ? 'LM Studio 연결됨' : 'LM Studio 연결 안 됨'} />
        SummarizeAI
      </div>
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="body">
        {loading ? (
          <span className="muted">자막을 불러오는 중...</span>
        ) : !data ? (
          <span className="muted">이 영상은 자막이 없어 요약할 수 없습니다.</span>
        ) : (
          <TabContent tab={tab} transcript={data.segments} meta={data.meta} />
        )}
      </div>
    </div>
  )
}

function TabContent({ tab, transcript, meta }: { tab: TabKey } & TabProps) {
  // Task 10~12에서 SummaryTab / ChaptersTab / ChatTab으로 교체된다
  switch (tab) {
    case 'summary':
      return <span className="muted">요약 탭 (구현 예정)</span>
    case 'chapters':
      return <span className="muted">챕터 탭 (구현 예정)</span>
    case 'chat':
      return <span className="muted">채팅 탭 (구현 예정)</span>
  }
}
