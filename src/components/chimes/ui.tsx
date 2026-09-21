import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-soft">
      {children}
    </h2>
  );
}

export function Surface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-line bg-white/60", className)}>{children}</div>
  );
}

export function Metric({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md px-4 py-4",
        accent ? "bg-teal text-paper" : "border border-line bg-white/60",
      )}
    >
      <div
        className={cn(
          "text-xs uppercase tracking-widest",
          accent ? "text-paper/70" : "text-ink-soft",
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
}: {
  id: string;
  label: string;
  detail?: string;
  state?: boolean;
  onToggle: (id: string) => void;
  icon: LucideIcon;
}) {
  const active = Boolean(state);
  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-md border px-3.5 py-3 text-left transition-colors duration-150",
        active ? "border-line bg-paper-raised" : "border-line bg-white/55",
      )}
    >
      <span
        className={cn(
          "grid size-9 place-items-center rounded-sm",
          active ? "bg-terra/15 text-terra" : "bg-teal/10 text-teal",
        )}
      >
        <Icon className="size-4" strokeWidth={1.7} />
      </span>
      <span>
        <span className="block font-medium">{label}</span>
        <span className="text-sm text-ink-soft">{detail ?? (active ? "On" : "Off")}</span>
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
