import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Navbar } from '@/components/layout/Navbar'
import { ActivityMarquee } from '@/components/shared/ActivityMarquee'
import { Footer } from '@/components/layout/Footer'
import { TxReceiptModal } from '@/components/shared/TxReceiptModal'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://www.qualyra.xyz'),
  title: {
    default: 'QUALYRA — Launch. Prove. Battle. | Robinhood Chain',
    template: '%s | QUALYRA',
  },
  description: 'Token launchpad on Robinhood Chain: bonding curve launches paired with ETH, USDG or stock tokens (NVDA, AAPL, SPY), token battles and a weekly Trader League.',
  keywords: [
    'QUALYRA',
    'Robinhood Chain',
    'Robinhood L2',
    'DeFi',
    'Bonding Curve DEX',
    'RWA',
    'Tokenized Stocks',
    'NVDA Stock Onchain',
    'AAPL Stock Onchain',
    'SPY ETF',
    'USDG',
    'Pons',
    'Artificial Inu',
    'Arbitrum Orbit',
  ],
  authors: [{ name: 'Qualyra Protocol' }],
  creator: 'Qualyra Protocol',
  publisher: 'Qualyra Protocol',
  alternates: {
    canonical: 'https://www.qualyra.xyz',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.qualyra.xyz',
    siteName: 'QUALYRA',
    title: 'QUALYRA — Launch. Prove. Battle. | Robinhood Chain',
    description: 'Token launchpad on Robinhood Chain: bonding curve launches, token battles and a weekly Trader League.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'QUALYRA — Token launchpad on Robinhood Chain',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QUALYRA — Launch. Prove. Battle. | Robinhood Chain',
    description: 'Token launchpad on Robinhood Chain: bonding curve launches, token battles and a weekly Trader League.',
    images: ['/og-image.png'],
    creator: '@qualyra',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <Navbar />
          <ActivityMarquee />
          <main>{children}</main>
          <Footer />
          <TxReceiptModal />
        </Providers>
      </body>
    </html>
  )
}
