/**
 * Central configuration — all env vars and constants in one place.
 * Every lib file imports from here. Never read import.meta.env directly in components.
 */
export const CONFIG = {
  supabase: {
    url:     import.meta.env.VITE_SUPABASE_URL     as string,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  },

  blockchain: {
    contractAddress: (import.meta.env.VITE_CONTRACT_ADDRESS ?? "0x049a443e7453F16C74229BF188B3A939e2753204") as string,
    chainId:         80002,
    chainIdHex:      "0x13882",
    chainName:       "Polygon Amoy Testnet",
    rpcUrl:          "https://rpc-amoy.polygon.technology/",
    explorerUrl:     "https://amoy.polygonscan.com",
    nativeCurrency:  { name: "POL", symbol: "POL", decimals: 18 },
  },

  n8n: {
    webhookUrl: (import.meta.env.VITE_N8N_WEBHOOK_URL ?? "") as string,
  },

  decentro: {
    apiKey:  (import.meta.env.VITE_DECENTRO_API_KEY  ?? "") as string,
    baseUrl: (import.meta.env.VITE_DECENTRO_BASE_URL ?? "https://in.decentro.tech") as string,
  },

  pricing: {
    pricePerTonneCO2:    3000,   // ₹ per tonne
    farmerPayoutPercent: 0.80,
    platformFeePercent:  0.20,
  },

  app: {
    url:        (import.meta.env.VITE_APP_URL   ?? "") as string,
    adminEmail: (import.meta.env.VITE_ADMIN_EMAIL ?? "priyanshupatil336@gmail.com") as string,
  },
} as const;
