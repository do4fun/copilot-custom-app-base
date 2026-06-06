import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Strip YAML frontmatter (---..---) before rendering —
// it's already stored separately in name/description fields.
function stripFrontmatter(content) {
  const m = content.match(/^---[\r\n][\s\S]*?[\r\n]---[\r\n]?/)
  return m ? content.slice(m[0].length).trimStart() : content
}

const components = {
  h1: ({ node, ...p }) => <h1 className="text-lg font-bold text-white mt-5 mb-2" {...p} />,
  h2: ({ node, ...p }) => <h2 className="text-base font-bold text-white mt-4 mb-2 border-b border-gray-700 pb-1" {...p} />,
  h3: ({ node, ...p }) => <h3 className="text-sm font-semibold text-gray-200 mt-3 mb-1.5" {...p} />,
  h4: ({ node, ...p }) => <h4 className="text-sm font-semibold text-gray-400 mt-2 mb-1" {...p} />,
  p:  ({ node, ...p }) => <p  className="text-gray-300 leading-relaxed mb-3" {...p} />,
  ul: ({ node, ...p }) => <ul className="list-disc pl-5 space-y-1 mb-3 text-gray-300" {...p} />,
  ol: ({ node, ...p }) => <ol className="list-decimal pl-5 space-y-1 mb-3 text-gray-300" {...p} />,
  li: ({ node, ...p }) => <li className="leading-relaxed" {...p} />,
  a:  ({ node, ...p }) => <a  className="text-indigo-400 hover:text-indigo-300 underline" target="_blank" rel="noopener noreferrer" {...p} />,
  strong: ({ node, ...p }) => <strong className="font-semibold text-gray-100" {...p} />,
  em:     ({ node, ...p }) => <em     className="italic text-gray-400" {...p} />,
  hr:     ({ node, ...p }) => <hr     className="border-gray-700 my-4" {...p} />,
  blockquote: ({ node, ...p }) => (
    <blockquote className="border-l-4 border-indigo-700 pl-4 italic text-gray-400 my-3" {...p} />
  ),
  code({ node, inline, className, children, ...p }) {
    if (inline) {
      return (
        <code className="bg-gray-950 text-emerald-300 px-1.5 py-0.5 rounded text-xs font-mono" {...p}>
          {children}
        </code>
      )
    }
    return (
      <pre className="bg-gray-950 border border-gray-800 rounded-lg p-3 overflow-x-auto my-3">
        <code className={`text-xs font-mono text-gray-300 ${className || ''}`} {...p}>
          {children}
        </code>
      </pre>
    )
  },
  table: ({ node, ...p }) => (
    <div className="overflow-x-auto my-3">
      <table className="min-w-full text-xs border-collapse" {...p} />
    </div>
  ),
  thead: ({ node, ...p }) => <thead className="border-b border-gray-700" {...p} />,
  th: ({ node, ...p }) => <th className="text-left py-2 px-3 text-gray-400 font-semibold" {...p} />,
  tr: ({ node, ...p }) => <tr className="border-b border-gray-800 hover:bg-gray-900/50" {...p} />,
  td: ({ node, ...p }) => <td className="py-2 px-3 text-gray-300" {...p} />,
}

export default function MarkdownContent({ content }) {
  if (!content) return null
  const body = stripFrontmatter(content)
  return (
    <div className="text-sm leading-relaxed min-w-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  )
}
