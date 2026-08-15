// LLM 출력에 쓰이는 최소한의 마크다운(볼드, 헤딩, 목록, 문단)만 파싱한다.
// HTML을 만들지 않고 구조만 반환하므로 인젝션 위험이 없다.

export type MdInline = { type: 'text' | 'bold'; text: string }

export type MdBlock =
  | { type: 'heading'; level: number; inline: MdInline[] }
  | { type: 'bullet'; items: MdInline[][] }
  | { type: 'paragraph'; inline: MdInline[] }

export function parseInline(text: string): MdInline[] {
  const parts: MdInline[] = []
  const regex = /\*\*([^*]+)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text))) {
    if (m.index > last) parts.push({ type: 'text', text: text.slice(last, m.index) })
    parts.push({ type: 'bold', text: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) })
  return parts
}

export function parseMarkdown(text: string): MdBlock[] {
  const blocks: MdBlock[] = []
  let bullets: MdInline[][] | null = null
  let para: string[] = []

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'paragraph', inline: parseInline(para.join(' ')) })
      para = []
    }
  }
  const flushBullets = () => {
    if (bullets) {
      blocks.push({ type: 'bullet', items: bullets })
      bullets = null
    }
  }

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) {
      flushPara()
      flushBullets()
      continue
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      flushPara()
      flushBullets()
      blocks.push({ type: 'heading', level: heading[1].length, inline: parseInline(heading[2]) })
      continue
    }
    // 모델이 소제목을 "**제목**" 한 줄로 쓰는 경우가 많다
    if (/^\*\*[^*]+\*\*:?$/.test(line)) {
      flushPara()
      flushBullets()
      blocks.push({ type: 'heading', level: 3, inline: parseInline(line.replace(/:$/, '')) })
      continue
    }
    const bullet = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line)
    if (bullet) {
      flushPara()
      bullets = bullets ?? []
      bullets.push(parseInline(bullet[1]))
      continue
    }
    flushBullets()
    para.push(line)
  }
  flushPara()
  flushBullets()
  return blocks
}
