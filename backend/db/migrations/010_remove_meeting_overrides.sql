-- Removing meeting-specific times restores semester availability. Existing
-- unanimous dated consent remains valid; pending proposals must be renewed.
CREATE TEMP TABLE removed_override_meetings ON COMMIT DROP AS
SELECT DISTINCT meeting_id FROM meeting_overrides;

UPDATE proposals SET status='cancelled'
WHERE status='pending' AND meeting_id IN (SELECT meeting_id FROM removed_override_meetings);

UPDATE meetings m SET state='undecided',confirmed_date=NULL,confirmed_slot=NULL,
  confirmation_source=NULL,expires_at=least(m.expires_at,m.created_at+interval '90 days')
WHERE m.id IN (SELECT meeting_id FROM removed_override_meetings)
  AND (m.state='proposing' OR (m.state='confirmed' AND m.confirmation_source='intersection'
    AND EXISTS (
      SELECT 1 FROM meeting_members mm JOIN terms t ON t.id=m.term_id
      JOIN schools s ON s.id=t.school_id
      LEFT JOIN availability a ON a.user_id=mm.user_id AND a.term_id=m.term_id
        AND now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone
      WHERE mm.meeting_id=m.id AND NOT (m.confirmed_slot=ANY(coalesce(a.slots,'{}'::smallint[])))
    )));

UPDATE meetings SET version=version+1 WHERE id IN (SELECT meeting_id FROM removed_override_meetings);
DROP TABLE meeting_overrides;
