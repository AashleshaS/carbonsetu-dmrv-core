import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { insertFarmer, type FarmerInput } from "@/lib/db";
import { triggerN8NWebhook } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { isNagpurTaluka, NAGPUR_TALUKAS, getVillagesForTaluka } from "@/lib/nagpur";
import { requireAuth } from "@/lib/auth-guard";
import { IMAGES } from "@/lib/images";

export const Route = createFileRoute("/register")({
  beforeLoad: () => requireAuth(),
  component: RegisterPage,
});

const emptyForm: FarmerInput = {
  name: "",
  mobile: "",
  taluka: "",
  village: "",
  gat_number: "",
  latitude: 0,
  longitude: 0,
  farm_area_acres: 0,
};

function RegisterPage() {
  const { user, loading } = useAuth();
  const [form, setForm] = useState<FarmerInput>(emptyForm);
  const [gpsCaptured, setGpsCaptured] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FarmerInput>(k: K, v: FarmerInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // When taluka changes, reset village
  function handleTalukaChange(taluka: string) {
    setForm((f) => ({ ...f, taluka, village: "" }));
  }

  // Villages for currently selected taluka
  const villages = form.taluka ? getVillagesForTaluka(form.taluka) : [];

  function captureGPS() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("या फोनवर location चालू नाही / Location not supported on this device.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update("latitude", Number(pos.coords.latitude.toFixed(6)));
        update("longitude", Number(pos.coords.longitude.toFixed(6)));
        setGpsCaptured(true);
        setGpsLoading(false);
      },
      (err) => {
        setGpsLoading(false);
        // err.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
        if (err.code === 1) {
          setError(
            "Location access denied. Browser ne location block kiya hai.\n" +
            "Fix: Address bar mein lock icon → Site settings → Location → Allow karo. " +
            "Agar localhost use kar rahe ho toh Chrome mein http://localhost ko secure site mark karo ya phone pe test karo."
          );
        } else if (err.code === 2) {
          setError(
            "Location unavailable. GPS signal nahi mila.\n" +
            "Phone ka GPS on karo aur open sky mein jaao, phir dobara try karo."
          );
        } else if (err.code === 3) {
          setError(
            "Location timeout. GPS response nahi aaya (15 sec).\n" +
            "Phone ka GPS on hai? Open area mein jaao aur dobara try karo."
          );
        } else {
          setError(`Location error (code ${err.code}): ${err.message}`);
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validation
    if (!form.name.trim()) {
      setError("कृपया पूर्ण नाव भरा.");
      return;
    }
    if (!form.mobile || !/^\d{10}$/.test(form.mobile)) {
      setError("मोबाईल नंबर 10 अंकी असावा.");
      return;
    }
    if (!form.taluka || !isNagpurTaluka(form.taluka)) {
      setError("फक्त नागपूर जिल्ह्यातील तालुका निवडा.");
      return;
    }
    if (!form.village) {
      setError("कृपया गाव निवडा.");
      return;
    }
    if (!form.gat_number.trim()) {
      setError("कृपया गट नंबर भरा.");
      return;
    }
    if (!form.latitude || !form.longitude) {
      setError("शेताचे location घ्या (GPS बटण दाबा).");
      return;
    }
    if (!form.farm_area_acres || form.farm_area_acres <= 0) {
      setError("शेताचे क्षेत्र (एकर) भरा.");
      return;
    }

    setSubmitting(true);
    try {
      // Step 1 — Save to Supabase
      const farmer = await insertFarmer(form);

      // Step 2 — Trigger n8n automation (non-blocking)
      triggerN8NWebhook({ ...farmer }).catch(() => undefined);

      // Step 3 — Show success
      setSuccess(true);
      setForm(emptyForm);
      setGpsCaptured(false);
      setTimeout(() => setSuccess(false), 8000);
    } catch (err: any) {
      setError(err?.message ?? "नोंदणी अयशस्वी. पुन्हा प्रयत्न करा.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-65px)] grid lg:grid-cols-2">
      {/* Left hero panel */}
      <aside className="relative min-h-[280px] lg:min-h-full">
        <img
          src={IMAGES.ruralLandscape}
          alt="Farm landscape in Maharashtra"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-black/75 to-black/30" />
        <div className="relative p-8 lg:p-12 flex flex-col justify-end h-full text-white max-w-lg">
          <p className="text-accent font-semibold text-sm uppercase tracking-wide">शेतकरी नोंदणी</p>
          <h2 className="mt-2 text-3xl lg:text-4xl font-bold leading-tight">
            तुमच्या शेताची नोंदणी करा
          </h2>
          <ul className="mt-6 space-y-3 text-white/90 text-base">
            {[
              "फक्त २–३ मिनिटे लागतात",
              "नागपूर जिल्ह्यातील शेतकरीच",
              "90% रक्कम थेट तुमच्या खात्यात",
            ].map((b) => (
              <li key={b} className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />
                {b}
              </li>
            ))}
          </ul>
          <img
            src={IMAGES.farmerPortrait}
            alt=""
            className="mt-8 w-20 h-20 rounded-full object-cover border-2 border-white/40 hidden lg:block"
            aria-hidden
          />
        </div>
      </aside>

      {/* Right form panel */}
      <section className="bg-white p-6 md:p-10 lg:p-12 overflow-y-auto">
        <div className="max-w-lg mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">शेताची माहिती</h1>
          <p className="mt-1 text-foreground/60">सर्व माहिती खरी आणि पूर्ण भरा</p>

          {success && (
            <div className="mt-6 p-5 rounded-xl border-2 border-primary bg-primary/5">
              <div className="flex gap-3">
                <CheckCircle2 className="w-8 h-8 text-primary shrink-0" />
                <div className="flex-1">
                  <p className="font-bold text-primary text-lg">नोंदणी झाली!</p>
                  <p className="text-foreground/75 mt-1">
                    आमची टीम तुमच्या शेताची पडताळणी satellite data वापरून करेल.
                    NDVI score आणि CO₂ tonnes calculate होताच तुम्हाला dashboard वर दिसेल.
                  </p>
                  <Link
                    to="/dashboard"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                  >
                    माझे शेत पहा (My Farm Dashboard) <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">

            {/* Name */}
            <BigField label="पूर्ण नाव">
              <input
                className="kc-input-lg"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="उदा. रामेश्वर पाटील"
              />
            </BigField>

            {/* Mobile — strictly 10 digits */}
            <BigField label="मोबाईल नंबर">
              <input
                className="kc-input-lg"
                value={form.mobile}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                  update("mobile", digits);
                }}
                placeholder="9876543210"
                inputMode="numeric"
                maxLength={10}
              />
              {form.mobile.length > 0 && form.mobile.length < 10 && (
                <p className="mt-1 text-xs text-destructive">
                  {10 - form.mobile.length} अंक बाकी आहेत
                </p>
              )}
              {form.mobile.length === 10 && (
                <p className="mt-1 text-xs text-primary font-medium">✓ 10 अंक</p>
              )}
            </BigField>

            {/* Taluka → Village (dependent dropdowns) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <BigField label="तालुका (नागपूर)">
                <select
                  className="kc-input-lg w-full"
                  value={form.taluka}
                  onChange={(e) => handleTalukaChange(e.target.value)}
                  required
                >
                  <option value="" disabled>तालुका निवडा</option>
                  {NAGPUR_TALUKAS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </BigField>

              <BigField label="गाव">
                {villages.length > 0 ? (
                  <select
                    className="kc-input-lg w-full"
                    value={form.village}
                    onChange={(e) => update("village", e.target.value)}
                    required
                  >
                    <option value="" disabled>गाव निवडा</option>
                    {villages.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                ) : (
                  <select className="kc-input-lg w-full" disabled>
                    <option>आधी तालुका निवडा</option>
                  </select>
                )}
              </BigField>
            </div>

            {/* Gat Number */}
            <BigField label="गट नंबर">
              <input
                className="kc-input-lg"
                value={form.gat_number}
                onChange={(e) => update("gat_number", e.target.value)}
                placeholder="142/2"
              />
            </BigField>

            {/* Farm area */}
            <BigField label="शेताचे क्षेत्र (एकर)">
              <input
                className="kc-input-lg"
                type="number"
                step="0.01"
                min="0"
                value={form.farm_area_acres || ""}
                onChange={(e) => update("farm_area_acres", parseFloat(e.target.value) || 0)}
                placeholder="2.5"
              />
            </BigField>

            {/* GPS — with clear farm instruction */}
            <div className="space-y-2">
              {/* Instruction banner — shown before GPS is captured */}
              {!gpsCaptured && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <MapPin className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-bold text-amber-800">
                      📍 शेतात जाऊन हे बटण दाबा
                    </p>
                    <p className="text-amber-700 mt-0.5">
                      GPS location शेतातूनच घ्या — घरातून नाही.
                      Satellite verification साठी exact farm location आवश्यक आहे.
                    </p>
                    <p className="text-amber-600 text-xs mt-1">
                      Go to your farm first, then tap the button below.
                    </p>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={captureGPS}
                disabled={gpsLoading}
                className={`w-full flex items-center justify-center gap-3 py-4 rounded-xl text-lg font-bold border-2 transition ${
                  gpsCaptured
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-secondary bg-secondary text-white"
                } disabled:opacity-60`}
              >
                {gpsLoading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <MapPin className="w-6 h-6" />
                )}
                {gpsLoading
                  ? "Location मिळवत आहे…"
                  : gpsCaptured
                    ? `✓ Location मिळाले (${form.latitude.toFixed(4)}, ${form.longitude.toFixed(4)})`
                    : "शेताचे location घ्या (GPS)"}
              </button>

              {/* Success confirmation */}
              {gpsCaptured && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="font-medium">
                    Farm location saved: {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setGpsCaptured(false); update("latitude", 0); update("longitude", 0); }}
                    className="ml-auto text-xs text-foreground/40 hover:text-destructive underline"
                  >
                    retake
                  </button>
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full kc-btn-primary py-4 text-xl rounded-xl inline-flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-6 h-6 animate-spin" />}
              {submitting ? "नोंदणी होत आहे…" : "नोंदणी करा"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}

function BigField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-base font-bold text-foreground mb-2">{label}</label>
      {children}
    </div>
  );
}
