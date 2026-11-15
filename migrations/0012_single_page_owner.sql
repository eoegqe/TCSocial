CREATE UNIQUE INDEX IF NOT EXISTS idx_social_page_single_owner ON social_page_managers(page_id) WHERE role='owner';
