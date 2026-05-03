interface Props {
  onNext: () => void
}

export function CompleteView({ onNext }: Props) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'sans-serif',
      gap: '24px',
    }}>
      <h1 style={{ margin: 0, fontSize: '32px' }}>Nice work!</h1>
      <p style={{ margin: 0, color: '#555', fontSize: '16px' }}>
        You nailed the algorithm and complexity.
      </p>
      <button
        onClick={onNext}
        style={{
          padding: '12px 32px',
          borderRadius: '8px',
          background: '#0070f3',
          color: '#fff',
          border: 'none',
          fontSize: '16px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Next Problem
      </button>
    </div>
  )
}
