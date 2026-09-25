/** Relative timestamp for trade and transfer rows. Falls back to the server's own label. */
export function formatTimeAgo(timestamp?: number, fallbackTime?: string): string {
  if (!timestamp) return fallbackTime || 'just now'
  const now = Math.floor(Date.now() / 1000)
  const diff = Math.max(0, now - timestamp)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
