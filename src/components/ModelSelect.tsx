import { useEffect, useState, type CSSProperties } from 'react'
import type { ListModelsResponse, RuntimeRequest } from '../shared/messages'
import type { Settings } from '../shared/types'

interface Props {
  settings: Settings // 현재 폼 값 (저장 전 API 키로도 조회 가능)
  value: string
  onChange: (model: string) => void
  emptyLabel?: string // 빈 값 선택지를 허용할 때의 표시 문구 (LM Studio용)
  className?: string
  style?: CSSProperties
  buttonClassName?: string
}

export function ModelSelect({ settings, value, onChange, emptyLabel, className, style, buttonClassName }: Props) {
  const [models, setModels] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = () => {
    setLoading(true)
    const req: RuntimeRequest = { kind: 'listModels', settings }
    chrome.runtime.sendMessage(req, (res: ListModelsResponse) => {
      setModels(res?.models ?? null)
      setLoading(false)
    })
  }

  // 공급자 변경 시 자동 재조회. API 키 타이핑 중에는 요청을 쏟지 않도록 ↻ 버튼으로 수동 조회.
  useEffect(refresh, [settings.provider])

  const rowStyle: CSSProperties = { display: 'flex', gap: 4, alignItems: 'stretch' }
  const refreshButton = (
    <button
      type="button"
      className={buttonClassName}
      title="모델 목록 새로고침"
      onClick={refresh}
      disabled={loading}
    >
      {loading ? '…' : '↻'}
    </button>
  )

  if (models && models.length > 0) {
    // 현재 값이 목록에 없으면(직접 입력했던 모델 등) 선택지로 함께 보여준다
    const options = value && !models.includes(value) ? [value, ...models] : models
    return (
      <div style={rowStyle}>
        <select
          className={className}
          style={{ ...style, flex: 1 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
          {!value && emptyLabel === undefined && <option value="">모델 선택...</option>}
          {options.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {refreshButton}
      </div>
    )
  }

  // 목록 조회 실패/전 — 직접 입력 폴백
  return (
    <div style={rowStyle}>
      <input
        className={className}
        style={{ ...style, flex: 1 }}
        value={value}
        placeholder="모델명 직접 입력 (↻로 목록 불러오기)"
        onChange={(e) => onChange(e.target.value)}
      />
      {refreshButton}
    </div>
  )
}
