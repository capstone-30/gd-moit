ALTER TABLE hosted_meetings
  ADD COLUMN require_activity boolean NOT NULL DEFAULT false,
  ADD COLUMN require_expenses boolean NOT NULL DEFAULT false;
-- Preserve the requirements of existing meetings; new blank activities start without them.
UPDATE hosted_meetings SET require_activity=true,require_expenses=true;
UPDATE hosted_meetings h SET require_expenses=false
  FROM hosted_projects p WHERE p.id=h.project_id AND p.activity_type='plogging';
ALTER TABLE hosted_notices ADD COLUMN document_requirements jsonb
  CHECK(document_requirements IS NULL OR (jsonb_typeof(document_requirements)='object'
    AND document_requirements ?& ARRAY['activity','expenses']
    AND jsonb_typeof(document_requirements->'activity')='boolean'
    AND jsonb_typeof(document_requirements->'expenses')='boolean'));
INSERT INTO hosted_notices(meeting_id,title,body,document_requirements)
  SELECT id,'서류 제출 안내','활동 후 아래에 안내된 서류를 제출해주세요.',
    jsonb_build_object('activity',require_activity,'expenses',require_expenses)
  FROM hosted_meetings;
ALTER TABLE activity_documents
  DROP CONSTRAINT activity_documents_content_check,
  DROP CONSTRAINT activity_documents_outcome_check,
  ADD COLUMN activity_submitted boolean NOT NULL DEFAULT true,
  ADD COLUMN expenses_submitted boolean NOT NULL DEFAULT true,
  ADD CHECK(length(btrim(content)) BETWEEN 0 AND 5000),
  ADD CHECK(length(btrim(outcome)) BETWEEN 0 AND 2000),
  ADD CHECK(NOT activity_submitted OR (length(btrim(content))>0 AND length(btrim(outcome))>0)),
  ADD CHECK(activity_submitted OR expenses_submitted);
