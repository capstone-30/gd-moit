ALTER TABLE hosted_projects ADD COLUMN activity_type text NOT NULL DEFAULT 'general'
  CHECK(activity_type IN ('general','plogging','mentoring','learning'));
