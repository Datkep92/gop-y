CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  owner_hash TEXT UNIQUE NOT NULL,
  scope TEXT NOT NULL,
  stance TEXT NOT NULL,
  topic TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE reactions (
  feedback_id TEXT NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  voter_hash TEXT NOT NULL,
  PRIMARY KEY (feedback_id, voter_hash)
);
CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL
);
CREATE INDEX rate_expiry ON rate_limits(expires_at);
CREATE INDEX feedback_created ON feedback(created_at DESC);
