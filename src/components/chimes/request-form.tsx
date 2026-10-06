import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bug, Check, ImagePlus, Lightbulb, X } from "lucide-react";
import { PageTitle, Surface } from "@/components/chimes/ui";
import { cn } from "@/lib/utils";
import { MAX_REQUEST_IMAGES, requestKindLabel, type RequestKind } from "@/lib/requests/types";

type Preview = {
  id: string;
  file: File;
  url: string;
};

const COPY: Record<
  RequestKind,
  { title: string; blurb: string; titlePlaceholder: string; descPlaceholder: string }
> = {
  bug: {
    title: "Report a bug",
    blurb: "Something broken or wrong on the dashboard? Screenshots help. Only Guy sees this.",
    titlePlaceholder: "What’s broken?",
    descPlaceholder: "What happened? What did you expect?",
  },
  feature: {
    title: "Request a feature",
    blurb: "An idea for something new on Chimes? Screenshots or sketches help. Only Guy sees this.",
    titlePlaceholder: "What would you like?",
    descPlaceholder: "Describe the idea — when you’d use it, why it helps.",
  },
};

export function RequestFormPage({ kind }: { kind: RequestKind }) {
  const copy = COPY[kind];
  const titleId = useId();
  const descId = useId();
  const fileId = useId();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const KindIcon = kind === "bug" ? Bug : Lightbulb;

  const revokeAll = useCallback((items: Preview[]) => {
    for (const p of items) URL.revokeObjectURL(p.url);
  }, []);

  useEffect(() => {
    return () => revokeAll(previews);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on unmount
  }, []);

  function addFiles(fileList: FileList | File[]) {
    const allowed = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
    const files = Array.from(fileList);
    const incoming = files.filter((f) => !f.type || allowed.has(f.type));
    if (incoming.length === 0) {
      setError("Use a JPG, PNG, or WebP image");
      return;
    }
    setError(incoming.length < files.length ? "Use a JPG, PNG, or WebP image" : "");
    setPreviews((prev) => {
      const room = Math.max(0, MAX_REQUEST_IMAGES - prev.length);
      const nextFiles = incoming.slice(0, room);
      if (nextFiles.length < incoming.length) {
        setError(`You can attach up to ${MAX_REQUEST_IMAGES} images`);
      }
      const added = nextFiles.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        url: URL.createObjectURL(file),
      }));
      return [...prev, ...added];
    });
  }

  function removePreview(id: string) {
    setPreviews((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  function onPaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      event.preventDefault();
      addFiles(files);
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer?.files?.length) {
      addFiles(event.dataTransfer.files);
    }
  }

  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.readAsDataURL(file);
    });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sent) return;
    const t = title.trim();
    const d = description.trim();
    if (!t || !d) {
      setError("Title and description are both required");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const images = await Promise.all(
        previews.map(async (p) => ({
          data: await fileToDataUrl(p.file),
          mimeType: p.file.type || "image/png",
          filename: p.file.name,
        })),
      );

      const res = await fetch("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ kind, title: t, description: d, images }),
      });

      let data: { ok?: boolean; error?: string } | null = null;
      try {
        data = (await res.json()) as { ok?: boolean; error?: string };
      } catch {
        data = null;
      }

      if (!res.ok || !data?.ok) {
        setError(data?.error || "Could not send — try again");
        setBusy(false);
        return;
      }

      revokeAll(previews);
      setPreviews([]);
      setTitle("");
      setDescription("");
      setSent(true);
      setBusy(false);
    } catch {
      setError("Couldn’t reach the server. Check the connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-paper text-ink" onPaste={onPaste}>
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
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-md border border-line bg-white/60 text-teal">
            <KindIcon className="size-5" strokeWidth={1.7} />
          </div>
          <PageTitle>{copy.title}</PageTitle>
        </div>
        <p className="mt-2 max-w-xl text-sm text-ink-soft">{copy.blurb}</p>

        <Surface className="mt-8 p-5 md:p-7" tone="sand">
          {sent ? (
            <div className="flex flex-col items-start gap-4 py-6">
              <div className="grid size-12 place-items-center rounded-full bg-teal text-paper">
                <Check className="size-6" strokeWidth={2} />
              </div>
              <div>
                <p className="text-xl font-semibold tracking-tight">Sent</p>
                <p className="mt-1 text-sm text-ink-soft">
                  Guy will see this {requestKindLabel(kind).toLowerCase()}. You can send another if
                  you like.
                </p>
              </div>
              <button
                type="button"
                className="rounded-md border border-line bg-white/70 px-4 py-2.5 text-sm font-medium backdrop-blur-sm hover:bg-white"
                onClick={() => setSent(false)}
              >
                Send another
              </button>
            </div>
          ) : (
            <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
              <div>
                <label
                  htmlFor={titleId}
                  className="text-xs font-semibold uppercase tracking-widest text-umber"
                >
                  Title
                </label>
                <input
                  id={titleId}
                  name="title"
                  required
                  value={title}
                  disabled={busy}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={copy.titlePlaceholder}
                  className="mt-2 w-full rounded-md border border-line bg-white/70 px-3.5 py-3 text-base outline-none backdrop-blur-sm focus:border-teal/50"
                />
              </div>

              <div>
                <label
                  htmlFor={descId}
                  className="text-xs font-semibold uppercase tracking-widest text-umber"
                >
                  Description
                </label>
                <textarea
                  id={descId}
                  name="description"
                  required
                  rows={7}
                  value={description}
                  disabled={busy}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={copy.descPlaceholder}
                  className="mt-2 w-full resize-y rounded-md border border-line bg-white/70 px-3.5 py-3 text-base outline-none backdrop-blur-sm focus:border-teal/50"
                />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-umber">
                  Screenshots
                </p>
                <div
                  ref={dropRef}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  className={cn(
                    "mt-2 rounded-md border border-dashed px-4 py-6 text-center backdrop-blur-sm transition-colors",
                    dragOver ? "border-teal bg-teal/10" : "border-line bg-white/40",
                  )}
                >
                  <ImagePlus className="mx-auto size-7 text-teal" strokeWidth={1.6} />
                  <p className="mt-2 text-sm text-ink-soft">
                    Drop images here, paste, or choose files
                  </p>
                  <label
                    htmlFor={fileId}
                    className="mt-3 inline-flex cursor-pointer rounded-md border border-line bg-white/80 px-3 py-2 text-sm font-medium hover:bg-white"
                  >
                    Choose images
                  </label>
                  <input
                    id={fileId}
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    disabled={busy}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      if (e.target.files) addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>

                {previews.length > 0 ? (
                  <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {previews.map((p) => (
                      <li
                        key={p.id}
                        className="relative aspect-square overflow-hidden rounded-md border border-line bg-white/60"
                      >
                        <img src={p.url} alt="" className="size-full object-cover" />
                        <button
                          type="button"
                          aria-label="Remove image"
                          disabled={busy}
                          onClick={() => removePreview(p.id)}
                          className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-ink/70 text-paper"
                        >
                          <X className="size-3.5" strokeWidth={2} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              {error ? (
                <p className="text-sm text-terra" role="alert">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className={cn(
                  "rounded-md bg-teal px-5 py-3 text-sm font-semibold text-paper shadow-card transition-opacity",
                  busy && "opacity-70",
                )}
              >
                {busy ? "Sending…" : `Submit ${requestKindLabel(kind).toLowerCase()}`}
              </button>
            </form>
          )}
        </Surface>
      </main>
    </div>
  );
}
