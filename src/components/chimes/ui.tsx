import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>;
}

type Tint = "teal" | "terra" | "sand" | "umber";

const labelTone: Record<Tint, string> = {
  teal: "text-teal",
  terra: "text-terra",
  sand: "text-umber",
  umber: "text-umber",
};

const surfaceTone: Record<Tint, string> = {
  teal: "border-teal/35 bg-gradient-to-br from-teal/[0.14] via-white/50 to-sand/25",
  terra: "border-terra/35 bg-gradient-to-br from-terra/[0.14] via-white/50 to-sand/20",
  sand: "border-sand bg-gradient-to-br from-sand/70 via-sand/35 to-white/50",
  umber: "border-umber/30 bg-gradient-to-br from-umber/[0.1] via-sand/30 to-white/55",
};

const metricTone: Record<Tint, string> = {
  teal: "border-teal/35 bg-gradient-to-br from-teal/[0.16] to-sand/30",
  terra: "border-terra/35 bg-gradient-to-br from-terra/[0.16] to-sand/25",
  sand: "border-sand bg-gradient-to-br from-sand/65 to-white/55",
  umber: "border-umber/30 bg-gradient-to-br from-umber/[0.12] to-sand/30",
};

export function SectionLabel({
  children,
  tone,
}: {
  children: ReactNode;
  /** Soft colour cue instead of flat grey — used on Energy and similar pages. */
  tone?: Tint;
}) {
  return (
    <h2
      className={cn(
        "mb-3 text-xs font-semibold uppercase tracking-widest",
        tone ? cn("flex items-center gap-2", labelTone[tone]) : "text-ink-soft",
      )}
    >
      {tone ? (
        <span
          aria-hidden
          className={cn(
            "inline-block h-3 w-1 shrink-0 rounded-full",
            tone === "teal" && "bg-teal",
            tone === "terra" && "bg-terra",
            tone === "sand" && "bg-sand",
            tone === "umber" && "bg-umber",
          )}
        />
      ) : null}
      {children}
    </h2>
  );
}

export function Surface({
  children,
  className,
  tone,
}: {
  children: ReactNode;
  className?: string;
  tone?: Tint;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border backdrop-blur-sm",
        tone ? surfaceTone[tone] : "border-line bg-white/60",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Metric({
  label,
  value,
  hint,
  accent = false,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  /** Soft border/wash when not the solid teal accent card. */
  tone?: Tint;
}) {
  return (
    <div
      className={cn(
        "rounded-md px-4 py-4 backdrop-blur-sm",
        accent
          ? "bg-teal text-paper"
          : tone
            ? cn("border", metricTone[tone])
            : "border border-line bg-white/60",
      )}
    >
      <div
        className={cn(
          "text-xs uppercase tracking-widest",
          accent ? "text-paper/70" : tone ? labelTone[tone] : "text-ink-soft",
        )}
      >
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-medium tracking-tight tabular-nums">{value}</div>
      {hint ? (
        <div className={cn("mt-1 text-sm", accent ? "text-paper/70" : "text-ink-soft")}>{hint}</div>
      ) : null}
    </div>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-3 last:border-0">
      <span className="text-ink-soft">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md bg-paper-deep p-1">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            "min-h-9 rounded-sm px-3 text-sm font-medium transition-colors duration-150",
            value === opt.id ? "bg-paper-raised text-ink shadow-sm" : "text-ink-soft",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Tile({
  id,
  label,
  detail,
  state,
  onToggle,
  icon: Icon,
  available = true,
}: {
  id: string;
  label: string;
  detail?: string;
  state?: boolean;
  onToggle: (id: string) => void;
  icon: LucideIcon;
  /** When false (live + unmapped), show Unavailable and do not toggle. */
  available?: boolean;
}) {
  const active = Boolean(state);
  return (
    <button
      type="button"
      disabled={!available}
      onClick={() => {
        if (available) onToggle(id);
      }}
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-md border px-3.5 py-3 text-left transition-colors duration-150",
        !available
          ? "cursor-not-allowed border-line bg-white/40 opacity-70"
          : active
            ? "border-line bg-paper-raised"
            : "border-line bg-white/55",
      )}
    >
      <span
        className={cn(
          "grid size-9 place-items-center rounded-sm",
          !available
            ? "bg-paper-deep text-ink-soft"
            : active
              ? "bg-terra/15 text-terra"
              : "bg-teal/10 text-teal",
        )}
      >
        <Icon className="size-4" strokeWidth={1.7} />
      </span>
      <span>
        <span className="block font-medium">{label}</span>
        <span className="text-sm text-ink-soft">
          {detail ?? (!available ? "Unavailable" : active ? "On" : "Off")}
        </span>
      </span>
    </button>
  );
}

export function Room({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <SectionLabel>{title}</SectionLabel>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}
