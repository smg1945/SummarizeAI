import { useState } from 'react'
import { Markdown } from '../../components/Markdown'
import { usePortStream } from '../usePortStream'
import type { TabProps } from '../Panel'
import type { ChatMessage } from '../../shared/types'

export function ChatTab({ transcript, meta }: TabProps) {
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const { text, status, error, start } = usePortStream()

  const streaming = status === 'streaming'

  const send = () => {
    const question = input.trim()
    if (!question || streaming) return
    const nextHistory: ChatMessage[] = [...history, { role: 'user', content: question }]
    setHistory(nextHistory)
    setInput('')
    start({ kind: 'chat', transcript, meta, history, question }, (finalText) => {
      setHistory([...nextHistory, { role: 'assistant', content: finalText }])
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
      <div className="chat-input-row">
        <input
          className="chat-input"
          value={input}
          placeholder="영상에 대해 질문해 보세요"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) send()
          }}
        />
        <button className="primary-btn" onClick={send} disabled={streaming || !input.trim()}>
          전송
        </button>
      </div>
    </div>
  )
}
