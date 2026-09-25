'use client'

import { type RefObject } from 'react'
import Image from 'next/image'
import { Camera, Trash2 } from 'lucide-react'
import { logoTransform } from '@/lib/ipfs'

interface LogoUploaderSectionProps {
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
}

export function LogoUploaderSection({
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
}: LogoUploaderSectionProps) {
  return (
    <div className="fi" style={{ marginBottom: '18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>Token Icon / Logo</span>
          <span className="dim" style={{ fontSize: '11px', fontWeight: 500 }}>(Optional - Image or Fallback)</span>
        </label>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {logoUrl && (
            <button
              type="button"
              onClick={handleRemoveLogo}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--red)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              <Trash2 size={11} /> Remove
            </button>
          )}
        </div>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: isDragging ? '2px dashed var(--brand)' : '1.5px dashed var(--line3)',
          borderRadius: '8px',
          padding: '14px 18px',
          background: isDragging ? 'var(--brand-dim)' : 'var(--inset)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          cursor: 'pointer',
          transition: 'all .15s ease',
          position: 'relative',
        }}
      >
        {/* Modern Framed Token Badge Preview */}
        <div
          style={{
            width: '58px',
            height: '58px',
            borderRadius: logoShape === 'circle' ? '50%' : '12px',
            border: '2px solid var(--line)',
            background: logoBg === 'white' ? '#ffffff' : logoBg === 'dark' ? '#141915' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
            boxShadow: '0 3px 8px rgba(0,0,0,0.2)',
            position: 'relative',
            transition: 'all .15s ease',
          }}
        >
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt="Token logo"
              unoptimized
              width={100}
              height={100}
              style={{
                width: '100%',
                height: '100%',
                objectFit: logoFit,
                transform: logoTransform(logoScale),
                transition: 'transform .1s ease',
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                background: coinBg,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '17px',
                letterSpacing: '-0.02em',
                borderRadius: logoShape === 'circle' ? '50%' : 0,
              }}
            >
              {displayTicker.slice(0, 2)}
            </div>
          )}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              background: 'rgba(0,0,0,0.65)',
              borderRadius: '6px 0 0 0',
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Camera size={10} color="#fff" />
          </div>
        </div>

        {/* Instructions & File Status */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tx)' }}>
              {logoUrl ? 'Click or drop a new image to replace' : 'Click to upload or drag & drop token logo'}
            </span>
            {logoUrl && (
              <span style={{ fontSize: '10.5px', background: 'var(--green-dim)', color: 'var(--green)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                ✓ Logo Active
              </span>
            )}
          </div>
          <p style={{ fontSize: '11px', color: 'var(--mt)', margin: '3px 0 0', lineHeight: 1.4 }}>
            PNG, JPG, SVG, WEBP up to 5MB. Automatically synchronized to Live Preview.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
        />
      </div>

      {/* Interactive Logo Adaptation Controls (shown when a logo is active) */}
      {logoUrl && (
        <div
          style={{
            marginTop: '12px',
            padding: '12px 14px',
            background: 'var(--panel)',
            borderRadius: '8px',
            border: '1px solid var(--line2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--tx)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ⚙️ Logo Display &amp; Preview Controls
            </span>
            <span style={{ fontSize: '10.5px', color: 'var(--dim)' }}>
              Automatically updates Live Preview
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
            {/* Fit Mode */}
            <div>
              <span style={{ fontSize: '11px', color: 'var(--mt)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Fit Mode
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setLogoFit('cover')}
                  style={{
                    flex: 1,
                    padding: '5px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: logoFit === 'cover' ? '1px solid var(--brand)' : '1px solid var(--line)',
                    background: logoFit === 'cover' ? 'var(--brand-dim)' : 'var(--input)',
                    color: logoFit === 'cover' ? 'var(--brand)' : 'var(--tx)',
                  }}
                >
                  Cover
                </button>
                <button
                  type="button"
                  onClick={() => setLogoFit('contain')}
                  style={{
                    flex: 1,
                    padding: '5px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: logoFit === 'contain' ? '1px solid var(--brand)' : '1px solid var(--line)',
                    background: logoFit === 'contain' ? 'var(--brand-dim)' : 'var(--input)',
                    color: logoFit === 'contain' ? 'var(--brand)' : 'var(--tx)',
                  }}
                >
                  Contain
                </button>
              </div>
            </div>

            {/* Shape */}
            <div>
              <span style={{ fontSize: '11px', color: 'var(--mt)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Frame Shape
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setLogoShape('squircle')}
                  style={{
                    flex: 1,
                    padding: '5px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: logoShape === 'squircle' ? '1px solid var(--brand)' : '1px solid var(--line)',
                    background: logoShape === 'squircle' ? 'var(--brand-dim)' : 'var(--input)',
                    color: logoShape === 'squircle' ? 'var(--brand)' : 'var(--tx)',
                  }}
                >
                  Squircle
                </button>
                <button
                  type="button"
                  onClick={() => setLogoShape('circle')}
                  style={{
                    flex: 1,
                    padding: '5px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: logoShape === 'circle' ? '1px solid var(--brand)' : '1px solid var(--line)',
                    background: logoShape === 'circle' ? 'var(--brand-dim)' : 'var(--input)',
                    color: logoShape === 'circle' ? 'var(--brand)' : 'var(--tx)',
                  }}
                >
                  Circle
                </button>
              </div>
            </div>

            {/* Background Fill */}
            <div>
              <span style={{ fontSize: '11px', color: 'var(--mt)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Background Fill
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setLogoBg('transparent')}
                  style={{
                    flex: 1,
                    padding: '5px 6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: logoBg === 'transparent' ? '1px solid var(--brand)' : '1px solid var(--line)',
                    background: logoBg === 'transparent' ? 'var(--brand-dim)' : 'var(--input)',
                    color: logoBg === 'transparent' ? 'var(--brand)' : 'var(--tx)',
                  }}
                >
                  Transparent
                </button>
                <button
                  type="button"
                  onClick={() => setLogoBg('white')}
                  style={{
                    flex: 1,
                    padding: '5px 6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: logoBg === 'white' ? '1px solid var(--brand)' : '1px solid var(--line)',
                    background: logoBg === 'white' ? 'var(--brand-dim)' : 'var(--input)',
                    color: logoBg === 'white' ? 'var(--brand)' : 'var(--tx)',
                  }}
                >
                  White
                </button>
                <button
                  type="button"
                  onClick={() => setLogoBg('dark')}
                  style={{
                    flex: 1,
                    padding: '5px 6px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    border: logoBg === 'dark' ? '1px solid var(--brand)' : '1px solid var(--line)',
                    background: logoBg === 'dark' ? 'var(--brand-dim)' : 'var(--input)',
                    color: logoBg === 'dark' ? 'var(--brand)' : 'var(--tx)',
                  }}
                >
                  Dark
                </button>
              </div>
            </div>
          </div>

          {/* Scale / Zoom Slider */}
          <div style={{ marginTop: '2px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: 'var(--mt)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              Scale / Zoom ({logoScale}%)
            </span>
            <input
              type="range"
              min="80"
              max="200"
              step="5"
              value={logoScale}
              onChange={e => setLogoScale(Number(e.target.value))}
              style={{ flex: 1, cursor: 'pointer', height: '4px' }}
            />
            {logoScale !== 100 && (
              <button
                type="button"
                onClick={() => setLogoScale(100)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--brand)',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
