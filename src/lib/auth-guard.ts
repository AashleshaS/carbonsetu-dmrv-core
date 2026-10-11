import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { CONFIG } from "./config";

export async function requireAuth() {
  if (import.meta.env.SSR) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw redirect({ to: "/login" });
  }
  return data.session;
}

export async function requireAdmin() {
  if (import.meta.env.SSR) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw redirect({ to: "/login" });
  }

  // Only the admin email can access admin routes
  const userEmail = data.session.user.email ?? "";
  if (userEmail !== CONFIG.app.adminEmail) {
    throw redirect({ to: "/" });
  }

  return data.session;
}

export async function redirectIfAuthenticated() {
  if (import.meta.env.SSR) return;

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    throw redirect({ to: "/register" });
  }
}
