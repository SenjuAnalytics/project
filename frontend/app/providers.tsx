'use client'

import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, lightTheme, darkTheme, type DisclaimerComponent } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Image from 'next/image'
import { wagmiConfig, robinhoodChain, robinhoodChainTestnet } from '@/lib/wagmi'
import { ThemeProvider, useTheme } from '@/components/ui/ThemeProvider'
import { ToastProvider } from '@/components/ui/Toast'
import { useEffect, useState, useMemo } from 'react'
import '@rainbow-me/rainbowkit/styles.css'

const queryClient = new QueryClient()

const CustomDisclaimer: DisclaimerComponent = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      padding: '7px 12px',
      borderRadius: '8px',
      background: 'var(--brand-dim)',
      border: '1px solid rgba(var(--brand-rgb), 0.3)',
      fontSize: '11px',
      color: 'var(--tx)',
      fontWeight: 600,
      letterSpacing: '0.01em',
      marginTop: '4px',
    }}
  >
    <Image
      src="/robinhood-logo.webp"
      alt="Robinhood Chain"
      width={14}
      height={14}
      unoptimized
      style={{
        width: '14px',
        height: '14px',
        borderRadius: '3px',
        objectFit: 'cover',
        flexShrink: 0,
      }}
    />
    <div
      style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: 'var(--brand)',
        boxShadow: '0 0 8px var(--brand)',
      }}
    />
    <span>Robinhood Chain (ID: 4663) · Sub-Second Settlement</span>
  </div>
)

function RainbowWrapper({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  const isDark = mounted && resolvedTheme === 'dark'

  const themeConfig = useMemo(() => {
    if (isDark) {
      const base = darkTheme({
        accentColor: '#AED43C',
        accentColorForeground: '#0B0E11',
        borderRadius: 'medium',
        fontStack: 'system',
        overlayBlur: 'none',
      })
      return {
        ...base,
        blurs: {
          modalOverlay: 'blur(0px)',
        },
        colors: {
          ...base.colors,
          accentColor: '#AED43C',
          accentColorForeground: '#0B0E11',
          modalBackground: '#242824',
          modalBorder: '#3E453E',
          modalBackdrop: 'rgba(0, 0, 0, 0.40)',
          modalText: '#EAEBE6',
          modalTextSecondary: '#C1C6C1',
          modalTextDim: '#A3A8A3',
          menuItemBackground: '#1B1E1B',
          actionButtonSecondaryBackground: '#161816',
          closeButton: '#C1C6C1',
          closeButtonBackground: '#161816',
          generalBorder: '#3E453E',
          selectedOptionBorder: '#AED43C',
        },
        radii: {
          ...base.radii,
          modal: '18px',
          modalMobile: '22px',
          menuButton: '12px',
          connectButton: '10px',
        },
        shadows: {
          ...base.shadows,
          dialog: '0 24px 60px -8px rgba(0, 0, 0, 0.65), 0 0 0 1px #3E453E, 0 0 28px -6px rgba(174, 212, 60, 0.12)',
        },
      }
    } else {
      const base = lightTheme({
        accentColor: '#85B314',
        accentColorForeground: '#FFFFFF',
        borderRadius: 'medium',
        fontStack: 'system',
        overlayBlur: 'none',
      })
      return {
        ...base,
        blurs: {
          modalOverlay: 'blur(0px)',
        },
        colors: {
          ...base.colors,
          accentColor: '#85B314',
          accentColorForeground: '#FFFFFF',
          modalBackground: '#FFFFFF',
          modalBorder: '#DCE0D5',
          modalBackdrop: 'rgba(15, 23, 42, 0.22)',
          modalText: '#161A14',
          modalTextSecondary: '#4A5246',
          modalTextDim: '#6E7869',
          menuItemBackground: '#F6F7F4',
          actionButtonSecondaryBackground: '#E7EAE1',
          closeButton: '#4A5246',
          closeButtonBackground: '#E7EAE1',
          generalBorder: '#DCE0D5',
          selectedOptionBorder: '#85B314',
        },
        radii: {
          ...base.radii,
          modal: '18px',
          modalMobile: '22px',
          menuButton: '12px',
          connectButton: '10px',
        },
        shadows: {
          ...base.shadows,
          dialog: '0 20px 48px -8px rgba(0, 0, 0, 0.15), 0 0 0 1px #DCE0D5',
        },
      }
    }
  }, [isDark])

  return (
    <RainbowKitProvider
      modalSize="compact"
      theme={themeConfig}
      locale="en"
      initialChain={process.env.NEXT_PUBLIC_ENABLE_TESTNETS === 'true' ? robinhoodChainTestnet : robinhoodChain}
      appInfo={{
        appName: 'QUALYRA',
        learnMoreUrl: 'https://robinhoodchain.blockscout.com',
        disclaimer: CustomDisclaimer,
      }}
    >
      {children}
    </RainbowKitProvider>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowWrapper>
            <ToastProvider>
              {children}
            </ToastProvider>
          </RainbowWrapper>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  )
}
