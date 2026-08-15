import { useEffect, useState, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { loadSettings, saveSettings } from '../shared/settings'
import { DEFAULT_SETTINGS, type Provider, type Settings } from '../shared/types'
import type { RuntimeRequest, RuntimeResponse } from '../shared/messages'

const PROVIDER_LABELS: Record<Provider, string> = {
  lmstudio: '로컬 (LM Studio)',
  gemini: 'Google Gemini',
  claude: 'Claude (Anthropic)',
  openai: 'OpenAI',
}

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
      setTestResult(
        res?.connected
          ? '✅ 연결 성공'
          : settings.provider === 'lmstudio'
            ? '❌ 연결 실패 — LM Studio 서버가 켜져 있는지 확인하세요'
            : '❌ 연결 실패 — API 키와 네트워크를 확인하세요',
      )
    })
  }

  const row: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }
  const input: CSSProperties = { padding: 8, fontSize: 14, width: 360 }
  const note: CSSProperties = { fontSize: 12, color: '#888' }

  const p = settings.provider

  return (
    <div style={{ fontFamily: 'sans-serif', padding: 24, maxWidth: 480 }}>
      <h1>SummarizeAI 설정</h1>
      <div style={row}>
        <label>모델 공급자</label>
        <select
          style={input}
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
          <div style={row}>
            <label>LM Studio 주소</label>
            <input
              style={input}
              value={settings.lmstudio.baseUrl}
              onChange={(e) =>
                setSettings({ ...settings, lmstudio: { ...settings.lmstudio, baseUrl: e.target.value } })
              }
            />
          </div>
          <div style={row}>
            <label>모델명 (비워두면 LM Studio에 로드된 기본 모델 사용)</label>
            <input
              style={input}
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
          <div style={row}>
            <label>{PROVIDER_LABELS[p]} API 키</label>
            <input
              style={input}
              type="password"
              value={settings[p].apiKey}
              placeholder="API 키 입력"
              onChange={(e) =>
                setSettings({ ...settings, [p]: { ...settings[p], apiKey: e.target.value } })
              }
            />
            <span style={note}>키는 이 브라우저의 확장 저장소에 평문으로 저장됩니다 (개인 사용 기준).</span>
          </div>
          <div style={row}>
            <label>모델명</label>
            <input
              style={input}
              value={settings[p].model}
              onChange={(e) =>
                setSettings({ ...settings, [p]: { ...settings[p], model: e.target.value } })
              }
            />
          </div>
        </>
      )}

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
