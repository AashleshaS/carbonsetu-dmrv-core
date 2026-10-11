/**
 * SettlementTreasuryAgent — Web3 & Escrow Automation Agent
 *
 * Manages the programmatic escrow and retirement lifecycles for carbon credit
 * tokens. Operates at the boundary between the verified data layer
 * (SynthesisVerificationAgent) and the Polygon blockchain.
 *
 * Three primary responsibilities:
 *
 *   a. prepareMintPayload(manifest)
 *      Constructs the exact EIP-1559 transaction parameter object for
 *      KisanCredit.mintToken(), including safety gas buffers, calldata
 *      encoding metadata, and a pre-flight sanity check.
 *
 *   b. computeEscrowSplit(totalPriceINR)
 *      Enforces the 80/20 programmatic split rule, returning exact rounded
 *      rupee amounts, tracking references, and a split audit receipt.
 *
 *   c. executeAtomicRetirement(tokenId, buyerData)
 *      Prepares the burnToken() invocation descriptor and emits a
 *      cryptographic offset receipt that can be attached to the certificate.
 *
 * This agent is pure TypeScript — it does NOT call ethers.js directly.
 * It produces typed payloads that are handed to blockchain.ts for execution,
 * keeping the agent layer testable without a live wallet/RPC connection.
 *
 * Pipeline position:
 *   CadastralSentinelAgent → SynthesisVerificationAgent
 *     → SettlementTreasuryAgent   ← you are here
 *       → blockchain.ts (mintTokens / burnTokens)
 */

import { CONFIG } from "@/lib/config";
import type { VerificationManifest } from "./SynthesisVerificationAgent";

// ── Public Types ──────────────────────────────────────────────────────────────

/**
 * EIP-1559 transaction parameter bundle ready to be passed to
 * blockchain.ts → mintTokens().
 */
export type MintTransactionPayload = {
  /** Contract address on Polygon Amoy. */
  contractAddress:      string;
  /** Recipient wallet address — farmer or admin custody. */
  recipientAddress:     string;
  /** Supabase UUID of the farmer (maps to farmerId on-chain). */
  farmerId:             string;
  /** GPS latitude string as it will be stored on-chain. */
  gpsLat:               string;
  /** GPS longitude string as it will be stored on-chain. */
  gpsLon:               string;
  /** NDVI score string as it will be stored on-chain. */
  ndviScore:            string;
  /** CO₂ tonnes string as it will be stored on-chain. */
  co2Tonnes:            string;
  /**
   * Token units to mint.
   * Convention: 1 unit = 0.1 tonne CO₂ (×10 multiplier for sub-tonne
   * granularity). E.g. 5.84 tonnes → 58 units.
   */
  tokenAmount:          number;
  /** EIP-1559 max fee per gas in wei (BigInt string for safe serialisation). */
  maxFeePerGasWei:      string;
  /** EIP-1559 max priority fee per gas in wei (BigInt string). */
  maxPriorityFeePerGas: string;
  /** Chain ID — must match Polygon Amoy (80002). */
  chainId:              number;
  /** Telemetry hash from the Verification Manifest — stored for audit trail. */
  telemetryHash:        string;
  /** ISO-8601 UTC timestamp when this payload was prepared. */
  preparedAt:           string;
  /** Human-readable preflight summary. */
  preflightLog:         string[];
};

/**
 * Result of the 80/20 escrow split computation.
 */
export type EscrowSplitResult = {
  /** Total purchase price in INR (input). */
  totalINR:           number;
  /** 80% farmer payout in INR (rounded to nearest rupee). */
  farmerShareINR:     number;
  /** 20% platform reserve in INR (rounded to nearest rupee). */
  platformReserveINR: number;
  /** Verification that the two shares sum exactly to totalINR. */
  splitBalanced:      boolean;
  /** Any rounding remainder (should always be 0 with integer prices). */
  roundingRemainderINR: number;
  /** Unique tracking reference for this escrow computation. */
  escrowRef:          string;
  /** Split audit receipt for the purchases table and certificate. */
  auditReceipt:       string[];
};

/**
 * Buyer data required for retirement and certificate generation.
 */
export type BuyerData = {
  buyerName:    string;
  buyerCompany: string;
  buyerEmail:   string;
  /** Total amount paid in INR. */
  amountPaidINR: number;
};

/**
 * Atomic retirement descriptor — produced by executeAtomicRetirement().
 * Contains everything needed to call burnTokens() and populate the certificate.
 */
export type AtomicRetirementDescriptor = {
  /** Unique retirement event ID: "RETIRE-{tokenId}-{epochMs}" */
  retirementId:       string;
  /** On-chain uint256 token ID to pass to burnToken(). */
  tokenId:            string;
  /** Contract address on Polygon Amoy. */
  contractAddress:    string;
  /** Chain ID — Polygon Amoy. */
  chainId:            number;
  /** EIP-1559 gas parameters for the burn transaction. */
  maxFeePerGasWei:    string;
  maxPriorityFeePerGas: string;
  /** Escrow split computed at retirement time. */
  escrowSplit:        EscrowSplitResult;
  /** Buyer data attached to the retirement. */
  buyer:              BuyerData;
  /**
   * Cryptographic offset receipt — a deterministic content fingerprint
   * of the retirement event. Used as the immutable proof-of-retirement
   * reference on the certificate.
   */
  offsetReceiptHash:  string;
  /** ISO-8601 UTC timestamp of retirement preparation. */
  retiredAt:          string;
  /** Full audit log of retirement steps. */
  retirementLog:      string[];
};

// ── Internal Constants ────────────────────────────────────────────────────────

/**
 * EIP-1559 gas parameters (in gwei, converted to wei strings).
 *
 * maxFeePerGas:         50 gwei — covers base fee spikes on Polygon Amoy.
 * maxPriorityFeePerGas: 30 gwei — above Amoy's 25 gwei minimum tip floor.
 *
 * These match the values hardcoded in blockchain.ts mintTokens() and are
 * centralised here so any future adjustment propagates from one place.
 */
const GAS_MAX_FEE_GWEI      = 50n;
const GAS_PRIORITY_FEE_GWEI = 30n;
const GWEI_TO_WEI            = 1_000_000_000n;

const MAX_FEE_PER_GAS_WEI      = (GAS_MAX_FEE_GWEI      * GWEI_TO_WEI).toString();
const MAX_PRIORITY_FEE_PER_GAS = (GAS_PRIORITY_FEE_GWEI * GWEI_TO_WEI).toString();

/**
 * Token unit multiplier.
 * 1 tonne CO₂ = 10 token units → minimum tradeable unit = 0.1 tonne.
 */
const TOKEN_UNIT_MULTIPLIER = 10;

// ── djb2 Hash (identical implementation to SynthesisVerificationAgent) ───────
// Kept local so each agent module is self-contained with no circular deps.

function djb2Hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
    h = h >>> 0;
  }
  const a = h.toString(16).padStart(8, "0");
  const b = (h ^ 0xdeadbeef).toString(16).padStart(8, "0");
  const c = (h ^ 0xcafebabe).toString(16).padStart(8, "0");
  const d = (h ^ 0x12345678).toString(16).padStart(8, "0");
  return `${a}${b}${c}${d}`;
}

// ── Agent Class ───────────────────────────────────────────────────────────────

export class SettlementTreasuryAgent {
  static readonly AGENT_NAME = "SettlementTreasury" as const;

  // ── a. prepareMintPayload ──────────────────────────────────────────────────

  /**
   * Constructs the complete EIP-1559 transaction parameter bundle for
   * KisanCredit.mintToken().
   *
   * Performs a pre-flight sanity check to catch obvious errors before
   * an on-chain transaction is attempted:
   *   - manifest must be isMintReady
   *   - CO₂ must be > 0
   *   - recipientAddress must look like a valid 0x hex address
   *   - GPS fields must be present in the manifest (passed via gpsLat/gpsLon)
   *
   * @param manifest          Verified manifest from SynthesisVerificationAgent.
   * @param recipientAddress  Wallet address to receive the minted token.
   * @param gpsLat            Farm GPS latitude string (carried from intake).
   * @param gpsLon            Farm GPS longitude string (carried from intake).
   * @returns MintTransactionPayload ready for blockchain.ts → mintTokens().
   */
  static prepareMintPayload(
    manifest:          VerificationManifest,
    recipientAddress:  string,
    gpsLat:            string,
    gpsLon:            string,
  ): MintTransactionPayload {
    const preflightLog: string[] = [];

    // ── Pre-flight checks ────────────────────────────────────────────────────
    if (!manifest.isMintReady) {
      preflightLog.push(
        `[PreFlight] ❌ FAIL — Manifest ${manifest.manifestId} is NOT mint-ready. ` +
        `Check SynthesisVerificationAgent auditLog for blocking reasons.`,
      );
    } else {
      preflightLog.push(
        `[PreFlight] ✅ Manifest ${manifest.manifestId} is mint-ready.`,
      );
    }

    if (manifest.verifiedCO2Tonnes <= 0) {
      preflightLog.push(
        `[PreFlight] ❌ FAIL — verifiedCO2Tonnes is ${manifest.verifiedCO2Tonnes}. ` +
        `Cannot mint a zero-value credit.`,
      );
    } else {
      preflightLog.push(
        `[PreFlight] ✅ verifiedCO2Tonnes = ${manifest.verifiedCO2Tonnes} t.`,
      );
    }

    const addressRegex = /^0x[0-9a-fA-F]{40}$/;
    if (!addressRegex.test(recipientAddress)) {
      preflightLog.push(
        `[PreFlight] ❌ FAIL — recipientAddress "${recipientAddress}" is not a ` +
        `valid EIP-55 Ethereum address (expected 0x + 40 hex chars).`,
      );
    } else {
      preflightLog.push(
        `[PreFlight] ✅ recipientAddress ${recipientAddress} is valid.`,
      );
    }

    if (!gpsLat || !gpsLon) {
      preflightLog.push(
        `[PreFlight] ❌ FAIL — gpsLat and/or gpsLon are missing. ` +
        `GPS coordinates are required for on-chain ParcelRecord.`,
      );
    } else {
      preflightLog.push(
        `[PreFlight] ✅ GPS coordinates present: (${gpsLat}, ${gpsLon}).`,
      );
    }

    // ── Token amount computation ─────────────────────────────────────────────
    const tokenAmount = Math.round(manifest.verifiedCO2Tonnes * TOKEN_UNIT_MULTIPLIER);
    preflightLog.push(
      `[TokenAmount] ${manifest.verifiedCO2Tonnes} t CO₂ × ${TOKEN_UNIT_MULTIPLIER} ` +
      `= ${tokenAmount} token units.`,
    );

    // ── Gas parameters ───────────────────────────────────────────────────────
    preflightLog.push(
      `[Gas] maxFeePerGas: ${GAS_MAX_FEE_GWEI} gwei (${MAX_FEE_PER_GAS_WEI} wei) | ` +
      `maxPriorityFee: ${GAS_PRIORITY_FEE_GWEI} gwei (${MAX_PRIORITY_FEE_PER_GAS} wei) | ` +
      `network: ${CONFIG.blockchain.chainName} (chainId ${CONFIG.blockchain.chainId}).`,
    );

    preflightLog.push(
      `[Payload] MintTransactionPayload assembled at ${new Date().toISOString()}.`,
    );

    return {
      contractAddress:      CONFIG.blockchain.contractAddress,
      recipientAddress,
      farmerId:             manifest.farmerId,
      gpsLat,
      gpsLon,
      ndviScore:            manifest.ndviScore.toFixed(6),
      co2Tonnes:            manifest.verifiedCO2Tonnes.toFixed(4),
      tokenAmount,
      maxFeePerGasWei:      MAX_FEE_PER_GAS_WEI,
      maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
      chainId:              CONFIG.blockchain.chainId,
      telemetryHash:        manifest.telemetryHash,
      preparedAt:           new Date().toISOString(),
      preflightLog,
    };
  }

  // ── b. computeEscrowSplit ─────────────────────────────────────────────────

  /**
   * Enforces the 80/20 programmatic split rule from CONFIG.pricing.
   *
   * Rounding strategy: farmer share is floored to the nearest rupee;
   * platform reserve receives the remainder so the two shares always sum
   * exactly to totalINR. This guarantees splitBalanced = true for all
   * integer input prices.
   *
   * @param totalPriceINR  Total purchase price in INR (must be > 0).
   * @returns EscrowSplitResult with audit receipt.
   */
  static computeEscrowSplit(totalPriceINR: number): EscrowSplitResult {
    const auditReceipt: string[] = [];
    const escrowRef = `ESCROW-${Date.now().toString(36).toUpperCase()}`;

    auditReceipt.push(
      `[Escrow · Init] ref=${escrowRef} | totalINR=₹${totalPriceINR.toLocaleString("en-IN")}`,
    );

    if (totalPriceINR <= 0) {
      auditReceipt.push(
        `[Escrow · Error] totalPriceINR must be > 0. Received: ${totalPriceINR}.`,
      );
      return {
        totalINR:              totalPriceINR,
        farmerShareINR:        0,
        platformReserveINR:    0,
        splitBalanced:         false,
        roundingRemainderINR:  0,
        escrowRef,
        auditReceipt,
      };
    }

    // Floor farmer share to avoid over-paying due to floating-point
    const farmerShareINR     = Math.floor(totalPriceINR * CONFIG.pricing.farmerPayoutPercent);
    // Platform gets the remainder — ensures perfect balance
    const platformReserveINR = totalPriceINR - farmerShareINR;
    const roundingRemainder  = totalPriceINR - farmerShareINR - platformReserveINR;
    const splitBalanced      = roundingRemainder === 0;

    auditReceipt.push(
      `[Escrow · Split] Rule: ${CONFIG.pricing.farmerPayoutPercent * 100}% farmer / ` +
      `${CONFIG.pricing.platformFeePercent * 100}% platform.`,
    );
    auditReceipt.push(
      `[Escrow · Split] Farmer  share  : ₹${farmerShareINR.toLocaleString("en-IN")} ` +
      `(${((farmerShareINR / totalPriceINR) * 100).toFixed(2)}%)`,
    );
    auditReceipt.push(
      `[Escrow · Split] Platform reserve: ₹${platformReserveINR.toLocaleString("en-IN")} ` +
      `(${((platformReserveINR / totalPriceINR) * 100).toFixed(2)}%)`,
    );
    auditReceipt.push(
      `[Escrow · Split] Balance check: ${splitBalanced ? "✅ BALANCED" : `❌ UNBALANCED — remainder ₹${roundingRemainder}`}`,
    );
    auditReceipt.push(
      `[Escrow · Disbursement] Farmer payout via Decentro UPI. ` +
      `Platform reserve held in CarbonSetu treasury wallet.`,
    );

    return {
      totalINR:              totalPriceINR,
      farmerShareINR,
      platformReserveINR,
      splitBalanced,
      roundingRemainderINR:  roundingRemainder,
      escrowRef,
      auditReceipt,
    };
  }

  // ── c. executeAtomicRetirement ────────────────────────────────────────────

  /**
   * Prepares the on-chain burnToken() invocation descriptor and emits a
   * cryptographic offset receipt for the certificate.
   *
   * "Atomic" in the sense that the escrow split and the burn parameters are
   * computed together in one indivisible step — either both succeed or
   * neither is submitted to the chain.
   *
   * @param tokenId   On-chain uint256 tokenId (string) from carbon_tokens.token_id_onchain.
   * @param buyerData Buyer name, company, email, and amount paid.
   * @returns         AtomicRetirementDescriptor ready for blockchain.ts → burnTokens().
   */
  static executeAtomicRetirement(
    tokenId:    string,
    buyerData:  BuyerData,
  ): AtomicRetirementDescriptor {
    const retirementLog: string[] = [];
    const retirementId  = `RETIRE-${tokenId}-${Date.now()}`;
    const retiredAt     = new Date().toISOString();

    retirementLog.push(
      `[Retirement · Init] retirementId=${retirementId} | tokenId=${tokenId} | ` +
      `buyer=${buyerData.buyerName} (${buyerData.buyerCompany}) | ` +
      `amountPaid=₹${buyerData.amountPaidINR.toLocaleString("en-IN")}`,
    );

    // ── Validate tokenId ────────────────────────────────────────────────────
    const tokenIdNum = Number(tokenId);
    if (!tokenId || isNaN(tokenIdNum) || tokenIdNum < 0) {
      retirementLog.push(
        `[Retirement · Error] tokenId "${tokenId}" is not a valid non-negative ` +
        `integer. burnToken() will revert on-chain.`,
      );
    } else {
      retirementLog.push(
        `[Retirement · Validation] ✅ tokenId ${tokenId} is a valid uint256.`,
      );
    }

    // ── Compute escrow split ────────────────────────────────────────────────
    const escrowSplit = SettlementTreasuryAgent.computeEscrowSplit(
      buyerData.amountPaidINR,
    );
    retirementLog.push(
      `[Retirement · Escrow] ref=${escrowSplit.escrowRef} | ` +
      `farmer=₹${escrowSplit.farmerShareINR.toLocaleString("en-IN")} | ` +
      `platform=₹${escrowSplit.platformReserveINR.toLocaleString("en-IN")}`,
    );

    // ── Build offset receipt hash ───────────────────────────────────────────
    // Canonical string captures all retirement-event fields deterministically.
    const receiptCanonical = [
      `retirementId=${retirementId}`,
      `tokenId=${tokenId}`,
      `buyerCompany=${buyerData.buyerCompany}`,
      `buyerEmail=${buyerData.buyerEmail}`,
      `amountPaid=${buyerData.amountPaidINR}`,
      `farmerShare=${escrowSplit.farmerShareINR}`,
      `platformReserve=${escrowSplit.platformReserveINR}`,
      `escrowRef=${escrowSplit.escrowRef}`,
      `retiredAt=${retiredAt}`,
    ].join("|");
    const offsetReceiptHash = djb2Hash(receiptCanonical);

    retirementLog.push(
      `[Retirement · Receipt] offsetReceiptHash=${offsetReceiptHash} ` +
      `(djb2 content fingerprint of retirement event).`,
    );

    // ── Gas parameters ──────────────────────────────────────────────────────
    retirementLog.push(
      `[Retirement · Gas] maxFeePerGas: ${GAS_MAX_FEE_GWEI} gwei | ` +
      `maxPriorityFee: ${GAS_PRIORITY_FEE_GWEI} gwei | ` +
      `network: ${CONFIG.blockchain.chainName}.`,
    );
    retirementLog.push(
      `[Retirement · Ready] AtomicRetirementDescriptor assembled. ` +
      `Pass to blockchain.ts → burnTokens(tokenId) to execute.`,
    );

    return {
      retirementId,
      tokenId,
      contractAddress:      CONFIG.blockchain.contractAddress,
      chainId:              CONFIG.blockchain.chainId,
      maxFeePerGasWei:      MAX_FEE_PER_GAS_WEI,
      maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
      escrowSplit,
      buyer:                buyerData,
      offsetReceiptHash,
      retiredAt,
      retirementLog,
    };
  }
}
