import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatUnits, parseUnits, zeroAddress, type Address } from 'viem'
import type { VaultAsset } from '~/types/asset'
import { queryClient } from '~/utils/query-client'
import { useVerifiedSpendingAsset as createState } from '~/composables/useVerifiedSpendingAsset'

const scopes: ReturnType<typeof effectScope>[] = []
const useVerifiedSpendingAsset = (invalidate?: () => void) => {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => createState(invalidate))!
}
afterEach(() => {
  scopes.splice(0).forEach(scope => scope.stop())
})

const token: VaultAsset = { address: '0x00000000000000000000000000000000000000ab', name: 'Selected token', symbol: 'SEL', decimals: 18 }
const other: VaultAsset = { ...token, address: '0x00000000000000000000000000000000000000cd' }
const chainId = ref(1)
const readContract = vi.fn()
const settle = async () => {
  for (let i = 0; i < 12; i++) await nextTick()
}
const deferred = () => {
  let resolve!: (value: number) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<number>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  queryClient.clear()
  chainId.value = 1
  readContract.mockReset().mockResolvedValue(17)
  vi.stubGlobal('useEulerAddresses', () => ({ chainId }))
  vi.stubGlobal('useRpcClient', () => ({ client: ref({ readContract }) }))
})

describe('selected spending asset decimals', () => {
  it('verifies a default wallet asset and preserves an explicit pay-with choice across vault changes', async () => {
    const state = useVerifiedSpendingAsset()
    state.setDefaultAsset(token)
    expect(state.isBlocked.value).toBe(true)
    expect(state.asset.value).toBeUndefined()
    await settle()
    expect(state.asset.value?.decimals).toBe(17)

    state.asset.value = other
    await settle()
    state.setDefaultAsset({ ...token, address: '0x00000000000000000000000000000000000000ef' })
    await settle()
    expect(state.asset.value?.address).toBe(other.address)
    expect(readContract).toHaveBeenCalledTimes(2)
  })

  it('does no reads until a spending token is selected; corrects only the local selection', async () => {
    const state = useVerifiedSpendingAsset()
    expect(readContract).not.toHaveBeenCalled()
    state.asset.value = token
    expect(state.asset.value).toBeUndefined()
    expect(state.isBlocked.value).toBe(true)
    await settle()
    expect(state.asset.value).toEqual({ ...token, decimals: 17 })
    expect(token.decimals).toBe(18)
    expect(state.isBlocked.value).toBe(false)
    expect(readContract).toHaveBeenCalledTimes(1)
    expect(readContract.mock.calls[0]![0].address.toLowerCase()).toBe(token.address)
    expect(readContract.mock.calls[0]![0].functionName).toBe('decimals')
  })

  it.each([17, 8, 0])('uses verified %i decimals for typed amount, Max, and review round trips', async (decimals) => {
    readContract.mockResolvedValue(decimals)
    const state = useVerifiedSpendingAsset()
    state.asset.value = token
    await settle()
    const asset = state.asset.value!
    const typed = parseUnits('2', asset.decimals)
    expect(typed).toBe(2n * 10n ** BigInt(decimals))
    const balance = 31n * 10n ** BigInt(decimals)
    const max = formatUnits(balance, asset.decimals)
    expect(max).toBe('31')
    expect(parseUnits(max, asset.decimals)).toBe(balance)
    expect(formatUnits(typed, asset.decimals)).toBe('2')
  })

  it('deduplicates inflight reads and caches by chain and normalized address', async () => {
    const pending = deferred()
    readContract.mockReturnValueOnce(pending.promise)
    const a = useVerifiedSpendingAsset()
    const b = useVerifiedSpendingAsset()
    a.asset.value = token
    b.asset.value = { ...token, address: token.address.toUpperCase().replace('0X', '0x') as Address }
    expect(readContract).toHaveBeenCalledTimes(1)
    pending.resolve(8)
    await settle()
    expect(a.asset.value?.decimals).toBe(8)
    expect(b.asset.value?.decimals).toBe(8)
    a.asset.value = token
    await settle()
    expect(readContract).toHaveBeenCalledTimes(1)
    chainId.value = 10
    expect(a.asset.value).toBeUndefined()
    await settle()
    expect(readContract).toHaveBeenCalledTimes(2)
  })

  it('blocks failures without a list fallback and explicitly retries', async () => {
    readContract.mockRejectedValueOnce(new Error('Unavailable'))
    const state = useVerifiedSpendingAsset()
    state.asset.value = token
    await settle()
    expect(state.asset.value).toBeUndefined()
    expect(state.isBlocked.value).toBe(true)
    expect(state.error.value).toBeTruthy()
    await state.retry()
    expect(readContract).toHaveBeenCalledTimes(2)
    expect(state.asset.value?.decimals).toBe(17)
    expect(state.error.value).toBeNull()
  })

  it.each([undefined, -1, 256, 1.5, '18'])('rejects invalid decimals %s', async (result) => {
    readContract.mockResolvedValue(result)
    const state = useVerifiedSpendingAsset()
    state.asset.value = token
    await settle()
    expect(state.asset.value).toBeUndefined()
    expect(state.isBlocked.value).toBe(true)
  })

  it('ignores stale token and chain responses and invalidates dependent state synchronously', async () => {
    const first = deferred()
    const second = deferred()
    readContract.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const invalidate = vi.fn()
    const state = useVerifiedSpendingAsset(invalidate)
    state.asset.value = token
    state.asset.value = other
    expect(invalidate).toHaveBeenCalledTimes(2)
    first.resolve(8)
    await settle()
    expect(state.asset.value).toBeUndefined()
    chainId.value = 10
    expect(invalidate).toHaveBeenCalledTimes(3)
    await settle()
    expect(state.asset.value).toEqual({ ...other, decimals: 17 })
    second.resolve(6)
    await settle()
    expect(state.asset.value?.decimals).toBe(17)
  })

  it('clearing selection or disposing invalidates an outstanding read', async () => {
    const pending = deferred()
    readContract.mockReturnValueOnce(pending.promise)
    const scope = effectScope()
    const state = scope.run(() => useVerifiedSpendingAsset())!
    state.asset.value = token
    scope.stop()
    pending.resolve(8)
    await settle()
    expect(state.asset.value).toBeUndefined()
    state.asset.value = undefined
    expect(state.isBlocked.value).toBe(false)
  })

  it('bypasses ERC20 reads for native currency', () => {
    const state = useVerifiedSpendingAsset()
    state.asset.value = { ...token, address: zeroAddress }
    expect(state.asset.value?.decimals).toBe(18)
    expect(state.isBlocked.value).toBe(false)
    expect(readContract).not.toHaveBeenCalled()
  })
})
