CREATE TABLE hosted_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES terms,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '120 days',
  UNIQUE(id,host_id,term_id)
);
ALTER TABLE hosted_meetings ADD COLUMN project_id uuid,
  ADD FOREIGN KEY(project_id,host_id,term_id) REFERENCES hosted_projects(id,host_id,term_id) ON DELETE CASCADE;
CREATE INDEX hosted_project_listing ON hosted_projects(host_id,created_at DESC,id DESC);
CREATE INDEX hosted_meeting_project ON hosted_meetings(project_id);
