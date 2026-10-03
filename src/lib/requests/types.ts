export type RequestSource = "web" | "mcp";

export type RequestImageInput = {
  /** MIME type, e.g. image/png. Defaults when inferable from data URL. */
  mimeType?: string;
  /**
   * Either a `data:` URL / raw base64 payload, or an http(s) URL the server
   * will fetch and store. MCP tools may pass either.
   */
  data: string;
};

export type CreateRequestInput = {
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
