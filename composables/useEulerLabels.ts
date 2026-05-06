import {
  applyEulerLabelVaultOverrides,
  createEmptyEulerLabelsData,
  getEulerLabelEntitiesByEarnVault,
  getEulerLabelEntitiesByVault,
  getEulerLabelPointsByVault,
  getEulerLabelProductByVault,
  type EulerEarn,
  type EulerLabelsData,
  type EVault,
} from '@eulerxyz/euler-v2-sdk'
import { toReactive, until } from '@vueuse/core'
import { computed, ref, shallowRef, unref, type Ref } from 'vue'
import { logWarn } from '~/utils/errorHandling'
import { invalidateSdkQueries } from '~/utils/sdk-query-cache'
import type { EulerLabelEntity, EulerLabelProduct, EulerLabelPointReward } from '~/entities/euler/labels'
import { eulerLabelProductEmpty } from '~/entities/euler/labels'
import { getEulerSdk } from '~/composables/useEulerSdk'
import { useEulerOracleAdapters } from '~/composables/useEulerOracleAdapters'

const LABEL_QUERY_NAMES = [
  'queryEulerLabelsEntities',
  'queryEulerLabelsProducts',
  'queryEulerLabelsPoints',
  'queryEulerLabelsEarnVaults',
  'queryEulerLabelsAssets',
] as const

const labelsData = shallowRef<EulerLabelsData>(createEmptyEulerLabelsData())
const labelsChainId = ref<number | null>(null)
const labelsVersion = ref(0)
const isLoading = ref(false)
const isReady = ref(false)
let pendingLabelsLoad: Promise<void> | undefined

const setLabelsData = (data: EulerLabelsData, chainId: number | null) => {
  labelsData.value = data
  labelsChainId.value = chainId
  labelsVersion.value += 1
}

export const getCurrentEulerLabelsData = (): EulerLabelsData => labelsData.value

export const getEulerLabelsVersion = (): number => labelsVersion.value

export const __setEulerLabelsDataForTest = (data: Partial<EulerLabelsData> = {}) => {
  setLabelsData({
    ...createEmptyEulerLabelsData(),
    ...data,
    featuredEarnVaults: data.featuredEarnVaults ?? new Set(),
    notExplorableEarnVaults: data.notExplorableEarnVaults ?? new Set(),
    assetPatternRules: data.assetPatternRules ?? [],
  }, null)
  isReady.value = true
  isLoading.value = false
}

const resolveChainId = async (): Promise<number> => {
  const { getCurrentChainConfig, loadEulerConfig } = useEulerAddresses()

  if (!getCurrentChainConfig.value) {
    void loadEulerConfig()
  }
  await until(getCurrentChainConfig).toBeTruthy()

  return getCurrentChainConfig.value!.chainId
}

const products = toReactive(computed(() => labelsData.value.products as Record<string, EulerLabelProduct>))
const entities = toReactive(computed(() => labelsData.value.entities as Record<string, EulerLabelEntity>))
const points = toReactive(computed(() => labelsData.value.points as Record<string, EulerLabelPointReward[]>))
const verifiedVaultAddresses = computed(() => labelsData.value.verifiedVaultAddresses)
const earnVaults = computed(() => labelsData.value.earnVaults)

const loadLabels = async (forceRefresh = false) => {
  if (pendingLabelsLoad && !forceRefresh) return pendingLabelsLoad

  const promise = (async () => {
    const chainId = await resolveChainId()

    if (!forceRefresh && labelsChainId.value === chainId && isReady.value) return

    try {
      isReady.value = false
      isLoading.value = true

      if (labelsChainId.value !== chainId) {
        setLabelsData(createEmptyEulerLabelsData(), chainId)
      }

      if (forceRefresh) {
        await invalidateSdkQueries([...LABEL_QUERY_NAMES])
      }

      const sdk = await getEulerSdk()
      setLabelsData(await sdk.eulerLabelsService.fetchEulerLabelsData(chainId), chainId)
    }
    catch (e) {
      logWarn('labels/load', e)
    }
    finally {
      isLoading.value = false
      isReady.value = true
    }
  })()

  pendingLabelsLoad = promise
  try {
    await promise
  }
  finally {
    if (pendingLabelsLoad === promise) pendingLabelsLoad = undefined
  }
}

export const useEulerLabels = () => {
  const oracleAdapters = useEulerOracleAdapters()

  return {
    isLoading,
    isReady,
    verifiedVaultAddresses,
    products,
    entities,
    points,
    oracleAdapters: oracleAdapters.oracleAdapters,
    earnVaults,
    loadLabels,
    loadOracleAdapter: oracleAdapters.loadOracleAdapter,
    loadOracleAdapters: oracleAdapters.loadOracleAdapters,
    loadAllOracleAdapters: oracleAdapters.loadAllOracleAdapters,
  }
}

export const useEulerProductOfVault = (vaultAddress: string | Ref<string>) => {
  return toReactive(computed(() => {
    const addr = unref(vaultAddress)
    const product = getEulerLabelProductByVault(labelsData.value, addr)
    if (!product) return eulerLabelProductEmpty
    return applyEulerLabelVaultOverrides(product, addr) as EulerLabelProduct
  }))
}

export const useEulerEntitiesOfVault = (vault: EVault | Ref<EVault>) => {
  return toReactive(computed(() =>
    getEulerLabelEntitiesByVault(labelsData.value, unref(vault)) as EulerLabelEntity[],
  ))
}

export const useEulerEntitiesOfEarnVault = (earnVault: EulerEarn | Ref<EulerEarn>) => {
  return toReactive(computed(() =>
    getEulerLabelEntitiesByEarnVault(labelsData.value, unref(earnVault)) as EulerLabelEntity[],
  ))
}

export const useEulerPointsOfVault = (vaultAddress: string | Ref<string>) => {
  return toReactive(computed(() =>
    getEulerLabelPointsByVault(labelsData.value, unref(vaultAddress)) as EulerLabelPointReward[],
  ))
}
