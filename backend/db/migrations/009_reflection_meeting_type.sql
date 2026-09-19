ALTER TABLE meetings DROP CONSTRAINT meetings_type_check;
ALTER TABLE meetings ADD CONSTRAINT meetings_type_check CHECK(type IN ('study','coffee','lunch','reflection'));
