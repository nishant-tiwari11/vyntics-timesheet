"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { NO_ACCESS_ERROR } from "@/lib/access/config";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/timesheet/log";

// Email + password sign-in for people an admin added with a password. Passwords are checked by Supabase Auth (bcrypt);
// this wrapper adds the lockout (5 wrong passwords = 15 minutes, per account, plus a limit per address), the access rules
// (not disabled, not expired, on the list), and says the same thing for "no such person" and "wrong password" so the
// form can't be used to find out who has an account. Nothing here ever logs the password.
export type PasswordResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

const WRONG = "Invalid email or password.";

async function clientIp(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
  return ip ? ip.slice(0, 64) : null;
}

const waitText = (seconds: number) => `Too many attempts. Try again in ${Math.max(1, Math.ceil(seconds / 60))} minutes.`;

export async function signInWithPasswordAction(input: unknown): Promise<PasswordResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: WRONG };
  const { email, password } = parsed.data;

  try {
    const supabase = await createClient();
    const ip = await clientIp();

    const locked = await supabase.rpc("access_login_locked", { p_email: email, p_ip: ip });
    if (locked.error) {
      logError("password-login", locked.error);
      return { ok: false, error: "Password sign-in isn't available yet. Use Google, or ask your admin." };
    }
    if ((locked.data ?? 0) > 0) return { ok: false, error: waitText(locked.data ?? 900) };

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const left = await supabase.rpc("access_login_failed", { p_email: email, p_ip: ip });
      if ((left.data ?? 0) > 0) return { ok: false, error: waitText(left.data ?? 900) };
      return { ok: false, error: WRONG };
    }

    const verdict = await supabase.rpc("access_after_login");
    if (verdict.error || verdict.data !== "ok") {
      await supabase.auth.signOut();
      if (verdict.data === "disabled") return { ok: false, error: "This account is switched off. Contact your admin." };
      if (verdict.data === "expired") return { ok: false, error: "Your access has expired. Contact your admin." };
      return { ok: false, error: NO_ACCESS_ERROR };
    }
    await supabase.rpc("access_login_ok", { p_email: email, p_ip: ip });
    return { ok: true };
  } catch (e) {
    logError("password-login", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
