import type {PoolClient} from 'pg';
import type {DB,Runtime} from '../application/ports';
const retentionTables=['meetings','hosted_projects','hosted_meetings','otp_challenges','auth_limits','sessions','reports'];

export function repositories(client:Pick<PoolClient,'query'>,runtime:Runtime):DB {return {runtime,
  operations:{
    findUser:values=>client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',values),
    changeRole:values=>client.query('UPDATE users SET role=$2 WHERE id=$1',values),
    revokeSessions:values=>client.query('DELETE FROM sessions WHERE user_id=$1',values),
    findReport:values=>client.query('SELECT * FROM reports WHERE id=$1 AND expires_at>now() FOR UPDATE',values),
    reviewReport:values=>client.query('UPDATE reports SET status=$2,reviewed_at=now(),reviewer_id=$3,review_reason=$4 WHERE id=$1',values),
    closeRegistration:()=>client.query('UPDATE app_settings SET registration_open=false,launch_verified_at=NULL'),
    deletedUsers:values=>client.query('SELECT id,school_id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id',values),
    eraseEntities:async(values,entity)=>{
      if(entity==='hosted_notices')return client.query('DELETE FROM hosted_notices WHERE id=ANY($1::uuid[]) RETURNING meeting_id',values);
      if(!['meetings','hosted_meetings','hosted_projects','hosted_members'].includes(entity)) throw new Error('INVALID_DELETION_ENTITY');
      return client.query(`DELETE FROM ${entity} WHERE id=ANY($1::uuid[])`,values);
    },
    pendingDeletions:()=>client.query('SELECT id,entity_id,deleted_at FROM deletion_outbox WHERE delivered_at IS NULL ORDER BY deleted_at,id LIMIT 500'),
    markDelivered:values=>client.query('UPDATE deletion_outbox SET delivered_at=now() WHERE id=ANY($1::uuid[])',values),
  },
  auth:{
    findSession:values=>client.query(`SELECT u.*,s.id AS session_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,values),
    removeExpiredLimit:values=>client.query('DELETE FROM auth_limits WHERE kind=$1 AND key_hmac=$2 AND expires_at<=now()',values),
    lockLimit:values=>client.query('SELECT *,extract(epoch FROM now()-last_sent_at) AS elapsed,ceil(extract(epoch FROM expires_at-now())) AS remaining FROM auth_limits WHERE kind=$1 AND key_hmac=$2 FOR UPDATE',values),
    recordSend:values=>client.query(`INSERT INTO auth_limits(kind,key_hmac,count,expires_at,last_sent_at) VALUES($1,$2,1,now()+interval '1 hour',now())
    ON CONFLICT(kind,key_hmac) DO UPDATE SET count=auth_limits.count+1,last_sent_at=now()`,values),
    findSchoolDomain:values=>client.query('SELECT school_id FROM school_domains WHERE domain=$1',values),
    removeChallengesForEmail:values=>client.query('DELETE FROM otp_challenges WHERE email=$1',values),
    createChallenge:values=>client.query(`INSERT INTO otp_challenges(id,school_id,email,code_hmac,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')`,values),
    lockChallenge:values=>client.query('SELECT * FROM otp_challenges WHERE id=$1 FOR UPDATE',values),
    removeChallenge:values=>client.query('DELETE FROM otp_challenges WHERE id=$1',values),
    recordFailedAttempt:values=>client.query('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=$1',values),
    findUserByEmail:values=>client.query('SELECT * FROM users WHERE email=$1',values),
    registerUser:values=>client.query(`INSERT INTO users(school_id,email,privacy_version,privacy_acknowledged_at) VALUES($1,$2,$3,now()) RETURNING *`,values),
    acknowledgePrivacy:values=>client.query('UPDATE users SET privacy_version=$2,privacy_acknowledged_at=now() WHERE id=$1',values),
    createSession:values=>client.query(`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '7 days')`,values),
    removeSession:values=>client.query('DELETE FROM sessions WHERE token_hash=$1',values),
  },
  configuration:{
    getSettings:()=>client.query(`SELECT a.*, s.name AS school_name,s.timezone,s.departments,s.entry_years,t.starts_on,t.ends_on,
    to_char(now() AT TIME ZONE s.timezone,'YYYY-MM-DD') AS today
    FROM app_settings a JOIN schools s ON s.id=a.school_id JOIN terms t ON t.id=a.current_term_id AND t.school_id=a.school_id WHERE a.id=1`),
    hasRegistrationData:values=>client.query(`SELECT 1 WHERE EXISTS(SELECT 1 FROM term_slots WHERE term_id=$1)
    AND EXISTS(SELECT 1 FROM places WHERE school_id=$2 AND active) AND EXISTS(SELECT 1 FROM school_domains WHERE school_id=$2)`,values),
    listActivePlaces:values=>client.query('SELECT id,name FROM places WHERE school_id=$1 AND active ORDER BY name,id',values),
    listTermSlots:values=>client.query('SELECT slot_code AS slot,starts_at AS "startsAt",ends_at AS "endsAt" FROM term_slots WHERE term_id=$1 ORDER BY slot_code',values),
    findActivePlace:values=>client.query('SELECT 1 FROM places WHERE id=$1 AND school_id=$2 AND active',values),
    findRetainedTerm:values=>client.query(`SELECT t.*,s.timezone,to_char(now() AT TIME ZONE s.timezone,'YYYY-MM-DD') AS today
    FROM terms t JOIN schools s ON s.id=t.school_id WHERE t.id=$1 AND t.school_id=$2 AND now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone`,values),
  },
  demo:{
    getDemoSettings:()=>client.query('SELECT privacy_version,school_id FROM app_settings WHERE id=1'),
    hasSchools:()=>client.query('SELECT 1 FROM schools LIMIT 1'),
    createDemoSchool:()=>client.query("INSERT INTO schools(name,timezone) VALUES('tukorea.ac.kr · 로컬 데모','Asia/Seoul') RETURNING id"),
    createDemoDomain:values=>client.query("INSERT INTO school_domains(domain,school_id) VALUES('tukorea.ac.kr',$1)",values),
    createDemoTerm:values=>client.query("INSERT INTO terms(school_id,name,starts_on,ends_on) VALUES($1,'합성 데모 학기',current_date-1,current_date+90) RETURNING id",values),
    createDemoSettings:values=>client.query("INSERT INTO app_settings(id,school_id,current_term_id,service_ends_on,privacy_version,privacy_notice) VALUES(1,$1,$2,current_date+90,$3,$4)",values),
    renameLegacyDemoPlace:values=>client.query("UPDATE places SET name='TIP' WHERE school_id=$1 AND name='합성 데모 공간 · 실제 장소 아님'",values),
    createDemoPlaces:values=>client.query(`INSERT INTO places(school_id,name)
    SELECT $1,name FROM unnest($2::text[]) AS name
    WHERE NOT EXISTS(SELECT 1 FROM places WHERE school_id=$1 AND places.name=name.name)`,values),
    activateDemoPlaces:values=>client.query('UPDATE places SET active=(name=ANY($2::text[])) WHERE school_id=$1',values),
    upsertDemoSlots:()=>client.query(`INSERT INTO term_slots(term_id,slot_code,starts_at,ends_at)
    SELECT current_term_id,day*100+period,make_time(8+period,30,0),make_time(9+period,20,0)
    FROM app_settings CROSS JOIN generate_series(1,5) AS day CROSS JOIN generate_series(1,12) AS period WHERE id=1
    ON CONFLICT(term_id,slot_code) DO UPDATE SET starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at`),
    createDemoUser:values=>client.query('INSERT INTO users(school_id,email,role,privacy_version,privacy_acknowledged_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(email) DO NOTHING',values),
    refreshDemoTerm:()=>client.query(`WITH refreshed AS (
      UPDATE terms t SET starts_on=least(t.starts_on,current_date-7),ends_on=greatest(t.ends_on,current_date+90)
      FROM app_settings a WHERE a.id=1 AND t.id=a.current_term_id RETURNING t.id
    ) UPDATE app_settings SET service_ends_on=greatest(service_ends_on,current_date+90) WHERE id=1`),
    listDemoMeetings:values=>client.query('SELECT topic FROM meetings WHERE host_id=ANY($1::uuid[]) AND term_id=$2 AND expires_at>now()',values),
    listDemoProjects:values=>client.query('SELECT title FROM hosted_projects WHERE host_id=$1 AND term_id=$2 AND expires_at>now()',values),
  },
  hostedMeetings:{
    findOwnedProject:values=>client.query(`SELECT p.* FROM hosted_projects p JOIN terms t ON t.id=p.term_id
    WHERE p.id=$1 AND p.host_id=$2 AND t.school_id=$3 AND p.expires_at>now()`,values),
    listOwnedProjects:values=>client.query(`SELECT p.id,p.title,p.activity_type AS "activityType",p.expires_at AS "expiresAt",
    (SELECT count(*)::integer FROM hosted_meetings h WHERE h.project_id=p.id AND h.expires_at>now()) AS "meetingCount",
    to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
    FROM hosted_projects p JOIN terms t ON t.id=p.term_id
    WHERE p.host_id=$1 AND t.school_id=$2 AND p.expires_at>now()
    AND ($3::timestamptz IS NULL OR (p.created_at,p.id)<($3::timestamptz,$4::uuid))
    ORDER BY p.created_at DESC,p.id DESC LIMIT $5`,values),
    createProject:values=>client.query(`INSERT INTO hosted_projects(host_id,term_id,title,activity_type) VALUES($1,$2,$3,$4)
    RETURNING id,title,activity_type AS "activityType",expires_at AS "expiresAt",0 AS "meetingCount"`,values),
    deleteProject:values=>client.query(`WITH deleted AS (
      DELETE FROM hosted_projects WHERE id=$1 RETURNING id
    ) INSERT INTO deletion_outbox(entity_id) SELECT id FROM deleted RETURNING entity_id`,values),
    renameProject:values=>client.query(`UPDATE hosted_projects SET title=$2
    WHERE id=$1 AND title=$3 AND expires_at>now() RETURNING id`,values),
    findVisibleMeeting:values=>client.query(`SELECT h.*,p.name AS place_name,hp.title AS project_title,hp.activity_type,t.school_id,t.starts_on,t.ends_on,
    EXISTS(SELECT 1 FROM activity_documents WHERE meeting_id=h.id) AS has_documents,
    to_char(now() AT TIME ZONE s.timezone,'YYYY-MM-DD') AS today
    FROM hosted_meetings h JOIN terms t ON t.id=h.term_id JOIN schools s ON s.id=t.school_id LEFT JOIN places p ON p.id=h.place_id LEFT JOIN hosted_projects hp ON hp.id=h.project_id
    WHERE h.id=$1 AND t.school_id=$2 AND h.expires_at>now() AND (h.project_id IS NULL OR hp.expires_at>now()) AND (($3='student' AND EXISTS(SELECT 1 FROM hosted_members WHERE meeting_id=h.id AND user_id=$4)) OR ($3='institution' AND h.host_id=$4))`,values),
    listVisibleMembers:values=>client.query(`SELECT d.*,m.user_id,m.member_no,m.id AS membership_id
    FROM hosted_members m LEFT JOIN activity_documents d ON d.meeting_id=m.meeting_id AND d.user_id=m.user_id AND ($2 OR d.user_id=$3)
    WHERE m.meeting_id=$1 ORDER BY m.member_no`,values),
    listVisibleMeetings:values=>client.query(`SELECT h.id,h.title,h.activity_date AS date,h.slot,p.name AS place,h.capacity,h.require_activity,h.require_expenses,
    count(m.user_id)::integer AS "memberCount",coalesce(bool_or(m.user_id=$3),false) AS "isMember",
    count(d.user_id) FILTER (WHERE (h.require_activity OR h.require_expenses)
      AND (NOT h.require_activity OR d.activity_submitted) AND (NOT h.require_expenses OR d.expenses_submitted))::integer AS "submittedCount",
    h.project_id,hp.title AS project_title,hp.activity_type,
    to_char(h.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
    FROM hosted_meetings h JOIN terms t ON t.id=h.term_id LEFT JOIN places p ON p.id=h.place_id LEFT JOIN hosted_projects hp ON hp.id=h.project_id
    LEFT JOIN hosted_members m ON m.meeting_id=h.id
    LEFT JOIN activity_documents d ON d.meeting_id=m.meeting_id AND d.user_id=m.user_id
    WHERE t.school_id=$1 AND h.expires_at>now() AND (($2='student' AND EXISTS(SELECT 1 FROM hosted_members WHERE meeting_id=h.id AND user_id=$3)) OR ($2='institution' AND h.host_id=$3))
    AND (h.project_id IS NULL OR hp.expires_at>now()) AND ($7::uuid IS NULL OR h.project_id=$7)
    AND ($4::timestamptz IS NULL OR (h.created_at,h.id)<($4::timestamptz,$5::uuid))
    GROUP BY h.id,p.name,hp.title,hp.activity_type ORDER BY h.created_at DESC,h.id DESC LIMIT $6`,values),
    findAssignableStudents:values=>client.query(`SELECT u.id FROM unnest($2::text[]) WITH ORDINALITY AS e(email,member_no)
    JOIN users u ON u.email=e.email WHERE u.school_id=$1 AND u.role='student' ORDER BY e.member_no`,values),
    createMeeting:values=>client.query(`INSERT INTO hosted_meetings(host_id,term_id,title,capacity,expires_at,project_id)
    VALUES($1,$2,$3,$4,least(now()+interval '90 days',$6::timestamptz),$5) RETURNING id`,values),
    assignMembers:values=>client.query(`INSERT INTO hosted_members(meeting_id,user_id,member_no)
    SELECT $1,user_id,member_no FROM unnest($2::uuid[]) WITH ORDINALITY AS m(user_id,member_no)`,values),
    updateSchedule:values=>client.query(`UPDATE hosted_meetings h SET activity_date=$2,slot=$3,place_id=$4,version=h.version+1,
    expires_at=least(($2::date+30)::timestamp AT TIME ZONE s.timezone,h.created_at+interval '120 days',
      (SELECT expires_at FROM hosted_projects WHERE id=h.project_id))
    FROM schools s WHERE h.id=$1 AND s.id=$5`,values),
    createNotice:values=>client.query(`WITH publication AS MATERIALIZED (SELECT gen_random_uuid() AS id), inserted AS (
      INSERT INTO hosted_notices(meeting_id,title,body,document_requirements,publication_id)
      SELECT m.id,$2,$3,$4::jsonb,p.id FROM unnest($1::uuid[]) AS m(id) CROSS JOIN publication p RETURNING meeting_id
    ) UPDATE hosted_meetings h SET require_activity=($4::jsonb->>'activity')::boolean,
      require_expenses=($4::jsonb->>'expenses')::boolean,version=h.version+1
      FROM inserted n WHERE h.id=n.meeting_id AND $4::jsonb IS NOT NULL`,values),
    listNotices:values=>client.query(`SELECT id,title,body,document_requirements AS "documentRequirements",created_at AS "createdAt",updated_at AS "updatedAt",
    to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
    FROM hosted_notices WHERE meeting_id=$1
    AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid))
    ORDER BY created_at DESC,id DESC LIMIT $4`,values),
    listProjectMeetingIds:values=>client.query(`SELECT id FROM hosted_meetings WHERE project_id=$1 AND expires_at>now() ORDER BY id`,values),
    listProjectNotices:values=>client.query(`SELECT n.publication_id AS id,n.title,n.body,n.document_requirements AS "documentRequirements",
      n.created_at AS "createdAt",n.updated_at AS "updatedAt",n.version,
      jsonb_object_agg(h.id,h.title ORDER BY h.id) AS meetings,
      (SELECT jsonb_build_object('total',count(*),'completed',count(*) FILTER (WHERE
        (NOT coalesce((n.document_requirements->>'activity')::boolean,false) OR coalesce(d.activity_submitted,false)) AND
        (NOT coalesce((n.document_requirements->>'expenses')::boolean,false) OR coalesce(d.expenses_submitted,false))))
        FROM hosted_members m LEFT JOIN activity_documents d ON d.meeting_id=m.meeting_id AND d.user_id=m.user_id
        WHERE m.meeting_id=ANY(array_agg(h.id))) AS "submissionSummary",
      to_char(n.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
      FROM hosted_notices n JOIN hosted_meetings h ON h.id=n.meeting_id
      WHERE h.project_id=$1 AND h.expires_at>now()
      AND ($2::timestamptz IS NULL OR (n.created_at,n.publication_id)<($2::timestamptz,$3::uuid))
      GROUP BY n.publication_id,n.title,n.body,n.document_requirements,n.created_at,n.updated_at,n.version
      ORDER BY n.created_at DESC,n.publication_id DESC LIMIT $4`,values),
    findProjectNotice:values=>client.query(`SELECT n.* FROM hosted_notices n JOIN hosted_meetings h ON h.id=n.meeting_id
      WHERE h.project_id=$1 AND n.publication_id=$2 AND h.expires_at>now() ORDER BY h.id`,values),
    updateProjectNotice:values=>client.query(`UPDATE hosted_notices SET title=$3,body=$4,document_requirements=$5::jsonb,
      updated_at=now(),version=version+1 WHERE publication_id=$1 AND meeting_id=ANY($2::uuid[]) AND version=$6 RETURNING id`,values),
    deleteProjectNotice:values=>client.query(`WITH deleted AS (
      DELETE FROM hosted_notices WHERE publication_id=$1 AND meeting_id=ANY($2::uuid[]) AND version=$3 RETURNING id
    ) INSERT INTO deletion_outbox(entity_id) SELECT id FROM deleted RETURNING entity_id`,values),
    refreshDocumentRequirements:values=>client.query(`UPDATE hosted_meetings h SET
      require_activity=coalesce((SELECT (n.document_requirements->>'activity')::boolean FROM hosted_notices n
        WHERE n.meeting_id=h.id AND n.document_requirements IS NOT NULL ORDER BY n.created_at DESC,n.id DESC LIMIT 1),false),
      require_expenses=coalesce((SELECT (n.document_requirements->>'expenses')::boolean FROM hosted_notices n
        WHERE n.meeting_id=h.id AND n.document_requirements IS NOT NULL ORDER BY n.created_at DESC,n.id DESC LIMIT 1),false),
      version=h.version+1 WHERE h.id=ANY($1::uuid[])`,values),
    recordMeetingDeletion:values=>client.query('INSERT INTO deletion_outbox(entity_id) VALUES($1)',values),
    deleteMeeting:values=>client.query('DELETE FROM hosted_meetings WHERE id=$1',values),
    recordMembershipDeletion:values=>client.query('INSERT INTO deletion_outbox(entity_id) SELECT id FROM hosted_members WHERE meeting_id=$1 AND user_id=$2',values),
    deleteMembership:values=>client.query('DELETE FROM hosted_members WHERE meeting_id=$1 AND user_id=$2',values),
    findOwnDocuments:values=>client.query('SELECT d.version,m.id AS membership_id FROM activity_documents d JOIN hosted_members m USING(meeting_id,user_id) WHERE d.meeting_id=$1 AND d.user_id=$2',values),
    saveDocuments:values=>client.query(`INSERT INTO activity_documents
      (meeting_id,user_id,content,outcome,expenses,activity_submitted,expenses_submitted)
      VALUES($1,$2,coalesce($3::text,''),coalesce($4::text,''),coalesce($5::jsonb,'[]'),$3::text IS NOT NULL,$5::jsonb IS NOT NULL)
    ON CONFLICT(meeting_id,user_id) DO UPDATE SET
      content=coalesce($3::text,activity_documents.content),outcome=coalesce($4::text,activity_documents.outcome),
      expenses=coalesce($5::jsonb,activity_documents.expenses),
      activity_submitted=activity_documents.activity_submitted OR $3::text IS NOT NULL,
      expenses_submitted=activity_documents.expenses_submitted OR $5::jsonb IS NOT NULL,
      updated_at=now(),version=activity_documents.version+1`,values),
    findDownloadableDocuments:values=>client.query(`SELECT d.*,m.member_no FROM activity_documents d JOIN hosted_members m USING(meeting_id,user_id) WHERE d.meeting_id=$1 AND d.user_id=$2`,values),
  },
  lists:{
    listVisibleCandidates:values=>client.query(`SELECT m.id,to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM meetings m JOIN terms t ON t.id=m.term_id WHERE t.school_id=$1 AND m.expires_at>now()
    AND ($2::text IS NULL OR m.type=$2)
    AND ($3::timestamptz IS NULL OR (m.created_at,m.id)<($3::timestamptz,$4::uuid))
    AND ($6::text='all' OR EXISTS(SELECT 1 FROM meeting_members mm WHERE mm.meeting_id=m.id AND mm.user_id=$5)=($6='joined'))
    AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$5 AND b.blocked_id=m.host_id) OR (b.blocked_id=$5 AND b.blocker_id=m.host_id)) ORDER BY m.created_at DESC,m.id DESC`,values),
    listComments:values=>client.query(`SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM comments WHERE meeting_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)>($2::timestamptz,$3::uuid)) ORDER BY created_at,id LIMIT $4`,values),
    listBlockedUsers:values=>client.query(`SELECT b.blocked_id AS id,b.created_at,to_char(b.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,u.department,u.entry_year,u.interests FROM blocks b JOIN users u ON u.id=b.blocked_id
    WHERE b.blocker_id=$1 AND ($2::timestamptz IS NULL OR (b.created_at,b.blocked_id)>($2::timestamptz,$3::uuid)) ORDER BY b.created_at,b.blocked_id LIMIT $4`,values),
  },
  meetings:{
    countActiveReporters:values=>client.query(`SELECT count(DISTINCT reporter_id) AS n FROM reports WHERE target_user_id=$1 AND status<>'dismissed' AND expires_at>now()`,values),
    listMembers:values=>client.query(`SELECT u.id AS user_id,u.department,u.entry_year,u.interests,mm.member_no,
    coalesce(a.slots,'{}'::smallint[]) AS slots
    FROM meeting_members mm JOIN users u ON u.id=mm.user_id JOIN meetings m ON m.id=mm.meeting_id
    JOIN terms t ON t.id=m.term_id JOIN schools s ON s.id=t.school_id
    LEFT JOIN availability a ON a.user_id=mm.user_id AND a.term_id=m.term_id AND now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone
    WHERE mm.meeting_id=$1 ORDER BY mm.member_no`,values),
    findVisibleMeeting:values=>client.query(`SELECT m.*,p.name AS place_name,t.school_id,t.starts_on,t.ends_on,s.timezone,
    now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone AS term_available FROM meetings m
    JOIN terms t ON t.id=m.term_id JOIN schools s ON s.id=t.school_id JOIN places p ON p.id=m.place_id
    WHERE m.id=$1 AND t.school_id=$2 AND m.expires_at>now()
    AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$3 AND b.blocked_id=m.host_id) OR (b.blocked_id=$3 AND b.blocker_id=m.host_id))`,values),
    findMyAvailability:values=>client.query(`SELECT a.slots FROM availability a JOIN terms t ON t.id=a.term_id JOIN schools s ON s.id=t.school_id
    WHERE a.user_id=$1 AND a.term_id=$2 AND now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone`,values),
    hasBlockedMember:values=>client.query(`SELECT 1 FROM blocks b JOIN meeting_members mm ON mm.meeting_id=$2
    WHERE (b.blocker_id=$1 AND b.blocked_id=mm.user_id) OR (b.blocked_id=$1 AND b.blocker_id=mm.user_id) LIMIT 1`,values),
    listAcceptances:values=>client.query(`SELECT a.user_id,mm.member_no FROM proposal_acceptances a JOIN meeting_members mm ON mm.user_id=a.user_id AND mm.meeting_id=$2 WHERE a.proposal_id=$1 ORDER BY mm.member_no`,values),
    findPendingProposal:values=>client.query("SELECT * FROM proposals WHERE meeting_id=$1 AND status='pending'",values),
    findMeeting:values=>client.query('SELECT * FROM meetings WHERE id=$1',values),
    cancelPendingProposal:values=>client.query("UPDATE proposals SET status='cancelled' WHERE meeting_id=$1 AND status='pending'",values),
    resetCoordination:values=>client.query(`UPDATE meetings SET state='undecided',confirmed_date=NULL,confirmed_slot=NULL,confirmation_source=NULL,
      expires_at=created_at+interval '90 days',version=version+1 WHERE id=$1`,values),
    incrementVersion:values=>client.query('UPDATE meetings SET version=version+1 WHERE id=$1 RETURNING id,version,state',values),
    createMeeting:values=>client.query(`INSERT INTO meetings(host_id,term_id,topic,type,place_id,capacity) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,values),
    addMember:values=>client.query('INSERT INTO meeting_members(meeting_id,user_id,member_no) VALUES($1,$2,$3)',values),
    advanceMemberNumber:values=>client.query('UPDATE meetings SET next_member_no=next_member_no+1,version=version+1 WHERE id=$1',values),
    removeMember:values=>client.query('DELETE FROM meeting_members WHERE meeting_id=$1 AND user_id=$2',values),
    confirmSchedule:values=>client.query(`UPDATE meetings SET state='confirmed',confirmed_date=$2,confirmed_slot=$3,confirmation_source=$4,version=version+1,
    expires_at=least(created_at+interval '120 days',($2::date+30)::timestamp AT TIME ZONE $5) WHERE id=$1 RETURNING id,version,state`,values),
    createProposal:values=>client.query('INSERT INTO proposals(meeting_id,proposed_date,proposed_slot) VALUES($1,$2,$3) RETURNING *',values),
    beginProposal:values=>client.query("UPDATE meetings SET state='proposing',version=version+1 WHERE id=$1 RETURNING id,version",values),
    findProposal:values=>client.query('SELECT * FROM proposals WHERE id=$1 AND meeting_id=$2',values),
    acceptProposal:values=>client.query('INSERT INTO proposal_acceptances(proposal_id,user_id) VALUES($1,$2)',values),
    completeProposal:values=>client.query("UPDATE proposals SET status='accepted' WHERE id=$1",values),
    createComment:values=>client.query('INSERT INTO comments(meeting_id,author_id,author_member_no,body) VALUES($1,$2,$3,$4) RETURNING *',values),
  },
  profile:{
    clearOptionalProfile:values=>client.query('UPDATE users SET display_name=NULL,department=NULL,entry_year=NULL,interests=\'{}\',optional_profile_consented_at=NULL WHERE id=$1 RETURNING *',values),
    findProfileOptions:values=>client.query('SELECT departments,entry_years FROM schools WHERE id=$1',values),
    saveProfile:values=>client.query(`UPDATE users SET display_name=$2,department=$3,entry_year=$4,interests=$5,optional_profile_consented_at=coalesce(optional_profile_consented_at,now()) WHERE id=$1 RETURNING *`,values),
    listSavedAvailability:values=>client.query(`SELECT t.id AS "termId",t.name,t.starts_on AS "startsOn",t.ends_on AS "endsOn",a.slots,
    (SELECT coalesce(json_agg(json_build_object('slot',ts.slot_code,'startsAt',ts.starts_at,'endsAt',ts.ends_at) ORDER BY ts.slot_code),'[]'::json)
      FROM term_slots ts WHERE ts.term_id=t.id) AS "termSlots"
    FROM availability a JOIN terms t ON t.id=a.term_id JOIN schools s ON s.id=t.school_id
    WHERE a.user_id=$1 AND t.school_id=$2 AND now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone
    ORDER BY t.starts_on DESC,t.id`,values),
    findAvailability:values=>client.query('SELECT * FROM availability WHERE user_id=$1 AND term_id=$2',values),
    saveAvailability:values=>client.query(`INSERT INTO availability(user_id,term_id,slots) VALUES($1,$2,$3) ON CONFLICT(user_id,term_id) DO UPDATE SET slots=EXCLUDED.slots,updated_at=now() RETURNING updated_at`,values),
    listJoinedMeetingIds:values=>client.query(`SELECT m.id FROM meetings m JOIN meeting_members mm ON mm.meeting_id=m.id WHERE mm.user_id=$1 AND m.term_id=$2 ORDER BY m.id`,values),
    listAffectedMeetings:values=>client.query('SELECT meeting_id FROM meeting_members WHERE user_id=$1 ORDER BY meeting_id',values),
    recordAccountDeletion:values=>client.query(`INSERT INTO deletion_outbox(entity_id)
    SELECT id FROM meetings WHERE host_id=$1 UNION ALL
    SELECT id FROM hosted_meetings WHERE host_id=$1 UNION ALL
    SELECT id FROM hosted_projects WHERE host_id=$1 UNION ALL SELECT $1::uuid`,values),
    removeAccountChallenges:values=>client.query('DELETE FROM otp_challenges o USING users u WHERE u.id=$1 AND o.email=u.email',values),
    deleteUser:values=>client.query('DELETE FROM users WHERE id=$1',values),
  },
  retention:{
    listMeetingsWithExpiredAvailability:()=>client.query(`SELECT DISTINCT mm.meeting_id FROM meeting_members mm JOIN meetings m ON m.id=mm.meeting_id
    JOIN terms t ON t.id=m.term_id JOIN schools s ON s.id=t.school_id WHERE now()>=(t.ends_on+30)::timestamp AT TIME ZONE s.timezone`),
    deleteExpiredAvailability:()=>client.query(`DELETE FROM availability a USING terms t,schools s WHERE a.term_id=t.id AND s.id=t.school_id AND now()>=(t.ends_on+30)::timestamp AT TIME ZONE s.timezone`),
    deleteExpiredEntities:async(table:string)=>{if(!retentionTables.includes(table)) throw new Error('INVALID_RETENTION_ENTITY'); return client.query(`WITH deleted AS (DELETE FROM ${table} WHERE expires_at<=now() RETURNING id)
      INSERT INTO deletion_outbox(entity_id) SELECT id FROM deleted`);},
    deleteExpiredRecords:async(table:string)=>{if(!retentionTables.includes(table)) throw new Error('INVALID_RETENTION_ENTITY'); return client.query(`DELETE FROM ${table} WHERE expires_at<=now()`);},
    findEndedService:()=>client.query(`SELECT a.school_id FROM app_settings a JOIN schools s ON s.id=a.school_id WHERE now() AT TIME ZONE s.timezone>=a.service_ends_on::timestamp`),
    closeRegistration:()=>client.query('UPDATE app_settings SET registration_open=false WHERE id=1'),
    listSchoolUsers:values=>client.query('SELECT id,school_id FROM users WHERE school_id=$1 ORDER BY id',values),
    deleteDeliveredHistory:()=>client.query("DELETE FROM deletion_outbox WHERE delivered_at IS NOT NULL AND deleted_at<now()-interval '8 days'"),
  },
  safety:{
    findVisibleUser:values=>client.query(`SELECT * FROM users u WHERE u.id=$1 AND u.school_id=$2
    AND ($4 OR NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$3 AND b.blocked_id=u.id) OR (b.blocked_id=$3 AND b.blocker_id=u.id)))`,values),
    createReport:values=>client.query('INSERT INTO reports(reporter_id,target_user_id,target_meeting_id,reason) VALUES($1,$2,$3,$4) RETURNING id,status,created_at',values),
    removeBlock:values=>client.query('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2',values),
    createBlock:values=>client.query('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',values),
    listSharedMeetings:values=>client.query(`SELECT m.id,m.host_id FROM meetings m JOIN meeting_members a ON a.meeting_id=m.id AND a.user_id=$1
    JOIN meeting_members b ON b.meeting_id=m.id AND b.user_id=$2 ORDER BY m.id`,values),
    removeConflictingMember:values=>client.query('DELETE FROM meeting_members WHERE meeting_id=$1 AND user_id=$2',values),
    findBlock:values=>client.query('SELECT created_at FROM blocks WHERE blocker_id=$1 AND blocked_id=$2',values),
  },
};}
