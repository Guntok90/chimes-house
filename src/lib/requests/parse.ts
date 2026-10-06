import type { CreateRequestInput, RequestImageInput, RequestKind } from "./types.ts";
import {
  isRequestKind,
  MAX_DESCRIPTION_CHARS,
  MAX_IMAGE_BYTES,
  MAX_REQUEST_IMAGES,
  MAX_TITLE_CHARS,
} from "./types.ts";

export type ParsedImage = {
  mimeType: string;
  dataBase64: string;
  byteLength: number;
  filename?: string;
};

export type ParseError = { ok: false; error: string; status: number };
export type ParseOk = {
  ok: true;
  kind: RequestKind;
  title: string;
  description: string;
  images: ParsedImage[];
};

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

function normalizeMime(raw: string | undefined): string | null {
  if (!raw) return null;
  let mime = raw.trim().toLowerCase().split(";")[0]!.trim();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (!ALLOWED_MIME.has(mime)) return null;
  return mime;
}

function cleanFilename(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function filenameFromUrl(url: string): string | undefined {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (!last) return undefined;
    return decodeURIComponent(last);
  } catch {
    return undefined;
  }
}

/** Strip whitespace from base64 payloads (data URLs / pasted blobs). */
function cleanBase64(raw: string): string {
  return raw.replace(/\s+/g, "");
}

function estimateBase64Bytes(b64: string): number {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/**
 * Accept:
 * - data:image/png;base64,...
 * - raw base64 (mimeType required)
 * - http(s) URL (fetched by resolveRemoteImages)
 */
export function parseInlineImage(
  input: RequestImageInput,
): { ok: true; image: ParsedImage } | { ok: false; error: string } {
  const raw = typeof input.data === "string" ? input.data.trim() : "";
  if (!raw) return { ok: false, error: "Empty image" };

  if (/^https?:\/\//i.test(raw)) {
    return { ok: false, error: "remote" }; // caller fetches
  }

  let mimeType = normalizeMime(input.mimeType);
  let base64 = raw;

  const dataUrl = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(raw);
  if (dataUrl) {
    mimeType = normalizeMime(dataUrl[1] || input.mimeType) ?? mimeType;
    const isBase64 = Boolean(dataUrl[2]);
    const payload = dataUrl[3] ?? "";
    if (!isBase64) {
      // percent-encoded data URL — uncommon; reject rather than guess
      return { ok: false, error: "Image must be base64 (data URL)" };
    }
    base64 = cleanBase64(payload);
  } else {
    base64 = cleanBase64(raw);
  }

  if (!mimeType) {
    return { ok: false, error: "Unsupported or missing image type" };
  }
  if (!/^[A-Za-z0-9+/]+=*$/.test(base64) || base64.length < 8) {
    return { ok: false, error: "Invalid image data" };
  }

  const byteLength = estimateBase64Bytes(base64);
  if (byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, error: `Image too large (max ${MAX_IMAGE_BYTES / (1024 * 1024)} MiB)` };
  }
  if (byteLength < 16) {
    return { ok: false, error: "Image too small" };
  }

  return {
    ok: true,
    image: {
      mimeType,
      dataBase64: base64,
      byteLength,
      filename: cleanFilename(input.filename),
    },
  };
}

export async function resolveRemoteImage(
  url: string,
  mimeHint?: string,
  filenameHint?: string,
): Promise<{ ok: true; image: ParsedImage } | { ok: false; error: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Invalid image URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Image URL must be http(s)" };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { Accept: "image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, error: "Could not fetch image URL" };
  }
  if (!res.ok) {
    return { ok: false, error: `Image URL returned ${res.status}` };
  }

  const contentType = normalizeMime(res.headers.get("content-type") ?? undefined);
  const mimeType = contentType ?? normalizeMime(mimeHint);
  if (!mimeType) {
    return { ok: false, error: "Image URL is not a supported image type" };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, error: `Image too large (max ${MAX_IMAGE_BYTES / (1024 * 1024)} MiB)` };
  }
  if (buf.byteLength < 16) {
    return { ok: false, error: "Image too small" };
  }

  return {
    ok: true,
    image: {
      mimeType,
      dataBase64: buf.toString("base64"),
      byteLength: buf.byteLength,
      filename: cleanFilename(filenameHint) ?? filenameFromUrl(url),
    },
  };
}

export async function parseCreateRequestBody(body: unknown): Promise<ParseOk | ParseError> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Expected JSON body", status: 400 };
  }
  const input = body as CreateRequestInput;
  const rawKind = (body as { kind?: unknown }).kind;
  let kind: RequestKind;
  if (rawKind == null || rawKind === "") {
    // Older POST /api/requests callers (Dad’s house MCP submit_request) omit kind.
    kind = "feature";
  } else if (!isRequestKind(rawKind)) {
    return {
      ok: false,
      error: 'kind must be "bug" or "feature"',
      status: 400,
    };
  } else {
    kind = rawKind;
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";

  if (!title) return { ok: false, error: "Title is required", status: 400 };
  if (!description) return { ok: false, error: "Description is required", status: 400 };
  if (title.length > MAX_TITLE_CHARS) {
    return { ok: false, error: `Title max ${MAX_TITLE_CHARS} characters`, status: 400 };
  }
  if (description.length > MAX_DESCRIPTION_CHARS) {
    return {
      ok: false,
      error: `Description max ${MAX_DESCRIPTION_CHARS} characters`,
      status: 400,
    };
  }

  const rawImages = Array.isArray(input.images) ? input.images : [];
  if (rawImages.length > MAX_REQUEST_IMAGES) {
    return {
      ok: false,
      error: `At most ${MAX_REQUEST_IMAGES} images`,
      status: 400,
    };
  }

  const images: ParsedImage[] = [];
  for (const item of rawImages) {
    if (!item || typeof item !== "object" || typeof (item as RequestImageInput).data !== "string") {
      return { ok: false, error: "Each image needs a data string", status: 400 };
    }
    const imgInput = item as RequestImageInput;
    const inline = parseInlineImage(imgInput);
    if (inline.ok) {
      images.push(inline.image);
      continue;
    }
    if (inline.error === "remote") {
      const remote = await resolveRemoteImage(
        imgInput.data.trim(),
        imgInput.mimeType,
        imgInput.filename,
      );
      if (!remote.ok) return { ok: false, error: remote.error, status: 400 };
      images.push(remote.image);
      continue;
    }
    return { ok: false, error: inline.error, status: 400 };
  }

  return { ok: true, kind, title, description, images };
}
