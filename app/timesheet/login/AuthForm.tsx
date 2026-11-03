"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COMPANY_EMAIL_ERROR, COMPANY_EMAIL_HINT, isCompanyEmail } from "@/lib/companyEmail";

type Mode = "signin" | "signup";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Turn Supabase's technical messages into plain words.
function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("database error saving new user")) return COMPANY_EMAIL_ERROR;
  if (m.includes("invalid login credentials")) return "Wrong email or password. Please try again.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "An account with this email already exists. Try signing in instead.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email first. Check your inbox for the confirmation link.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("password") && m.includes("characters")) return "Password must be at least 6 characters.";
  if (m.includes("valid email") || m.includes("invalid email")) return "Please enter a valid email address.";
  if (m.includes("signups not allowed")) return "New sign-ups are turned off. Ask an admin for access.";
  if (m.includes("fetch") || m.includes("network"))
    return "Couldn't reach the server. Check your internet connection and try again.";
  return message;
}

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  function validate(): string | null {
    if (mode === "signup" && name.trim().length < 2) return "Please enter your full name.";
    if (!EMAIL_RE.test(email.trim())) return "Please enter a valid work email address.";
    if (!isCompanyEmail(email)) return COMPANY_EMAIL_ERROR;
    if (password.length < 6) return "Password must be at least 6 characters.";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const cleanEmail = email.trim().toLowerCase();

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { name: name.trim() } },
        });
        if (error) throw error;

        // With email confirmation on, an existing address returns a fake user with no identities.
        if (data.user && data.user.identities?.length === 0) {
          throw new Error("User already registered");
        }
        if (!data.session) {
          setNotice("Check your email to confirm your account, then sign in.");
          setMode("signin");
          setPassword("");
          setLoading(false);
          return;
        }
      }

      router.push("/timesheet/dashboard");
      router.refresh();
      // Keep the "Signing in..." state while the page changes.
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : "Something went wrong. Please try again."));
      setLoading(false);
    }
  }

  const isSignup = mode === "signup";

  return (
    <>
      <div className="ts-tabs" role="tablist" aria-label="Sign in or create account">
        <button
          type="button"
          role="tab"
          aria-selected={!isSignup}
          className="ts-tab"
          onClick={() => switchMode("signin")}
          disabled={loading}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isSignup}
          className="ts-tab"
          onClick={() => switchMode("signup")}
          disabled={loading}
        >
          Create account
        </button>
      </div>

      <form onSubmit={onSubmit} noValidate className="ts-form">
        {isSignup && (
          <div className="ts-field">
            <label htmlFor="ts-name">Full name</label>
            <input
              id="ts-name"
              className="ts-input"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
            />
          </div>
        )}

        <div className="ts-field">
          <label htmlFor="ts-email">Work email</label>
          <input
            id="ts-email"
            className="ts-input"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@vyntics.com"
            aria-describedby="ts-email-hint"
          />
          <p id="ts-email-hint" className="ts-hint">
            {COMPANY_EMAIL_HINT}
          </p>
        </div>

        <div className="ts-field">
          <label htmlFor="ts-password">Password</label>
          <div className="ts-password">
            <input
              id="ts-password"
              className="ts-input"
              type={showPassword ? "text" : "password"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignup ? "At least 6 characters" : "Your password"}
            />
            <button
              type="button"
              className="ts-password-toggle"
              onClick={() => setShowPassword((s) => !s)}
              aria-pressed={showPassword}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div aria-live="polite">
          {error && (
            <p className="ts-alert" role="alert">
              {error}
            </p>
          )}
          {notice && <p className="ts-success">{notice}</p>}
        </div>

        <button type="submit" className="ts-btn ts-btn-block" disabled={loading}>
          {loading ? (isSignup ? "Creating account..." : "Signing in...") : isSignup ? "Create account" : "Sign in"}
        </button>
      </form>
    </>
  );
}
