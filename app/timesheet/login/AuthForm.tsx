"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { COMPANY_DOMAIN, NOT_INVITED_ERROR } from "@/lib/companyEmail";
import { InAppBrowserNotice } from "./InAppBrowserNotice";
import { signInWithPasswordAction } from "./passwordAction";

// Turn Supabase's technical messages into plain words.
function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("database error saving new user")) return NOT_INVITED_ERROR;
  if (m.includes("provider is not enabled") || m.includes("unsupported provider"))
    return "Google sign-in isn't switched on yet. Ask an admin to enable it in Supabase.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("fetch") || m.includes("network"))
    return "Couldn't reach the server. Check your internet connection and try again.";
  return message;
}

export default function AuthForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  async function onPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setSigningIn(true);
    const res = await signInWithPasswordAction({ email, password });
    if (res.ok) {
      router.replace("/timesheet/dashboard");
      router.refresh();
      return;
    }
    setPassword("");
    setError(res.error);
    setSigningIn(false);
  }

  async function onGoogle() {
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      // No "hd" (hosted domain) hint: it would make Google's picker show only company accounts, and people an admin added
      // by hand (a Gmail address, a client's address) must be able to pick theirs. The database enforces who gets in.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/timesheet/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
      // The browser is now being sent to Google.
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : "Something went wrong. Please try again."));
      setLoading(false);
    }
  }

  return (
    <>
      <CardHeader>
        <CardTitle className="text-2xl font-semibold tracking-tight">Welcome back</CardTitle>
        <CardDescription>
          Sign in to the Vyntics Employee Management System with your @{COMPANY_DOMAIN} Google account, or with the email and password an admin gave you.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        <InAppBrowserNotice />
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={onGoogle} disabled={loading}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="currentColor" d="M21.6 12.23c0-.71-.06-1.4-.18-2.05H12v3.87h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.98-4.3 2.98-7.34z" />
            <path fill="currentColor" opacity="0.8" d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.23-2.5c-.9.6-2.04.95-3.39.95-2.6 0-4.8-1.76-5.59-4.12H3.07v2.58A10 10 0 0 0 12 22z" />
            <path fill="currentColor" opacity="0.6" d="M6.41 13.9a6 6 0 0 1 0-3.8V7.52H3.07a10 10 0 0 0 0 8.96l3.34-2.58z" />
            <path fill="currentColor" opacity="0.7" d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.96 9.96 0 0 0 12 2 10 10 0 0 0 3.07 7.52l3.34 2.58C7.2 7.74 9.4 5.98 12 5.98z" />
          </svg>
          {loading ? "Opening Google..." : "Continue with Google"}
        </Button>

        <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={onPassword} noValidate className="grid gap-3" aria-label="Sign in with email and password">
          <div className="grid gap-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input id="login-email" type="email" autoComplete="username" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} disabled={signingIn} className="max-md:min-h-11" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="login-password">Password</Label>
            <Input id="login-password" type="password" autoComplete="current-password" maxLength={200} value={password} onChange={(e) => setPassword(e.target.value)} disabled={signingIn} className="max-md:min-h-11" />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={signingIn || loading}>
            {signingIn ? "Signing in..." : "Sign in with email"}
          </Button>
        </form>

        <div aria-live="polite">
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          No access? Contact your admin. Only company accounts and people an admin has added can sign in.
        </p>
      </CardContent>
    </>
  );
}
