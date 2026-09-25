'use client'

import { use } from 'react'
import { DeployConfirmModal } from '@/components/launch/DeployConfirmModal'
import { TokenIdentitySection } from '@/components/launch/TokenIdentitySection'
import { BondingCurveConfigSection } from '@/components/launch/BondingCurveConfigSection'
import { CreatorTaxSection } from '@/components/launch/CreatorTaxSection'
import { AntiSnipeSection } from '@/components/launch/AntiSnipeSection'
import { DeployReviewSection } from '@/components/launch/DeployReviewSection'
import { LaunchPreviewCard } from '@/components/launch/LaunchPreviewCard'
import { useLaunchForm } from '@/hooks/launch/useLaunchForm'

export default function LaunchPage({ searchParams }: { searchParams?: Promise<{ quoteAsset?: string }> }) {
  const params = searchParams ? use(searchParams) : undefined
  const {
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
    setQuoteAssetPick,
    pairOpen,
    setPairOpen,
    pairRef,
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
  } = useLaunchForm(params?.quoteAsset)

  return (
    <div className="wrap" style={{ padding: '20px 16px' }}>
      <div className="sec">
        <div className="sec-hd">
          <div>
            <h3>Launch a Token</h3>
            <p className="dim" style={{ fontSize: '13px', marginTop: '4px' }}>
              Bonding curve, then a pool with liquidity locked for good. Live on Robinhood Chain in under 2 minutes.
            </p>
          </div>
        </div>

        <div className="ln-grid">
          {/* Launch Form */}
          <div className="panel form">
            <TokenIdentitySection
              name={name}
              setName={setName}
              ticker={ticker}
              setTicker={setTicker}
              desc={desc}
              setDesc={setDesc}
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

            <BondingCurveConfigSection
              pairAssets={pairAssets}
              pairAssetsLive={pairAssetsLive}
              chainId={chainId}
              quoteAsset={quoteAsset}
              setQuoteAssetPick={setQuoteAssetPick}
              pairOpen={pairOpen}
              setPairOpen={setPairOpen}
              pairRef={pairRef}
              goal={goal}
              displayTicker={displayTicker}
              firstBuy={firstBuy}
              setFirstBuy={setFirstBuy}
            />

            <CreatorTaxSection
              creatorTax={creatorTax}
              setCreatorTax={setCreatorTax}
              feeRecipient={feeRecipient}
              setFeeRecipient={setFeeRecipient}
              feeRecipientValid={feeRecipientValid}
            />

            <AntiSnipeSection
              snipeExempt={snipeExempt}
              invalidExempt={invalidExempt}
              addExemptWallet={addExemptWallet}
              removeExemptWallet={removeExemptWallet}
              updateExemptWallet={updateExemptWallet}
            />

            <DeployReviewSection
              isWrongChain={isWrongChain}
              chainId={chainId}
              switchChainAsync={switchChainAsync}
              isSwitchingChain={isSwitchingChain}
              creatorTax={creatorTax}
              blockingIssue={blockingIssue}
              handleDeploy={handleDeploy}
            />
          </div>

          {/* Live Preview Card */}
          <LaunchPreviewCard
            logoUrl={logoUrl}
            logoFit={logoFit}
            logoShape={logoShape}
            logoBg={logoBg}
            logoScale={logoScale}
            displayName={displayName}
            displayTicker={displayTicker}
            displayDesc={displayDesc}
            coinBg={coinBg}
            quoteAsset={quoteAsset}
            goal={goal}
            creatorTax={creatorTax}
            website={website}
            twitter={twitter}
            telegram={telegram}
            discord={discord}
            customLinks={customLinks}
          />
        </div>
      </div>

      <DeployConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmDeploy}
        isDeploying={isDeploying}
        data={{
          name: displayName,
          ticker: displayTicker,
          logoUrl,
          logoFit,
          logoShape,
          logoBg,
          logoScale,
          desc: desc.trim(),
          supply,
          snipeExempt: exemptList.length,
          firstBuy: Number(firstBuy) > 0 ? `${firstBuy} ${quoteAsset}` : '',
          feeRecipient: feeRecipient.trim(),
          goal: `${goal} ${quoteAsset === 'ETH' ? 'ETH' : quoteAsset}`,
          quoteAsset,
          creatorTax,
          website,
          twitter,
          telegram,
          discord,
          customLinks,
        }}
      />
    </div>
  )
}
