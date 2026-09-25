'use client'

import { useToast } from '@/components/ui/Toast'

interface CreatorTaxSectionProps {
  creatorTax: number
  setCreatorTax: (tax: number) => void
  feeRecipient: string
  setFeeRecipient: (recipient: string) => void
  feeRecipientValid: boolean
}

export function CreatorTaxSection({
  creatorTax,
  setCreatorTax,
  feeRecipient,
  setFeeRecipient,
  feeRecipientValid,
}: CreatorTaxSectionProps) {
  const { toast } = useToast()

  return (
    <div className="fsec">
      <h4><span className="n">03</span> Creator tax &amp; protection</h4>
      <p>Creator tax is charged on every buy and sell and paid to you in full. It is locked at launch and can never be changed.</p>
      <div className="fi">
        <label>
          Creator tax — <b style={{ color: 'var(--brand)' }}>{creatorTax}%</b> <span className="dim">(same rate on buys and sells)</span>
        </label>
        <input
          type="range"
          min="0"
          max="5"
          step="0.5"
          value={creatorTax}
          onChange={e => setCreatorTax(Number(e.target.value))}
        />
      </div>
      <div className="fi">
        <label>
          Fee recipient <span className="dim">(optional — defaults to your wallet)</span>
        </label>
        <input
          className="inp"
          placeholder="0x…"
          value={feeRecipient}
          onChange={e => setFeeRecipient(e.target.value)}
          spellCheck={false}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            borderColor: feeRecipientValid ? undefined : 'var(--red)',
          }}
        />
      </div>
      <div
        className="trow"
        onClick={() => toast.info('Always on', 'Every graduated pool is owned by QualyraLiquidityLocker, which has no function to remove liquidity.')}
        title="Click to view rule details"
      >
        <div>
          <div className="t">Liquidity locked at graduation</div>
          <div className="d">The pool position is owned by the locker contract, which has no function to take it out.</div>
        </div>
        <button
          type="button"
          className="sw on"
          onClick={e => {
            e.stopPropagation()
            toast.info('Always on', 'Every graduated pool is owned by QualyraLiquidityLocker, which has no function to remove liquidity.')
          }}
          title="Applies to every launch"
        />
      </div>
      <div
        className="trow"
        onClick={() => toast.info('Always on', 'The snipe tax starts at 99% and halves roughly once a second over the first 15 seconds. You, your fee recipient and up to 32 wallets you name are exempt.')}
        title="Click to view rule details"
      >
        <div>
          <div className="t">Snipe tax · first 15 seconds</div>
          <div className="d">Starts at 99% and halves about once a second. You and up to 32 wallets you name are exempt.</div>
        </div>
        <button
          type="button"
          className="sw on"
          onClick={e => {
            e.stopPropagation()
            toast.info('Always on', 'The snipe tax starts at 99% and halves roughly once a second over the first 15 seconds. You, your fee recipient and up to 32 wallets you name are exempt.')
          }}
          title="Applies to every launch"
        />
      </div>
      <div
        className="trow"
        onClick={() => toast.info('How battles work', 'Battles are scheduled by the operator between two graduated tokens sharing a pair asset. There is no entry fee and no way to enter one yourself.')}
        title="Click to view how battles work"
      >
        <div>
          <div className="t">Battle eligible after graduation</div>
          <div className="d">The operator schedules 24 hour battles between graduated tokens on the same pair asset. No entry fee.</div>
        </div>
        <button
          type="button"
          className="sw on"
          onClick={e => {
            e.stopPropagation()
            toast.info('How battles work', 'Battles are scheduled by the operator between two graduated tokens sharing a pair asset. There is no entry fee and no way to enter one yourself.')
          }}
          title="Toggle battle enrollment"
        />
      </div>
    </div>
  )
}
