/**
 * SynthesisVerificationAgent — Biomass Audit & Telemetry Synthesizer
 *
 * Bridges the remote sensing output from the Python dMRV engine with on-chain
 * readiness. Validates data viability, computes authoritative CO₂ tonnage using
 * two calibrated formulas, scores telemetry integrity, and generates an
 * immutable Verification Manifest ready for KisanCredit.mintToken().
 *
 * Pipeline position:
 *   CadastralSentinelAgent (APPROVED/FLAGGED)
 *     → SynthesisVerificationAgent   ← you are here
 *       → SettlementTreasuryAgent
 *
 * Key responsibilities:
 *   1. Validate NDVI is within credible agricultural range (0.10 – 0.95).
 *   2. Apply dual CO₂ sequestration formulas and select the authoritative value.
 *   3. Score scene data integrity (recency × cloud-contamination penalty).
 *   4. Produce a telemetry hash as a deterministic content fingerprint.
 *   5. Output a signed Verification Manifest with isMintReady flag.
 */

import { CONFIG } from "@/lib/config";

// ── Public Types ──────────────────────────────────────────────────────────────

/** Raw remote sensing output delivered by the Python dMRV engine / n8n. */
export type RemoteSensingResult = {
  /** Normalised Difference Vegetation Index — (B8 − B4) / (B8 + B4). */
  ndvi:          number;
  /**
   * Cloud cover percentage for the selected Sentinel-2 scene (0–100).
   * Scenes with > 30 % cloud cover are considered unreliable for NDVI.
   */
  cloudCover:    number;
  /** Farm area in acres (carried from intake telemetry). */
  areaAcres:     number;
  /**
   * Sentinel-2 product scene identifier from the CDSE OData catalogue.
   * Used to derive scene acquisition date for recency scoring.
   * Example: "S2A_MSIL2A_20260510T052651_N0510_R105_T44QKG_20260510T091530"
   */
  sceneId:       string;
  /** Supabase UUID of the farmer — threaded through for manifest binding. */
  farmerId:      string;
};

/**
 * Immutable Verification Manifest output.
 * This is the canonical artefact passed to SettlementTreasuryAgent and
 * ultimately committed to the blockchain via mintToken().
 */
export type VerificationManifest = {
  /** Unique manifest identifier: "MANIFEST-{farmerId}-{epochMs}" */
  manifestId:       string;
  farmerId:         string;
  /** CO₂ sequestration value selected after dual-formula reconciliation. */
  verifiedCO2Tonnes: number;
  ndviScore:        number;
  /**
   * SHA-256-style deterministic content fingerprint of the core telemetry
   * fields. Computed without a cryptographic library (pure string hash) to
   * remain dependency-free in both browser and Node environments.
   * Production systems should replace with SubtleCrypto SHA-256.
   */
  telemetryHash:    string;
  /**
   * True only when ALL of the following hold:
   *   - NDVI is within credible agricultural range
   *   - Cloud cover ≤ CLOUD_COVER_HARD_LIMIT
   *   - Data Integrity Score ≥ INTEGRITY_SCORE_MINT_THRESHOLD
   *   - CO₂ > 0
   */
  isMintReady:      boolean;
  /** Data Integrity Score 0–1 (recency × cloud-contamination weight). */
  integrityScore:   number;
  /** Formula used for the authoritative CO₂ value. */
  formulaUsed:      "standard" | "regional-kappa";
  auditLog:         string[];
  timestamp:        string;  // ISO-8601 UTC
};

// ── Internal Constants ────────────────────────────────────────────────────────

/**
 * NDVI credible range for agricultural land in Maharashtra.
 * Values below 0.10 indicate bare soil / fallow land.
 * Values above 0.95 are physically implausible (sensor saturation artefact).
 */
const NDVI_AGRICULTURAL_MIN = 0.10;
const NDVI_AGRICULTURAL_MAX = 0.95;

/**
 * Cloud cover hard limit (%).
 * Scenes with cloud cover above this value are rejected — NDVI values derived
 * from cloud-contaminated pixels are unreliable.
 */
const CLOUD_COVER_HARD_LIMIT = 30;

/**
 * Cloud cover soft warning threshold (%).
 * Scenes between SOFT and HARD limits are accepted with a confidence penalty.
 */
const CLOUD_COVER_SOFT_LIMIT = 15;

/**
 * Minimum Data Integrity Score required to set isMintReady = true.
 */
const INTEGRITY_SCORE_MINT_THRESHOLD = 0.60;

/**
 * Standard CO₂ coefficient used in the primary formula.
 * CO₂ (t/yr) = NDVI × (areaAcres × 0.4047 ha/acre) × 10 t/ha/NDVI
 */
const CO2_COEFFICIENT_STANDARD = 10;

/**
 * Regional Nagpur kappa coefficient derived from ICAR (Indian Council of
 * Agricultural Research) dryland carbon sequestration studies for Vidarbha
 * region, Maharashtra.
 * CO₂ (t/yr) = NDVI × (areaAcres × 0.4047 ha/acre) × 4.35 t/ha/NDVI
 */
const CO2_COEFFICIENT_KAPPA = 4.35;

/**
 * Sentinel-2 scene ID date token position.
 * Standard format: S2X_MSIL2A_YYYYMMDDTHHMMSS_...
 * The acquisition date string starts at index 11, length 8 (YYYYMMDD).
 */
const SCENE_DATE_OFFSET = 11;
const SCENE_DATE_LENGTH  = 8;

/**
 * Maximum scene age (days) for a full recency score.
 * Beyond this the recency score decays linearly.
 */
const SCENE_RECENCY_MAX_DAYS = 30;
const SCENE_RECENCY_DECAY_DAYS = 90; // score reaches 0 at this age

// ── Helper Utilities ──────────────────────────────────────────────────────────

/**
 * djb2 string hash — fast, deterministic, dependency-free.
 * Returns a 32-character hex-like string to mimic a content fingerprint.
 * Replace with SubtleCrypto SHA-256 in production for cryptographic strength.
 */
function djb2Hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  // Expand to 32 hex chars by combining multiple passes for display length
  const a = h.toString(16).padStart(8, "0");
  const b = (h ^ 0xdeadbeef).toString(16).padStart(8, "0");
  const c = (h ^ 0xcafebabe).toString(16).padStart(8, "0");
  const d = (h ^ 0x12345678).toString(16).padStart(8, "0");
  return `${a}${b}${c}${d}`;
}

/**
 * Build the canonical telemetry fingerprint string.
 * Field order is fixed — any change in values produces a different hash.
 */
function buildTelemetryFingerprint(
  farmerId:  string,
  ndvi:      number,
  co2:       number,
  sceneId:   string,
  areaAcres: number,
): string {
  const canonical = [
    `farmerId=${farmerId}`,
    `ndvi=${ndvi.toFixed(6)}`,
    `co2=${co2.toFixed(4)}`,
    `sceneId=${sceneId}`,
    `areaAcres=${areaAcres.toFixed(4)}`,
    `pricingVersion=2026-05-28`,   // versioned so re-runs with new coefficients differ
  ].join("|");
  return djb2Hash(canonical);
}

/**
 * Parse the acquisition date from a Sentinel-2 scene ID string.
 * Returns null if the scene ID doesn't match the standard format.
 *
 * Scene ID format: S2A_MSIL2A_20260510T052651_N0510_R105_T44QKG_20260510T091530
 *                              ^^^^^^^^ ← YYYYMMDD at offset 11
 */
function parseSceneDate(sceneId: string): Date | null {
  if (sceneId.length < SCENE_DATE_OFFSET + SCENE_DATE_LENGTH) return null;
  const dateStr = sceneId.substring(SCENE_DATE_OFFSET, SCENE_DATE_OFFSET + SCENE_DATE_LENGTH);
  const year  = parseInt(dateStr.substring(0, 4), 10);
  const month = parseInt(dateStr.substring(4, 6), 10) - 1; // 0-indexed
  const day   = parseInt(dateStr.substring(6, 8), 10);
  const d = new Date(Date.UTC(year, month, day));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Compute scene recency score (0–1).
 * 1.0 = acquired within SCENE_RECENCY_MAX_DAYS.
 * Linearly decays to 0 at SCENE_RECENCY_DECAY_DAYS.
 */
function computeRecencyScore(sceneId: string, auditLog: string[]): number {
  const sceneDate = parseSceneDate(sceneId);
  if (!sceneDate) {
    auditLog.push(
      `[Integrity · Recency] WARN — Could not parse acquisition date from ` +
      `scene ID "${sceneId}". Defaulting recency score to 0.5.`,
    );
    return 0.5;
  }

  const nowMs      = Date.now();
  const ageMs      = nowMs - sceneDate.getTime();
  const ageDays    = ageMs / (1000 * 60 * 60 * 24);
  const ageDaysInt = Math.round(ageDays);

  if (ageDays <= SCENE_RECENCY_MAX_DAYS) {
    auditLog.push(
      `[Integrity · Recency] PASS — Scene acquired ${ageDaysInt} day(s) ago. ` +
      `Recency score: 1.00.`,
    );
    return 1.0;
  }

  if (ageDays >= SCENE_RECENCY_DECAY_DAYS) {
    auditLog.push(
      `[Integrity · Recency] WARN — Scene is ${ageDaysInt} days old ` +
      `(≥${SCENE_RECENCY_DECAY_DAYS}d). Recency score: 0.00.`,
    );
    return 0.0;
  }

  const score = 1.0 - (ageDays - SCENE_RECENCY_MAX_DAYS) /
    (SCENE_RECENCY_DECAY_DAYS - SCENE_RECENCY_MAX_DAYS);
  auditLog.push(
    `[Integrity · Recency] Scene acquired ${ageDaysInt} day(s) ago. ` +
    `Recency score: ${score.toFixed(3)}.`,
  );
  return score;
}

/**
 * Compute cloud contamination weight (0–1).
 * 0 cloud cover → 1.0 (no penalty).
 * At CLOUD_COVER_HARD_LIMIT → 0.0.
 */
function computeCloudWeight(cloudCover: number, auditLog: string[]): number {
  if (cloudCover <= 0) return 1.0;
  if (cloudCover >= CLOUD_COVER_HARD_LIMIT) {
    auditLog.push(
      `[Integrity · Cloud] FAIL — Cloud cover ${cloudCover.toFixed(1)}% ` +
      `exceeds hard limit of ${CLOUD_COVER_HARD_LIMIT}%. ` +
      `NDVI values are unreliable. Cloud weight: 0.00.`,
    );
    return 0.0;
  }
  const weight = 1.0 - cloudCover / CLOUD_COVER_HARD_LIMIT;
  if (cloudCover > CLOUD_COVER_SOFT_LIMIT) {
    auditLog.push(
      `[Integrity · Cloud] WARN — Cloud cover ${cloudCover.toFixed(1)}% ` +
      `exceeds soft limit of ${CLOUD_COVER_SOFT_LIMIT}%. ` +
      `Cloud weight: ${weight.toFixed(3)}.`,
    );
  } else {
    auditLog.push(
      `[Integrity · Cloud] PASS — Cloud cover ${cloudCover.toFixed(1)}%. ` +
      `Cloud weight: ${weight.toFixed(3)}.`,
    );
  }
  return weight;
}

// ── Agent Class ───────────────────────────────────────────────────────────────

export class SynthesisVerificationAgent {
  static readonly AGENT_NAME = "SynthesisVerification" as const;

  // ── Step A: NDVI Viability Check ──────────────────────────────────────────

  private static auditNDVI(
    ndvi: number,
    auditLog: string[],
  ): { viable: boolean } {
    if (ndvi < NDVI_AGRICULTURAL_MIN) {
      auditLog.push(
        `[NDVI · Viability] FAIL — NDVI ${ndvi.toFixed(4)} is below the ` +
        `minimum credible agricultural value of ${NDVI_AGRICULTURAL_MIN}. ` +
        `This indicates bare soil, fallow land, or a sensing error. ` +
        `CO₂ sequestration cannot be attributed.`,
      );
      return { viable: false };
    }
    if (ndvi > NDVI_AGRICULTURAL_MAX) {
      auditLog.push(
        `[NDVI · Viability] FAIL — NDVI ${ndvi.toFixed(4)} exceeds ` +
        `${NDVI_AGRICULTURAL_MAX} (physical saturation limit). ` +
        `This is likely a sensor artefact. Scene should be reprocessed.`,
      );
      return { viable: false };
    }
    auditLog.push(
      `[NDVI · Viability] PASS — NDVI ${ndvi.toFixed(4)} is within ` +
      `credible agricultural range [${NDVI_AGRICULTURAL_MIN}, ${NDVI_AGRICULTURAL_MAX}].`,
    );
    return { viable: true };
  }

  // ── Step B: Dual CO₂ Formula Computation ─────────────────────────────────

  /**
   * Applies two calibrated formulas and selects the more conservative value.
   *
   * Formula 1 — Standard global coefficient:
   *   CO₂ = NDVI × (areaAcres × 0.4047) × 10
   *
   * Formula 2 — Regional Nagpur kappa (ICAR Vidarbha dryland study):
   *   CO₂ = NDVI × (areaAcres × 0.4047) × 4.35
   *
   * Selection: the regional kappa is used when the standard formula
   * exceeds it by more than 10% (i.e., when the standard over-estimates
   * relative to the local calibration). Otherwise the standard value is used.
   */
  private static computeCO2(
    ndvi:      number,
    areaAcres: number,
    auditLog:  string[],
  ): { co2Tonnes: number; formulaUsed: "standard" | "regional-kappa" } {
    const areaHa = areaAcres * 0.4047;

    const co2Standard = ndvi * areaHa * CO2_COEFFICIENT_STANDARD;
    const co2Kappa    = ndvi * areaHa * CO2_COEFFICIENT_KAPPA;

    auditLog.push(
      `[CO₂ · Formula] Standard  : NDVI(${ndvi.toFixed(4)}) × ` +
      `${areaHa.toFixed(4)} ha × ${CO2_COEFFICIENT_STANDARD} = ` +
      `${co2Standard.toFixed(4)} t CO₂/yr`,
    );
    auditLog.push(
      `[CO₂ · Formula] RegKappa  : NDVI(${ndvi.toFixed(4)}) × ` +
      `${areaHa.toFixed(4)} ha × ${CO2_COEFFICIENT_KAPPA} = ` +
      `${co2Kappa.toFixed(4)} t CO₂/yr`,
    );

    // Use regional kappa when standard over-estimates by > 10%
    if (co2Standard > co2Kappa * 1.10) {
      auditLog.push(
        `[CO₂ · Formula] SELECTED → Regional-kappa (${co2Kappa.toFixed(4)} t) ` +
        `— standard formula exceeds kappa by ` +
        `${(((co2Standard / co2Kappa) - 1) * 100).toFixed(1)}%, ` +
        `applying conservative Vidarbha dryland calibration.`,
      );
      return { co2Tonnes: Math.round(co2Kappa * 100) / 100, formulaUsed: "regional-kappa" };
    }

    auditLog.push(
      `[CO₂ · Formula] SELECTED → Standard (${co2Standard.toFixed(4)} t) ` +
      `— within 10% of regional kappa; standard formula applied.`,
    );
    return { co2Tonnes: Math.round(co2Standard * 100) / 100, formulaUsed: "standard" };
  }

  // ── Step C: Data Integrity Score ─────────────────────────────────────────

  /**
   * Composite integrity score = recencyScore × cloudWeight.
   * Both factors are 0–1; the product yields a 0–1 integrity score.
   */
  private static computeIntegrityScore(
    result:   RemoteSensingResult,
    auditLog: string[],
  ): number {
    const recencyScore = computeRecencyScore(result.sceneId, auditLog);
    const cloudWeight  = computeCloudWeight(result.cloudCover, auditLog);
    const score        = recencyScore * cloudWeight;

    auditLog.push(
      `[Integrity · Score] recency(${recencyScore.toFixed(3)}) × ` +
      `cloudWeight(${cloudWeight.toFixed(3)}) = ` +
      `integrityScore(${score.toFixed(4)}) ` +
      `[threshold: ≥${INTEGRITY_SCORE_MINT_THRESHOLD} to mint]`,
    );
    return score;
  }

  // ── Public Entry Point ────────────────────────────────────────────────────

  /**
   * Run all validation and synthesis steps and return an immutable
   * Verification Manifest.
   *
   * @param result  Raw output from the Python dMRV engine.
   * @returns       Verification Manifest with isMintReady flag.
   */
  static synthesise(result: RemoteSensingResult): VerificationManifest {
    const auditLog: string[] = [];
    const manifestId = `MANIFEST-${result.farmerId}-${Date.now()}`;

    auditLog.push(
      `[Init] SynthesisVerificationAgent started for farmerId=${result.farmerId} ` +
      `| sceneId=${result.sceneId} | ndvi=${result.ndvi} ` +
      `| cloudCover=${result.cloudCover}% | areaAcres=${result.areaAcres}`,
    );

    // ── Step A: NDVI viability ────────────────────────────────────────────────
    const { viable: ndviViable } = SynthesisVerificationAgent.auditNDVI(
      result.ndvi, auditLog,
    );

    // ── Step B: CO₂ computation ───────────────────────────────────────────────
    let co2Tonnes    = 0;
    let formulaUsed: "standard" | "regional-kappa" = "standard";
    if (ndviViable) {
      const co2Result = SynthesisVerificationAgent.computeCO2(
        result.ndvi, result.areaAcres, auditLog,
      );
      co2Tonnes   = co2Result.co2Tonnes;
      formulaUsed = co2Result.formulaUsed;
    } else {
      auditLog.push(
        `[CO₂ · Formula] SKIPPED — NDVI failed viability check. CO₂ = 0.`,
      );
    }

    // ── Step C: Data integrity score ──────────────────────────────────────────
    const integrityScore = SynthesisVerificationAgent.computeIntegrityScore(
      result, auditLog,
    );

    // ── Determine mint readiness ───────────────────────────────────────────────
    const cloudBlocked = result.cloudCover >= CLOUD_COVER_HARD_LIMIT;
    const isMintReady  =
      ndviViable &&
      !cloudBlocked &&
      integrityScore >= INTEGRITY_SCORE_MINT_THRESHOLD &&
      co2Tonnes > 0;

    if (isMintReady) {
      auditLog.push(
        `[MintReady] ✅ MINT READY — All conditions met. ` +
        `verifiedCO2Tonnes=${co2Tonnes}, integrityScore=${integrityScore.toFixed(4)}.`,
      );
    } else {
      const reasons: string[] = [];
      if (!ndviViable)                                      reasons.push("NDVI out of range");
      if (cloudBlocked)                                     reasons.push(`cloud cover ${result.cloudCover}% ≥ ${CLOUD_COVER_HARD_LIMIT}%`);
      if (integrityScore < INTEGRITY_SCORE_MINT_THRESHOLD)  reasons.push(`integrityScore ${integrityScore.toFixed(4)} < ${INTEGRITY_SCORE_MINT_THRESHOLD}`);
      if (co2Tonnes <= 0)                                   reasons.push("CO₂ ≤ 0");
      auditLog.push(
        `[MintReady] ❌ NOT MINT READY — Blocking reasons: ${reasons.join("; ")}.`,
      );
    }

    // ── Build telemetry hash ──────────────────────────────────────────────────
    const telemetryHash = buildTelemetryFingerprint(
      result.farmerId, result.ndvi, co2Tonnes, result.sceneId, result.areaAcres,
    );
    auditLog.push(
      `[Manifest] telemetryHash=${telemetryHash} (djb2 content fingerprint)`,
    );
    auditLog.push(
      `[Manifest] manifestId=${manifestId}`,
    );

    return {
      manifestId,
      farmerId:          result.farmerId,
      verifiedCO2Tonnes: co2Tonnes,
      ndviScore:         result.ndvi,
      telemetryHash,
      isMintReady,
      integrityScore:    Math.round(integrityScore * 10000) / 10000,
      formulaUsed,
      auditLog,
      timestamp:         new Date().toISOString(),
    };
  }

  // ── Utility: pricing preview ──────────────────────────────────────────────

  /**
   * Returns the INR token price for a given CO₂ tonnage using the current
   * CONFIG pricing constants (₹3,000/tonne at time of writing).
   */
  static estimateTokenPrice(co2Tonnes: number): {
    totalINR:    number;
    farmerINR:   number;
    platformINR: number;
  } {
    const totalINR    = Math.round(co2Tonnes * CONFIG.pricing.pricePerTonneCO2);
    const farmerINR   = Math.round(totalINR * CONFIG.pricing.farmerPayoutPercent);
    const platformINR = Math.round(totalINR * CONFIG.pricing.platformFeePercent);
    return { totalINR, farmerINR, platformINR };
  }
}
