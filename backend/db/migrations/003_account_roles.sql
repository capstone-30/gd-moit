ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'student' CHECK (role IN ('student','institution'));
