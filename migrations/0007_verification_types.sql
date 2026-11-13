ALTER TABLE users ADD COLUMN verification_type TEXT NOT NULL DEFAULT 'account';
ALTER TABLE social_pages ADD COLUMN verification_type TEXT NOT NULL DEFAULT 'account';
