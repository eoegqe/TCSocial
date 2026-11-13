CREATE TABLE IF NOT EXISTS social_post_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  media_kind TEXT NOT NULL CHECK (media_kind IN ('image','video','file')),
  file_size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_post_media_post_id ON social_post_media(post_id, id);
