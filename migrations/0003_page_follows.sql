CREATE TABLE IF NOT EXISTS social_page_follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id INTEGER NOT NULL REFERENCES social_pages(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id,page_id)
);
CREATE INDEX IF NOT EXISTS idx_social_page_follows_page
ON social_page_follows(page_id,created_at DESC);
