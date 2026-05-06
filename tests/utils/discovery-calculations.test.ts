import { describe, expect, it, vi } from 'vitest'
import {
  STATS_ROWS,
  buildAttributeRowCells,
  getActiveExternalCollateral,
  getAttributeRowColor,
  getAttributeMatrixColumns,
  getCollateralMatrix,
  isNodeRampingDown,
  type VaultUsdCacheEntry,
} from '~/utils/discoveryCalculations'
import type { MarketGroup } from '~/entities/lend-discovery'
import type { EVault, EVaultCollateral, SecuritizeCollateralVault } from '@eulerxyz/euler-v2-sdk'

vi.mock('~/entities/euler/labels', () => ({
  getEulerLabelEntityLogo: () => undefined,
}))

vi.mock('~/utils/eulerLabelsUtils', () => ({
  getEntitiesByVault: () => [],
  isVaultDeprecated: () => false,
}))

vi.stubGlobal('useVaultRegistry', () => ({
  getVaultCategory: () => undefined,
}))

const makeLtv = (overrides: Partial<any> = {}): EVaultCollateral => ({
  address: '0xCollateral',
  borrowLTV: 0,
  liquidationLTV: 0.7,
  currentLiquidationLTV: 0.75,
  isLiquidationLTVRamping: true,
  rampTimeRemaining: 1000n,
  oraclePriceRaw: {
    amountIn: 0n,
    amountOutMid: 0n,
    amountOutBid: 0n,
    amountOutAsk: 0n,
    timestamp: 0,
  },
  ...overrides,
}) as unknown as EVaultCollateral

const makeVault = (address: string, collaterals: EVaultCollateral[]): EVault =>
  ({
    type: 'EVault',
    address,
    collaterals,
    asset: { address, symbol: 'TST' },
  }) as unknown as EVault

const makeSecuritizeVault = (address: string): SecuritizeCollateralVault =>
  ({
    type: 'SecuritizeCollateral',
    address,
    asset: { address, symbol: 'NOTE' },
  }) as unknown as SecuritizeCollateralVault

const makeMarket = (
  vaults: Array<EVault | SecuritizeCollateralVault>,
  externalCollateral: Array<EVault | SecuritizeCollateralVault> = [],
): MarketGroup =>
  ({
    vaults,
    externalCollateral,
  }) as unknown as MarketGroup

describe('isNodeRampingDown', () => {
  it('marks the vault whose own collateral LTV is ramping down after borrow LTV is zeroed', () => {
    const borrowVault = makeVault('0xBorrow', [makeLtv({ address: '0xCollateral' })])
    const collateralVault = makeVault('0xCollateral', [])
    const market = makeMarket([borrowVault, collateralVault])

    expect(isNodeRampingDown(market, '0xBorrow')).toBe(true)
  })

  it('does not mark a collateral vault just because another vault is ramping against it', () => {
    const borrowVault = makeVault('0xBorrow', [makeLtv({ address: '0xCollateral' })])
    const collateralVault = makeVault('0xCollateral', [])
    const market = makeMarket([borrowVault, collateralVault])

    expect(isNodeRampingDown(market, '0xCollateral')).toBe(false)
  })

  it('does not mark completed or upward LTV changes as ramping down', () => {
    const vault = makeVault('0xBorrow', [
      makeLtv({
        liquidationLTV: 0.9,
        currentLiquidationLTV: 0.9,
        isLiquidationLTVRamping: false,
      }),
      makeLtv({
        currentLiquidationLTV: 0.7,
        isLiquidationLTVRamping: false,
      }),
    ])
    const market = makeMarket([vault])

    expect(isNodeRampingDown(market, '0xBorrow')).toBe(false)
  })
})

describe('getCollateralMatrix', () => {
  it('keeps a vault as a matrix column while its liquidation LTV is still ramping down', () => {
    const borrowVault = makeVault('0xBorrow', [makeLtv({ address: '0xCollateral', borrowLTV: 0 })])
    const collateralVault = makeVault('0xCollateral', [])
    const market = makeMarket([borrowVault, collateralVault])

    const matrix = getCollateralMatrix(market)

    expect(matrix).not.toBeNull()
    expect(matrix!.columns.map(col => col.address)).toContain('0xborrow')
    expect(matrix!.rows.map(row => row.address)).toContain('0xcollateral')
  })

  it('drops a vault from matrix columns once all of its collateral relationships are fully ramped out', () => {
    const phasedOutVault = makeVault('0xBorrow', [
      makeLtv({
        address: '0xCollateral',
        borrowLTV: 0,
        liquidationLTV: 0,
        currentLiquidationLTV: 0,
        isLiquidationLTVRamping: false,
      }),
    ])
    const collateralVault = makeVault('0xCollateral', [])
    const market = makeMarket([phasedOutVault, collateralVault])

    expect(getCollateralMatrix(market)).toBeNull()
  })

  it('includes Securitize member vaults referenced as collateral rows', () => {
    const borrowVault = makeVault('0xBorrow', [
      makeLtv({ address: '0xSecuritize', borrowLTV: 0.5 }),
    ])
    const securitizeVault = makeSecuritizeVault('0xSecuritize')
    const market = makeMarket([borrowVault, securitizeVault])

    const matrix = getCollateralMatrix(market)

    expect(matrix).not.toBeNull()
    expect(matrix!.rows).toContainEqual({
      address: '0xsecuritize',
      symbol: 'NOTE',
      assetAddress: '0xSecuritize',
      category: 'external',
    })
  })
})

describe('getActiveExternalCollateral', () => {
  it('keeps an external collateral vault visible while the borrow vault is ramping it out', () => {
    const borrowVault = makeVault('0xBorrow', [
      makeLtv({ address: '0xExternal', borrowLTV: 0 }),
    ])
    const externalVault = makeVault('0xExternal', [])
    const market = makeMarket([borrowVault], [externalVault])

    const active = getActiveExternalCollateral(market)
    expect(active.map(v => (v as EVault).address)).toContain('0xExternal')
  })

  it('drops an external collateral once the relationship is fully ramped out', () => {
    const borrowVault = makeVault('0xBorrow', [
      makeLtv({
        address: '0xExternal',
        borrowLTV: 0,
        liquidationLTV: 0,
        currentLiquidationLTV: 0,
        isLiquidationLTVRamping: false,
      }),
    ])
    const externalVault = makeVault('0xExternal', [])
    const market = makeMarket([borrowVault], [externalVault])

    expect(getActiveExternalCollateral(market)).toEqual([])
  })
})

describe('attribute stats matrix', () => {
  it('includes Securitize member vaults in attribute columns', () => {
    const eVault = makeVault('0xBorrow', [])
    const securitizeVault = makeSecuritizeVault('0xSecuritize')
    const market = makeMarket([eVault, securitizeVault])

    expect(getAttributeMatrixColumns(market).map(column => column.address)).toEqual([
      '0xborrow',
      '0xsecuritize',
    ])
  })

  it('emits numeric values and directional rows for heatmap rendering', () => {
    const vault = {
      ...makeVault('0xStats', []),
      totalCash: 500n,
      totalBorrowed: 500n,
      totalAssets: 1000n,
      availableLiquidity: 500n,
      utilization: 50,
      caps: {
        supplyCap: 1000n,
        borrowCap: 1000n,
        supplyCapUtilization: 40,
        borrowCapUtilization: 50,
      },
      interestRates: {
        supplyAPY: 5,
        borrowAPY: 12,
      },
    } as unknown as EVault
    const usd: VaultUsdCacheEntry = {
      supply: '$1K',
      supplyUsd: 1000,
      borrow: '$500',
      borrowUsd: 500,
      liquidity: '$500',
      liquidityUsd: 500,
      supplyCap: '$1K',
      supplyCapUsd: 1000,
      borrowCap: '$1K',
      borrowCapUsd: 1000,
    }

    const columns = [{ address: vault.address.toLowerCase(), symbol: 'TST', assetAddress: vault.asset.address, vault }]
    const usdCache = new Map([[vault.address.toLowerCase(), usd]])
    const byRow = new Map(STATS_ROWS.map(row => [
      row.id,
      { row, cell: buildAttributeRowCells(row, columns, usdCache)[0] },
    ]))

    expect(byRow.get('totalSupply')!.row.direction).toBe('higher-better')
    expect(byRow.get('totalSupply')!.cell.numeric).toBe(1000)
    expect(byRow.get('totalBorrow')!.row.direction).toBe('lower-better')
    expect(byRow.get('totalBorrow')!.cell.numeric).toBe(500)
    expect(byRow.get('liquidity')!.row.direction).toBe('higher-better')
    expect(byRow.get('liquidity')!.cell.numeric).toBe(500)
    expect(byRow.get('utilization')!.row.direction).toBe('lower-better')
    expect(byRow.get('utilization')!.cell.numeric).toBe(50)
    expect(byRow.get('supplyCapUsage')!.row.direction).toBe('lower-better')
    expect(byRow.get('supplyCapUsage')!.cell.numeric).toBe(40)
    expect(byRow.get('borrowCapUsage')!.row.direction).toBe('lower-better')
    expect(byRow.get('borrowCapUsage')!.cell.numeric).toBe(50)
    expect(byRow.get('supplyApy')!.row.direction).toBe('higher-better')
    expect(byRow.get('supplyApy')!.cell.numeric).toBe(5)
    expect(byRow.get('borrowApy')!.row.direction).toBe('lower-better')
    expect(byRow.get('borrowApy')!.cell.numeric).toBe(12)
  })

  it('colors higher-better rows green at the high end and lower-better rows red at the high end', () => {
    expect(getAttributeRowColor(100, 0, 100, 'higher-better')).toContain('hsla(145')
    expect(getAttributeRowColor(100, 0, 100, 'lower-better')).toContain('hsla(0')
  })
})
