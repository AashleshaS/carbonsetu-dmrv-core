import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Printer, Download, ExternalLink, Sprout, ShieldCheck } from "lucide-react";
import { getPurchaseById } from "@/lib/db";

export const Route = createFileRoute("/certificate/$id")({
  component: CertificatePage,
});

type PurchaseFull = {
  id: string;
  certificate_id: string | null;
  buyer_company: string | null;
  buyer_name: string | null;
  amount_paid: number | null;
  farmer_payout: number | null;
  burn_hash: string | null;
  purchased_at: string;
  status: string;
  carbon_tokens?: {
    co2_tonnes: number | null;
    ndvi_score: number | null;
    village: string | null;
    taluka: string | null;
    farm_gps_lat: number | null;
    farm_gps_lon: number | null;
    polygonscan_hash: string | null;
  } | null;
};

function CertificatePage() {
  const { id } = Route.useParams();
  const [data, setData] = useState<PurchaseFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPurchaseById(id)
      .then((d) => setData(d as PurchaseFull))
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-12 text-center text-foreground/60">Loading certificate...</div>;
  if (error || !data) return <div className="p-12 text-center text-destructive">{error ?? "Not found"}</div>;

  const tok = data.carbon_tokens;

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Action bar */}
        <div className="no-print flex justify-end gap-2 mb-4">
          <button
            onClick={() => window.print()}
            className="kc-btn-outline-teal inline-flex items-center gap-2"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          <button
            onClick={() => window.print()}
            className="kc-btn-primary inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Download PDF
          </button>
        </div>

        {/* Certificate */}
        <div className="bg-white border-4 border-primary rounded-lg p-10 md:p-14 shadow-lg relative">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 text-primary">
              <Sprout className="w-7 h-7" />
              <span className="text-2xl font-bold">किसान Credit</span>
            </div>
            <div className="mt-1 text-xs uppercase tracking-widest text-foreground/50 font-semibold">
              Carbon Offset Impact Certificate
            </div>
          </div>

          <div className="mt-2 text-center text-xs font-mono text-foreground/50">
            Certificate ID: {data.certificate_id ?? data.id}
          </div>

          <div className="my-8 h-px bg-border" />

          <div className="text-center">
            <p className="text-sm text-foreground/60">Issued to</p>
            <p className="text-3xl font-bold text-foreground mt-1">{data.buyer_company}</p>
            <p className="text-sm text-foreground/70 mt-1">Attn: {data.buyer_name}</p>
          </div>

          <div className="mt-8 text-center text-foreground/80 leading-relaxed">
            This certifies that <span className="font-semibold text-foreground">{data.buyer_company}</span> has offset
            <span className="block mt-2 text-5xl font-bold text-primary">
              {(tok?.co2_tonnes ?? 0).toFixed(2)} tonnes CO₂
            </span>
          </div>

          <div className="mt-8 grid sm:grid-cols-2 gap-4 text-sm">
            <CertField label="Verified Farm" value={`${tok?.village ?? "—"}, ${tok?.taluka ?? "—"}, Nagpur, Maharashtra`} />
            <CertField label="GPS Coordinates" value={`${tok?.farm_gps_lat?.toFixed(4) ?? "—"}, ${tok?.farm_gps_lon?.toFixed(4) ?? "—"}`} mono />
            <CertField label="NDVI Score" value={`${(tok?.ndvi_score ?? 0).toFixed(2)} (Sentinel-2 Satellite Verified)`} />
            <CertField label="Date of Purchase" value={new Date(data.purchased_at).toLocaleDateString()} />
            <CertField label="Amount Paid" value={`₹ ${(data.amount_paid ?? 0).toLocaleString("en-IN")}`} />
            <CertField label="Farmer Payout (80%)" value={`₹ ${(data.farmer_payout ?? 0).toLocaleString("en-IN")}`} />
          </div>

          <div className="mt-6 space-y-2 text-sm">
            <HashLink label="Polygonscan verification" hash={tok?.polygonscan_hash ?? null} />
            <HashLink label="Burn transaction" hash={data.burn_hash} />
          </div>

          <div className="mt-10 p-3 rounded-md bg-primary/5 border border-primary/20 text-center text-xs text-primary font-semibold">
            <ShieldCheck className="inline w-4 h-4 mr-1" />
            Token permanently retired on Polygon blockchain — cannot be reused.
          </div>

          <div className="mt-8 flex justify-end">
            <div className="text-right">
              <div className="w-24 h-24 rounded-full border-4 border-primary flex items-center justify-center bg-primary/5">
                <Sprout className="w-10 h-10 text-primary" />
              </div>
              <p className="text-xs font-bold text-primary mt-1">किसान Credit</p>
              <p className="text-[10px] text-foreground/50 uppercase tracking-wider">Official Seal</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CertField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-foreground/50 font-semibold">{label}</div>
      <div className={`mt-0.5 font-semibold text-foreground ${mono ? "font-mono text-sm" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function HashLink({ label, hash }: { label: string; hash: string | null }) {
  if (!hash) {
    return (
      <div className="text-foreground/60">
        <span className="font-semibold">{label}:</span> <span className="text-foreground/40">pending</span>
      </div>
    );
  }
  return (
    <div>
      <span className="font-semibold text-foreground/60">{label}: </span>
      <a
        href={`https://polygonscan.com/tx/${hash}`}
        target="_blank" rel="noreferrer"
        className="text-secondary font-mono text-xs hover:underline inline-flex items-center gap-1 break-all"
      >
        {hash} <ExternalLink className="w-3 h-3 shrink-0" />
      </a>
    </div>
  );
}
