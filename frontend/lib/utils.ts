// Export all institutional financial formatters
export * from './formatters'

// Deterministic avatar color from ticker
const AVC = ['#3A7D44','#6D5BD0','#9A6B1F','#2F6FED','#B33A4B','#1F7A8C','#5B5B66','#7A3E6E']
export function tickerColor(ticker: string): string {
  let h = 0
  for (const c of ticker) h = ((h * 31 + c.charCodeAt(0)) >>> 0)
  return AVC[h % AVC.length]
}

// Score → color
