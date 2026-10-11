/**
 * Real photographs via Unsplash CDN (licensed for free use, including commercial).
 * License: https://unsplash.com/license
 *
 * Who Are You section:
 *   farmerPortrait  — Young Indian farmer standing in cotton agriculture field
 *                     Photo by Unsplash contributor · unsplash.com/photos/lV55D_U5l50
 *   buyerOffice     — Corporate professional at a sustainable green-building office
 *                     Photo by Nastuh Abootalebi · unsplash.com/photos/eHD8Y1Znfpk
 *   buyerForest     — Green corporate building covered in trees (ESG / sustainability)
 *                     Photo by Unsplash contributor · unsplash.com/photos/dqXiw7nCb9Q
 */
export const IMAGES = {
  // ── Hero ──────────────────────────────────────────────────────────────────
  heroFarm:
    "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?auto=format&fit=crop&w=1800&q=80",

  // ── How it works / register panel ────────────────────────────────────────
  farmerField:
    "https://images.unsplash.com/photo-1574943325803-72727bbf0890?auto=format&fit=crop&w=1200&q=80",

  // ── "Who are you?" — Farmer card ─────────────────────────────────────────
  // Young Indian farmer standing in cotton agriculture field (Nagpur region)
  farmerPortrait:
    "https://images.unsplash.com/photo-1589923188900-85dae523342b?auto=format&fit=crop&w=900&q=80",

  // ── "Who are you?" — Buyer card ──────────────────────────────────────────
  // Corporate professional working in a modern sustainable office
  buyerOffice:
    "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=900&q=80",

  // ── Marketplace / registry cards ─────────────────────────────────────────
  greenCrops:
    "https://images.unsplash.com/photo-1500382017468-9049fed747be?auto=format&fit=crop&w=1200&q=80",
  ruralLandscape:
    "https://images.unsplash.com/photo-1586771100165-bfe046b220e0?auto=format&fit=crop&w=1200&q=80",
  handsSoil:
    "https://images.unsplash.com/photo-1464226184556-4ce0891c5f72?auto=format&fit=crop&w=1200&q=80",

  // Green corporate building with trees — ESG / carbon offset visual
  buyerForest:
    "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1600&q=80",

  sunriseFarm:
    "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=1200&q=80",
} as const;

/** Rotating farm photos for marketplace cards */
export const FARM_CARD_IMAGES = [
  IMAGES.greenCrops,
  IMAGES.farmerField,
  IMAGES.ruralLandscape,
  IMAGES.handsSoil,
  IMAGES.sunriseFarm,
  IMAGES.heroFarm,
];

export function farmImageForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i)) % FARM_CARD_IMAGES.length;
  return FARM_CARD_IMAGES[hash]!;
}
  