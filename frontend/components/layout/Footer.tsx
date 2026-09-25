'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useBlockNumber, useChainId } from 'wagmi'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheck,
  Percent,
  Lock,
  ExternalLink,
  X,
  Info,
  AlertTriangle,
  Github,
} from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { XIcon, TelegramIcon, DiscordIcon } from '@/components/ui/SocialIcons'
import { explorerUrl, qualyraDeployment, resolveTargetChainId } from '@/lib/contracts'

type ModalType = 'fee' | 'risk' | 'about' | 'security' | null

export function Footer() {
  const pathname = usePathname()
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const chainId = resolveTargetChainId(useChainId())
  const explorer = explorerUrl(chainId)
  const factory = qualyraDeployment(chainId)?.factory
  const { data: blockNumber } = useBlockNumber({ chainId, watch: true })

  if (pathname === '/trade') return null

  const closeModal = () => setActiveModal(null)

  return (
    <>
      <footer>
        <div className="foot">
          {/* Brand Column */}
          <div>
            <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Logo size={24} />
              <span className="wordmark" style={{ fontSize: '13px' }}>QUALYRA</span>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--dim)', marginTop: '12px', lineHeight: 1.6, maxWidth: '280px' }}>
              Token launchpad on Robinhood Chain. Bonding curve launches, locked Uniswap v4 liquidity, and weekly competitions paid from trading fees. Launch. Prove. Battle.
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <a
                href="https://x.com/QualyraDEX"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--dim)', display: 'inline-flex', alignItems: 'center' }}
                title="X / Twitter"
              >
                <XIcon size={16} />
              </a>
              <a
                href="https://t.me/QualyraDEX"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--dim)', display: 'inline-flex', alignItems: 'center' }}
                title="Telegram"
              >
                <TelegramIcon size={16} />
              </a>
              <a
                href="https://discord.gg/qualyra"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--dim)', display: 'inline-flex', alignItems: 'center' }}
                title="Discord"
              >
                <DiscordIcon size={16} />
              </a>
              <a
                href="https://github.com/qualyra/qualyra"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--dim)', display: 'inline-flex', alignItems: 'center' }}
                title="GitHub Repository"
              >
                <Github size={16} />
              </a>
            </div>
          </div>

          {/* Products Column */}
          <div>
            <h5>Products</h5>
            <Link href="/trade">Spot Trading</Link>
            <Link href="/stocks">Stock Tokens</Link>
            <Link href="/battles">Token Battles</Link>
            <Link href="/launch">Launchpad</Link>
            <Link href="/portfolio">Portfolio</Link>
          </div>

          {/* Protocol & Institutional Info */}
          <div>
            <h5>Protocol</h5>
            <button
              type="button"
              onClick={() => setActiveModal('about')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--dim)',
                fontSize: '12.5px',
                textAlign: 'left',
                marginBottom: '10px',
                cursor: 'pointer',
                display: 'block',
                transition: 'color .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--tx)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--dim)')}
            >
              About Qualyra
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('security')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--dim)',
                fontSize: '12.5px',
                textAlign: 'left',
                marginBottom: '10px',
                cursor: 'pointer',
                display: 'block',
                transition: 'color .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--tx)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--dim)')}
            >
              Security & Governance
            </button>
            <a
              href="https://github.com/qualyra/qualyra"
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <span>GitHub Source</span>
              <ExternalLink size={11} />
            </a>
            <a
              href={explorer}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <span>Block Explorer</span>
              <ExternalLink size={11} />
            </a>
          </div>

          {/* Transparency & Legal */}
          <div>
            <h5>Transparency</h5>
            <button
              type="button"
              onClick={() => setActiveModal('fee')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--dim)',
                fontSize: '12.5px',
                textAlign: 'left',
                marginBottom: '10px',
                cursor: 'pointer',
                display: 'block',
                transition: 'color .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--tx)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--dim)')}
            >
              Fee Schedule
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('risk')}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--dim)',
                fontSize: '12.5px',
                textAlign: 'left',
                marginBottom: '10px',
                cursor: 'pointer',
                display: 'block',
                transition: 'color .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--tx)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--dim)')}
            >
              Risk Disclosure
            </button>
            <a
              href="https://rpc.mainnet.chain.robinhood.com"
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <span>RPC Node Health</span>
              <ExternalLink size={11} />
            </a>
            <a
              href={factory ? `${explorer}/address/${factory}` : explorer}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <span>Factory Contract</span>
              <ExternalLink size={11} />
            </a>
          </div>

          {/* Ecosystem Column */}
          <div>
            <h5>Robinhood Chain</h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--dim)' }}>
              <div>
                <b style={{ color: 'var(--tx)' }}>Chain ID:</b> 4663 (0x1237)
              </div>
              <div>
                <b style={{ color: 'var(--tx)' }}>Gas Token:</b> ETH (Ether)
              </div>
              <div>
                <b style={{ color: 'var(--tx)' }}>Settlement:</b> USDG (Global Dollar)
              </div>
              <div>
                <b style={{ color: 'var(--tx)' }}>Network:</b> Arbitrum Orbit L2
              </div>
            </div>
          </div>
        </div>

        {/* Legal Riskbar */}
        <div className="riskbar">
          <div className="wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ maxWidth: '820px' }}>
              © 2026 Qualyra Protocol · Built natively on Robinhood Chain. Liquidity is locked permanently at graduation and the contracts cannot be upgraded, which eliminates developer withdrawal and abandonment risk but not market price volatility. Tokenized stocks used as pair assets are issued and controlled by their issuer, not by Qualyra. Nothing herein constitutes financial or investment advice.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--green)', fontWeight: 600 }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: blockNumber ? 'var(--green)' : 'var(--dim)', boxShadow: blockNumber ? '0 0 8px rgba(14,203,129,0.8)' : 'none' }} />
              <span style={{ color: blockNumber ? undefined : 'var(--dim)' }}>
                {blockNumber ? `Block #${blockNumber.toLocaleString('en-US')}` : 'Connecting to Robinhood Chain…'}
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* ================= MODALS ================= */}
      <AnimatePresence>
        {activeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1100,
              background: 'rgba(0, 0, 0, 0.78)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="panel"
              style={{
                width: '100%',
                maxWidth: '560px',
                maxHeight: '88vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: '14px',
                border: '1px solid rgba(var(--brand-rgb), 0.35)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 24px rgba(var(--brand-rgb), 0.12)',
                background: 'var(--modal-bg, #FFFFFF)',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--line)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--inset)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: 'rgba(var(--brand-rgb), 0.15)',
                      color: 'var(--brand)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid rgba(var(--brand-rgb), 0.3)',
                    }}
                  >
                    {activeModal === 'fee' && <Percent size={18} strokeWidth={2.4} />}
                    {activeModal === 'risk' && <AlertTriangle size={18} strokeWidth={2.4} />}
                    {activeModal === 'about' && <Info size={18} strokeWidth={2.4} />}
                    {activeModal === 'security' && <ShieldCheck size={18} strokeWidth={2.4} />}
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--tx)', letterSpacing: '-0.01em' }}>
                      {activeModal === 'fee' && 'Qualyra Fee Schedule'}
                      {activeModal === 'risk' && 'Risk Disclosure'}
                      {activeModal === 'about' && 'About Qualyra'}
                      {activeModal === 'security' && 'Security & Governance'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--dim)' }}>
                      {activeModal === 'fee' && 'Every rate below is enforced by the contracts'}
                      {activeModal === 'risk' && 'Non-custodial contracts, locked liquidity'}
                      {activeModal === 'about' && 'Token launchpad on Robinhood Chain'}
                      {activeModal === 'security' && 'Roles, limits and what is not done yet'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--dim)',
                    cursor: 'pointer',
                    padding: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                  }}
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '12.5px', lineHeight: 1.6 }}>
                {/* 1. FEE SCHEDULE MODAL */}
                {activeModal === 'fee' && (
                  <>
                    <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--inset)', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx)', marginBottom: '4px' }}>
                        1% Trading Fee
                      </div>
                      <p style={{ color: 'var(--dim)', margin: 0 }}>
                        Charged on every trade, on the bonding curve and in the pool after graduation, always in the token&apos;s pair asset. The split is locked per token at launch:
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', marginTop: '10px' }}>
                        <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--panel)', border: '1px solid var(--line2)' }}>
                          <b style={{ color: 'var(--brand)' }}>70% Creator</b>
                          <div style={{ fontSize: '11px', color: 'var(--dim)' }}>Paid in the pair asset, withdrawn any time</div>
                        </div>
                        <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--panel)', border: '1px solid var(--line2)' }}>
                          <b style={{ color: 'var(--tx)' }}>15% Platform</b>
                          <div style={{ fontSize: '11px', color: 'var(--dim)' }}>Treasury, held by the admin multisig</div>
                        </div>
                        <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--panel)', border: '1px solid var(--line2)' }}>
                          <b style={{ color: 'var(--green)' }}>15% Competition</b>
                          <div style={{ fontSize: '11px', color: 'var(--dim)' }}>Split by where the token is in its battle life, below</div>
                        </div>
                        <div style={{ padding: '8px 10px', borderRadius: '6px', background: 'var(--panel)', border: '1px solid var(--line2)' }}>
                          <b style={{ color: 'var(--dim)' }}>Creator tax, up to 5%</b>
                          <div style={{ fontSize: '11px', color: 'var(--dim)' }}>Optional, set at launch, cannot be raised, all of it to the creator</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--inset)', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx)', marginBottom: '4px' }}>
                        Where the 15% competition share goes
                      </div>
                      <ul style={{ margin: '0 0 0 16px', color: 'var(--dim)' }}>
                        <li><b>Before its battle:</b> 70% is held for the token&apos;s own battle pot, 30% funds the Trader League.</li>
                        <li><b>During its battle:</b> all of it goes into the battle pot.</li>
                        <li><b>After its battle:</b> 70% to the treasury, 30% to the Trader League. Each token battles once.</li>
                        <li><b>Disqualified before qualifying:</b> all of it to the treasury, along with what was held for its pot.</li>
                      </ul>
                    </div>

                    <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--inset)', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx)', marginBottom: '4px' }}>
                        Anti-Snipe Tax
                      </div>
                      <p style={{ color: 'var(--dim)', margin: 0 }}>
                        Buys in the first 15 seconds after launch pay a tax that starts at 99% and halves roughly every second. Fee, creator tax and anti-snipe tax together never take more than 99% of a buy. The launcher, the fee recipient and up to 32 wallets picked by the creator are exempt.
                      </p>
                    </div>

                    <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--inset)', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx)', marginBottom: '4px' }}>
                        Launch Fee
                      </div>
                      <p style={{ color: 'var(--dim)', margin: 0 }}>
                        Deploying a token costs a flat <b>0.0005 ETH</b>, always paid in ETH whatever the pair asset, and all of it goes to the treasury. Nothing else is charged at launch, and no deposit is held.
                      </p>
                    </div>
                  </>
                )}

                {/* 2. RISK DISCLOSURE MODAL */}
                {activeModal === 'risk' && (
                  <>
                    <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(246, 70, 93, 0.08)', border: '1px solid rgba(246, 70, 93, 0.25)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--red)', marginBottom: '4px' }}>
                        General Trading & Volatility Warning
                      </div>
                      <p style={{ color: 'var(--tx)', margin: 0 }}>
                        Digital asset markets are subject to extreme market price volatility. Assets launched via fair bonding curves can fluctuate rapidly in valuation. Never commit capital you cannot afford to lose.
                      </p>
                    </div>

                    <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--inset)', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx)', marginBottom: '4px' }}>
                        🔒 What the contracts actually guarantee
                      </div>
                      <p style={{ color: 'var(--dim)', margin: 0 }}>
                        At graduation the whole raise seeds a Uniswap v4 pool owned by <b>QualyraLiquidityLocker</b>, which has no function to remove liquidity. Launched tokens have no creator allocation, no mint and no blocklist, and no contract can be upgraded after deployment. If a completed curve cannot graduate within 7 days, the admin can open proportional refunds. None of this protects against price falling.
                      </p>
                    </div>

                    <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--inset)', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx)', marginBottom: '4px' }}>
                        Non-Custodial Smart Contracts
                      </div>
                      <p style={{ color: 'var(--dim)', margin: 0 }}>
                        Qualyra is completely non-custodial. Funds are held directly inside verified Robinhood Chain smart contracts or in your self-custody Web3 wallet. The protocol operators cannot access your private keys or seize your deposited assets.
                      </p>
                    </div>
                  </>
                )}

                {/* 3. ABOUT QUALYRA MODAL */}
                {activeModal === 'about' && (
                  <>
                    <div>
                      <p style={{ color: 'var(--tx)', margin: 0 }}>
                        <b>Qualyra</b> is a token launchpad on <b>Robinhood Chain</b>. Tokens launch on a bonding curve, graduate into a Uniswap v4 pool, and compete every week for prizes paid from trading fees.
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                      <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--inset)', border: '1px solid var(--line)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--brand)', marginBottom: '3px' }}>
                          🚀 Fair Launches
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--dim)' }}>
                          The whole supply starts on the curve, with no creator allocation. Liquidity is locked for good at graduation.
                        </div>
                      </div>

                      <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--inset)', border: '1px solid var(--line)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--green)', marginBottom: '3px' }}>
                          🔗 Pair Assets
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--dim)' }}>
                          ETH, USDG or an approved Robinhood stock token, fixed per token at launch.
                        </div>
                      </div>

                      <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--inset)', border: '1px solid var(--line)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx)', marginBottom: '3px' }}>
                          ⚔️ Token Battles
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--dim)' }}>
                          Qualified tokens meet once, head to head. The pot buys back and burns the winner.
                        </div>
                      </div>

                      <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--inset)', border: '1px solid var(--line)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--brand)', marginBottom: '3px' }}>
                          🏆 Trader League
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--dim)' }}>
                          One weekly leaderboard across every token. The top wallets by qualified volume split the pool.
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '12px', borderRadius: '8px', background: 'var(--inset)', border: '1px solid var(--line)' }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx)', marginBottom: '4px' }}>
                        Principle
                      </div>
                      <p style={{ color: 'var(--dim)', margin: 0 }}>
                        Prizes come only from fees that were actually paid. Nothing is promised up front, and no token is minted to pay anyone.
                      </p>
                    </div>
                  </>
                )}

                {/* 4. SECURITY & AUDITS MODAL */}
                {activeModal === 'security' && (
                  <>
                    <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--inset)', border: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <ShieldCheck size={16} color="var(--green)" />
                        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx)' }}>
                          Smart Contract Architecture
                        </span>
                      </div>
                      <p style={{ color: 'var(--dim)', margin: 0 }}>
                        The core contracts (QualyraFactory, QualyraBondingCurve, QualyraGraduationExecutor, QualyraHook, QualyraFeeVault and QualyraCompetitionVault) build on <b>OpenZeppelin Contracts v5</b>, with ReentrancyGuard, SafeERC20 transfers and two-step ownership. None of them can be upgraded after deployment.
                      </p>
                    </div>

                    <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--inset)', border: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <Lock size={16} color="var(--brand)" />
                        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx)' }}>
                          Roles
                        </span>
                      </div>
                      <p style={{ color: 'var(--dim)', margin: 0 }}>
                        Admin changes go through a 48-hour timelock behind the admin Safe, and only apply to future launches within hard limits. The operator Safe schedules battles and posts results; the guardian Safe can pause the prize contracts and veto results during a challenge window. No role can touch locked liquidity, creator balances or tokens already launched.
                      </p>
                    </div>

                    <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'var(--inset)', border: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <AlertTriangle size={16} color="#f59e0b" />
                        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx)' }}>
                          Not audited yet
                        </span>
                      </div>
                      <p style={{ color: 'var(--dim)', margin: 0 }}>
                        The contracts have had internal reviews only. An independent audit is required before mainnet.
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  padding: '12px 20px',
                  borderTop: '1px solid var(--line)',
                  background: 'var(--inset)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ fontSize: '11px', color: 'var(--dim)' }}>
                  Robinhood Chain · Chain ID: 4663 (0x1237)
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="btn btn-brand"
                  style={{ fontSize: '12px', padding: '6px 16px', fontWeight: 700 }}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
