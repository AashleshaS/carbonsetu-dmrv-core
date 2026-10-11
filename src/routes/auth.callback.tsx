import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatAuthError, getAuthRedirectUrl } from "@/lib/auth";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Completing Google sign-in…");

  useEffect(() => {
    let cancelled = false;

    function goLogin(error: string) {
      if (cancelled) return;
      navigate({
        to: "/login",
        search: { error: formatAuthError(error) },
        replace: true,
      });
    }

    function goRegister() {
      if (cancelled) return;
      // Clear ?code= from address bar so refresh does not break
      window.history.replaceState({}, "", "/register");
      navigate({ to: "/register", replace: true });
    }

    async function finish() {
      const search = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

      const oauthError =
        search.get("error_description") ||
        search.get("error") ||
        hash.get("error_description") ||
        hash.get("error");

      if (oauthError) {
        goLogin(oauthError);
        return;
      }

      const code = search.get("code");

      if (code) {
        setMessage("Verifying with Supabase…");
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          goLogin(error.message);
          return;
        }
      } else if (hash.get("access_token")) {
        // Legacy implicit flow fallback
        const { error } = await supabase.auth.getSession();
        if (error) {
          goLogin(error.message);
          return;
        }
      } else {
        goLogin(
          "No sign-in code in URL. Check Supabase redirect URLs include: " +
            getAuthRedirectUrl(),
        );
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        goLogin(error.message);
        return;
      }

      if (data.session) {
        goRegister();
        return;
      }

      setMessage("Almost done…");
      await new Promise((r) => setTimeout(r, 500));
      const retry = await supabase.auth.getSession();
      if (retry.data.session) {
        goRegister();
        return;
      }

      goLogin(
        "Session not saved. Use the same browser tab, same port (5173), and add " +
          getAuthRedirectUrl() +
          " to Supabase redirect URLs.",
      );
    }

    finish().catch((e: unknown) => {
      goLogin(e instanceof Error ? e.message : "Google sign-in failed");
    });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-foreground/70">{message}</p>
      <p className="max-w-md text-xs text-foreground/50">
        Callback URL: <code className="break-all">{getAuthRedirectUrl()}</code>
      </p>
    </div>
  );
}
