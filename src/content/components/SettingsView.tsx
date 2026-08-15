import { useEffect, useState } from 'react'
import { loadSettings, saveSettings } from '../../shared/settings'
import { DEFAULT_SETTINGS, type Provider, type Settings } from '../../shared/types'
import type { RuntimeRequest, RuntimeResponse } from '../../shared/messages'

const PROVIDER_LABELS: Record<Provider, string> = {
  lmstudio: '로컬 (LM Studio)',
  gemini: 'Google Gemini',
  claude: 'Claude (Anthropic)',
  openai: 'OpenAI',
}

export function SettingsView({ onSaved }: { onSaved: () => void }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void loadSettings().then(setSettings)
  }, [])

  const save = async () => {
    await saveSettings(settings)
    setStatus('저장됨 ✓')
    onSaved()
    setTimeout(() => setStatus(null), 2000)
  }

  const test = async () => {
    setStatus('확인 중...')
    await saveSettings(settings)
    onSaved()
    const req: RuntimeRequest = { kind: 'checkConnection' }
    chrome.runtime.sendMessage(req, (res: RuntimeResponse) => {
      setStatus(res?.connected ? '✅ 연결 성공' : '❌ 연결 실패')
    })
  }

  const p = settings.provider

  return (
    <div className="settings">
      <div className="settings-row">
        <label>모델 공급자</label>
        <select
          className="settings-input"
          value={p}
          onChange={(e) => setSettings({ ...settings, provider: e.target.value as Provider })}
        >
          {(Object.keys(PROVIDER_LABELS) as Provider[]).map((key) => (
            <option key={key} value={key}>
              {PROVIDER_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      {p === 'lmstudio' ? (
        <>
          <div className="settings-row">
            <label>LM Studio 주소</label>
            <input
              className="settings-input"
              value={settings.lmstudio.baseUrl}
              onChange={(e) =>
                setSettings({ ...settings, lmstudio: { ...settings.lmstudio, baseUrl: e.target.value } })
              }
            />
          </div>
          <div className="settings-row">
            <label>모델명 (비우면 로드된 기본 모델)</label>
            <input
              className="settings-input"
              value={settings.lmstudio.model}
              placeholder="예: qwen2.5-7b-instruct"
              onChange={(e) =>
                setSettings({ ...settings, lmstudio: { ...settings.lmstudio, model: e.target.value } })
              }
            />
          </div>
        </>
      ) : (
        <>
          <div className="settings-row">
            <label>{PROVIDER_LABELS[p]} API 키</label>
            <input
              className="settings-input"
              type="password"
              value={settings[p].apiKey}
              placeholder="API 키 입력"
              onChange={(e) => setSettings({ ...settings, [p]: { ...settings[p], apiKey: e.target.value } })}
            />
          </div>
          <div className="settings-row">
            <label>모델명</label>
            <input
              className="settings-input"
              value={settings[p].model}
              onChange={(e) => setSettings({ ...settings, [p]: { ...settings[p], model: e.target.value } })}
            />
          </div>
        </>
      )}

      <div className="settings-row">
        <label>요약 출력 언어</label>
        <select
          className="settings-input"
          value={settings.language}
          onChange={(e) => setSettings({ ...settings, language: e.target.value as Settings['language'] })}
        >
          <option value="ko">한국어</option>
          <option value="en">English</option>
          <option value="auto">자막 언어 따름</option>
        </select>
      </div>

      <div className="settings-actions">
        <button className="primary-btn" onClick={() => void save()}>
          저장
        </button>
        <button className="primary-btn" onClick={() => void test()}>
          연결 테스트
        </button>
        {status && <span className="muted">{status}</span>}
      </div>
    </div>
  )
}
