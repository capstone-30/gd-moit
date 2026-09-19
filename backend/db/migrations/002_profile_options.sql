-- No invented school values: operators must set these before offering optional fields.
ALTER TABLE schools ADD COLUMN departments text[] NOT NULL DEFAULT '{}';
ALTER TABLE schools ADD COLUMN entry_years integer[] NOT NULL DEFAULT '{}';
