import { describe, it, expect } from 'vitest'
import { INTEREST_RATE_MODEL_TYPE } from '~/entities/constants'
import { getBorrowVaultsByMap, isCyclicalNoteVault } from '~/entities/vault/utils'
import type { EVault, SecuritizeCollateralVault } from '~/entities/vault/types'

describe('getBorrowVaultsByMap', () => {
  const makeVault = (address: string, collaterals: Array<{ address: string, borrowLTV: number, liquidationLTV: number, initialLiquidationLTV: number, targetTimestamp: number, rampDuration: bigint }>) =>
    ({ address, collaterals }) as unknown as EVault

  it('returns empty array for empty map', () => {
    expect(getBorrowVaultsByMap(new Map())).toEqual([])
  })

  it('returns pairs for vaults with borrowLTV > 0', () => {
    const vaultA = makeVault('0xA', [{
      address: '0xB',
      borrowLTV: 0.8,
      liquidationLTV: 0.85,
      initialLiquidationLTV: 0.85,
      targetTimestamp: 0,
      rampDuration: 0n,
    }])
    const vaultB = makeVault('0xB', [])
    const map = new Map([['0xA', vaultA], ['0xB', vaultB]])
    const pairs = getBorrowVaultsByMap(map)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].borrow).toBe(vaultA)
    expect(pairs[0].collateral).toBe(vaultB)
    expect(pairs[0].ltv.borrowLTV).toBe(0.8)
  })

  it('skips LTVs with borrowLTV = 0', () => {
    const vault = makeVault('0xA', [{
      address: '0xB',
      borrowLTV: 0,
      liquidationLTV: 0,
      initialLiquidationLTV: 0,
      targetTimestamp: 0,
      rampDuration: 0n,
    }])
    const map = new Map([['0xA', vault]])
    expect(getBorrowVaultsByMap(map)).toEqual([])
  })

  it('filters out pairs where collateral vault is not in map', () => {
    const vault = makeVault('0xA', [{
      address: '0xMissing',
      borrowLTV: 0.8,
      liquidationLTV: 0.85,
      initialLiquidationLTV: 0.85,
      targetTimestamp: 0,
      rampDuration: 0n,
    }])
    const map = new Map([['0xA', vault]])
    // Collateral vault not in map → pair.collateral is undefined → filtered
    expect(getBorrowVaultsByMap(map)).toEqual([])
  })
})

describe('isCyclicalNoteVault', () => {
  it('returns true for EVK vaults using the fixed cyclical IRM', () => {
    const vault = {
      interestRateModel: {
        type: INTEREST_RATE_MODEL_TYPE.FIXED_CYCLICAL_BINARY,
      },
    } as unknown as EVault

    expect(isCyclicalNoteVault(vault)).toBe(true)
  })

  it('returns false for non-cyclical EVK vaults', () => {
    const vault = {
      interestRateModel: {
        type: INTEREST_RATE_MODEL_TYPE.KINK,
      },
    } as unknown as EVault

    expect(isCyclicalNoteVault(vault)).toBe(false)
  })

  it('returns false for securitize vaults and missing vault data', () => {
    const securitizeVault = {
      type: 'securitize',
    } as SecuritizeCollateralVault

    expect(isCyclicalNoteVault(securitizeVault)).toBe(false)
    expect(isCyclicalNoteVault(null)).toBe(false)
    expect(isCyclicalNoteVault(undefined)).toBe(false)
  })

  it('returns false when the IRM type is missing or not numeric', () => {
    const missingType = {
      interestRateModel: {},
    } as unknown as EVault

    const stringType = {
      interestRateModel: {
        type: `${INTEREST_RATE_MODEL_TYPE.FIXED_CYCLICAL_BINARY}`,
      },
    } as unknown as EVault

    expect(isCyclicalNoteVault(missingType)).toBe(false)
    expect(isCyclicalNoteVault(stringType)).toBe(false)
  })
})
