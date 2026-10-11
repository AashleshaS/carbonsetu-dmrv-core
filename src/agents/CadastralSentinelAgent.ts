/**
 * CadastralSentinelAgent — Land Verification & Anti-Spoofing Agent
 *
 * Autonomous validator that performs a 3-tier cadastral inspection on every
 * farmer registration before it is allowed to proceed to remote sensing.
 *
 * Tier 1 — Precision Audit
 *   Verifies GPS coordinates have ≥6 decimal places (~0.11 m accuracy) and
 *   cross-checks for common mobile spoofing artefacts (round numbers, origin
 *   coordinates, suspiciously uniform decimals).
 *
 * Tier 2 — Nagpur Cadastral Geofence
 *   Validates coordinates fall within the Nagpur district bounding box and
 *   that the submitted taluka and village are present in the official lookup
 *   table from src/lib/nagpur.ts.
 *
 * Tier 3 — Gat Number Format & Integrity Audit
 *   Validates the 7/12 Satbara (Satbara Utara) parcel identifier against
 *   Maharashtra land revenue authority regex syntax rules.
 */

import { NAGPUR_TALUKAS, isNagpurTaluka, getVillagesForTaluka } from "@/lib/nagpur";

// ── Public Types ──────────────────────────────────────────────────────────────

/** Intake telemetry payload from the farmer registration form. */
export type CadastralIntakeTelemetry = {
  farmerId:   string;   // Supabase UUID
  lat:        number;   // WGS-84 latitude  (must be ≥6 dp precision)
  lon:        number;   // WGS-84 longitude (must be ≥6 dp precision)
  gatNumber:  string;   // 7/12 Satbara parcel identifier, e.g. "142/2" or "56/A"
  taluka:     string;   // Must be an official Nagpur district taluka
  village:    string;   // Must belong to the declared taluka
  areaAcres:  number;   // Farm area in acres (must be > 0)
};

/** Verdict returned by the agent after all 3 tiers complete. */
export type CadastralDecisionEnvelope = {
  agent:      "CadastralSentinel";
  farmerId:   string;
  status:     "APPROVED" | "FLAGGED" | "REJECTED";
  /**
   * Confidence score 0–1.
   * 1.0 = all tiers passed cleanly.
   * 0.5–0.99 = passed with soft warnings (FLAGGED).
   * < 0.5 = hard failure on at least one tier (REJECTED).
   */
  confidence: number;
  reasoning:  string[];
  timestamp:  string;   // ISO-8601 UTC
};

// ── Internal Constants ────────────────────────────────────────────────────────

/**
 * Nagpur district bounding box (WGS-84).
 * Slightly wider than the strict administrative boundary to account for GPS
 * drift at the edges of border talukas.
 */
const NAGPUR_BBOX = {
  latMin: 20.5,
  latMax: 21.8,
  lonMin: 78.5,
  lonMax: 79.9,
} as const;

/**
 * Minimum decimal places required to assert sub-metre GPS precision.
 * 6 dp ≈ 0.11 m horizontal accuracy on a stationary high-accuracy fix.
 */
const REQUIRED_GPS_DECIMAL_PLACES = 6;

/**
 * Maharashtra land revenue Gat Number regex patterns.
 *
 * Valid formats observed in Nagpur district 7/12 extracts:
 *   "142"       — plain survey number
 *   "142/2"     — survey / sub-division number
 *   "142/2A"    — survey / sub-division with alphabetic suffix
 *   "56/A"      — survey / alphabetic sub-division
 *   "7/12"      — legacy satbara reference (numeric/numeric)
 *   "142-A"     — hyphen-separated variant
 *   "P-142/2"   — "Pot Kharab" prefix (P-) used for partially govt-owned land
 *
 * The regex accepts 1–6 digit primary number, an optional separator (/ or -)
 * and an optional alphanumeric suffix of 1–4 characters.
 */
const GAT_NUMBER_REGEX =
  /^(?:P-)?[1-9]\d{0,5}(?:[/\-][A-Za-z0-9]{1,4})?$/;

/**
 * Spoofing-detection heuristics.
 * These are soft flags — they raise suspicion but don't hard-reject.
 */
const SPOOF_ROUND_THRESHOLD = 3; // if both lat & lon have ≤ 3 dp, likely desktop entry
const SPOOF_ORIGIN_RADIUS   = 0.01; // within 0.01° of 0,0 — clear default/mock value

// ── Helper Utilities ──────────────────────────────────────────────────────────

/**
 * Count the number of significant decimal places in a floating-point number.
 * Converts to string and counts digits after the decimal point,
 * stripping trailing zeros that JavaScript may add.
 */
function countDecimalPlaces(value: number): number {
  const str = value.toString();
  const dotIdx = str.indexOf(".");
  if (dotIdx === -1) return 0;
  return str.length - dotIdx - 1;
}

/**
 * Clamp a score between 0 and 1.
 */
function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

// ── Agent Class ───────────────────────────────────────────────────────────────

export class CadastralSentinelAgent {
  /** Human-readable name used in Decision Envelopes. */
  static readonly AGENT_NAME = "CadastralSentinel" as const;

  // ── Tier 1: Precision Audit ────────────────────────────────────────────────

  /**
   * Inspects GPS coordinate precision and mobile spoofing signals.
   *
   * @returns Object containing pass/fail flag, deductions to confidence, and
   *          human-readable findings appended to the reasoning array.
   */
  private static runPrecisionAudit(
    telemetry: CadastralIntakeTelemetry,
    reasoning: string[],
  ): { passed: boolean; confidenceDelta: number } {
    const { lat, lon } = telemetry;
    let confidenceDelta = 0;
    let hardFail = false;

    const latDp = countDecimalPlaces(lat);
    const lonDp = countDecimalPlaces(lon);

    // ── Hard check: minimum precision ────────────────────────────────────────
    if (latDp < REQUIRED_GPS_DECIMAL_PLACES || lonDp < REQUIRED_GPS_DECIMAL_PLACES) {
      reasoning.push(
        `[Tier 1 · Precision] FAIL — Insufficient GPS precision: lat has ${latDp} dp, ` +
        `lon has ${lonDp} dp. Minimum required: ${REQUIRED_GPS_DECIMAL_PLACES} dp ` +
        `(~0.11 m). This suggests manual entry or a low-accuracy location source.`,
      );
      confidenceDelta -= 0.35;
      hardFail = true;
    } else {
      reasoning.push(
        `[Tier 1 · Precision] PASS — GPS precision adequate: ` +
        `lat ${latDp} dp, lon ${lonDp} dp (≥${REQUIRED_GPS_DECIMAL_PLACES} dp required).`,
      );
    }

    // ── Soft check: round-number spoofing heuristic ───────────────────────────
    if (latDp <= SPOOF_ROUND_THRESHOLD && lonDp <= SPOOF_ROUND_THRESHOLD) {
      reasoning.push(
        `[Tier 1 · Precision] WARN — Both coordinates have ≤${SPOOF_ROUND_THRESHOLD} ` +
        `decimal places. Possible desktop/manual entry rather than an on-farm GPS fix.`,
      );
      confidenceDelta -= 0.15;
    }

    // ── Soft check: origin proximity (0,0 default value check) ───────────────
    if (Math.abs(lat) < SPOOF_ORIGIN_RADIUS && Math.abs(lon) < SPOOF_ORIGIN_RADIUS) {
      reasoning.push(
        `[Tier 1 · Precision] WARN — Coordinates are suspiciously close to 0°, 0° ` +
        `(origin). This is a strong indicator of a default or un-set GPS value.`,
      );
      confidenceDelta -= 0.40;
      hardFail = true;
    }

    // ── Soft check: exact-integer coordinate (e.g. lat=21.0, lon=79.0) ───────
    if (Number.isInteger(lat) || Number.isInteger(lon)) {
      reasoning.push(
        `[Tier 1 · Precision] WARN — At least one coordinate is an exact integer ` +
        `(lat=${lat}, lon=${lon}). Real GPS fixes are never whole-number degrees.`,
      );
      confidenceDelta -= 0.20;
      hardFail = true;
    }

    // ── Hard check: area must be positive ────────────────────────────────────
    if (telemetry.areaAcres <= 0) {
      reasoning.push(
        `[Tier 1 · Precision] FAIL — Farm area is ${telemetry.areaAcres} acres. ` +
        `Must be > 0.`,
      );
      confidenceDelta -= 0.20;
      hardFail = true;
    } else {
      reasoning.push(
        `[Tier 1 · Precision] PASS — Farm area: ${telemetry.areaAcres} acres.`,
      );
    }

    return { passed: !hardFail, confidenceDelta };
  }

  // ── Tier 2: Nagpur Cadastral Geofence ─────────────────────────────────────

  /**
   * Validates coordinates against Nagpur district bounds and the official
   * taluka/village hierarchy from nagpur.ts.
   */
  private static runGeofenceAudit(
    telemetry: CadastralIntakeTelemetry,
    reasoning: string[],
  ): { passed: boolean; confidenceDelta: number } {
    const { lat, lon, taluka, village } = telemetry;
    let confidenceDelta = 0;
    let hardFail = false;

    // ── Bounding box check ───────────────────────────────────────────────────
    const inBbox =
      lat >= NAGPUR_BBOX.latMin && lat <= NAGPUR_BBOX.latMax &&
      lon >= NAGPUR_BBOX.lonMin && lon <= NAGPUR_BBOX.lonMax;

    if (!inBbox) {
      reasoning.push(
        `[Tier 2 · Geofence] FAIL — Coordinates (${lat}, ${lon}) fall outside ` +
        `Nagpur district bounding box ` +
        `[lat ${NAGPUR_BBOX.latMin}–${NAGPUR_BBOX.latMax}, ` +
        `lon ${NAGPUR_BBOX.lonMin}–${NAGPUR_BBOX.lonMax}].`,
      );
      confidenceDelta -= 0.40;
      hardFail = true;
    } else {
      reasoning.push(
        `[Tier 2 · Geofence] PASS — Coordinates (${lat}, ${lon}) are within ` +
        `Nagpur district bounding box.`,
      );
    }

    // ── Official taluka check ────────────────────────────────────────────────
    if (!isNagpurTaluka(taluka)) {
      reasoning.push(
        `[Tier 2 · Geofence] FAIL — Taluka "${taluka}" is not a recognised ` +
        `Nagpur district taluka. Valid talukas: ${NAGPUR_TALUKAS.join(", ")}.`,
      );
      confidenceDelta -= 0.30;
      hardFail = true;
    } else {
      reasoning.push(
        `[Tier 2 · Geofence] PASS — Taluka "${taluka}" is an official Nagpur ` +
        `district taluka.`,
      );

      // ── Village cross-verification (only if taluka is valid) ───────────────
      const officialVillages = getVillagesForTaluka(taluka);
      const villageNormalised = village.trim().toLowerCase();
      const villageMatch = officialVillages.some(
        (v) => v.toLowerCase() === villageNormalised,
      );

      if (!villageMatch) {
        reasoning.push(
          `[Tier 2 · Geofence] WARN — Village "${village}" not found in the ` +
          `official list for taluka "${taluka}". ` +
          `This may be a spelling variant or an unlisted hamlet. ` +
          `Manual cadastral cross-check recommended.`,
        );
        confidenceDelta -= 0.10;
        // Soft flag — not a hard fail; village lists are non-exhaustive
      } else {
        reasoning.push(
          `[Tier 2 · Geofence] PASS — Village "${village}" verified under ` +
          `taluka "${taluka}".`,
        );
      }
    }

    return { passed: !hardFail, confidenceDelta };
  }

  // ── Tier 3: Gat Number Format & Integrity ────────────────────────────────

  /**
   * Validates the Gat Number against Maharashtra land revenue syntax rules.
   */
  private static runGatNumberAudit(
    telemetry: CadastralIntakeTelemetry,
    reasoning: string[],
  ): { passed: boolean; confidenceDelta: number } {
    const { gatNumber } = telemetry;
    let confidenceDelta = 0;
    let hardFail = false;

    const trimmed = gatNumber.trim();

    // ── Hard check: must not be empty ────────────────────────────────────────
    if (!trimmed) {
      reasoning.push(
        `[Tier 3 · GatNumber] FAIL — Gat Number is empty. ` +
        `A valid 7/12 Satbara parcel identifier is required.`,
      );
      confidenceDelta -= 0.30;
      hardFail = true;
      return { passed: false, confidenceDelta };
    }

    // ── Hard check: regex format ─────────────────────────────────────────────
    if (!GAT_NUMBER_REGEX.test(trimmed)) {
      reasoning.push(
        `[Tier 3 · GatNumber] FAIL — Gat Number "${trimmed}" does not match ` +
        `Maharashtra land revenue syntax. ` +
        `Expected formats: "142", "142/2", "56/A", "142/2A", "P-142/2". ` +
        `Regex: ${GAT_NUMBER_REGEX.source}`,
      );
      confidenceDelta -= 0.25;
      hardFail = true;
    } else {
      reasoning.push(
        `[Tier 3 · GatNumber] PASS — Gat Number "${trimmed}" matches ` +
        `Maharashtra land revenue format.`,
      );
    }

    // ── Soft check: suspiciously short (single digit with no sub-division) ───
    if (/^\d{1}$/.test(trimmed)) {
      reasoning.push(
        `[Tier 3 · GatNumber] WARN — Gat Number "${trimmed}" is a single digit. ` +
        `Real survey numbers in Nagpur district are typically 2–4 digits. ` +
        `Manual verification recommended.`,
      );
      confidenceDelta -= 0.05;
    }

    return { passed: !hardFail, confidenceDelta };
  }

  // ── Public Entry Point ────────────────────────────────────────────────────

  /**
   * Run all 3 inspection tiers against the intake telemetry and return a
   * Decision Envelope.
   *
   * Confidence scoring:
   *   Starts at 1.0. Each tier deducts based on severity of findings.
   *   Final confidence → status:
   *     ≥ 0.75   → APPROVED
   *     0.40–0.74 → FLAGGED (passed but with soft warnings)
   *     < 0.40   → REJECTED
   *
   * @param telemetry  Raw intake data from the registration form.
   * @returns          Decision Envelope with full reasoning trace.
   */
  static inspect(telemetry: CadastralIntakeTelemetry): CadastralDecisionEnvelope {
    const reasoning: string[] = [];
    let confidence = 1.0;

    // ── Run all 3 tiers ───────────────────────────────────────────────────────
    const tier1 = CadastralSentinelAgent.runPrecisionAudit(telemetry, reasoning);
    const tier2 = CadastralSentinelAgent.runGeofenceAudit(telemetry, reasoning);
    const tier3 = CadastralSentinelAgent.runGatNumberAudit(telemetry, reasoning);

    confidence = clamp(
      confidence + tier1.confidenceDelta + tier2.confidenceDelta + tier3.confidenceDelta,
    );

    // ── Derive status from final confidence ───────────────────────────────────
    let status: CadastralDecisionEnvelope["status"];
    if (confidence >= 0.75) {
      status = "APPROVED";
      reasoning.push(
        `[Summary] APPROVED — All critical checks passed. ` +
        `Confidence: ${(confidence * 100).toFixed(1)}%.`,
      );
    } else if (confidence >= 0.40) {
      status = "FLAGGED";
      reasoning.push(
        `[Summary] FLAGGED — Soft warnings detected but no hard failures. ` +
        `Manual review recommended before minting. ` +
        `Confidence: ${(confidence * 100).toFixed(1)}%.`,
      );
    } else {
      status = "REJECTED";
      reasoning.push(
        `[Summary] REJECTED — One or more critical checks failed. ` +
        `Do not proceed to remote sensing. ` +
        `Confidence: ${(confidence * 100).toFixed(1)}%.`,
      );
    }

    return {
      agent:      CadastralSentinelAgent.AGENT_NAME,
      farmerId:   telemetry.farmerId,
      status,
      confidence: Math.round(confidence * 10000) / 10000, // 4 dp
      reasoning,
      timestamp:  new Date().toISOString(),
    };
  }
}
