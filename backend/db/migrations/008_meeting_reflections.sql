CREATE TABLE meeting_reflections (
  meeting_id uuid NOT NULL,
  user_id uuid NOT NULL,
  activity_date date NOT NULL,
  activity_slot smallint NOT NULL,
  done text NOT NULL CHECK(length(btrim(done)) BETWEEN 1 AND 1000),
  learned text NOT NULL CHECK(length(btrim(learned)) BETWEEN 1 AND 1000),
  next_step text NOT NULL CHECK(length(btrim(next_step)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(meeting_id,user_id),
  FOREIGN KEY(meeting_id,user_id) REFERENCES meeting_members ON DELETE CASCADE
);
