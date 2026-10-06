/**
 * Forward a Dad bug/feature to Guy’s desk.
 *
 * Both the web route (`POST /api/requests`) and the MCP tools
 * (`submit_bug` / `submit_feature`) call `createHouseRequest`.
 * This does not write `house_requests`. Guy reads the queue at the desk.
 *
 * Server-only. `DESK_INTAKE_TOKEN` is read from the environment here and
 * never sent to the browser.
 */
import { env } from "../env.server.ts";
import type { ParsedImage } from "./parse.ts";
import {
  MAX_IMAGE_BYTES,
  MAX_REQUEST_IMAGES,
  type DeskRequestSource,
  type RequestKind,
} from "./types.ts";

export const DESK_INTAKE_URL = "https://desk.shyftstudio.at/api/intake";

const PLAIN_ERROR = "Could not send request";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type CreateHouseRequestInput = {
  kind: RequestKind;
  title: string;
  description: string;
  images: ParsedImage[];
  source: DeskRequestSource;
};

export type CreateHouseRequestResult = { ok: true; id: string } | { ok: false; error: string };

type FetchLike = typeof fetch;

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error("Desk intake is server-only");
  }
}

assertServerOnly();

function extensionFor(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function safeFilename(raw: string | undefined, mimeType: string, index: number): string {
  const ext = extensionFor(mimeType);
  const fallback = index === 0 ? `image.${ext}` : `image-${index + 1}.${ext}`;
  if (!raw) return fallback;
  const base = raw.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 80);
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  const lower = cleaned.toLowerCase();
  if (lower.endsWith(`.${ext}`) || (ext === "jpg" && lower.endsWith(".jpeg"))) {
    return cleaned;
  }
  const stem = cleaned.replace(/\.[A-Za-z0-9]+$/, "") || "image";
  return `${stem}.${ext}`;
}

export function deskImages(images: ParsedImage[]) {
  return images.map((img, index) => {
    const mimeType = img.mimeType === "image/jpg" ? "image/jpeg" : img.mimeType;
    return {
      data: `data:${mimeType};base64,${img.dataBase64}`,
      mimeType,
      filename: safeFilename(img.filename, mimeType, index),
    };
  });
}

function invalidImages(images: ParsedImage[]): string | null {
  if (images.length > MAX_REQUEST_IMAGES) {
    return `At most ${MAX_REQUEST_IMAGES} images`;
  }
  for (const img of images) {
    if (!ALLOWED_MIME.has(img.mimeType)) {
      return "Use a JPG, PNG, or WebP image";
    }
    if (img.byteLength > MAX_IMAGE_BYTES) {
      return `Image too large (max ${MAX_IMAGE_BYTES / (1024 * 1024)} MiB)`;
    }
    if (/^https?:\/\//i.test(img.dataBase64)) {
      return PLAIN_ERROR;
    }
  }
  return null;
}

/**
 * POST the request to Guy’s desk. On success returns the desk id.
 * On failure returns a plain error and does not claim the request was sent.
 */
export async function createHouseRequest(
  input: CreateHouseRequestInput,
  fetchImpl: FetchLike = fetch,
): Promise<CreateHouseRequestResult> {
  assertServerOnly();

  const imageError = invalidImages(input.images);
  if (imageError) return { ok: false, error: imageError };

  const token = env("DESK_INTAKE_TOKEN");
  if (!token) {
    console.error("[requests] desk intake is not configured");
    return { ok: false, error: PLAIN_ERROR };
  }

  const payload = {
    kind: input.kind,
    title: input.title,
    description: input.description,
    from: "Dad" as const,
    source: input.source,
    images: deskImages(input.images),
  };

  let res: Response;
  try {
    res = await fetchImpl(DESK_INTAKE_URL, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    console.error("[requests] desk intake request failed");
    return { ok: false, error: PLAIN_ERROR };
  }

  if (res.status !== 200) {
    console.error("[requests] desk intake status", res.status);
    return { ok: false, error: PLAIN_ERROR };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    console.error("[requests] desk intake returned non-JSON");
    return { ok: false, error: PLAIN_ERROR };
  }

  const id =
    body &&
    typeof body === "object" &&
    (body as { ok?: unknown }).ok === true &&
    typeof (body as { id?: unknown }).id === "string"
      ? (body as { id: string }).id
      : "";

  if (!id) {
    console.error("[requests] desk intake rejected the request");
    return { ok: false, error: PLAIN_ERROR };
  }

  return { ok: true, id };
}
