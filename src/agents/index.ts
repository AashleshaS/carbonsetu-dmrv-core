/**
 * src/agents/index.ts — Agent Pipeline Orchestrator
 *
 * Public surface of the CarbonSetu autonomous agent layer.
 * Re-exports all agent classes and types, and provides the top-level
 * orchestrator function that chains the three agents end-to-end.
 *
 *  ┌──────────────────────────────────────────────────────────────┐
 *  │               runIngestionAgentPipeline(intake)              │
 *  │                                                              │
 *  │  ① CadastralSentinelAgent.inspect()                         │
 *  │       ↓ APPROVED / FLAGGED → continue                       │
 *  │       ↓ REJECTED           → abort, return pipeline result  │
 *  │                                                              │
 *  │  ② SynthesisVerificationAgent.synthesise()                  │
 *  │       ↓ isMintReady = true  → continue                      │
 *  │       ↓ isMintReady = false → return pipeline result        │
 *  │                                                              │
 *  │  ③ SettlementTreasuryAgent.prepareMintPayload()             │
 *  │       ↓ returns MintTransactionPayload                       │
 *  │                                                              │
 *  │  → PipelineResult { stage, cadastral, manifest, mintPayload }│
 *  └──────────────────────────────────────────────────────────────┘
 *
 * Usage (from admin.tsx or an n8n Function node):
 *
 *   import { runIngestionAgentPipeline } from "@/agents";
 *
 *   const result = runIngestionAgentPipeline({
 *     farmerIntake: { farmerId, lat, lon, gatNumber, taluka, village, areaAcres },
 *     remoteSensing: { ndvi, cloudCover, areaAcres, sceneId, farmerId },
 *     recipientAddress: "0xABC...",
 *   });
 *
 *   if (result.mintPayload) {
 *     // hand off to blockchain.ts → mintTokens()
 *   }
 */

// ── Re-exports ────────────────────────────────────────────────────────────────

export { CadastralSentinelAgent } from "./CadastralSentinelAgent";
export type {
  CadastralIntakeTelemetry,
  CadastralDecisionEnvelope,
} from "./CadastralSentinelAgent";

export { SynthesisVerificationAgent } from "./SynthesisVerificationAgent";
export type {
  RemoteSensingResult,
  VerificationManifest,
} from "./SynthesisVerificationAgent";

export { SettlementTreasuryAgent } from "./SettlementTreasuryAgent";
export type {
  MintTransactionPayload,
  EscrowSplitResult,
  BuyerData,
  AtomicRetirementDescriptor,
} from "./SettlementTreasuryAgent";

// ── Orchestrator Types ────────────────────────────────────────────────────────

import type { CadastralIntakeTelemetry, CadastralDecisionEnvelope } from "./CadastralSentinelAgent";
import type { RemoteSensingResult, VerificationManifest }           from "./SynthesisVerificationAgent";
import type { MintTransactionPayload }                               from "./SettlementTreasuryAgent";
import { CadastralSentinelAgent }                                    from "./CadastralSentinelAgent";
import { SynthesisVerificationAgent }                                from "./SynthesisVerificationAgent";
import { SettlementTreasuryAgent }                                   from "./SettlementTreasuryAgent";

/**
 * The stage at which the pipeline halted or completed.
 *
 *   "cadastral_rejected"   — Agent 1 hard-rejected the farm submission.
 *   "synthesis_not_ready"  — Agent 2 processed the telemetry but isMintReady=false.
 *   "settlement_ready"     — All 3 agents succeeded; mintPayload is populated.
 */
export type PipelineStage =
  | "cadastral_rejected"
  | "synthesis_not_ready"
  | "settlement_ready";

/** Combined input for the full 3-agent pipeline run. */
export type PipelineInput = {
  /** Intake telemetry from the farmer registration form (Agent 1 input). */
  farmerIntake:      CadastralIntakeTelemetry;
  /**
   * Remote sensing results from the Python dMRV engine (Agent 2 input).
   * This is available only after n8n has completed the Copernicus NDVI pass.
   * If not yet available, pass undefined — the pipeline will stop at Agent 1.
   */
  remoteSensing?:    RemoteSensingResult;
  /**
   * Recipient wallet address for the mint transaction (Agent 3 input).
   * Typically the admin custody address or the farmer's MetaMask wallet.
   * Required only when remoteSensing is also provided.
   */
  recipientAddress?: string;
};

/** Full pipeline execution result. */
export type PipelineResult = {
  /** Unique pipeline run identifier: "PIPELINE-{farmerId}-{epochMs}" */
  pipelineId:   string;
  /** Which stage the pipeline reached. */
  stage:        PipelineStage;
  /**
   * True only when stage === "settlement_ready" AND mintPayload is populated.
   * This is the single boolean a calling component needs to check.
   */
  mintReady:    boolean;
  /** Agent 1 result — always present. */
  cadastral:    CadastralDecisionEnvelope;
  /** Agent 2 result — present when remoteSensing input was provided. */
  manifest?:    VerificationManifest;
  /** Agent 3 result — present when stage === "settlement_ready". */
  mintPayload?: MintTransactionPayload;
  /** Consolidated log of all agent outputs in execution order. */
  pipelineLog:  string[];
  /** ISO-8601 UTC timestamp of pipeline completion. */
  completedAt:  string;
};

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * runIngestionAgentPipeline
 *
 * Chains CadastralSentinelAgent → SynthesisVerificationAgent →
 * SettlementTreasuryAgent in a single synchronous call.
 *
 * Gate logic:
 *   • If CadastralSentinel returns REJECTED → stop (stage: "cadastral_rejected").
 *   • If CadastralSentinel returns APPROVED or FLAGGED → proceed to Agent 2
 *     (FLAGGED continues with a warning but does not block minting — the
 *     admin dashboard surfaces the warning for manual review).
 *   • If Agent 2 returns isMintReady=false → stop (stage: "synthesis_not_ready").
 *   • If all agents succeed → stage: "settlement_ready", mintPayload populated.
 *
 * @param input  PipelineInput containing farmerIntake, optional remoteSensing,
 *               and optional recipientAddress.
 * @returns      PipelineResult with consolidated outputs and log.
 */
export function runIngestionAgentPipeline(input: PipelineInput): PipelineResult {
  const pipelineId  = `PIPELINE-${input.farmerIntake.farmerId}-${Date.now()}`;
  const pipelineLog: string[] = [];
  const startedAt   = new Date().toISOString();

  pipelineLog.push(
    `═══════════════════════════════════════════════════════════`,
  );
  pipelineLog.push(
    `[Pipeline] ${pipelineId} started at ${startedAt}`,
  );
  pipelineLog.push(
    `[Pipeline] farmerId=${input.farmerIntake.farmerId} | ` +
    `taluka=${input.farmerIntake.taluka} | ` +
    `village=${input.farmerIntake.village} | ` +
    `areaAcres=${input.farmerIntake.areaAcres}`,
  );
  pipelineLog.push(
    `═══════════════════════════════════════════════════════════`,
  );

  // ── Stage 1: Cadastral Sentinel ───────────────────────────────────────────

  pipelineLog.push(`\n[Stage 1] CadastralSentinelAgent.inspect() →`);

  const cadastral = CadastralSentinelAgent.inspect(input.farmerIntake);

  pipelineLog.push(
    `[Stage 1] Result: ${cadastral.status} | ` +
    `confidence: ${(cadastral.confidence * 100).toFixed(1)}%`,
  );
  cadastral.reasoning.forEach((r) => pipelineLog.push(`  ${r}`));

  if (cadastral.status === "REJECTED") {
    pipelineLog.push(
      `\n[Pipeline] ⛔ HALTED at Stage 1 — CadastralSentinel REJECTED ` +
      `farmerId=${input.farmerIntake.farmerId}. ` +
      `Do not proceed to remote sensing or minting.`,
    );
    return {
      pipelineId,
      stage:       "cadastral_rejected",
      mintReady:   false,
      cadastral,
      pipelineLog,
      completedAt: new Date().toISOString(),
    };
  }

  if (cadastral.status === "FLAGGED") {
    pipelineLog.push(
      `[Stage 1] ⚠ FLAGGED — continuing pipeline with soft warnings. ` +
      `Admin dashboard will surface these for manual review.`,
    );
  }

  // ── Stage 2: Synthesis Verification ──────────────────────────────────────

  if (!input.remoteSensing) {
    pipelineLog.push(
      `\n[Stage 2] ⏸ DEFERRED — no remoteSensing input provided. ` +
      `Pipeline will resume when the n8n dMRV engine delivers NDVI results. ` +
      `Cadastral result is APPROVED and ready for Agent 2 when data arrives.`,
    );
    // Return partial result — not a failure, just awaiting async NDVI data
    return {
      pipelineId,
      stage:       "synthesis_not_ready",
      mintReady:   false,
      cadastral,
      pipelineLog,
      completedAt: new Date().toISOString(),
    };
  }

  pipelineLog.push(`\n[Stage 2] SynthesisVerificationAgent.synthesise() →`);

  const manifest = SynthesisVerificationAgent.synthesise(input.remoteSensing);

  pipelineLog.push(
    `[Stage 2] manifestId=${manifest.manifestId} | ` +
    `ndvi=${manifest.ndviScore} | ` +
    `co2=${manifest.verifiedCO2Tonnes}t | ` +
    `formula=${manifest.formulaUsed} | ` +
    `integrity=${(manifest.integrityScore * 100).toFixed(1)}% | ` +
    `isMintReady=${manifest.isMintReady}`,
  );
  manifest.auditLog.forEach((a) => pipelineLog.push(`  ${a}`));

  // Pricing preview
  const pricing = SynthesisVerificationAgent.estimateTokenPrice(
    manifest.verifiedCO2Tonnes,
  );
  pipelineLog.push(
    `[Stage 2] Pricing preview: totalINR=₹${pricing.totalINR.toLocaleString("en-IN")} | ` +
    `farmerINR=₹${pricing.farmerINR.toLocaleString("en-IN")} (80%) | ` +
    `platformINR=₹${pricing.platformINR.toLocaleString("en-IN")} (20%)`,
  );

  if (!manifest.isMintReady) {
    pipelineLog.push(
      `\n[Pipeline] ⛔ HALTED at Stage 2 — Manifest not mint-ready. ` +
      `Review SynthesisVerificationAgent auditLog for blocking conditions.`,
    );
    return {
      pipelineId,
      stage:       "synthesis_not_ready",
      mintReady:   false,
      cadastral,
      manifest,
      pipelineLog,
      completedAt: new Date().toISOString(),
    };
  }

  // ── Stage 3: Settlement Treasury ─────────────────────────────────────────

  pipelineLog.push(`\n[Stage 3] SettlementTreasuryAgent.prepareMintPayload() →`);

  const recipient = input.recipientAddress ?? "0x0000000000000000000000000000000000000000";

  if (!input.recipientAddress) {
    pipelineLog.push(
      `[Stage 3] ⚠ WARN — recipientAddress not provided. ` +
      `Using zero address as placeholder. ` +
      `Supply a valid wallet address before submitting to blockchain.ts.`,
    );
  }

  // GPS carried from intake telemetry
  const gpsLat = input.farmerIntake.lat.toFixed(6);
  const gpsLon = input.farmerIntake.lon.toFixed(6);

  const mintPayload = SettlementTreasuryAgent.prepareMintPayload(
    manifest,
    recipient,
    gpsLat,
    gpsLon,
  );

  mintPayload.preflightLog.forEach((p) => pipelineLog.push(`  ${p}`));

  pipelineLog.push(
    `\n[Pipeline] ✅ COMPLETE — stage=settlement_ready | ` +
    `tokenAmount=${mintPayload.tokenAmount} units | ` +
    `recipient=${mintPayload.recipientAddress} | ` +
    `gas=${mintPayload.maxFeePerGasWei} wei maxFee`,
  );
  pipelineLog.push(
    `[Pipeline] completedAt=${new Date().toISOString()}`,
  );
  pipelineLog.push(
    `═══════════════════════════════════════════════════════════`,
  );

  return {
    pipelineId,
    stage:       "settlement_ready",
    mintReady:   true,
    cadastral,
    manifest,
    mintPayload,
    pipelineLog,
    completedAt: new Date().toISOString(),
  };
}

// ── Convenience: settlement-only helper ──────────────────────────────────────

/**
 * runSettlementPipeline
 *
 * Convenience wrapper for the purchase/retirement path (buyer side).
 * Skips Agents 1 & 2 and runs only the SettlementTreasuryAgent escrow
 * split + atomic retirement descriptor. Called from registry.tsx when
 * a buyer confirms a purchase.
 *
 * @param tokenId    On-chain uint256 tokenId from carbon_tokens.token_id_onchain.
 * @param buyerData  Buyer name, company, email, and amount paid.
 * @returns          AtomicRetirementDescriptor ready for burnTokens().
 */
export function runSettlementPipeline(
  tokenId:   string,
  buyerData: import("./SettlementTreasuryAgent").BuyerData,
): import("./SettlementTreasuryAgent").AtomicRetirementDescriptor {
  return SettlementTreasuryAgent.executeAtomicRetirement(tokenId, buyerData);
}
