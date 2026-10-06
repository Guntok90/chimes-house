export type RequestKind = "bug" | "feature";
export type RequestSource = "web" | "mcp";

export type RequestImageInput = {
  /** MIME type, e.g. image/png. Defaults when inferable from data URL. */
  mimeType?: string;
  /**
   * Either a `data:` URL / raw base64 payload, or an http(s) URL the server
   * downloads before forwarding. The desk does not fetch URLs itself.
   */
  data: string;
  /** Original file name, when the caller has one. */
  filename?: string;
};

/** Where Guy’s desk should say the request came from. */
export type DeskRequestSource = "form" | "mcp";

/**
 * Family web form → `"form"`.
 * Bearer `CHIMES_REQUEST_API_TOKEN` (MCP tools and older `submit_request`) → `"mcp"`.
 */
export function intakeSource(fromBearerToken: boolean): DeskRequestSource {
  return fromBearerToken ? "mcp" : "form";
}

export type CreateRequestInput = {
  /**
   * `"bug"` or `"feature"`.
   * Omitted or blank → `"feature"` so older callers (Dad’s house MCP
   * `submit_request`) still work.
   */
  kind?: RequestKind;
  title: string;
  description: string;
  images?: RequestImageInput[];
  source?: RequestSource;
};

export type StoredRequestImage = {
  id: string;
  mimeType: string;
  /** Path Guy’s inbox uses to load the image (cookie-gated). */
  url: string;
};

export type StoredRequest = {
  id: string;
  kind: RequestKind;
  title: string;
  description: string;
  source: RequestSource;
  createdAt: string;
  images: StoredRequestImage[];
};

export const MAX_REQUEST_IMAGES = 6;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MiB each
export const MAX_TITLE_CHARS = 200;
export const MAX_DESCRIPTION_CHARS = 8000;

export function isRequestKind(value: unknown): value is RequestKind {
  return value === "bug" || value === "feature";
}

export function requestKindLabel(kind: RequestKind): string {
  return kind === "feature" ? "Feature" : "Bug";
}
