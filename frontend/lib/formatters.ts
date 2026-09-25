/**
 * Number formatting for prices, amounts and balances: stock tokens, curve and pool prices, and
 * wallet balances all go through here so the same magnitude always reads the same way.
 */

/**
 * Where compact notation takes over.
 *
 * A bonding curve opens with a billion tokens against a fraction of an ETH, so its first prices sit ten
 * or more decimal places down. Written out in full those are a wall of zeros, and rounded to a fixed
 * number of decimals they are simply gone. Every number below this cutoff is therefore written the same
 * way — 0.0<subscript count>digits — with no second style for the range just above it. One rule, so two
 * prices of similar size never appear in two different notations side by side.
 */
export const COMPACT_NOTATION_CUTOFF = 1e-4

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉'

/** Renders a run of leading zeros as a subscript count, the way DEX interfaces write tiny prices. */
function subscript(count: number): string {
  return String(count)
    .split('')
    .map(d => SUBSCRIPT_DIGITS[Number(d)])
    .join('')
}

/**
 * A number far below a cent, written compactly: 0.000000000006153 becomes 0.0₁₁6153.
 * The subscript counts the zeros between the point and the first significant digit.
 */
export function formatCompactSmall(v: number, significant = 4): string {
  const abs = Math.abs(v)
  if (!Number.isFinite(abs) || abs === 0) return '0.00'
  const sign = v < 0 ? '-' : ''
  let exponent = Math.floor(Math.log10(abs))
  let mantissa = abs / 10 ** exponent
  // Rounding the mantissa to the requested significant digits can carry it to 10 (e.g. 9.9999 -> "10.00").
  // Left unhandled that prints an extra digit against the wrong zero-count and shows the price ~10x too
  // small. Detect the carry, roll the exponent up by one, and re-round so the notation stays consistent.
  let digits = mantissa.toFixed(significant - 1)
  if (parseFloat(digits) >= 10) {
    exponent += 1
    mantissa = abs / 10 ** exponent
    digits = mantissa.toFixed(significant - 1)
  }
  const leadingZeros = -exponent - 1
  // Below this there is nothing left to show; subnormal territory, not a price.
  if (leadingZeros < 0 || leadingZeros > 99) return sign + abs.toExponential(significant - 1)
  return `${sign}0.0${subscript(leadingZeros)}${digits.replace('.', '')}`
}

/**
 * Rounds a numeric price value cleanly to eliminate floating-point IEEE 754 precision noise.
 * Useful when setting input values or simulating live price ticks.
 *
 * Below a cent the rounding counts significant digits rather than decimal places: a fixed decimal count
 * turns a curve's opening price into a flat zero, which is what empties the chart.
 */
export function cleanPrice(v: number, isRwa?: boolean): number {
  if (v === 0 || !v || isNaN(v)) return 0
  if (isRwa) return +(v.toFixed(2))
  const abs = Math.abs(v)
  if (abs >= 100) return +(v.toFixed(2))
  if (abs >= 1) return +(v.toFixed(4))
  if (abs >= 0.01) return +(v.toFixed(5))
  return +(v.toPrecision(8))
}

/**
 * Backward-compatible alias for cleanPrice.
 */
export const cleanPriceNum = cleanPrice

/**
 * Formats a token or stock price by magnitude:
 * - Stocks & Assets >= 100: exactly 2 decimals (Wall Street standard, e.g. 240.30)
 * - Assets 1 - 99.99: 2 decimals, up to 4 if fractional (e.g. 1.85, 14.20)
 * - Cents 0.01 - 0.99: 4 decimals (e.g. 0.0425)
 * - 0.0001 - 0.0099: 6 decimals (e.g. 0.000142)
 * - Anything smaller: compact notation (e.g. 0.0₁₁6153)
 */
export function formatPrice(v: number, isRwa?: boolean): string {
  if (v === 0 || !v || isNaN(v)) return '0.00'
  if (isRwa) return v.toFixed(2)
  const abs = Math.abs(v)

  if (abs >= 100) {
    return v.toFixed(2)
  }
  if (abs >= 1) {
    const s4 = +v.toFixed(4)
    const s2 = +v.toFixed(2)
    return s4 === s2 ? v.toFixed(2) : String(s4)
  }
  if (abs >= 0.01) {
    return String(+v.toFixed(4))
  }
  if (abs >= COMPACT_NOTATION_CUTOFF) {
    return String(+v.toFixed(6))
  }
  return formatCompactSmall(v)
}

/**
 * Backward-compatible alias for formatPrice (formerly px7).
 */
export const px7 = formatPrice

/**
 * A price carrying its unit, for chart axes and price lines.
 * The unit is whatever the pair is actually quoted in, so an ETH pair is not labelled in dollars.
 */
export function formatPriceWithUnit(v: number, unit = '$'): string {
  const safeVal = Number.isFinite(v) ? Math.max(0, v) : 0
  const body = formatPrice(safeVal)
  const negative = body.startsWith('-')
  const magnitude = negative ? body.slice(1) : body
  // A currency symbol leads the number; a ticker follows it.
  return unit === '$'
    ? `${negative ? '-' : ''}$${magnitude}`
    : `${negative ? '-' : ''}${magnitude} ${unit}`
}

/**
 * The smallest price step a chart should quantise to, derived from the data it is about to draw.
 *
 * Charting libraries round every value to this step. A step fixed at 1e-7 flattens a curve trading at
 * 1e-11 into a straight line at zero, which is why the bars vanish and the axis reads 0.000000.
 */
export function priceMinMove(values: number[]): number {
  let smallest = Infinity
  for (const v of values) {
    const abs = Math.abs(v)
    if (Number.isFinite(abs) && abs > 0 && abs < smallest) smallest = abs
  }
  if (!Number.isFinite(smallest)) return 0.0001
  // Match the step to what formatPrice actually shows at that magnitude, so a stock at 243.24 keeps
  // its cents while a curve eleven places down keeps its significant digits.
  if (smallest >= 100) return 0.01
  if (smallest >= 0.01) return 0.0001
  if (smallest >= COMPACT_NOTATION_CUTOFF) return 0.000001
  const step = Number((10 ** (Math.floor(Math.log10(smallest)) - 3)).toPrecision(1))
  return Math.max(1e-18, step)
}

/**
 * Formats large USD currency metrics into human-readable compact representations:
 * e.g., $1.25T, $45.20B, $8.40M, $120.5K, $25.00
 */
export function formatUsd(n: number): string {
  if (!n || isNaN(n)) return '$0.00'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''

  if (abs >= 1e12) return sign + '$' + (abs / 1e12).toFixed(2) + 'T'
  if (abs >= 1e9)  return sign + '$' + (abs / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6)  return sign + '$' + (abs / 1e6).toFixed(2) + 'M'
  if (abs >= 1e3)  return sign + '$' + (abs / 1e3).toFixed(abs >= 1e5 ? 0 : 1) + 'K'
  if (abs >= 0.01) return sign + '$' + abs.toFixed(2)
  // Below a cent, rounding to two places hides the number entirely.
  if (abs >= COMPACT_NOTATION_CUTOFF) return sign + '$' + String(+abs.toFixed(6))
  return sign + '$' + formatCompactSmall(abs)
}

export interface SubCentUsdParts {
  integer: string
  cents: string
  subCents: string
  hasSubCents: boolean
  formatted: string
  mainDisplay: string
}

/**
 * Splits a USD amount into integer, cents, and muted sub-cents.
 * For amounts >= $100: Standard 2-decimal fiat formatting (e.g. $25,000.00).
 * For amounts < $100: Preserves sub-cent precision (e.g. $1.66 + "99"),
 * allowing users to clearly see micro-trades without mistaking the value for thousands.
 */
export function splitSubCentUsd(amount: number, maxSubCents: number = 2): SubCentUsdParts {
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      integer: '0',
      cents: '00',
      subCents: '',
      hasSubCents: false,
      formatted: '$0.00',
      mainDisplay: '0.00',
    }
  }

  // Tier 1: Large amounts >= $100 -> Standard 2-decimal fiat formatting
  if (amount >= 100) {
    const fixed = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const [intPart, centPart] = fixed.split('.')
    return {
      integer: intPart,
      cents: centPart || '00',
      subCents: '',
      hasSubCents: false,
      formatted: `$${fixed}`,
      mainDisplay: fixed,
    }
  }

  // Tier 2: Amounts < $100 -> Show main dollars & cents + muted sub-cents
  const subLimit = amount < 0.01 ? Math.max(4, maxSubCents) : maxSubCents
  const fixedStr = amount.toFixed(2 + subLimit)
  const [intPart, decPart = ''] = fixedStr.split('.')
  const integer = Number(intPart).toLocaleString('en-US')
  const cents = decPart.slice(0, 2).padEnd(2, '0')
  const rawSub = decPart.slice(2, 2 + subLimit)
  const trimmedSub = rawSub.replace(/0+$/, '')

  const hasSubCents = trimmedSub.length > 0
  const subCents = hasSubCents ? rawSub : ''
  const mainDisplay = `${integer}.${cents}`
  const formatted = hasSubCents ? `$${mainDisplay}${subCents}` : `$${mainDisplay}`

  return {
    integer,
    cents,
    subCents,
    hasSubCents,
    formatted,
    mainDisplay,
  }
}

/**
 * Formats a high-precision crypto or on-chain native amount (e.g. ETH, USDG).
 * Accurately surfaces micro-amounts on-chain (e.g. 0.0005228 ETH) so every fee addition is visible.
 */
export function formatCryptoAmount(amount: number, symbol?: string, maxDecimals = 7): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    return symbol ? `0.00 ${symbol}` : '0.00'
  }
  const abs = Math.abs(amount)
  let formatted: string

  if (abs >= 1000) {
    formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  } else if (abs >= 1) {
    formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  } else if (abs >= 0.01) {
    formatted = amount.toFixed(4)
  } else if (abs >= 0.0001) {
    const fixed = amount.toFixed(maxDecimals)
    const trimmed = fixed.replace(/0+$/, '')
    formatted = trimmed.length <= 6 ? amount.toFixed(4) : trimmed
  } else {
    formatted = formatCompactSmall(amount)
  }

  return symbol ? `${formatted} ${symbol}` : formatted
}

/**
 * Formats a fiat USD amount (such as prize pools or treasury balances):
 * - Amounts >= $100: standard 2 decimal places with thousands grouping (e.g. 25,000.00)
 * - Amounts < $100: adaptive 2-4 decimal places so sub-cents are preserved without trailing 0s
 * - Zero or invalid: 0.00
 */
export function formatCurrencyUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '0.00'
  if (amount >= 100) {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }
  const fixed = amount.toFixed(4)
  const trimmed = fixed.replace(/0+$/, '')
  const [intPart, decPart = ''] = trimmed.split('.')
  const padDec = decPart.padEnd(2, '0')
  return `${Number(intPart).toLocaleString('en-US')}.${padDec}`
}

/**
 * Backward-compatible alias for formatUsd.
 */
export const fmtUsd = formatUsd

/**
 * Formats ETH / native gas amounts.
 * Gas on an L3 and a curve's opening price both land far below four decimals, so the same compact
 * notation applies here rather than a row of zeros.
 */
export function formatEth(n: number): string {
  if (!n || isNaN(n)) return '0.00'
  const abs = Math.abs(n)
  if (abs >= 1) return n.toFixed(3)
  if (abs >= COMPACT_NOTATION_CUTOFF) return String(+n.toFixed(6))
  return formatCompactSmall(n)
}

/**
 * Backward-compatible alias for formatEth.
 */
export const fmtEth = formatEth

/**
 * Formats percentage changes with explicit +/- indicators:
 * e.g., +5.25%, -1.80%, 0.00%
 */
export function formatPercent(n: number, decimals = 2): string {
  if (isNaN(n)) return '0.00%'
  return (n >= 0 ? '+' : '') + n.toFixed(decimals) + '%'
}

/**
 * Backward-compatible alias for formatPercent.
 */
export const fmtPct = formatPercent

/**
 * Formats token quantity professionally with magnitude-aware precision and thousands separators:
 * e.g., 607,412,766.08 (or 1,500,000), 12.50, 0.2857
 */
export function formatTokenAmount(amount: number, isRwa?: boolean): string {
  if (!amount || isNaN(amount)) return '0'
  const abs = Math.abs(amount)
  if (abs === 0) return '0'

  // Dust balances: show up to 6 decimals, or <0.000001 if microscopic
  if (abs < 0.0001) {
    if (abs < 0.000001) return '<0.000001'
    return amount.toLocaleString('en-US', { maximumFractionDigits: 6 })
  }

  if (isRwa) {
    if (abs < 10) return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Large token amounts (>= 1,000): show thousands separators with max 2 decimal places (e.g. 607,412,766.08 or 10,000)
  if (abs >= 1_000) {
    return amount.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }

  // Fractional or small amounts (< 1,000): show clean 4 decimal places without trailing zeros (e.g. 0.2857)
  return amount.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

/**
 * Truncates an onchain hexadecimal address:
 * e.g., 0x7a39...9F02
 */
export function shortAddr(addr: string): string {
  if (!addr) return ''
  if (addr.length <= 10) return addr
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

/**
 * Generates local clock time string (HH:MM:SS).
 */
export function nowTime(): string {
  const d = new Date()
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0'))
    .join(':')
}
