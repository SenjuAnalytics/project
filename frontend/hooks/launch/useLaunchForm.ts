'use client'

import { useState, useRef, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { usePairAssets } from '@/lib/usePairAssets'
import { useQualyraLaunch } from '@/lib/useQualyraLaunch'
import { pinFile, pinJson } from '@/lib/ipfs'
import { checkSocial, SOCIAL_RULES, type SocialKind } from '@/lib/socialLinks'
import { NATIVE_PAIR_ASSET, type Address } from '@/lib/contracts'
import { tickerColor } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { describeTxError } from '@/lib/gas'

const emptySubscribe = () => () => {}
function useIsMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false)
}

export const CUSTOM_LINK_KINDS: Partial<Record<string, SocialKind>> = {
  GitHub: 'github',
  YouTube: 'youtube',
  Reddit: 'reddit',
  Linktree: 'linktree',
}

export interface CustomSocialLink {
  id: string
  label: string
  url: string
}

/** `initialQuoteAsset` preselects a pair asset by symbol or address, e.g. from `?quoteAsset=` on the Stocks page. */
export function useLaunchForm(initialQuoteAsset?: string) {
  const router = useRouter()
  const mounted = useIsMounted()

  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain()
  const isSupportedChain = chainId === 4663 || chainId === 46630
  const isWrongChain = mounted && isConnected && !isSupportedChain
  const { toast } = useToast()

  const [name, setName] = useState('')
  const [ticker, setTicker] = useState('')
  const [logoUrl, setLogoUrl] = useState<string>('')
  // The resized image itself, kept aside so the launch can pin it. logoUrl is only the preview.
  const [logoBlob, setLogoBlob] = useState<Blob | null>(null)
  const [logoFit, setLogoFit] = useState<'cover' | 'contain'>('cover')
  const [logoShape, setLogoShape] = useState<'squircle' | 'circle'>('squircle')
  const [logoBg, setLogoBg] = useState<'transparent' | 'white' | 'dark'>('transparent')
  const [logoScale, setLogoScale] = useState<number>(100)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [desc, setDesc] = useState('')
  const [website, setWebsite] = useState('')
  const [twitter, setTwitter] = useState('')
  const [telegram, setTelegram] = useState('')
  const [discord, setDiscord] = useState('')
  const [customLinks, setCustomLinks] = useState<CustomSocialLink[]>([])

  const linkChecks = useMemo(() => {
    const entries: { key: string; kind: SocialKind; value: string }[] = [
      { key: 'website', kind: 'website', value: website },
      { key: 'twitter', kind: 'twitter', value: twitter },
      { key: 'telegram', kind: 'telegram', value: telegram },
      { key: 'discord', kind: 'discord', value: discord },
      ...customLinks.map(l => ({ key: `custom:${l.id}`, kind: CUSTOM_LINK_KINDS[l.label] ?? ('url' as SocialKind), value: l.url })),
    ]
    return entries.map(e => ({ ...e, result: checkSocial(e.kind, e.value) }))
  }, [website, twitter, telegram, discord, customLinks])

  const badLinks = linkChecks.filter(c => !c.result.ok)

  const linkUrls = useMemo(() => {
    const out: Record<string, string> = {}
    for (const c of linkChecks) {
      if (c.result.ok && c.result.url) out[c.key] = c.result.url
    }
    return out
  }, [linkChecks])

  const compressLogo = (file: File): Promise<{ dataUrl: string; blob: Blob }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Could not read the image file.'))
      reader.onload = () => {
        const img = new window.Image()
        img.onerror = () => reject(new Error('That file could not be decoded as an image.'))
        img.onload = () => {
          const SIZE = 512
          const canvas = document.createElement('canvas')
          canvas.width = SIZE
          canvas.height = SIZE
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('This browser cannot process images.'))
            return
          }

          // Cover-crop to a square so non-square logos are not distorted.
          const side = Math.min(img.width, img.height)
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE)

          canvas.toBlob(
            blob => {
              if (!blob) {
                reject(new Error('This browser could not encode the image.'))
                return
              }
              const reader2 = new FileReader()
              reader2.onerror = () => reject(new Error('Could not read the resized image.'))
              reader2.onload = () => resolve({ dataUrl: reader2.result as string, blob })
              reader2.readAsDataURL(blob)
            },
            'image/webp',
            0.9,
          )
        }
        img.src = reader.result as string
      }
      reader.readAsDataURL(file)
    })

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Invalid File Type', 'Please select an image file (PNG, JPG, SVG, WEBP, or GIF).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File Too Large', 'Logo size must be less than 5MB.')
      return
    }

    try {
      const { dataUrl, blob } = await compressLogo(file)
      setLogoUrl(dataUrl)
      setLogoBlob(blob)
      toast.success(
        'Logo ready',
        `Resized to 512px (${Math.round(blob.size / 1024)} KB)${/gif$/i.test(file.type) ? '. Animation is not kept.' : '.'}`
      )
    } catch (err) {
      toast.error('Upload Error', err instanceof Error ? err.message : 'Could not process image file.')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0])
    }
  }

  const handleRemoveLogo = (e: React.MouseEvent) => {
    e.stopPropagation()
    setLogoUrl('')
    setLogoBlob(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    toast.info('Logo Removed', 'Reverted to generated ticker fallback initials.')
  }

  const isAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v.trim())

  const addExemptWallet = () => {
    setSnipeExempt(prev => (prev.length >= 32 ? prev : [...prev, { id: Date.now().toString(), address: '' }]))
  }

  const removeExemptWallet = (id: string) => {
    setSnipeExempt(prev => prev.filter(w => w.id !== id))
  }

  const updateExemptWallet = (id: string, address: string) => {
    setSnipeExempt(prev => prev.map(w => (w.id === id ? { ...w, address } : w)))
  }

  const addCustomLink = () => {
    setCustomLinks(prev => [
      ...prev,
      { id: Date.now().toString(), label: 'GitHub', url: '' },
    ])
  }

  const removeCustomLink = (id: string) => {
    setCustomLinks(prev => prev.filter(l => l.id !== id))
  }

  const updateCustomLink = (id: string, field: 'label' | 'url', value: string) => {
    setCustomLinks(prev =>
      prev.map(l => (l.id === id ? { ...l, [field]: value } : l))
    )
  }

  const supply = '1,000,000,000'
  const { assets: pairAssets, isLive: pairAssetsLive } = usePairAssets()
  const { launch: launchOnChain, available: launchAvailable } = useQualyraLaunch()
  const [quoteAssetPick, setQuoteAssetPick] = useState(initialQuoteAsset || 'ETH')
  const [pairOpen, setPairOpen] = useState(false)
  const pairRef = useRef<HTMLDivElement>(null)

  const pick = quoteAssetPick.toLowerCase()
  const selectedPair =
    pairAssets.find(a => a.symbol.toLowerCase() === pick || a.address.toLowerCase() === pick) ?? pairAssets[0]
  const quoteAsset = selectedPair?.symbol ?? 'ETH'
  const goal = selectedPair ? String(selectedPair.graduationTarget) : '0'

  const [creatorTax, setCreatorTax] = useState(0)
  const [firstBuy, setFirstBuy] = useState('')
  const [feeRecipient, setFeeRecipient] = useState('')
  const [snipeExempt, setSnipeExempt] = useState<{ id: string; address: string }[]>([])

  useEffect(() => {
    if (!pairOpen) return
    const onDown = (e: MouseEvent) => {
      if (pairRef.current && !pairRef.current.contains(e.target as Node)) setPairOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPairOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pairOpen])

  const firstBuyAmount = Number(firstBuy) > 0 ? Number(firstBuy) : 0
  const feeRecipientValid = feeRecipient.trim() === '' || isAddress(feeRecipient)
  const exemptList = snipeExempt.map(w => w.address.trim()).filter(Boolean)
  const invalidExempt = exemptList.filter(v => !isAddress(v)).length

  const blockingIssue = useMemo(() => {
    if (!name.trim()) return 'Enter a token name'
    if (!ticker.trim()) return 'Enter a ticker symbol'
    if (!feeRecipientValid) return 'Fee recipient is not an address'
    if (invalidExempt > 0) {
      return `${invalidExempt} exempt wallet${invalidExempt === 1 ? '' : 's'} not a valid address`
    }
    if (badLinks.length > 0) {
      const first = badLinks[0]
      const label = SOCIAL_RULES[first.kind]?.label ?? 'link'
      return badLinks.length === 1 ? `Fix the highlighted ${label} link` : `Fix ${badLinks.length} highlighted links`
    }
    return ''
  }, [name, ticker, feeRecipientValid, invalidExempt, badLinks])

  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)

  const displayName = name.trim() || 'YourProject'
  const displayTicker = (ticker.trim().replace(/^\$+/, '') || 'TICK').toUpperCase()
  const displayDesc = desc.trim() || 'Short description of your project will appear here. No promises of profit.'
  const coinBg = tickerColor(displayTicker)

  const handleDeploy = () => {
    if (!name.trim()) {
      toast.error('Token Name Required', 'Please enter a name for your token.')
      return
    }
    if (!ticker.trim()) {
      toast.error('Ticker Symbol Required', 'Please enter a ticker symbol (e.g. HFI).')
      return
    }
    if (!feeRecipientValid) {
      toast.error('Fee recipient is not an address', 'Leave it empty to receive fees in your own wallet.')
      return
    }
    if (invalidExempt > 0) {
      toast.error(
        `${invalidExempt} exempt wallet${invalidExempt === 1 ? '' : 's'} not a valid address`,
        'Each one has to be 0x followed by 40 hex characters.'
      )
      return
    }

    if (badLinks.length > 0) {
      const first = badLinks[0]
      const label = SOCIAL_RULES[first.kind]?.label ?? 'link'
      toast.error(
        badLinks.length === 1 ? `Invalid ${label} link` : `${badLinks.length} links are not valid`,
        first.result.ok ? '' : first.result.reason,
      )
      return
    }

    setShowConfirmModal(true)
  }

  const handleConfirmDeploy = async () => {
    if (!launchAvailable) {
      toast.error('Not deployed here', 'Qualyra has no factory on the network your wallet is on.')
      return
    }

    setIsDeploying(true)
    try {
      const metadata: Record<string, unknown> = {
        name: displayName,
        symbol: displayTicker,
        description: desc.trim() || undefined,
        logoFit,
        logoShape,
        logoBg,
        logoScale,
        website: linkUrls.website || undefined,
        twitter: linkUrls.twitter || undefined,
        telegram: linkUrls.telegram || undefined,
        discord: linkUrls.discord || undefined,
      }

      const extraLinks = customLinks
        .map(l => ({ label: l.label, url: linkUrls[`custom:${l.id}`] }))
        .filter((l): l is { label: string; url: string } => !!l.url)
      if (extraLinks.length > 0) metadata.links = extraLinks

      if (logoBlob) {
        const logoFile = new File([logoBlob], `${displayTicker || 'token'}-logo.webp`, { type: 'image/webp' })
        metadata.image = await pinFile(logoFile, `${displayTicker || 'token'} logo`)
      }

      let metadataURI = ''
      try {
        metadataURI = await pinJson(metadata, `${displayTicker || 'token'}.json`)
      } catch (err) {
        const inline = JSON.stringify(metadata)
        const INLINE_LIMIT = 1024
        if (metadata.image || inline.length > INLINE_LIMIT) throw err
        metadataURI = inline
        toast.warning('Stored on chain', 'Pinning is unavailable, so the text metadata was written directly.')
      }

      const result = await launchOnChain({
        name: displayName,
        symbol: displayTicker,
        metadataURI,
        quoteAsset: (selectedPair?.address ?? NATIVE_PAIR_ASSET) as Address,
        quoteDecimals: selectedPair?.decimals ?? 18,
        creatorTaxPercent: creatorTax,
        creatorFeeRecipient: feeRecipient,
        snipeExempt: exemptList as Address[],
        firstBuy: firstBuyAmount > 0 ? firstBuy : undefined,
      })

      setIsDeploying(false)
      setShowConfirmModal(false)

      if (!result.token) {
        toast.success(
          'Launch confirmed',
          'The transaction went through, but the token address could not be read from it. Check the explorer.'
        )
        return
      }

      toast.success(
        `${displayTicker} is live`,
        `${displayName} is trading on its bonding curve. Opening the terminal...`
      )
      setTimeout(() => {
        router.push(`/trade?pair=${result.token}`)
      }, 700)
    } catch (err) {
      setIsDeploying(false)
      const { title, detail } = describeTxError(err)
      toast.error(title === 'Transaction failed' ? 'Launch failed' : title, detail)
    }
  }

  return {
    name,
    setName,
    ticker,
    setTicker,
    desc,
    setDesc,
    logoUrl,
    setLogoUrl,
    logoBlob,
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
    handleFileSelect,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleFileInputChange,
    handleRemoveLogo,
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
    supply,
    pairAssets,
    pairAssetsLive,
    quoteAssetPick,
    setQuoteAssetPick,
    pairOpen,
    setPairOpen,
    pairRef,
    selectedPair,
    quoteAsset,
    goal,
    creatorTax,
    setCreatorTax,
    firstBuy,
    setFirstBuy,
    feeRecipient,
    setFeeRecipient,
    feeRecipientValid,
    snipeExempt,
    addExemptWallet,
    removeExemptWallet,
    updateExemptWallet,
    exemptList,
    invalidExempt,
    blockingIssue,
    showConfirmModal,
    setShowConfirmModal,
    isDeploying,
    displayName,
    displayTicker,
    displayDesc,
    coinBg,
    isWrongChain,
    chainId,
    switchChainAsync,
    isSwitchingChain,
    handleDeploy,
    handleConfirmDeploy,
  }
}
