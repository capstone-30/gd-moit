CREATE TABLE hosted_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES terms,
  title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 100),
  place_id uuid NOT NULL REFERENCES places,
  activity_date date NOT NULL,
  slot smallint NOT NULL,
  capacity integer NOT NULL CHECK(capacity BETWEEN 2 AND 4),
  next_member_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE TABLE hosted_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES hosted_meetings ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  member_no integer NOT NULL,
  UNIQUE(meeting_id,user_id), UNIQUE(meeting_id,member_no)
);
CREATE TABLE activity_documents (
  meeting_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL CHECK(length(btrim(content)) BETWEEN 1 AND 5000),
  outcome text NOT NULL CHECK(length(btrim(outcome)) BETWEEN 1 AND 2000),
  expenses jsonb NOT NULL CHECK(jsonb_typeof(expenses)='array' AND jsonb_array_length(expenses)<=20),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL DEFAULT 1,
  PRIMARY KEY(meeting_id,user_id),
  FOREIGN KEY(meeting_id,user_id) REFERENCES hosted_members(meeting_id,user_id) ON DELETE CASCADE
);
CREATE INDEX hosted_listing ON hosted_meetings(created_at DESC,id DESC);
CREATE INDEX hosted_member_user ON hosted_members(user_id,meeting_id);
CREATE INDEX hosted_expiry ON hosted_meetings(expires_at);
