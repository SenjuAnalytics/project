'use client'

const STEPS = [
  {
    title: 'Pair Assets',
    body: 'Pick a stock token as the pair asset when you launch. The curve, the 1% trading fee and the Uniswap v4 pool after graduation all run in that token, and the choice is locked for good.',
  },
  {
    title: 'Official Contracts Only',
    body: "The pair list is closed. For stocks it holds Robinhood's official token addresses only, so a token that copies a name or ticker at another address can't be picked. New listings go through the multisig and a timelock and apply to new launches only.",
  },
  {
    title: 'No Backing, No Floor',
    body: "A token paired with NVDA is priced in NVDA. It isn't backed by NVDA and has no price floor.",
  },
  {
    title: 'Price Follows the Stock',
    body: 'In dollar terms a pair moves with the stock behind it: when NVDA drops, a token priced in NVDA drops too, even if nobody sold it. Stock tokens mint and redeem Monday 02:00 to Saturday 02:00 CET/CEST, and on weekends the on-chain price can drift from the share.',
  },
  {
    title: 'Splits & Dividends',
    body: "Splits and dividends change the token's multiplier, not the number of tokens you hold. One token is worth the share price times its multiplier.",
  },
  {
    title: 'Availability',
    body: "Robinhood doesn't offer stock tokens in the US or to US persons, and restricts them in other countries, including the UK, Canada and Switzerland.",
  },
]

export function RwaHowItWorks() {
  return (
    <div className="sec">
      <div className="sec-hd"><h3>How Stock Pairs Work</h3></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '20px' }}>
        {STEPS.map((step, i) => (
          <div key={step.title} className="panel" style={{ padding: '24px' }}>
            <div style={{ borderBottom: '1px solid var(--line)', paddingBottom: '16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <h4 style={{ fontSize: '17px', fontWeight: 700 }}>{step.title}</h4>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--line2)', lineHeight: 1 }}>
                {String(i + 1).padStart(2, '0')}
              </div>
            </div>
            <p style={{ color: 'var(--mt)', lineHeight: 1.65 }}>{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
