import { useEffect, useRef, useState } from 'react'
import { Markdown } from '../../components/Markdown'
import { usePortStream } from '../usePortStream'
import type { TabProps } from '../Panel'
import type { ChatMessage } from '../../shared/types'
import type { RuntimeRequest, SuggestQuestionsResponse } from '../../shared/messages'

export function ChatTab({ transcript, meta, active }: TabProps & { active: boolean }) {
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const suggestionsFetched = useRef(false)
  const { text, status, error, start } = usePortStream()

  const streaming = status === 'streaming'

  const fetchSuggestions = (currentHistory: ChatMessage[]) => {
    setLoadingSuggestions(true)
    const req: RuntimeRequest = { kind: 'suggestQuestions', transcript, meta, history: currentHistory }
    chrome.runtime.sendMessage(req, (res: SuggestQuestionsResponse) => {
      setSuggestions(res?.questions ?? [])
      setLoadingSuggestions(false)
    })
  }

  // 채팅 탭을 처음 열었을 때 한 번만 추천 질문을 생성한다 (열지 않으면 LLM 호출 없음)
  useEffect(() => {
    if (active && !suggestionsFetched.current) {
      suggestionsFetched.current = true
      fetchSuggestions([])
    }
    // eslint 없음 — fetchSuggestions는 최신 props를 캡처하는 렌더당 함수
  }, [active])

  const ask = (question: string) => {
    if (!question || streaming) return
    const nextHistory: ChatMessage[] = [...history, { role: 'user', content: question }]
    setHistory(nextHistory)
    setInput('')
    setSuggestions([])
    start({ kind: 'chat', transcript, meta, history, question }, (finalText) => {
      const doneHistory: ChatMessage[] = [...nextHistory, { role: 'assistant', content: finalText }]
      setHistory(doneHistory)
      fetchSuggestions(doneHistory)
    })
  }

  return (
    <div>
      <div className="chat-log">
        {history.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
          </div>
        ))}
        {streaming && <div className="chat-msg assistant">{text ? <Markdown text={text} /> : '...'}</div>}
        {status === 'error' && <p className="error">{error}</p>}
      </div>
      {!streaming && suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((q) => (
            <button key={q} className="suggestion" onClick={() => ask(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
      {!streaming && loadingSuggestions && <div className="muted suggestions-loading">추천 질문 생성 중...</div>}
      <div className="chat-input-row">
        <input
          className="chat-input"
          value={input}
          placeholder="영상에 대해 질문해 보세요"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) ask(input.trim())
          }}
        />
        <button className="primary-btn" onClick={() => ask(input.trim())} disabled={streaming || !input.trim()}>
          전송
        </button>
      </div>
    </div>
  )
}
