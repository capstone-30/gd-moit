ALTER TABLE hosted_meetings
  ALTER COLUMN place_id DROP NOT NULL,
  ALTER COLUMN activity_date DROP NOT NULL,
  ALTER COLUMN slot DROP NOT NULL,
  ADD COLUMN version bigint NOT NULL DEFAULT 1,
  ADD CONSTRAINT hosted_schedule_complete CHECK (
    (place_id IS NULL AND activity_date IS NULL AND slot IS NULL) OR
    (place_id IS NOT NULL AND activity_date IS NOT NULL AND slot IS NOT NULL)
  );
CREATE TABLE hosted_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES hosted_meetings ON DELETE CASCADE,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 100),
  body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hosted_notice_meeting ON hosted_notices(meeting_id,created_at DESC,id DESC);
