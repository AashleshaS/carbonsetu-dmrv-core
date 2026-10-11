import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock, Sprout, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IMAGES } from "@/lib/images";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword]         = useState("");
  const [confirm, setConfirm]           = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy]                 = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [ready, setReady]               = useState(false);
  const [invalid, setInvalid]           = useState(false);
  const [done, setDone]                 = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Supabase sends reset links with tokens in the URL hash like:
      // /reset-password#access_token=xxx&type=recovery
      // Since detectSessionInUrl is false, we must exchange it manually.

      const hash   = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const search = new URLSearchParams(window.location.search);

      const accessToken  = hash.get("access_token")  || search.get("access_token");
      const refreshToken = hash.get("refresh_token") || search.get("refresh_token");
      const type         = hash.get("type")           || search.get("type");

      // Also handle PKCE code flow (newer Supabase versions)
      const code = search.get("code");

      if (code) {
        // PKCE flow — exchange code for session
        const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code);
        if (exchErr) {
          if (!cancelled) setInvalid(true);
          return;
        }
        if (!cancelled) setReady(true);
        return;
      }

      if (accessToken && type === "recovery") {
        // Set the session from the recovery token
        const { error: sessErr } = await supabase.auth.setSession({
          access_token:  accessToken,
          refresh_token: refreshToken ?? "",
        });
        if (sessErr) {
          if (!cancelled) setInvalid(true);
          return;
        }
        // Clear the hash from URL bar so refresh doesn't re-use the token
        window.history.replaceState({}, "", "/reset-password");
        if (!cancelled) setReady(true);
        return;
      }

      // No token in URL — listen for PASSWORD_RECOVERY event as fallback
      // (fires if user navigated here from an already-active session)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY" && !cancelled) {
          setReady(true);
        }
      });

      // If nothing fires in 4 seconds, mark as invalid
      const timeout = setTimeout(() => {
        if (!cancelled) setInvalid(true);
      }, 4000);

      return () => {
        subscription.unsubscribe();
        clearTimeout(timeout);
      };
    }

    init();
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
      await supabase.auth.signOut();
      setTimeout(() => navigate({ to: "/login", replace: true }), 2000);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-65px)] grid lg:grid-cols-2">
      {/* Left panel */}
      <div className="relative hidden lg:block min-h-full">
        <img
          src={IMAGES.farmerField}
          alt="Farmer in green field"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-primary/50" />
        <div className="relative p-12 flex flex-col justify-end h-full text-white">
          <Sprout className="w-10 h-10 text-accent mb-4" />
          <h2 className="text-3xl font-bold">किसान Credit</h2>
          <p className="mt-2 text-white/85 max-w-sm">
            Trusted carbon credits from real Nagpur farms.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex items-center justify-center bg-gray-50 px-4 py-10">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8">

          {/* ── Success state ── */}
          {done && (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Password updated</h1>
              <p className="mt-2 text-sm text-gray-500">Redirecting to sign in…</p>
            </div>
          )}

          {/* ── Loading / invalid state ── */}
          {!done && !ready && (
            <div className="text-center py-4">
              <h1 className="text-2xl font-bold text-gray-900 mb-6">Set new password</h1>
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-gray-500">Verifying reset link…</p>

              {invalid && (
                <div className="mt-6 space-y-3">
                  <p className="text-sm text-red-600 font-medium">
                    This link is invalid or has expired.
                  </p>
                  <p className="text-xs text-gray-400">
                    Reset links expire after 1 hour and can only be used once.
                  </p>
                  <Link
                    to="/forgot-password"
                    className="inline-block mt-2 text-sm text-primary font-semibold hover:underline"
                  >
                    Request a new reset link →
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* ── Form state ── */}
          {!done && ready && (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Set new password</h1>
              <p className="text-sm text-gray-500 mb-6">Choose a strong password for your account.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                      minLength={6}
                      placeholder="Min. 6 characters"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="w-full pl-10 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                      minLength={6}
                      placeholder="Repeat password"
                    />
                  </div>
                  {confirm.length > 0 && confirm !== password && (
                    <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
                  )}
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60"
                >
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  Update password
                </button>
              </form>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
