/**
 * All external API calls — n8n, Decentro, Polygonscan.
 * Components never call fetch/axios directly; they call these functions.
 */
import axios from "axios";
import { CONFIG } from "./config";

// ── n8n Webhook ───────────────────────────────────────────────────────────────

/**
 * Fires after farmer registration.
 * n8n picks this up and runs: land records → Copernicus NDVI → mint → updateFarmerNDVI()
 */
export async function triggerN8NWebhook(farmerData: Record<string, unknown>) {
  if (!CONFIG.n8n.webhookUrl) {
    console.warn("[api] n8n webhook URL not set — skipping. Add VITE_N8N_WEBHOOK_URL to .env");
    return null;
  }
  try {
    const res = await axios.post(CONFIG.n8n.webhookUrl, farmerData, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });
    console.log("[api] n8n webhook triggered:", res.status);
    return res.data;
  } catch (e: any) {
    console.error("[api] n8n webhook error:", e?.message);
    return null; // non-fatal — don't block farmer registration
  }
}

// ── Decentro Payment ──────────────────────────────────────────────────────────

/**
 * Generates a UPI payment link for the buyer.
 * TODO: Replace mock with real Decentro integration when API key is ready.
 * Real endpoint: POST https://in.decentro.tech/v2/payments/upi/link
 */
export async function generateDecentroPayment(
  amount: number,
  buyerName: string,
  tokenId: string,
): Promise<{ qrCode: string; paymentRef: string; payment_ref?: string }> {
  if (!CONFIG.decentro.apiKey) {
    // TODO: Remove mock when Decentro API key is added to .env
    console.warn("[api] Decentro API key not set — returning mock payment response");
    return {
      qrCode:     "mock_qr_code",
      paymentRef: `mock_ref_${Date.now()}`,
      payment_ref: `mock_ref_${Date.now()}`,
    };
  }

  try {
    const res = await axios.post(
      `${CONFIG.decentro.baseUrl}/v2/payments/upi/link`,
      { amount, buyer_name: buyerName, reference_id: tokenId },
      {
        headers: {
          "Content-Type": "application/json",
          "client_id": CONFIG.decentro.apiKey,
        },
        timeout: 15000,
      },
    );
    return res.data;
  } catch (e: any) {
    console.error("[api] Decentro payment error:", e?.message);
    throw new Error("Payment service error. Please try again.");
  }
}

// ── Polygonscan ───────────────────────────────────────────────────────────────

export async function getPolygonscanTx(hash: string) {
  try {
    const res = await axios.get(
      `https://api.polygonscan.com/api?module=transaction&action=gettxreceiptstatus&txhash=${hash}`,
      { timeout: 10000 },
    );
    return res.data;
  } catch (e: any) {
    console.error("[api] Polygonscan error:", e?.message);
    return null;
  }
}
