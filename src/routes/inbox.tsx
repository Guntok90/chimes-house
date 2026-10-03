import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { Inbox, Lock, LogOut } from "lucide-react";
import { PageTitle, Surface } from "@/components/chimes/ui";
import type { StoredRequest } from "@/lib/requests/types";

export const Route = createFileRoute("/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox · Chimes" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Guy-only request inbox." },
    ],
  }),
  component: InboxPage,
});

function InboxPage() {
  const passwordId = useId();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requests, setRequests] = useState<StoredRequest[]>([]);
  const [loadError, setLoadError] = useState("");

  const loadInbox = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/inbox", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (res.status === 401) {
        setAuthed(false);
        setRequests([]);
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        requests?: StoredRequest[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setLoadError(data.error || "Could not load inbox");
        setAuthed(true);
        return;
      }
      setRequests(data.requests ?? []);
      setAuthed(true);
    } catch {
      setLoadError("Couldn’t reach the server");
      setAuthed(false);
    }
  }, []);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setLoginError("");
    try {
      const res = await fetch("/api/inbox/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setLoginError(data.error || "Wrong password");
        setBusy(false);
        return;
      }
      setPassword("");
      setBusy(false);
      await loadInbox();
    } catch {
      setLoginError("Couldn’t reach the server");
      setBusy(false);
    }
  }

  async function onLogout() {
    await fetch("/api/inbox/logout", {
      method: "POST",
      credentials: "same-origin",
    });
    setAuthed(false);
    setRequests([]);
  }

  function formatWhen(iso: string): string {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(80% 50% at 0% 0%, rgb(28 57 64 / 0.2), transparent 55%), radial-gradient(60% 40% at 100% 20%, rgb(174 89 60 / 0.1), transparent 50%), linear-gradient(165deg, #1c3940 0%, #2a4e56 35%, #f1eee9 35%)",
        }}
      />

      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 pb-2 pt-8 md:px-8">
        <div className="flex items-center gap-3 text-paper">
          <div className="grid size-10 place-items-center rounded-md border border-white/20 bg-white/10">
            <Inbox className="size-5" strokeWidth={1.7} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-paper/60">Guy only</p>
            <p className="text-lg font-semibold tracking-tight">Request inbox</p>
          </div>
        </div>
        {authed ? (
          <button
            type="button"
            onClick={() => void onLogout()}
            className="inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/10 px-3 py-2 text-sm text-paper backdrop-blur-sm hover:bg-white/20"
          >
            <LogOut className="size-4" strokeWidth={1.7} />
            Lock
          </button>
        ) : null}
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-16 pt-10 md:px-8">
        {authed === null ? (
          <p className="text-sm text-ink-soft">Loading…</p>
        ) : !authed ? (
          <Surface className="max-w-md p-6 md:p-8" tone="sand">
            <div className="mb-5 flex items-center gap-3">
              <Lock className="size-5 text-teal" strokeWidth={1.7} />
              <PageTitle>Inbox password</PageTitle>
            </div>
            <p className="mb-5 text-sm text-ink-soft">
              Separate from Dad’s family login. Set{" "}
              <code className="rounded bg-paper-deep px-1.5 py-0.5 text-xs">
                GUY_INBOX_PASSWORD
              </code>{" "}
              on Vercel.
            </p>
            <form onSubmit={onLogin} className="flex flex-col gap-4" noValidate>
              <label htmlFor={passwordId} className="sr-only">
                Inbox password
              </label>
              <input
                id={passwordId}
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded-md border border-line bg-white/70 px-3.5 py-3 outline-none focus:border-teal/50"
              />
              {loginError ? (
                <p className="text-sm text-terra" role="alert">
                  {loginError}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-teal px-5 py-3 text-sm font-semibold text-paper"
              >
                {busy ? "Checking…" : "Open inbox"}
              </button>
            </form>
          </Surface>
        ) : (
          <div className="flex flex-col gap-5">
            <div>
              <PageTitle>Incoming</PageTitle>
              <p className="mt-1 text-sm text-ink-soft">
                Newest first. Dad never sees this page from the dashboard nav.
              </p>
            </div>

            {loadError ? (
              <p className="text-sm text-terra" role="alert">
                {loadError}
              </p>
            ) : null}

            {requests.length === 0 ? (
              <Surface className="p-8 text-center" tone="sand">
                <Inbox className="mx-auto size-8 text-teal/70" strokeWidth={1.5} />
                <p className="mt-3 text-base font-medium">No requests yet</p>
                <p className="mt-1 text-sm text-ink-soft">
                  When Dad submits a bug or idea, it shows up here.
                </p>
              </Surface>
            ) : (
              <ul className="flex flex-col gap-4">
                {requests.map((item) => (
                  <li key={item.id}>
                    <Surface className="overflow-hidden p-5 md:p-6" tone="sand">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h2 className="text-lg font-semibold tracking-tight">
                          {item.title}
                        </h2>
                        <time
                          dateTime={item.createdAt}
                          className="text-xs uppercase tracking-widest text-ink-soft"
                        >
                          {formatWhen(item.createdAt)}
                        </time>
                      </div>
                      <p className="mt-1 text-xs uppercase tracking-widest text-umber/70">
                        via {item.source === "mcp" ? "MCP" : "web form"}
                      </p>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                        {item.description}
                      </p>
                      {item.images.length > 0 ? (
                        <ul className="mt-4 flex flex-wrap gap-3">
                          {item.images.map((img) => (
                            <li key={img.id}>
                              <a
                                href={img.url}
                                target="_blank"
                                rel="noreferrer"
                                className="block overflow-hidden rounded-md border border-line bg-white/60"
                              >
                                <img
                                  src={img.url}
                                  alt=""
                                  className="h-28 w-auto max-w-[12rem] object-cover"
                                />
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </Surface>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
