import { useState } from 'react'
import type { Problem } from '../types'

const difficultyColor: Record<string, string> = {
  Easy: '#00b8a9',
  Medium: '#ffc01e',
  Hard: '#ff375f',
}

export function ProblemView({ problem, onSkip }: { problem: Problem, onSkip: () => void }) {
  const [tagsOpen, setTagsOpen] = useState(false)
  const [titleOpen, setTitleOpen] = useState(false)

  return (
    <div style={{ width: '50%', overflowY: 'auto', padding: '24px', borderRight: '1px solid #e0e0e0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
        <h2
          onClick={() => setTitleOpen(o => !o)}
          style={{
            margin: 0,
            flex: 1,
            cursor: 'pointer',
            userSelect: 'none',
            filter: titleOpen ? 'none' : 'blur(6px)',
            opacity: titleOpen ? 1 : 0.6,
            transition: 'filter 0.2s, opacity 0.2s',
          }}
          title={titleOpen ? '' : 'Click to reveal'}
        >
          {problem.title}
        </h2>
        <span style={{
          color: difficultyColor[problem.difficulty] ?? '#666',
          fontWeight: 600,
          fontSize: '14px',
        }}>
          {problem.difficulty}
        </span>
        <button onClick={onSkip} style={{
          marginLeft: 'auto',
          padding: '4px 12px',
          fontSize: '13px',
          cursor: 'pointer',
          border: '1px solid #555',
          borderRadius: '6px',
          background: 'transparent',
          color: '#aaa',
        }}>
          Skip →
        </button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button onClick={() => setTagsOpen(o => !o)} style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#888',
          fontSize: '13px',
          padding: 0,
        }}>
          {tagsOpen ? '▾ Hide topics' : '▸ Show topics'}
        </button>
        {tagsOpen && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
            {problem.topic_tags.map(tag => (
              <span key={tag} style={{
                background: '#f0f0f0',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '12px',
                color: '#444',
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={{ lineHeight: 1.7, fontSize: '15px', whiteSpace: 'pre-wrap' }}>
        {problem.description}
      </div>
    </div>
  )
}
