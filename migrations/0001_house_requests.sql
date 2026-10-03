-- Dad bug / feature requests (web form + MCP). Images stored as base64 for
-- Neon/PGLite driver parity; served from /api/inbox/images/:id for Guy's inbox.

CREATE TABLE IF NOT EXISTS house_requests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'web',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS house_requests_created_at_idx
  ON house_requests (created_at DESC);

CREATE TABLE IF NOT EXISTS house_request_images (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES house_requests (id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL,
  data_base64 TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS house_request_images_request_id_idx
  ON house_request_images (request_id, sort_order);
