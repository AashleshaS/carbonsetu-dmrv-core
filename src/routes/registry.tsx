import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  ChevronDown,
  ExternalLink,
  Leaf,
  Loader2,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { getAllTokens, insertPurchase, updatePurchaseBurnHash, updateTokenStatus } from "@/lib/db";
import { generateDecentroPayment } from "@/lib/api";
import { burnTokens } from "@/lib/blockchain";
import { CONFIG } from "@/lib/config";
import { farmImageForId, IMAGES } from "@/lib/images";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/registry")({
  component: RegistryPage,
});

type Token = {
  id: string;
  farmer_id: string;
  farmer_name: string | null;
  village: string | null;
  taluka: string | null;
  token_amount: number | null;
  co2_tonnes: number | null;
  ndvi_score: number | null;
  farm_gps_lat: number | null;
  farm_gps_lon: number | null;
  farm_area_acres: number | null;
  polygonscan_hash: string | null;
  /** On-chain uint256 tokenId stored at mint time — used by burnToken(). */
  token_id_onchain: string | null;
  price_inr: number | null;
};

function RegistryPage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [maxPrice, setMaxPrice] = useState(0);
  const [sort, setSort] = useState<"newest" | "cheapest" | "most_co2">("cheapest");
  const [selected, setSelected] = useState<Token | null>(null);

  useEffect(() => {
    getAllTokens()
      .then((d) => setTokens(d as Token[]))
      .catch((e: any) => setLoadError(e?.message ?? "Failed to load credits."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = tokens.filter((t) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (t.village?.toLowerCase().includes(q) ?? false) ||
        (t.taluka?.toLowerCase().includes(q) ?? false) ||
        (t.farmer_name?.toLowerCase().includes(q) ?? false);
      const matchesPrice = maxPrice === 0 || (t.price_inr ?? 0) <= maxPrice;
      return matchesSearch && matchesPrice;
    });
    if (sort === "cheapest")
      list = [...list].sort((a, b) => (a.price_inr ?? 0) - (b.price_inr ?? 0));
    if (sort === "most_co2")
      list = [...list].sort((a, b) => (b.co2_tonnes ?? 0) - (a.co2_tonnes ?? 0));
    return list;
  }, [tokens, search, maxPrice, sort]);

  return (
    <div className="bg-[#f8faf8] min-h-screen">
      {/* Buyer hero */}
      <section className="relative h-56 md:h-64 overflow-hidden">
        <img
          src={IMAGES.buyerForest}
          alt="Green landscape"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/90 to-primary/60" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 h-full flex flex-col justify-center">
          <h1 className="text-3xl md:text-4xl font-bold text-white">Buy verified farm credits</h1>
          <p className="mt-2 text-white/85 max-w-xl">
            Real farms from Nagpur district. Official certificate after purchase. 90% supports the
            farmer.
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Simple filters */}
        <div className="bg-white rounded-xl border border-border p-4 shadow-sm flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" />
            <input
              className="kc-input pl-10"
              placeholder="Search village or taluka…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full md:w-40">
            <input
              type="number"
              className="kc-input"
              placeholder="Max ₹"
              min={0}
              value={maxPrice || ""}
              onChange={(e) => setMaxPrice(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="relative w-full md:w-44">
            <select
              className="kc-input appearance-none pr-8"
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
            >
              <option value="cheapest">Lowest price</option>
              <option value="most_co2">Most CO₂</option>
              <option value="newest">Newest</option>
            </select>
            <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-foreground/40" />
          </div>
        </div>

        {loading && (
          <p className="text-center py-16 text-foreground/50 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading farms…
          </p>
        )}

        {!loading && loadError && (
          <div className="mt-8 bg-white rounded-xl border border-destructive/30 p-12 text-center">
            <p className="font-semibold text-destructive">Could not load credits</p>
            <p className="text-sm text-foreground/55 mt-1">{loadError}</p>
          </div>
        )}

        {!loading && !loadError && filtered.length === 0 && (
          <div className="mt-8 bg-white rounded-xl border border-border p-12 text-center">
            <Leaf className="w-12 h-12 mx-auto text-primary/30 mb-3" />
            <p className="font-semibold text-foreground">No credits available right now</p>
            <p className="text-sm text-foreground/55 mt-1">
              New farms are added after registration. Check back soon.
            </p>
          </div>
        )}

        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((t) => (
            <TokenCard key={t.id} t={t} onBuy={() => setSelected(t)} />
          ))}
        </div>
      </div>

      {selected && <PurchaseModal token={selected} onClose={() => setSelected(null)} />}
      <SiteFooter />
    </div>
  );
}

function TokenCard({ t, onBuy }: { t: Token; onBuy: () => void }) {
  const img = farmImageForId(t.id);
  return (
    <article className="bg-white rounded-xl border border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
      <div className="relative h-40">
        <img src={img} alt={`Farm in ${t.village ?? "Nagpur"}`} className="w-full h-full object-cover" />
        <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/95 text-xs font-bold text-primary shadow">
          <BadgeCheck className="w-3.5 h-3.5" /> Verified
        </span>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-start gap-2 text-sm">
          <MapPin className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-foreground">
              {t.village ?? "—"}, {t.taluka ?? "—"}
            </p>
            <p className="text-foreground/50 text-xs">Nagpur, Maharashtra</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-foreground/50 text-xs">CO₂ offset</p>
            <p className="text-xl font-bold text-primary">
              {(t.co2_tonnes ?? 0).toFixed(1)} <span className="text-sm font-medium">tonnes</span>
            </p>
          </div>
          <div>
            <p className="text-foreground/50 text-xs">Farm size</p>
            <p className="text-lg font-bold">{t.farm_area_acres ?? "—"} acres</p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border mt-auto">
          <p className="text-xs text-foreground/50">Total price</p>
          <p className="text-2xl font-bold text-foreground">
            ₹ {(t.price_inr ?? 0).toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-primary mt-1 font-medium">
            ₹ {((t.price_inr ?? 0) * 0.8).toLocaleString("en-IN")} to farmer
          </p>
        </div>

        <button type="button" onClick={onBuy} className="mt-4 w-full kc-btn-primary py-3 rounded-lg">
          Buy this credit
        </button>
      </div>
    </article>
  );
}

function PurchaseModal({ token, onClose }: { token: Token; onClose: () => void }) {
  const navigate = useNavigate();
  const [buyerName, setBuyerName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"form" | "burning" | "done">("form");
  const [burnHash, setBurnHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total       = token.price_inr ?? 0;
  const farmerShare = total * CONFIG.pricing.farmerPayoutPercent;
  const platformFee = total * CONFIG.pricing.platformFeePercent;

  async function confirm() {
    setError(null);
    if (!buyerName || !company || !email) {
      setError("Please fill all fields.");
      return;
    }
    setBusy(true);
    try {
      // Step 1 — Generate payment link
      const payment = await generateDecentroPayment(total, buyerName, token.id);
      const certificateId = `KC-${Date.now().toString(36).toUpperCase()}`;

      // Step 2 — Save purchase record
      const purchase = await insertPurchase({
        token_id: token.id,
        farmer_id: token.farmer_id,
        buyer_name: buyerName,
        buyer_company: company,
        buyer_email: email,
        amount_paid: total,
        farmer_payout: farmerShare,
        platform_fee:  platformFee,
        decentro_payment_ref: payment?.payment_ref ?? null,
        certificate_id: certificateId,
        status: "pending",
      });

      // Step 3 — Burn token on blockchain
      setStep("burning");
      // token_id_onchain is the uint256 integer stored at mint time in carbon_tokens.
      // Fallback to "0" only if somehow missing (pre-migration rows); burn will
      // revert on-chain in that case and we still navigate to the certificate.
      const tokenId = token.token_id_onchain ?? "0";
      console.log("[registry] burning tokenId =", tokenId);

      try {
        const { txHash } = await burnTokens(tokenId);
        setBurnHash(txHash);
        console.log("[registry] burn txHash =", txHash);

        // Step 4 — Save burn hash + mark token as sold
        await updatePurchaseBurnHash(purchase.id, txHash);
        await updateTokenStatus(token.id, "sold");

        setStep("done");
        setTimeout(() => {
          navigate({ to: "/certificate/$id", params: { id: purchase.id } });
        }, 2000);
      } catch (burnErr: any) {
        // Burn failed — still go to certificate (burn can be retried)
        console.warn("[registry] burn failed, continuing:", burnErr?.message);
        navigate({ to: "/certificate/$id", params: { id: purchase.id } });
      }
    } catch (e: any) {
      setError(e?.message ?? "Purchase could not be completed.");
      setStep("form");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={step === "form" ? onClose : undefined}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-32">
          <img src={farmImageForId(token.id)} alt="" className="w-full h-full object-cover" />
          {step === "form" && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6">
          {/* ── Burning state ── */}
          {step === "burning" && (
            <div className="text-center py-6">
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
              <p className="font-bold text-lg">Retiring token on blockchain…</p>
              <p className="text-sm text-foreground/60 mt-1">
                Please confirm the transaction in MetaMask.
              </p>
            </div>
          )}

          {/* ── Done state ── */}
          {step === "done" && burnHash && (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <BadgeCheck className="w-8 h-8 text-green-600" />
              </div>
              <p className="font-bold text-lg text-green-700">Token permanently retired</p>
              <a
                href={`https://amoy.polygonscan.com/tx/${burnHash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-sm text-secondary hover:underline"
              >
                View burn on Polygonscan <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <p className="text-xs text-foreground/50 mt-3">Redirecting to certificate…</p>
            </div>
          )}

          {/* ── Form state ── */}
          {step === "form" && (
            <>
              <h2 className="text-xl font-bold">Complete your purchase</h2>
              <p className="text-sm text-foreground/60 mt-1">
                {(token.co2_tonnes ?? 0).toFixed(1)} tonnes CO₂ · {token.village}, {token.taluka}
              </p>

              <div className="mt-5 space-y-3">
                <div>
                  <label className="kc-label">Your name</label>
                  <input className="kc-input" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
                </div>
                <div>
                  <label className="kc-label">Company</label>
                  <input className="kc-input" value={company} onChange={(e) => setCompany(e.target.value)} />
                </div>
                <div>
                  <label className="kc-label">Work email</label>
                  <input type="email" className="kc-input" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>

              <div className="mt-5 p-4 rounded-lg bg-[#f0f7f0] text-sm">
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>₹ {total.toLocaleString("en-IN")}</span>
                </div>
                <p className="text-primary text-xs mt-2 font-medium">
                  ₹ {farmerShare.toLocaleString("en-IN")} goes to the farmer (80%)
                </p>
              </div>

              {error && (
                <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                className="mt-5 w-full kc-btn-primary py-3.5 rounded-lg inline-flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? "Processing…" : "Pay & get certificate"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
