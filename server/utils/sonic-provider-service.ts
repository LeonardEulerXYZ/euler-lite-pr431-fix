import { createPublicClient, http, type Chain } from 'viem'
import type { IProviderService } from '@eulerxyz/euler-v2-sdk'

const SONIC_CHAIN_ID = 146

/** Keep the SDK provider on every chain, replacing only Sonic's Multicall budget. */
export const createSonicProviderService = (
  rpcUrls: Record<number, string>,
  delegate: IProviderService,
): IProviderService => {
  const sonicUrl = rpcUrls[SONIC_CHAIN_ID]
  const sonicProvider: ReturnType<IProviderService['getProvider']> | undefined = sonicUrl
    ? createPublicClient({
      // Take chain metadata (including Multicall3 address) from the SDK's provider.
      // The SDK installs its own viem version, so its Chain type differs from Lite's.
      chain: delegate.getProvider(SONIC_CHAIN_ID).chain as unknown as Chain,
      batch: { multicall: { batchSize: 128, wait: 10 } },
      transport: http(sonicUrl, { batch: { batchSize: 100, wait: 10 } }),
    }) as unknown as ReturnType<IProviderService['getProvider']>
    : undefined

  return {
    getProvider: chainId => chainId === SONIC_CHAIN_ID && sonicProvider
      ? sonicProvider
      : delegate.getProvider(chainId),
    getSupportedChainIds: () => delegate.getSupportedChainIds(),
  }
}
