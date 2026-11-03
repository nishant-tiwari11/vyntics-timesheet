import "./login.css";
import AuthForm from "./AuthForm";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="ts-auth">
      <div className="ts-card ts-auth-card">
        <div className="ts-auth-brand">
          <span className="ts-brand-mark" aria-hidden="true">V</span>
          <span className="ts-auth-brand-name">
            Vyntics <span className="ts-muted">Timesheet</span>
          </span>
        </div>
        <AuthForm />
      </div>
    </main>
  );
}
