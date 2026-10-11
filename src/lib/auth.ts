/** OAuth / email redirect — uses the actual origin in the browser, or VITE_APP_URL in SSR */
export function getAuthRedirectUrl(path = "/auth/callback"): string {
  if (typeof window !== "undefined") {
    // Use localhost consistently (not 127.0.0.1) so Supabase redirect URLs match
    const origin = window.location.origin.replace("127.0.0.1", "localhost");
    return `${origin}${path}`;
  }
  // SSR fallback — set VITE_APP_URL in production (e.g. https://yourdomain.com)
  const base = import.meta.env.VITE_APP_URL ?? "http://localhost:5173";
  return `${base}${path}`;
}

/** Supabase callback URL — must be set in Google Cloud Console (NOT localhost) */
export const SUPABASE_GOOGLE_CALLBACK = `${
  import.meta.env.VITE_SUPABASE_URL ?? ""
}/auth/v1/callback`;

/** User-friendly messages for common Supabase Auth errors */
export function formatAuthError(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes("provider is not enabled") ||
    m.includes("unsupported provider") ||
    m.includes("validation_failed")
  ) {
    return "Google sign-in is not enabled. Please use email and password to sign in.";
  }
  if (m.includes("redirect_uri_mismatch")) {
    return "Google sign-in configuration error. Please contact support.";
  }
  if (m.includes("redirect") && m.includes("url")) {
    return "Sign-in redirect error. Please try again or contact support.";
  }
  if (m.includes("rate limit") || m.includes("email rate limit")) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "This email already has an account. Use Sign in instead of Create account.";
  }
  if (m.includes("invalid login credentials")) {
    return "Wrong email or password. If you just signed up and haven't verified your email yet, please check your inbox first.";
  }
  if (m.includes("email not confirmed")) {
    return "Please verify your email first. Check your inbox for the confirmation link.";
  }
  return message;
}
