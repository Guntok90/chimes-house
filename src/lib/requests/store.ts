import crypto from "node:crypto";
import { getSql } from "../db.ts";
import type { ParsedImage } from "./parse.ts";
import type {
  RequestKind,
  RequestSource,
  StoredRequest,
  StoredRequestImage,
} from "./types.ts";
import { isRequestKind } from "./types.ts";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return value;
  }
  return new Date().toISOString();
}

function imageUrl(id: string): string {
  return `/api/inbox/images/${encodeURIComponent(id)}`;
}

export async function createHouseRequest(input: {
  kind: RequestKind;
  title: string;
  description: string;
  images: ParsedImage[];
  source: RequestSource;
}): Promise<StoredRequest> {
  const sql = await getSql();
  const id = newId("req");
  const createdAt = new Date().toISOString();

  await sql.query(
    `INSERT INTO house_requests (id, title, description, kind, source, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
    [id, input.title, input.description, input.kind, input.source, createdAt],
  );

  const images: StoredRequestImage[] = [];
  for (let i = 0; i < input.images.length; i += 1) {
    const img = input.images[i]!;
    const imageId = newId("img");
    await sql.query(
      `INSERT INTO house_request_images (id, request_id, mime_type, data_base64, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [imageId, id, img.mimeType, img.dataBase64, i],
    );
    images.push({ id: imageId, mimeType: img.mimeType, url: imageUrl(imageId) });
  }

  return {
    id,
    kind: input.kind,
    title: input.title,
    description: input.description,
    source: input.source,
    createdAt,
    images,
  };
}

type RequestRow = {
  id: string;
  title: string;
  description: string;
  kind: string;
  source: string;
  created_at: unknown;
};

type ImageRow = {
  id: string;
  request_id: string;
  mime_type: string;
  sort_order: number;
};

export async function listHouseRequests(): Promise<StoredRequest[]> {
  const sql = await getSql();
  const rows = await sql.query<RequestRow>(
    `SELECT id, title, description, kind, source, created_at
     FROM house_requests
     ORDER BY created_at DESC`,
  );

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  const imageRows = await sql.query<ImageRow>(
    `SELECT id, request_id, mime_type, sort_order
     FROM house_request_images
     WHERE request_id IN (${placeholders})
     ORDER BY sort_order ASC`,
    ids,
  );

  const byRequest = new Map<string, StoredRequestImage[]>();
  for (const img of imageRows) {
    const list = byRequest.get(img.request_id) ?? [];
    list.push({
      id: img.id,
      mimeType: img.mime_type,
      url: imageUrl(img.id),
    });
    byRequest.set(img.request_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    kind: isRequestKind(row.kind) ? row.kind : "bug",
    title: row.title,
    description: row.description,
    source: row.source === "mcp" ? "mcp" : "web",
    createdAt: asIso(row.created_at),
    images: byRequest.get(row.id) ?? [],
  }));
}

export async function getHouseRequestImage(
  imageId: string,
): Promise<{ mimeType: string; dataBase64: string } | null> {
  const sql = await getSql();
  const rows = await sql.query<{ mime_type: string; data_base64: string }>(
    `SELECT mime_type, data_base64 FROM house_request_images WHERE id = $1`,
    [imageId],
  );
  const row = rows[0];
  if (!row) return null;
  return { mimeType: row.mime_type, dataBase64: row.data_base64 };
}
