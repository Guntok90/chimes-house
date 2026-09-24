import { Bot, Camera, Car, Sun, TreeDeciduous, Waves } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useHouse } from "@/lib/house-store";
import { cn } from "@/lib/utils";
import { PageTitle, Room, SectionLabel, Tile } from "./ui";

/**
 * Front / Back garden shell. Cameras and Frank are placeholders until HA
 * entities exist — never invent live streams here.
 */
export function GardenView({
  on,
  toggle,
}: {
  on: Record<string, boolean>;
  toggle: (id: string) => void;
}) {
  const status = useHouse((s) => s.status);
  const map = useHouse((s) => s.map);
  const mapped = (id: string) => status !== "live" || Boolean(map[id as keyof typeof map]);

  return (
    <div className="space-y-8">
      <PageTitle>Garden</PageTitle>

      <section>
        <SectionLabel>Front garden</SectionLabel>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          <PlaceCard
            icon={TreeDeciduous}
            label="Willow Tree"
            detail="Camera soon"
            hint="Front garden · feed not linked yet"
          />
          <PlaceCard
            icon={Car}
            label="Range Rover"
            detail="Camera soon"
            hint="Front garden · feed not linked yet"
          />
        </div>
      </section>

      <Room title="Back garden">
        <Tile
          id="pergola"
          label="Pergola"
          state={on.pergola}
          onToggle={toggle}
          icon={Sun}
          available={mapped("pergola")}
        />
        <Tile
          id="pond-1"
          label="Pond 1"
          state={on["pond-1"]}
          onToggle={toggle}
          icon={Waves}
          available={mapped("pond-1")}
        />
        <Tile
          id="pond-2"
          label="Pond 2"
          state={on["pond-2"]}
          onToggle={toggle}
          icon={Waves}
          available={mapped("pond-2")}
        />
        <PlaceCard
          icon={Bot}
          label="Frank"
          detail="Coming soon"
          hint="Landroid robot mower · not in HA yet"
          disabled
        />
      </Room>
    </div>
  );
}

function PlaceCard({
  icon: Icon,
  label,
  detail,
  hint,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-md border border-line px-3.5 py-3",
        disabled ? "bg-white/40 opacity-70" : "bg-white/55",
      )}
      aria-disabled={disabled || undefined}
    >
      <span className="relative grid size-9 place-items-center rounded-sm bg-paper-deep text-ink-soft">
        <Icon className="size-4" strokeWidth={1.7} />
        {!disabled ? (
          <Camera
            className="absolute -bottom-0.5 -right-0.5 size-3 text-ink-soft"
            strokeWidth={2}
            aria-hidden
          />
        ) : null}
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-ink-soft">{detail}</span>
        <span className="block text-xs text-ink-soft/80">{hint}</span>
      </span>
    </div>
  );
}
