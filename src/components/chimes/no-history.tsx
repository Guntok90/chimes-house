import { Surface } from "./ui";

/** Shown on History / charts when live and the Pi has no recorder series yet. */
export function NoHistoryYet({ label = "history" }: { label?: string }) {
  return (
    <Surface className="grid h-full min-h-40 place-items-center px-6 py-8 text-center">
      <div>
        <p className="font-medium text-ink">No {label} yet</p>
        <p className="mt-1.5 max-w-sm text-sm text-ink-soft">
          Live values are on. Charts appear once Home Assistant recorder data is available on the
          Pi — demo curves are never mixed in.
        </p>
      </div>
    </Surface>
  );
}
