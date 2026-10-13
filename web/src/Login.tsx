import { useState, type FormEvent } from "react";
import { type ApiClient, type Session, message } from "./api";
import { Alert } from "./components";
export function Login({
  api,
  onLogin,
  notice,
}: {
  api: ApiClient;
  onLogin: (session: Session) => void;
  notice: string;
}) {
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      onLogin(
        await api.login(
          String(form.get("email")).trim(),
          String(form.get("password")),
        ),
      );
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <section className="intro">
        <a className="brand" href="#/">
          C<span>+</span> CampusFix
        </a>
        <p className="eyebrow">A BETTER CAMPUS, TOGETHER</p>
        <h1>
          Small reports.
          <br />
          Better spaces.
        </h1>
        <p>
          A clear place to report maintenance issues and follow their progress.
        </p>
        <div className="intro-note">
          For students, coordinators &amp; technicians
        </div>
      </section>
      <section className="login-card" aria-labelledby="sign-in-title">
        <p className="eyebrow">WELCOME BACK</p>
        <h2 id="sign-in-title">Sign in to CampusFix</h2>
        <p>Use your campus demo account to continue.</p>
        {notice && <p role="status">{notice}</p>}
        {error && <Alert text={error} />}
        <form onSubmit={(e) => void submit(e)} aria-busy={busy}>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            value={credentials.email}
            onChange={(e) =>
              setCredentials((v) => ({ ...v, email: e.target.value }))
            }
            type="email"
            autoComplete="username"
            required
            maxLength={254}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            value={credentials.password}
            onChange={(e) =>
              setCredentials((v) => ({ ...v, password: e.target.value }))
            }
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
          <button className="primary wide" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="small">
          Accounts are provided by your project administrator. No public
          registration is available.
        </p>
      </section>
    </main>
  );
}
