-- Migration: add token_id_onchain to carbon_tokens
-- This stores the on-chain uint256 tokenId returned by mintToken(),
-- so the burn flow in registry.tsx can pass the correct integer to burnToken().

ALTER TABLE public.carbon_tokens
  ADD COLUMN IF NOT EXISTS token_id_onchain text;

COMMENT ON COLUMN public.carbon_tokens.token_id_onchain IS
  'On-chain uint256 tokenId returned by KisanCredit.mintToken(). '
  'Stored as text to avoid JS BigInt precision loss. '
  'Used by burnToken() at time of purchase.';
