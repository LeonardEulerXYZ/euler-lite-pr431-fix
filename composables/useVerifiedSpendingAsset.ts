import { computed, getCurrentScope, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { getAddress, zeroAddress } from 'viem'
import type { VaultAsset } from '~/types/asset'
import { erc20DecimalsAbi } from '~/abis/erc20'
import { queryClient } from '~/utils/query-client'

/** Only selected spending tokens are verified; lists and output pickers stay read-free.
 * The writable ref accepts candidates but exposes only the verified local copy.
 */
export const useVerifiedSpendingAsset = (invalidate?: () => void) => {
  const { chainId } = useEulerAddresses()
  const { client } = useRpcClient()
  const requested = shallowRef<VaultAsset>()
  const verified = shallowRef<VaultAsset>()
  const error = ref<string | null>(null)
  const isLoading = ref(false)
  let generation = 0

  const resolve = async () => {
    const current = ++generation
    const candidate = requested.value
    const chain = chainId.value
    const rpc = client.value
    verified.value = undefined
    error.value = null
    isLoading.value = false
    invalidate?.()
    if (!candidate) return
    try {
      const address = getAddress(candidate.address.toLowerCase())
      if (!chain) throw new Error('No selected chain')
      if (address === zeroAddress) {
        verified.value = { ...candidate }
        return
      }
      if (!rpc) throw new Error('RPC unavailable')
      isLoading.value = true
      // Reuse the app query cache for success caching and concurrent-read dedup.
      // Failed fetchQuery calls are not fresh, so explicit retry reaches RPC.
      const decimals = await queryClient.fetchQuery({
        queryKey: ['selected-spending-decimals', chain, address.toLowerCase()],
        staleTime: Infinity,
        gcTime: 30 * 60 * 1000,
        retry: false,
        queryFn: async () => {
          const value = await rpc.readContract({ address, abi: erc20DecimalsAbi, functionName: 'decimals', authorizationList: undefined })
          if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
            throw new Error('Invalid token decimals')
          }
          return value
        },
      })
      if (current === generation) verified.value = { ...candidate, decimals }
    }
    catch {
      if (current === generation) error.value = 'Unable to verify token decimals. Retry to continue.'
    }
    finally {
      if (current === generation) isLoading.value = false
    }
  }
  watch(chainId, () => {
    void resolve()
  }, { flush: 'sync' })
  if (getCurrentScope()) {
    onScopeDispose(() => {
      generation++
    })
  }

  const asset = computed({
    get: () => verified.value,
    set: (candidate: VaultAsset | undefined) => {
      requested.value = candidate ? { ...candidate } : undefined
      void resolve()
    },
  })
  const isBlocked = computed(() => !!requested.value && !verified.value)
  return { asset, isBlocked, isLoading, error, retry: resolve }
}
