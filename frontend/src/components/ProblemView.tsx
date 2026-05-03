import type { Problem } from '../types'

const difficultyColor: Record<string, string> = {
  Easy: '#00b8a9',
  Medium: '#ffc01e',
  Hard: '#ff375f',
}

export function ProblemView({ problem }: { problem: Problem }) {
  return (
    <div style={{ width: '50%', overflowY: 'auto', padding: '24px', borderRight: '1px solid #e0e0e0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <h2 style={{ margin: 0 }}>{problem.title}</h2>
        <span style={{
          color: difficultyColor[problem.difficulty] ?? '#666',
          fontWeight: 600,
          fontSize: '14px',
        }}>
          {problem.difficulty}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
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

      <div
        style={{ lineHeight: 1.7, fontSize: '15px' }}
        dangerouslySetInnerHTML={{ __html: problem.description }}
      />
    </div>
  )
}
