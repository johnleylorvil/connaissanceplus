import ReactMarkdown from 'react-markdown'
import './learning.css'

export default function MarkdownContent({ content }: { content: string }) {
  return <div className="learning-markdown"><ReactMarkdown skipHtml>{content}</ReactMarkdown></div>
}
