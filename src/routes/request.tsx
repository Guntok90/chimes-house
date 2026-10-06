import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bug, Lightbulb } from "lucide-react";
import { PageTitle, Surface } from "@/components/chimes/ui";

/** Chooser kept so old /request bookmarks still work. Prefer /bug and /feature. */
export const Route = createFileRoute("/request")({
  head: () => ({
    meta: [
      { title: "Send to Guy · Chimes" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RequestChooser,
});

function RequestChooser() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(90% 60% at 10% 0%, rgb(61 106 115 / 0.18), transparent 55%), radial-gradient(70% 50% at 100% 100%, rgb(174 89 60 / 0.12), transparent 50%), linear-gradient(180deg, #f7f4ef, #f1eee9 40%, #e7e2d9)",
        }}
      />
      <header className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 pb-2 pt-6 md:px-8 md:pt-10">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-md border border-line bg-white/50 px-3 py-2 text-sm text-ink-soft backdrop-blur-sm hover:bg-white/80"
        >
          <ArrowLeft className="size-4" strokeWidth={1.7} />
          Back to Chimes
        </Link>
        <div className="flex items-center gap-2">
          <img src="/brand/mark.png" alt="" className="size-8 object-contain" />
          <span className="text-sm font-semibold tracking-tight">Chimes</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 pb-16 pt-4 md:px-8">
        <PageTitle>Send to Guy</PageTitle>
        <p className="mt-2 text-sm text-ink-soft">
          Pick one — bugs and feature ideas stay separate.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link to="/bug" className="block">
            <Surface className="h-full p-6 transition-colors hover:border-terra/40" tone="sand">
              <Bug className="size-7 text-terra" strokeWidth={1.7} />
              <p className="mt-4 text-lg font-semibold tracking-tight">Report a bug</p>
              <p className="mt-1 text-sm text-ink-soft">Something broken or wrong</p>
            </Surface>
          </Link>
          <Link to="/feature" className="block">
            <Surface className="h-full p-6 transition-colors hover:border-teal/40" tone="sand">
              <Lightbulb className="size-7 text-teal" strokeWidth={1.7} />
              <p className="mt-4 text-lg font-semibold tracking-tight">Request a feature</p>
              <p className="mt-1 text-sm text-ink-soft">An idea for something new</p>
            </Surface>
          </Link>
        </div>
      </main>
    </div>
  );
}
