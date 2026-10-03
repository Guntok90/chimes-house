-- Backfill kind for DBs that applied an earlier 0001 without the column.
ALTER TABLE house_requests
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'bug';
