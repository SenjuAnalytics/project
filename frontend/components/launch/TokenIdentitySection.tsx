'use client'

import { type RefObject } from 'react'
import { LogoUploaderSection } from '@/components/launch/LogoUploaderSection'
import { SocialLinksSection } from '@/components/launch/SocialLinksSection'
import { type CustomSocialLink } from '@/hooks/launch/useLaunchForm'

interface TokenIdentitySectionProps {
  name: string
  setName: (v: string) => void
  ticker: string
  setTicker: (v: string) => void
  desc: string
  setDesc: (v: string) => void
  logoUrl: string
  logoFit: 'cover' | 'contain'
  setLogoFit: (fit: 'cover' | 'contain') => void
  logoShape: 'squircle' | 'circle'
  setLogoShape: (shape: 'squircle' | 'circle') => void
  logoBg: 'transparent' | 'white' | 'dark'
  setLogoBg: (bg: 'transparent' | 'white' | 'dark') => void
  logoScale: number
  setLogoScale: (scale: number) => void
  isDragging: boolean
  fileInputRef: RefObject<HTMLInputElement | null>
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent) => void
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleRemoveLogo: (e: React.MouseEvent) => void
  displayTicker: string
  coinBg: string
  website: string
  setWebsite: (v: string) => void
  twitter: string
  setTwitter: (v: string) => void
  telegram: string
  setTelegram: (v: string) => void
  discord: string
  setDiscord: (v: string) => void
  customLinks: CustomSocialLink[]
  addCustomLink: () => void
  removeCustomLink: (id: string) => void
  updateCustomLink: (id: string, field: 'label' | 'url', value: string) => void
}

export function TokenIdentitySection({
  name,
  setName,
  ticker,
  setTicker,
  desc,
  setDesc,
  logoUrl,
  logoFit,
  setLogoFit,
  logoShape,
  setLogoShape,
  logoBg,
  setLogoBg,
  logoScale,
  setLogoScale,
  isDragging,
  fileInputRef,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleFileInputChange,
  handleRemoveLogo,
  displayTicker,
  coinBg,
  website,
  setWebsite,
  twitter,
  setTwitter,
  telegram,
  setTelegram,
  discord,
  setDiscord,
  customLinks,
  addCustomLink,
  removeCustomLink,
  updateCustomLink,
}: TokenIdentitySectionProps) {
  return (
    <div className="fsec">
      <h4><span className="n">01</span> Token Identity &amp; Socials</h4>
      <p>What traders and liquidity providers see on the market.</p>

      {/* Token Logo Uploader with Premium Frame */}
      <LogoUploaderSection
        logoUrl={logoUrl}
        logoFit={logoFit}
        setLogoFit={setLogoFit}
        logoShape={logoShape}
        setLogoShape={setLogoShape}
        logoBg={logoBg}
        setLogoBg={setLogoBg}
        logoScale={logoScale}
        setLogoScale={setLogoScale}
        isDragging={isDragging}
        fileInputRef={fileInputRef}
        handleDragOver={handleDragOver}
        handleDragLeave={handleDragLeave}
        handleDrop={handleDrop}
        handleFileInputChange={handleFileInputChange}
        handleRemoveLogo={handleRemoveLogo}
        displayTicker={displayTicker}
        coinBg={coinBg}
      />

      <div className="f2">
        <div className="fi">
          <label>Token Name <span style={{ color: 'var(--brand)' }}>*</span></label>
          <input
            className="inp"
            placeholder="e.g. HoodFi"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div className="fi">
          <label>Ticker Symbol <span style={{ color: 'var(--brand)' }}>*</span></label>
          <input
            className="inp"
            placeholder="e.g. HFI"
            maxLength={8}
            value={ticker}
            onChange={e => setTicker(e.target.value)}
          />
        </div>
      </div>
      <div className="fi">
        <label>Description</label>
        <textarea
          className="inp"
          placeholder="One or two sentences describing your vision and utility."
          value={desc}
          onChange={e => setDesc(e.target.value)}
        />
      </div>

      {/* Socials & Community Links */}
      <SocialLinksSection
        website={website}
        setWebsite={setWebsite}
        twitter={twitter}
        setTwitter={setTwitter}
        telegram={telegram}
        setTelegram={setTelegram}
        discord={discord}
        setDiscord={setDiscord}
        customLinks={customLinks}
        addCustomLink={addCustomLink}
        removeCustomLink={removeCustomLink}
        updateCustomLink={updateCustomLink}
      />
    </div>
  )
}
