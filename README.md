# किसान Credit 🌱

> Blockchain-powered carbon credit marketplace for Nagpur district farmers.

Indian farmers absorb millions of tonnes of CO₂ every year through their crops — and get nothing for it. Companies need verified carbon credits for ESG reporting but can't trust international markets. किसान Credit connects them directly: satellite-verified, blockchain-minted, UPI-settled.

---

## How It Works

```
Farmer registers on phone
    ↓ GPS captures exact farm location
Copernicus Sentinel-2 satellite calculates NDVI + CO₂
    ↓ Automated via Make.com pipeline
Admin mints ERC-20 token on Polygon blockchain
    ↓ Immutable, publicly verifiable
Buyer purchases via UPI (Decentro)
    ↓ 90% to farmer · 10% platform fee
Token burns permanently on-chain
    ↓
Buyer receives blockchain-verified impact certificate
```

---

## Features

- **Farmer Dashboard** — Register farm, view NDVI score, CO₂ absorption, estimated earnings
- **Satellite Pipeline** — Automated Copernicus API → NDVI calculation → Supabase update
- **Blockchain** — Solidity ERC-20 contract on Polygon Amoy · Ethers.js v6 · MetaMask
- **Buyer Registry** — Browse verified credits, filter by CO₂/price, purchase via UPI
- **Admin Panel** — Mint tokens, view all farmers/tokens/transactions in one place
- **Impact Certificate** — Blockchain-verified PDF for ESG audit trail

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 · TanStack Router · Tailwind CSS v4 |
| Database | Supabase (PostgreSQL + Realtime + Auth) |
| Blockchain | Solidity · Polygon Amoy · Ethers.js v6 |
| Automation | Make.com · Copernicus Data Space API |
| Payments | Decentro UPI |
| Deployment | Render (backend) · Supabase (DB) |

---

## Getting Started

### Prerequisites
- Node.js 18+
- MetaMask browser extension
- Supabase account
- Copernicus Data Space account

### Setup

```bash
# Clone the repo
git clone https://github.com/priyanshuu-06/kisanCredit.git
cd kisanCredit

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

### Environment Variables

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_CONTRACT_ADDRESS=your_contract_address
VITE_N8N_WEBHOOK_URL=your_make_webhook_url
VITE_DECENTRO_API_KEY=your_decentro_key
VITE_ADMIN_EMAIL=your_admin_email
```

### Run

```bash
npm run dev
```

Open `http://localhost:5173`

---

## Smart Contract

**Contract:** `GEPCC` (Green Earth Platform Carbon Credit)  
**Network:** Polygon Amoy Testnet (Chain ID: 80002)  
**Address:** `0x049a443e7453F16C74229BF188B3A939e2753204`

```solidity
mintToken(address, farmerId, gpsLat, gpsLon, ndviScore, co2Tonnes, amount)
burnToken(uint256 tokenId)
getTokenDetails(uint256 tokenId)
```

---

## Satellite Pipeline (Make.com)

```
Webhook trigger (farmer registered)
    → HTTP POST to Flask server on Render
        → Copernicus auth token
        → Sentinel-2 image search by GPS
        → NDVI = (Band8 - Band4) / (Band8 + Band4)
        → CO2 = NDVI × farm_area_hectares × 10
    → PATCH Supabase farmers table
        { ndvi_score, co2_tonnes, token_status: "pending" }
```

Flask server: `https://kisan-credit-pipeline.onrender.com`

---

## Project Structure

```
src/
├── lib/
│   ├── config.ts        # All env vars and constants
│   ├── db.ts            # All Supabase database functions
│   ├── api.ts           # External API calls (Make, Decentro)
│   ├── blockchain.ts    # MetaMask + contract functions
│   └── nagpur.ts        # Taluka + village data
├── routes/
│   ├── index.tsx        # Landing page
│   ├── register.tsx     # Farmer registration
│   ├── dashboard.tsx    # Farmer dashboard
│   ├── registry.tsx     # Buyer marketplace
│   ├── admin.tsx        # Admin control panel
│   └── certificate.$id.tsx  # Impact certificate
└── components/
    ├── Navbar.tsx
    └── SiteFooter.tsx
docs/
├── Team Aether_KisanCredit.pdf
├── Video Project (1).mp4
```

---

## Team

- **Priyanshu Patil** : Frontend · Blockchain integration · Supabase
- **Kanak Tembhure** : Satellite pipeline · Copernicus API · NDVI engine · Flask backend

---

## License

MIT
