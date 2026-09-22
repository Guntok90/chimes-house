import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useId, useState, type FormEvent } from "react";
import { asErrorText, loginErrorMessage } from "@/lib/family-auth/client-errors";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Shyft · Chimes" },
      { name: "theme-color", content: "#0b1220" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content: "Shyft Chimes — sign in to Dad’s house dashboard.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Outfit:wght@500;600;700&display=swap",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const passwordId = useId();
  const errorId = useId();
  const hintId = useId();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("shyft-login-root");
    document.body.classList.add("shyft-login-root");
    return () => {
      document.documentElement.classList.remove("shyft-login-root");
      document.body.classList.remove("shyft-login-root");
    };
  }, []);

  function showError(message: unknown) {
    setError(asErrorText(message));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = password;
    if (!value) {
      showError("Enter the family password");
      return;
    }

    setBusy(true);
    showError("");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ password: value }),
      });

      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      const ok = Boolean(data && typeof data === "object" && (data as { ok?: boolean }).ok);
      if (!res.ok || !ok) {
        showError(loginErrorMessage(data, res.status));
        setBusy(false);
        return;
      }

      const next = new URLSearchParams(window.location.search).get("next");
      const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      window.location.assign(target);
    } catch {
      showError("Couldn’t reach the server. Check the connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="shyft-login">
      <div className="shyft-login-stage" aria-hidden="true">
        <div className="shyft-glow shyft-glow-solar" />
        <div className="shyft-glow shyft-glow-battery" />
        <div className="shyft-glow shyft-glow-grid" />
        <div className="shyft-grain" />
      </div>

      <main className="shyft-login-shell">
        <section className="shyft-login-card" aria-labelledby="login-brand">
          <header className="shyft-login-brand">
            <p className="shyft-wordmark" id="login-brand">
              Shyft
            </p>
            <p className="shyft-sub">Chimes · Dad’s house</p>
          </header>

          <form className="shyft-login-form" onSubmit={onSubmit} noValidate>
            <label className="shyft-field-label" htmlFor={passwordId}>
              Family password
            </label>
            <div className="shyft-field-row">
              <input
                id={passwordId}
                name="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                enterKeyHint="go"
                required
                autoFocus
                spellCheck={false}
                placeholder="Enter password"
                aria-describedby={`${errorId} ${hintId}`}
                aria-invalid={error ? true : undefined}
                value={password}
                disabled={busy}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) showError("");
                }}
                className={error ? "is-invalid" : undefined}
              />
              <button
                type="button"
                className="shyft-eye-btn"
                aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show}
                title="Show / hide"
                onClick={() => setShow((v) => !v)}
              >
                {show ? <EyeShutIcon /> : <EyeOpenIcon />}
              </button>
            </div>

            <p id={errorId} className="shyft-login-error" role="alert" hidden={!error}>
              {error}
            </p>

            <button
              type="submit"
              className={`shyft-enter-btn${busy ? " is-busy" : ""}`}
              disabled={busy}
            >
              <span className="shyft-enter-label">Enter</span>
              <span className="shyft-enter-spinner" aria-hidden="true" />
            </button>

            <p id={hintId} className="shyft-login-hint">
              After you enter, a tablet on Tailscale connects to the Pi on its own.
            </p>
          </form>
        </section>
      </main>
    </div>
  );
}

function EyeOpenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeShutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3l18 18M10.6 10.6A3 3 0 0 0 14.1 14.1M6.5 6.6C3.8 8.4 2 12 2 12s3.5 6 10 6c1.6 0 3-.3 4.3-.9M9.9 5.1C10.6 5 11.3 5 12 5c6.5 0 10 7 10 7s-.8 1.5-2.3 3.1" />
    </svg>
  );
}
