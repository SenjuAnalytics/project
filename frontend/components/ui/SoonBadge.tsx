// Marks a feature that has UI but no backing contract or service yet.
type Props = {
  /** Shown on hover. Say what the feature is waiting on. */
  title?: string
}

export function SoonBadge({ title }: Props) {
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        borderRadius: '4px',
        fontSize: '9px',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        lineHeight: 1.5,
        color: 'var(--dim)',
        background: 'var(--inset)',
        border: '1px solid var(--line)',
        whiteSpace: 'nowrap',
      }}
    >
      Soon
    </span>
  )
}
