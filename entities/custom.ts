export const links = [
  {
    title: 'Docs',
    url: 'https://github.com/',
  },
  {
    title: 'Terms of Use',
    url: 'https://github.com/',
  },
] as const

export const socials = {
  x: 'https://x.com/',
  discord: 'https://discord.com/',
  telegram: 'https://t.me/',
  github: 'https://github.com/',
} as const

// SEO defaults for the app (used in nuxt.config.ts).
export const appTitle = 'Euler Lite'
export const appDescription = 'Lightweight interface for Euler Finance lending and borrowing.'

// Base hue for the app theme in degrees (0-360). Change to shift the brand palette.
export const themeHue = 150

export const enableIntrinsicApy = true // defillama
export const intrinsicApySources = [
  { symbol: 'steth', project: 'lido' },
  { symbol: 'wsteth', sourceSymbol: 'steth', project: 'lido' },
  { symbol: 'reth', project: 'rocket-pool' },
  { symbol: 'cbeth', project: 'coinbase-wrapped-staked-eth' },
  { symbol: 'sfrxeth', project: 'frax-ether' },
  { symbol: 'sweth', project: 'swell-liquid-staking' },
  { symbol: 'weeth', project: 'ether.fi-stake' },
  { symbol: 'ezeth', project: 'renzo' },
  { symbol: 'ethx', project: 'stader' },
  { symbol: 'oseth', project: 'stakewise-v2' },
  { symbol: 'ankreth', project: 'ankr' },
  { symbol: 'syrupusdc', project: 'maple' },
  { symbol: 'susds', project: 'spark-lending' },

] as const

export const availableNetworkIds = [
  42161,
] as const

export const labelsRepo: string = 'kanvgupta/euler-labels' // https://github.com/euler-xyz/euler-labels

export const onboardingInfo = {
  logoUrl: '/logo.png',
  title: 'The Lending Super App',
  description: 'Lend, borrow and build without limits.',
}
