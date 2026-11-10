import "./login.css";
import Image from "next/image";
import { NOT_INVITED_ERROR } from "@/lib/companyEmail";
import { Card } from "@/components/ui/card";
import AuthForm from "./AuthForm";
import HeroAnimationLazy from "./HeroAnimationLazy";
import logo from "./vyntics-logo.png";

export const metadata = { title: "Sign in" };

const REASONS: Record<string, string> = {
  not_allowed: NOT_INVITED_ERROR,
  failed: "Google sign-in didn't finish. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).error;
  const reason = Array.isArray(raw) ? raw[0] : raw;
  const initialError = reason ? REASONS[reason] : undefined;

  return (
    <main className="ts-login">
      <section className="ts-login-hero">
        <HeroAnimationLazy />
        <div className="ts-login-brand">
          <Image src={logo} alt="Vyntics" width={56} height={56} priority className="ts-login-logo" />
          <span className="ts-login-brand-name">
            Vyntics <span>Employee Management System</span>
          </span>
        </div>

        <h1 className="ts-login-headline">
          Your hours,
          <span>perfectly logged</span>
        </h1>
        <p className="ts-login-copy">
          Log your work, track your time and get it approved, all in one simple place. Sign in with your company Google
          account to get started.
        </p>

      </section>

      <section className="ts-login-panel">
        <Card className="w-full max-w-md shadow-none">
          <AuthForm initialError={initialError} />
        </Card>
      </section>
    </main>
  );
}
