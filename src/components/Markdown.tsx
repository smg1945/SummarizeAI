import { parseMarkdown, type MdInline } from '../shared/markdown'

function Inline({ parts }: { parts: MdInline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.type === 'bold' ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>,
      )}
    </>
  )
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      {parseMarkdown(text).map((block, i) => {
        switch (block.type) {
          case 'heading':
            return (
              <div key={i} className={`md-h md-h${block.level}`}>
                <Inline parts={block.inline} />
              </div>
            )
          case 'bullet':
            return (
              <ul key={i} className="md-ul">
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Inline parts={item} />
                  </li>
                ))}
              </ul>
            )
          case 'paragraph':
            return (
              <p key={i} className="md-p">
                <Inline parts={block.inline} />
              </p>
            )
        }
      })}
    </div>
  )
}
