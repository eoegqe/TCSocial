CREATE TABLE IF NOT EXISTS social_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  profile_picture TEXT,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS social_page_managers (
  page_id INTEGER NOT NULL REFERENCES social_pages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner','admin','editor')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (page_id,user_id)
);

ALTER TABLE social_posts ADD COLUMN author_page_id INTEGER REFERENCES social_pages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_social_page_managers_user ON social_page_managers(user_id,page_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_author_page ON social_posts(author_page_id,created_at DESC);

INSERT OR IGNORE INTO social_pages (id,handle,display_name,profile_picture,owner_user_id,status,created_at)
VALUES (1,'TC','Theegget Creations',NULL,1,'active',CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO social_page_managers (page_id,user_id,role,created_at)
VALUES (1,1,'owner',CURRENT_TIMESTAMP);
