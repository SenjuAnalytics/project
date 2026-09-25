'use client'

import { Globe, Plus, Trash2 } from 'lucide-react'
import { DiscordIcon, TelegramIcon, XIcon } from '@/components/ui/SocialIcons'
import { SocialField } from '@/components/launch/SocialField'
import { CUSTOM_LINK_KINDS, type CustomSocialLink } from '@/hooks/launch/useLaunchForm'

interface SocialLinksSectionProps {
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

export function SocialLinksSection({
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
}: SocialLinksSectionProps) {
  return (
    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--line2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>Community &amp; Social Links</span>
        </label>
        <span className="dim" style={{ fontSize: '11px', fontWeight: 500 }}>(Optional - boost trust)</span>
      </div>
      <p style={{ fontSize: '11.5px', color: 'var(--ft)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Provide your official channels so buyers and battle voters can verify and connect with your project.
      </p>

      <div className="f2">
        <SocialField
          kind="website"
          icon={<Globe size={13} color="var(--brand)" />}
          label="Official Website"
          value={website}
          onChange={setWebsite}
        />
        <SocialField
          kind="twitter"
          icon={<XIcon size={13} color="var(--tx)" />}
          label="Twitter / X"
          value={twitter}
          onChange={setTwitter}
        />
      </div>

      <div className="f2">
        <SocialField
          kind="telegram"
          icon={<TelegramIcon size={14} color="#2AABEE" />}
          label="Telegram Group / Channel"
          value={telegram}
          onChange={setTelegram}
        />
        <SocialField
          kind="discord"
          icon={<DiscordIcon size={14} color="#5865F2" />}
          label="Discord Server"
          value={discord}
          onChange={setDiscord}
        />
      </div>

      {/* Dynamic Custom Links */}
      {customLinks.map((link) => (
        <div key={link.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 34px', gap: '8px', alignItems: 'center', marginTop: '10px' }}>
          <select
            className="inp"
            style={{ fontSize: '12px', padding: '8px 10px', height: '36px' }}
            value={link.label}
            onChange={e => updateCustomLink(link.id, 'label', e.target.value)}
          >
            <option value="GitHub">GitHub</option>
            <option value="Whitepaper">Whitepaper</option>
            <option value="Docs">Documentation</option>
            <option value="Medium">Medium / Blog</option>
            <option value="YouTube">YouTube</option>
            <option value="Warpcast">Warpcast</option>
            <option value="Reddit">Reddit</option>
            <option value="Linktree">Linktree</option>
            <option value="Other">Other Link</option>
          </select>
          <SocialField
            kind={CUSTOM_LINK_KINDS[link.label] ?? 'url'}
            label={link.label}
            value={link.url}
            onChange={v => updateCustomLink(link.id, 'url', v)}
            compact
          />
          <button
            type="button"
            onClick={() => removeCustomLink(link.id)}
            style={{
              width: '34px',
              height: '36px',
              borderRadius: '6px',
              border: '1px solid var(--line2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--red)',
              background: 'var(--input)',
              transition: 'all .15s',
            }}
            title="Remove link"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addCustomLink}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: 'none',
          border: '1px dashed var(--line3)',
          color: 'var(--brand)',
          fontSize: '12px',
          fontWeight: 600,
          padding: '8px 14px',
          borderRadius: '6px',
          cursor: 'pointer',
          marginTop: '12px',
          transition: 'all .15s',
        }}
      >
        <Plus size={13} />
        <span>+ Add Other Social / Link (GitHub, Docs, Medium, YouTube, etc.)</span>
      </button>
    </div>
  )
}
