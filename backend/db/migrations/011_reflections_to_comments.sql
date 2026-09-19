INSERT INTO comments(meeting_id,author_id,author_member_no,body,created_at)
SELECT r.meeting_id,r.user_id,mm.member_no,section.body,r.created_at
FROM meeting_reflections r
JOIN meeting_members mm ON mm.meeting_id=r.meeting_id AND mm.user_id=r.user_id
CROSS JOIN LATERAL (VALUES (r.done),(r.learned),(r.next_step)) AS section(body);
DROP TABLE meeting_reflections;
