import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink, Search, Download, Leaf, Users, Clock,
  ShieldCheck, Sprout, Zap, Loader2, CreditCard,
  CheckCircle2, BarChart3, RefreshCw, Wallet,
} from "lucide-react";
import { getAllFarmers, updateFarmerMintHash, insertToken, subscribeToFarmers } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { mintTokens } from "@/lib/blockchain";
import { CONFIG } from "@/lib/config";
import { requireAdmin } from "@/lib/auth-guard";

export const Route = createFileRoute("/admin")({
  beforeLoad: () => requireAdmin(),
  component: AdminPage,
});

type Farmer = {
  id: string; name: string; mobile: string; village: string; taluka: string;
  gat_number: string; latitude: number; longitude: number; farm_area_acres: number;
  ndvi_score: number | null; co2_tonnes: number | null; token_status: string;
  polygonscan_hash: string | null; created_at: string;
};

type Purchase = {
  id: string; buyer_name: string | null; buyer_company: string | null;
  buyer_email: string | null; amount_paid: number | null; farmer_payout: number | null;
  platform_fee: number | null; status: string; certificate_id: string | null;
  burn_hash: string | null; purchased_at: string;
  carbon_tokens?: { co2_tonnes: number | null; village: string | null; taluka: string | null; polygonscan_hash: string | null } | null;
  farmers?: { name: string | null; mobile: string | null } | null;
};

type Token = {
  id: string; farmer_name: string | null; village: string | null; taluka: string | null;
  co2_tonnes: number | null; ndvi_score: number | null; price_inr: number | null;
  status: string; polygonscan_hash: string | null; created_at: string;
};

function AdminPage() {
  const [tab, setTab] = useState<"farmers" | "tokens" | "transactions">("farmers");
  const [farmers, setFarmers]       = useState<Farmer[]>([]);
  const [tokens, setTokens]         = useState<Token[]>([]);
  const [purchases, setPurchases]   = useState<Purchase[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [mintingId, setMintingId]   = useState<string | null>(null);
  const [mintError, setMintError]   = useState<string | null>(null);
  const [pulseIds, setPulseIds]     = useState<Set<string>>(new Set());
  const [autoMinting, setAutoMinting] = useState<Set<string>>(new Set());

  async function loadAll() {
    try {
      const [farmersRes, tokensRes, purchasesRes] = await Promise.all([
        supabase.from("farmers").select("*").order("created_at", { ascending: false }),
        supabase.from("carbon_tokens").select("*").order("created_at", { ascending: false }),
        supabase.from("purchases").select("*, carbon_tokens:token_id(co2_tonnes,village,taluka,polygonscan_hash), farmers:farmer_id(name,mobile)").order("purchased_at", { ascending: false }),
      ]);
      if (farmersRes.data)   setFarmers(farmersRes.data as Farmer[]);
      if (tokensRes.data)    setTokens(tokensRes.data as Token[]);
      if (purchasesRes.data) setPurchases(purchasesRes.data as Purchase[]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function autoMint(farmer: Farmer) {
    if (autoMinting.has(farmer.id) || !farmer.ndvi_score || !farmer.co2_tonnes) return;
    setAutoMinting((s) => new Set(s).add(farmer.id));
    try {
      const co2 = farmer.co2_tonnes, ndvi = farmer.ndvi_score;
      const { txHash, tokenId } = await mintTokens(
        farmer.id,
        farmer.latitude.toString(),
        farmer.longitude.toString(),
        ndvi.toString(),
        co2.toString(),
        "0x573874dAbAe68fbE01b0679585dEd85D3C36Bf2A",
        Math.round(co2 * 10),
      );
      await updateFarmerMintHash(farmer.id, txHash, tokenId);
      await insertToken({
        farmer_id:        farmer.id,
        farmer_name:      farmer.name,
        village:          farmer.village,
        taluka:           farmer.taluka,
        token_amount:     co2,
        co2_tonnes:       co2,
        ndvi_score:       ndvi,
        farm_gps_lat:     farmer.latitude,
        farm_gps_lon:     farmer.longitude,
        farm_area_acres:  farmer.farm_area_acres,
        polygonscan_hash: txHash,
        token_id_onchain: tokenId,   // ← on-chain uint256 tokenId for burnToken()
        status:           "available",
        price_inr:        Math.round(co2 * CONFIG.pricing.pricePerTonneCO2),
      });
      setPulseIds((s) => new Set(s).add(farmer.id));
      setTimeout(() => setPulseIds((s) => { const n = new Set(s); n.delete(farmer.id); return n; }), 3000);
      await loadAll();
    } catch (e: any) { setMintError(`Auto-mint failed: ${e?.message}`); }
    finally { setAutoMinting((s) => { const n = new Set(s); n.delete(farmer.id); return n; }); }
  }

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 30000);
    const channel = subscribeToFarmers((payload: any) => {
      const newRow = payload.new as Farmer, oldRow = payload.old as Farmer;
      if (oldRow?.ndvi_score === null && newRow?.ndvi_score !== null && newRow?.token_status === "pending") autoMint(newRow);
      loadAll();
    });
    return () => { clearInterval(interval); channel.unsubscribe(); };
  }, []);

  const stats = useMemo(() => ({
    totalFarmers: farmers.length,
    verified:     farmers.filter(f => f.ndvi_score !== null).length,
    minted:       farmers.filter(f => f.token_status === "minted").length,
    totalCO2:     farmers.reduce((s, f) => s + (f.co2_tonnes ?? 0), 0),
    totalRevenue: purchases.filter(p => p.status === "completed").reduce((s, p) => s + (p.amount_paid ?? 0), 0),
    totalPayout:  purchases.filter(p => p.status === "completed").reduce((s, p) => s + (p.farmer_payout ?? 0), 0),
    availableTokens: tokens.filter(t => t.status === "available").length,
    soldTokens:   tokens.filter(t => t.status === "sold").length,
  }), [farmers, tokens, purchases]);

  async function handleMint(f: Farmer) {
    setMintError(null); setMintingId(f.id);
    try {
      const co2 = f.co2_tonnes ?? f.farm_area_acres * 0.5, ndvi = f.ndvi_score ?? 0.5;
      const { txHash, tokenId } = await mintTokens(
        f.id,
        f.latitude.toString(),
        f.longitude.toString(),
        ndvi.toString(),
        co2.toString(),
        "0x573874dAbAe68fbE01b0679585dEd85D3C36Bf2A",
        Math.round(co2 * 10),
      );
      await updateFarmerMintHash(f.id, txHash, tokenId);
      await insertToken({
        farmer_id:        f.id,
        farmer_name:      f.name,
        village:          f.village,
        taluka:           f.taluka,
        token_amount:     co2,
        co2_tonnes:       co2,
        ndvi_score:       ndvi,
        farm_gps_lat:     f.latitude,
        farm_gps_lon:     f.longitude,
        farm_area_acres:  f.farm_area_acres,
        polygonscan_hash: txHash,
        token_id_onchain: tokenId,   // ← on-chain uint256 tokenId for burnToken()
        status:           "available",
        price_inr:        Math.round(co2 * CONFIG.pricing.pricePerTonneCO2),
      });
      setPulseIds((s) => new Set(s).add(f.id));
      setTimeout(() => setPulseIds((s) => { const n = new Set(s); n.delete(f.id); return n; }), 3000);
      await loadAll();
    } catch (e: any) { setMintError(`Mint failed: ${e?.message}`); }
    finally { setMintingId(null); }
  }

  const filteredFarmers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? farmers.filter(f => f.name.toLowerCase().includes(q) || f.village.toLowerCase().includes(q)) : farmers;
  }, [farmers, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" /> Admin Control Panel
          </h1>
          <p className="text-sm text-foreground/50 mt-0.5">किसान Credit — Full management dashboard</p>
        </div>
        <button onClick={() => loadAll()} className="inline-flex items-center gap-1.5 text-sm text-foreground/60 hover:text-primary">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Farmers"    value={stats.totalFarmers}              color="blue"   icon={<Users className="w-4 h-4"/>} />
        <StatCard label="Verified (NDVI)"  value={stats.verified}                  color="green"  icon={<CheckCircle2 className="w-4 h-4"/>} />
        <StatCard label="Tokens Minted"    value={stats.minted}                    color="purple" icon={<Zap className="w-4 h-4"/>} />
        <StatCard label="Total CO₂"        value={`${stats.totalCO2.toFixed(1)}t`} color="teal"   icon={<Leaf className="w-4 h-4"/>} />
        <StatCard label="Available Tokens" value={stats.availableTokens}           color="green"  icon={<BarChart3 className="w-4 h-4"/>} />
        <StatCard label="Tokens Sold"      value={stats.soldTokens}                color="blue"   icon={<CreditCard className="w-4 h-4"/>} />
        <StatCard label="Total Revenue"    value={`₹${stats.totalRevenue.toLocaleString("en-IN")}`} color="amber" icon={<Wallet className="w-4 h-4"/>} />
        <StatCard label="Farmer Payouts"   value={`₹${stats.totalPayout.toLocaleString("en-IN")}`}  color="green" icon={<CheckCircle2 className="w-4 h-4"/>} />
      </div>

      {mintError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex gap-2">
          <span>⚠ {mintError}</span>
          <button onClick={() => setMintError(null)} className="ml-auto">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-muted/30 p-1 rounded-xl w-fit">
        {(["farmers", "tokens", "transactions"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition ${tab === t ? "bg-white shadow text-primary" : "text-foreground/60 hover:text-foreground"}`}>
            {t === "farmers" ? `👨‍🌾 Farmers (${farmers.length})` : t === "tokens" ? `🪙 Tokens (${tokens.length})` : `💳 Transactions (${purchases.length})`}
          </button>
        ))}
      </div>

      {/* ── FARMERS TAB ── */}
      {tab === "farmers" && (
        <div className="kc-card !p-0 overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" />
              <input className="kc-input pl-9" placeholder="Search name or village..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-foreground/60">
                <tr>{["Name","Mobile","Village","Area","NDVI","CO₂","Earnings","Status","Mint / Polygonscan"].map(h => <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={10} className="text-center py-10 text-foreground/50"><Loader2 className="w-5 h-5 animate-spin inline mr-2"/>Loading...</td></tr>}
                {!loading && filteredFarmers.map(f => (
                  <tr key={f.id} className={`border-t border-border hover:bg-muted/20 ${pulseIds.has(f.id) ? "kc-row-pulse" : ""}`}>
                    <td className="px-3 py-2.5 font-medium">{f.name}</td>
                    <td className="px-3 py-2.5 text-foreground/60">{f.mobile}</td>
                    <td className="px-3 py-2.5">{f.village}, {f.taluka}</td>
                    <td className="px-3 py-2.5">{f.farm_area_acres}ac</td>
                    <td className="px-3 py-2.5">{f.ndvi_score != null ? <span className="font-semibold text-green-600">{f.ndvi_score.toFixed(2)}</span> : <span className="text-amber-500 text-xs">pending</span>}</td>
                    <td className="px-3 py-2.5">{f.co2_tonnes != null ? <span className="font-semibold text-primary">{f.co2_tonnes.toFixed(2)}t</span> : <span className="text-amber-500 text-xs">pending</span>}</td>
                    <td className="px-3 py-2.5 text-amber-700 font-semibold">{f.co2_tonnes ? `₹${Math.round(f.co2_tonnes * CONFIG.pricing.pricePerTonneCO2 * 0.8).toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-3 py-2.5"><span className={`kc-badge ${f.token_status === "minted" ? "kc-badge-minted" : "kc-badge-pending"}`}>{f.token_status}</span></td>
                    <td className="px-3 py-2.5">
                      {f.token_status === "pending" ? (
                        <button type="button" disabled={mintingId === f.id || autoMinting.has(f.id)} onClick={() => handleMint(f)}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-60 whitespace-nowrap">
                          {(mintingId === f.id || autoMinting.has(f.id)) ? <Loader2 className="w-3 h-3 animate-spin"/> : <Zap className="w-3 h-3"/>}
                          {(mintingId === f.id || autoMinting.has(f.id)) ? "Minting…" : "⚡ Mint Token"}
                        </button>
                      ) : f.polygonscan_hash ? (
                        <a href={`${CONFIG.blockchain.explorerUrl}/tx/${f.polygonscan_hash}`} target="_blank" rel="noreferrer" className="text-green-600 text-xs font-semibold hover:underline inline-flex items-center gap-1 whitespace-nowrap">✅ Minted <ExternalLink className="w-3 h-3"/></a>
                      ) : <span className="text-foreground/30 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TOKENS TAB ── */}
      {tab === "tokens" && (
        <div className="kc-card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-foreground/60">
                <tr>{["Farmer","Village","CO₂","NDVI","Price","Status","Polygonscan","Created"].map(h => <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline"/></td></tr>}
                {!loading && tokens.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-foreground/50"><Sprout className="w-8 h-8 mx-auto text-primary/30 mb-2"/>No tokens yet. Mint farmers first.</td></tr>}
                {tokens.map(t => (
                  <tr key={t.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-medium">{t.farmer_name ?? "—"}</td>
                    <td className="px-3 py-2.5">{t.village}, {t.taluka}</td>
                    <td className="px-3 py-2.5 font-semibold text-primary">{t.co2_tonnes?.toFixed(2)}t</td>
                    <td className="px-3 py-2.5 text-green-600 font-semibold">{t.ndvi_score?.toFixed(2)}</td>
                    <td className="px-3 py-2.5 font-semibold">₹{t.price_inr?.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-2.5"><span className={`kc-badge ${t.status === "available" ? "kc-badge-minted" : t.status === "sold" ? "kc-badge-processing" : "kc-badge-pending"}`}>{t.status}</span></td>
                    <td className="px-3 py-2.5">{t.polygonscan_hash ? <a href={`${CONFIG.blockchain.explorerUrl}/tx/${t.polygonscan_hash}`} target="_blank" rel="noreferrer" className="text-secondary text-xs hover:underline inline-flex items-center gap-1">View <ExternalLink className="w-3 h-3"/></a> : "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-foreground/50">{new Date(t.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TRANSACTIONS TAB ── */}
      {tab === "transactions" && (
        <div className="kc-card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-foreground/60">
                <tr>{["Buyer","Company","Farmer","CO₂","Amount Paid","Farmer Payout","Platform Fee","Status","Certificate","Burn Hash","Date"].map(h => <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={11} className="text-center py-10"><Loader2 className="w-5 h-5 animate-spin inline"/></td></tr>}
                {!loading && purchases.length === 0 && <tr><td colSpan={11} className="text-center py-12 text-foreground/50"><CreditCard className="w-8 h-8 mx-auto text-primary/30 mb-2"/>No transactions yet.</td></tr>}
                {purchases.map(p => (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-medium">{p.buyer_name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-foreground/70">{p.buyer_company ?? "—"}</td>
                    <td className="px-3 py-2.5">{p.farmers?.name ?? "—"}</td>
                    <td className="px-3 py-2.5 font-semibold text-primary">{p.carbon_tokens?.co2_tonnes?.toFixed(2) ?? "—"}t</td>
                    <td className="px-3 py-2.5 font-semibold">₹{p.amount_paid?.toLocaleString("en-IN") ?? "—"}</td>
                    <td className="px-3 py-2.5 text-green-600 font-semibold">₹{p.farmer_payout?.toLocaleString("en-IN") ?? "—"}</td>
                    <td className="px-3 py-2.5 text-foreground/60">₹{p.platform_fee?.toLocaleString("en-IN") ?? "—"}</td>
                    <td className="px-3 py-2.5"><span className={`kc-badge ${p.status === "completed" ? "kc-badge-minted" : "kc-badge-pending"}`}>{p.status}</span></td>
                    <td className="px-3 py-2.5"><Link to="/certificate/$id" params={{ id: p.id }} className="text-secondary text-xs hover:underline">{p.certificate_id ?? "View"}</Link></td>
                    <td className="px-3 py-2.5">{p.burn_hash ? <a href={`${CONFIG.blockchain.explorerUrl}/tx/${p.burn_hash}`} target="_blank" rel="noreferrer" className="text-secondary text-xs hover:underline inline-flex items-center gap-1">Burn <ExternalLink className="w-3 h-3"/></a> : <span className="text-foreground/30">pending</span>}</td>
                    <td className="px-3 py-2.5 text-xs text-foreground/50 whitespace-nowrap">{new Date(p.purchased_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number | string; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue:   "bg-blue-50 border-blue-200 text-blue-700",
    green:  "bg-green-50 border-green-200 text-green-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
    teal:   "bg-teal-50 border-teal-200 text-teal-700",
    amber:  "bg-amber-50 border-amber-200 text-amber-700",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] ?? colors.blue}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</span>
        <span className="opacity-60">{icon}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
