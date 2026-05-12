const KNOWN_DOPPLER_ENVIRONMENTS = new Set(['dev', 'stg', 'prd'])

export function isProductionRuntime(): boolean {
  const dopplerEnvironment = process.env.DOPPLER_ENVIRONMENT?.trim()
  if (dopplerEnvironment && KNOWN_DOPPLER_ENVIRONMENTS.has(dopplerEnvironment)) {
    return dopplerEnvironment === 'prd'
  }

  return process.env.NODE_ENV === 'production'
}

export function isDevelopmentRuntime(): boolean {
  return process.env.DOPPLER_ENVIRONMENT === 'dev'
}
