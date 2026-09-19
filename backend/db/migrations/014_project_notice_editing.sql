ALTER TABLE hosted_notices
  ADD COLUMN publication_id uuid,
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN updated_at timestamptz;
UPDATE hosted_notices SET publication_id=id,updated_at=created_at;
ALTER TABLE hosted_notices
  ALTER COLUMN publication_id SET NOT NULL,
  ALTER COLUMN publication_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();
CREATE INDEX hosted_notice_publication ON hosted_notices(publication_id);
