import { useEffect, useState, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { loadSettings, saveSettings } from '../shared/settings'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'
import type { RuntimeRequest, RuntimeResponse } from '../shared/messages'

function OptionsApp() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    void loadSettings().then(setSettings)
  }, [])

  const save = async () => {
    await saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const test = async () => {
    setTestResult('확인 중...')
    await saveSettings(settings)
    const req: RuntimeRequest = { kind: 'checkConnection' }
    chrome.runtime.sendMessage(req, (res: RuntimeResponse) => {
      setTestResult(res?.connected ? '✅ 연결 성공' : '❌ 연결 실패 — LM Studio 서버가 켜져 있는지 확인하세요')
    })
  }

  const row: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }
  const input: CSSProperties = { padding: 8, fontSize: 14, width: 360 }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 24, maxWidth: 480 }}>
      <h1>SummarizeAI 설정</h1>
      <div style={row}>
        <label>LM Studio 주소</label>
        <input
          style={input}
          value={settings.baseUrl}
          onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
        />
      </div>
      <div style={row}>
        <label>모델명 (비워두면 LM Studio에 로드된 기본 모델 사용)</label>
        <input
          style={input}
          value={settings.model}
          placeholder="예: qwen2.5-7b-instruct"
          onChange={(e) => setSettings({ ...settings, model: e.target.value })}
        />
      </div>
      <div style={row}>
        <label>요약 출력 언어</label>
        <select
          style={input}
          value={settings.language}
          onChange={(e) => setSettings({ ...settings, language: e.target.value as Settings['language'] })}
        >
          <option value="ko">한국어</option>
          <option value="en">English</option>
          <option value="auto">자막 언어 따름</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => void save()}>저장</button>
        <button onClick={() => void test()}>연결 테스트</button>
        {saved && <span>저장됨 ✓</span>}
        {testResult && <span>{testResult}</span>}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<OptionsApp />)
