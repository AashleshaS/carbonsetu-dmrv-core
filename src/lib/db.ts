/**
 * All Supabase database operations — single source of truth.
 * Components never import supabase directly; they call these functions.
 */
import { supabase } from "@/integrations/supabase/client";
import { CONFIG } from "./config";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FarmerInput = {
  name: string;
  mobile: string;
  taluka: string;
  village: string;
  gat_number: string;
  latitude: number;
  longitude: number;
  farm_area_acres: number;
};

// ── Farmers ───────────────────────────────────────────────────────────────────

export async function insertFarmer(farmer: FarmerInput) {
  const { data, error } = await supabase
    .from("farmers")
    .insert([{ ...farmer, token_status: "pending" }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getAllFarmers() {
  const { data, error } = await supabase
    .from("farmers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getFarmerById(farmerId: string) {
  const { data, error } = await supabase
    .from("farmers")
    .select("*")
    .eq("id", farmerId)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Called by n8n after NDVI + CO₂ calculation.
 * Also auto-creates a carbon_tokens record so it appears in buyer registry.
 */
export async function updateFarmerNDVI(
  farmerId: string,
  ndviScore: number,
  co2Tonnes: number,
) {
  // 1 — Update farmer record
  const { data: farmer, error: farmerErr } = await supabase
    .from("farmers")
    .update({
      ndvi_score:   ndviScore,
      co2_tonnes:   co2Tonnes,
      token_status: "minted",
    })
    .eq("id", farmerId)
    .select()
    .single();
  if (farmerErr) throw farmerErr;

  // 2 — Auto-create carbon_tokens entry
  const priceInr = Math.round(co2Tonnes * CONFIG.pricing.pricePerTonneCO2);
  await supabase.from("carbon_tokens").insert([{
    farmer_id:        farmerId,
    farmer_name:      farmer.name,
    village:          farmer.village,
    taluka:           farmer.taluka,
    token_amount:     co2Tonnes,
    co2_tonnes:       co2Tonnes,
    ndvi_score:       ndviScore,
    farm_gps_lat:     farmer.latitude,
    farm_gps_lon:     farmer.longitude,
    farm_area_acres:  farmer.farm_area_acres,
    status:           "available",
    price_inr:        priceInr,
    // token_id_onchain is not yet known at NDVI-update time;
    // it is set later by insertToken() when admin mints on-chain.
  }]);

  return farmer;
}

export async function updateFarmerTokenHash(farmerId: string, polygonscanHash: string) {
  const { data, error } = await supabase
    .from("farmers")
    .update({ polygonscan_hash: polygonscanHash, token_status: "minted" })
    .eq("id", farmerId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Alias used by admin mint flow */
export async function updateFarmerMintHash(
  farmerId: string,
  polygonscanHash: string,
  tokenIdOnchain: string,
) {
  return updateFarmerTokenHash(farmerId, polygonscanHash);
  // tokenIdOnchain is stored on carbon_tokens via insertToken(); not duplicated on farmers.
  void tokenIdOnchain;
}

// ── Carbon Tokens ─────────────────────────────────────────────────────────────

export async function getAllTokens() {
  const { data, error } = await supabase
    .from("carbon_tokens")
    .select("*")
    .eq("status", "available")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getTokenById(tokenId: string) {
  const { data, error } = await supabase
    .from("carbon_tokens")
    .select("*")
    .eq("id", tokenId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateTokenStatus(tokenId: string, status: "available" | "sold" | "burned") {
  const { data, error } = await supabase
    .from("carbon_tokens")
    .update({ status })
    .eq("id", tokenId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export type TokenInput = {
  farmer_id: string;
  farmer_name: string;
  village: string;
  taluka: string;
  token_amount: number;
  co2_tonnes: number;
  ndvi_score: number;
  farm_gps_lat: number;
  farm_gps_lon: number;
  farm_area_acres: number;
  polygonscan_hash: string;
  /** On-chain uint256 tokenId returned by KisanCredit.mintToken(). Stored as
   *  string to avoid BigInt → JSON precision loss. Used by burnToken() at
   *  purchase time in registry.tsx. */
  token_id_onchain: string;
  status: "available" | "sold" | "burned";
  price_inr: number;
};

export async function insertToken(token: TokenInput) {
  const { data, error } = await supabase
    .from("carbon_tokens")
    .insert([token])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Purchases ─────────────────────────────────────────────────────────────────

export async function insertPurchase(purchase: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("purchases")
    .insert([purchase])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getPurchaseById(purchaseId: string) {
  const { data, error } = await supabase
    .from("purchases")
    .select("*, carbon_tokens:token_id(*), farmers:farmer_id(*)")
    .eq("id", purchaseId)
    .single();
  if (error) throw error;
  return data;
}

export async function updatePurchaseBurnHash(purchaseId: string, burnHash: string) {
  const { data, error } = await supabase
    .from("purchases")
    .update({ burn_hash: burnHash, status: "completed" })
    .eq("id", purchaseId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Realtime ──────────────────────────────────────────────────────────────────

/**
 * Subscribe to all farmer table changes.
 * Returns the channel — call channel.unsubscribe() on cleanup.
 */
export function subscribeToFarmers(callback: (payload: unknown) => void) {
  const channel = supabase
    .channel("farmers-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "farmers" },
      callback,
    )
    .subscribe();
  return channel;
}
