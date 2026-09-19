import type {PoolClient} from 'pg';
import type {DB,Runtime} from '../application/ports';
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
      if(!['meetings','hosted_meetings','hosted_projects','hosted_members'].includes(entity)) throw new Error('INVALID_DELETION_ENTITY');
      return client.query(`DELETE FROM ${entity} WHERE id=ANY($1::uuid[])`,values);
    },
    pendingDeletions:()=>client.query('SELECT id,entity_id,deleted_at FROM deletion_outbox WHERE delivered_at IS NULL ORDER BY deleted_at,id LIMIT 500'),
    markDelivered:values=>client.query('UPDATE deletion_outbox SET delivered_at=now() WHERE id=ANY($1::uuid[])',values),
  },
  auth:{
    findSession:async(values:unknown[])=>{return client.query(`SELECT u.*,s.id AS session_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,values);},
    removeExpiredLimit:async(values:unknown[])=>{return client.query('DELETE FROM auth_limits WHERE kind=$1 AND key_hmac=$2 AND expires_at<=now()',values);},
    lockLimit:async(values:unknown[])=>{return client.query('SELECT *,extract(epoch FROM now()-last_sent_at) AS elapsed,ceil(extract(epoch FROM expires_at-now())) AS remaining FROM auth_limits WHERE kind=$1 AND key_hmac=$2 FOR UPDATE',values);},
    recordSend:async(values:unknown[])=>{return client.query(`INSERT INTO auth_limits(kind,key_hmac,count,expires_at,last_sent_at) VALUES($1,$2,1,now()+interval '1 hour',now())
    ON CONFLICT(kind,key_hmac) DO UPDATE SET count=auth_limits.count+1,last_sent_at=now()`,values);},
    findSchoolDomain:async(values:unknown[])=>{return client.query('SELECT school_id FROM school_domains WHERE domain=$1',values);},
    removeChallengesForEmail:async(values:unknown[])=>{return client.query('DELETE FROM otp_challenges WHERE email=$1',values);},
    createChallenge:async(values:unknown[])=>{return client.query(`INSERT INTO otp_challenges(id,school_id,email,code_hmac,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes')`,values);},
    lockChallenge:async(values:unknown[])=>{return client.query('SELECT * FROM otp_challenges WHERE id=$1 FOR UPDATE',values);},
    removeChallenge:async(values:unknown[])=>{return client.query('DELETE FROM otp_challenges WHERE id=$1',values);},
    recordFailedAttempt:async(values:unknown[])=>{return client.query('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=$1',values);},
    findUserByEmail:async(values:unknown[])=>{return client.query('SELECT * FROM users WHERE email=$1',values);},
    registerUser:async(values:unknown[])=>{return client.query(`INSERT INTO users(school_id,email,privacy_version,privacy_acknowledged_at) VALUES($1,$2,$3,now()) RETURNING *`,values);},
    acknowledgePrivacy:async(values:unknown[])=>{return client.query('UPDATE users SET privacy_version=$2,privacy_acknowledged_at=now() WHERE id=$1',values);},
    consumeChallenge:async(values:unknown[])=>{return client.query('DELETE FROM otp_challenges WHERE id=$1',values);},
    createSession:async(values:unknown[])=>{return client.query(`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '7 days')`,values);},
    removeSession:async(values:unknown[])=>{return client.query('DELETE FROM sessions WHERE token_hash=$1',values);},
  },
  configuration:{
    getSettings:async()=>{return client.query(`SELECT a.*, s.name AS school_name,s.timezone,s.departments,s.entry_years,t.starts_on,t.ends_on,
    to_char(now() AT TIME ZONE s.timezone,'YYYY-MM-DD') AS today
    FROM app_settings a JOIN schools s ON s.id=a.school_id JOIN terms t ON t.id=a.current_term_id AND t.school_id=a.school_id WHERE a.id=1`);},
    hasRegistrationData:async(values:unknown[])=>{return client.query(`SELECT 1 WHERE EXISTS(SELECT 1 FROM term_slots WHERE term_id=$1)
    AND EXISTS(SELECT 1 FROM places WHERE school_id=$2 AND active) AND EXISTS(SELECT 1 FROM school_domains WHERE school_id=$2)`,values);},
    listActivePlaces:async(values:unknown[])=>{return client.query('SELECT id,name FROM places WHERE school_id=$1 AND active ORDER BY name,id',values);},
    listTermSlots:async(values:unknown[])=>{return client.query('SELECT slot_code AS slot,starts_at AS "startsAt",ends_at AS "endsAt" FROM term_slots WHERE term_id=$1 ORDER BY slot_code',values);},
    findActivePlace:async(values:unknown[])=>{return client.query('SELECT 1 FROM places WHERE id=$1 AND school_id=$2 AND active',values);},
    findRetainedTerm:async(values:unknown[])=>{return client.query(`SELECT t.*,s.timezone,to_char(now() AT TIME ZONE s.timezone,'YYYY-MM-DD') AS today
    FROM terms t JOIN schools s ON s.id=t.school_id WHERE t.id=$1 AND t.school_id=$2 AND now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone`,values);},
    listSlotCodes:async(values:unknown[])=>{return client.query('SELECT slot_code FROM term_slots WHERE term_id=$1',values);},
  },
  demo:{
    getDemoSettings:async()=>{return client.query('SELECT privacy_version,school_id FROM app_settings WHERE id=1');},
    hasSchools:async()=>{return client.query('SELECT 1 FROM schools LIMIT 1');},
    createDemoSchool:async()=>{return client.query("INSERT INTO schools(name,timezone) VALUES('tukorea.ac.kr · 로컬 데모','Asia/Seoul') RETURNING id");},
    createDemoDomain:async(values:unknown[])=>{return client.query("INSERT INTO school_domains(domain,school_id) VALUES('tukorea.ac.kr',$1)",values);},
    createDemoTerm:async(values:unknown[])=>{return client.query("INSERT INTO terms(school_id,name,starts_on,ends_on) VALUES($1,'합성 데모 학기',current_date-1,current_date+90) RETURNING id",values);},
    createDemoSettings:async(values:unknown[])=>{return client.query("INSERT INTO app_settings(id,school_id,current_term_id,service_ends_on,privacy_version,privacy_notice) VALUES(1,$1,$2,current_date+90,$3,$4)",values);},
    renameLegacyDemoPlace:async(values:unknown[])=>{return client.query("UPDATE places SET name='TIP' WHERE school_id=$1 AND name='합성 데모 공간 · 실제 장소 아님'",values);},
    createDemoPlaces:async(values:unknown[])=>{return client.query(`INSERT INTO places(school_id,name)
    SELECT $1,name FROM unnest($2::text[]) AS name
    WHERE NOT EXISTS(SELECT 1 FROM places WHERE school_id=$1 AND places.name=name.name)`,values);},
    activateDemoPlaces:async(values:unknown[])=>{return client.query('UPDATE places SET active=(name=ANY($2::text[])) WHERE school_id=$1',values);},
    upsertDemoSlots:async()=>{return client.query(`INSERT INTO term_slots(term_id,slot_code,starts_at,ends_at)
    SELECT current_term_id,day*100+period,make_time(8+period,30,0),make_time(9+period,20,0)
    FROM app_settings CROSS JOIN generate_series(1,5) AS day CROSS JOIN generate_series(1,12) AS period WHERE id=1
    ON CONFLICT(term_id,slot_code) DO UPDATE SET starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at`);},
    createDemoUser:async(values:unknown[])=>{return client.query('INSERT INTO users(school_id,email,role,privacy_version,privacy_acknowledged_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(email) DO NOTHING',values);},
  },
  hostedMeetings:{
    findOwnedProject:async(values:unknown[])=>{return client.query(`SELECT p.* FROM hosted_projects p JOIN terms t ON t.id=p.term_id
    WHERE p.id=$1 AND p.host_id=$2 AND t.school_id=$3 AND p.expires_at>now()`,values);},
    listOwnedProjects:async(values:unknown[])=>{return client.query(`SELECT p.id,p.title,p.expires_at AS "expiresAt",
    (SELECT count(*)::integer FROM hosted_meetings h WHERE h.project_id=p.id AND h.expires_at>now()) AS "meetingCount",
    to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
    FROM hosted_projects p JOIN terms t ON t.id=p.term_id
    WHERE p.host_id=$1 AND t.school_id=$2 AND p.expires_at>now()
    AND ($3::timestamptz IS NULL OR (p.created_at,p.id)<($3::timestamptz,$4::uuid))
    ORDER BY p.created_at DESC,p.id DESC LIMIT $5`,values);},
    createProject:async(values:unknown[])=>{return client.query(`INSERT INTO hosted_projects(host_id,term_id,title) VALUES($1,$2,$3)
    RETURNING id,title,expires_at AS "expiresAt",0 AS "meetingCount"`,values);},
    findVisibleMeeting:async(values:unknown[])=>{return client.query(`SELECT h.*,p.name AS place_name,hp.title AS project_title,t.school_id,t.starts_on,t.ends_on,
    EXISTS(SELECT 1 FROM activity_documents WHERE meeting_id=h.id) AS has_documents,
    to_char(now() AT TIME ZONE s.timezone,'YYYY-MM-DD') AS today
    FROM hosted_meetings h JOIN terms t ON t.id=h.term_id JOIN schools s ON s.id=t.school_id LEFT JOIN places p ON p.id=h.place_id LEFT JOIN hosted_projects hp ON hp.id=h.project_id
    WHERE h.id=$1 AND t.school_id=$2 AND h.expires_at>now() AND (h.project_id IS NULL OR hp.expires_at>now()) AND (($3='student' AND EXISTS(SELECT 1 FROM hosted_members WHERE meeting_id=h.id AND user_id=$4)) OR ($3='institution' AND h.host_id=$4))`,values);},
    listVisibleMembers:async(values:unknown[])=>{return client.query(`SELECT d.*,m.user_id,m.member_no,m.id AS membership_id
    FROM hosted_members m LEFT JOIN activity_documents d ON d.meeting_id=m.meeting_id AND d.user_id=m.user_id AND ($2 OR d.user_id=$3)
    WHERE m.meeting_id=$1 ORDER BY m.member_no`,values);},
    listVisibleMeetings:async(values:unknown[])=>{return client.query(`SELECT h.id,h.title,h.activity_date AS date,h.slot,p.name AS place,h.capacity,
    count(m.user_id)::integer AS "memberCount",coalesce(bool_or(m.user_id=$3),false) AS "isMember",
    count(d.user_id)::integer AS "submittedCount",
    h.project_id,hp.title AS project_title,
    to_char(h.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
    FROM hosted_meetings h JOIN terms t ON t.id=h.term_id LEFT JOIN places p ON p.id=h.place_id LEFT JOIN hosted_projects hp ON hp.id=h.project_id
    LEFT JOIN hosted_members m ON m.meeting_id=h.id
    LEFT JOIN activity_documents d ON d.meeting_id=m.meeting_id AND d.user_id=m.user_id
    WHERE t.school_id=$1 AND h.expires_at>now() AND (($2='student' AND EXISTS(SELECT 1 FROM hosted_members WHERE meeting_id=h.id AND user_id=$3)) OR ($2='institution' AND h.host_id=$3))
    AND (h.project_id IS NULL OR hp.expires_at>now()) AND ($7::uuid IS NULL OR h.project_id=$7)
    AND ($4::timestamptz IS NULL OR (h.created_at,h.id)<($4::timestamptz,$5::uuid))
    GROUP BY h.id,p.name,hp.title ORDER BY h.created_at DESC,h.id DESC LIMIT $6`,values);},
    findAssignableStudents:async(values:unknown[])=>{return client.query(`SELECT u.id FROM unnest($2::text[]) WITH ORDINALITY AS e(email,member_no)
    JOIN users u ON u.email=e.email WHERE u.school_id=$1 AND u.role='student' ORDER BY e.member_no`,values);},
    createMeeting:async(values:unknown[])=>{return client.query(`INSERT INTO hosted_meetings(host_id,term_id,title,capacity,expires_at,project_id)
    VALUES($1,$2,$3,$4,least(now()+interval '90 days',$6::timestamptz),$5) RETURNING id`,values);},
    assignMembers:async(values:unknown[])=>{return client.query(`INSERT INTO hosted_members(meeting_id,user_id,member_no)
    SELECT $1,user_id,member_no FROM unnest($2::uuid[]) WITH ORDINALITY AS m(user_id,member_no)`,values);},
    updateSchedule:async(values:unknown[])=>{return client.query(`UPDATE hosted_meetings h SET activity_date=$2,slot=$3,place_id=$4,version=h.version+1,
    expires_at=least(($2::date+30)::timestamp AT TIME ZONE s.timezone,h.created_at+interval '120 days',
      (SELECT expires_at FROM hosted_projects WHERE id=h.project_id))
    FROM schools s WHERE h.id=$1 AND s.id=$5`,values);},
    createNotice:async(values:unknown[])=>{return client.query('INSERT INTO hosted_notices(meeting_id,title,body) SELECT unnest($1::uuid[]),$2,$3',values);},
    listNotices:async(values:unknown[])=>{return client.query(`SELECT id,title,body,created_at AS "createdAt",
    to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
    FROM hosted_notices WHERE meeting_id=$1
    AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid))
    ORDER BY created_at DESC,id DESC LIMIT $4`,values);},
    recordMeetingDeletion:async(values:unknown[])=>{return client.query('INSERT INTO deletion_outbox(entity_id) VALUES($1)',values);},
    deleteMeeting:async(values:unknown[])=>{return client.query('DELETE FROM hosted_meetings WHERE id=$1',values);},
    recordMembershipDeletion:async(values:unknown[])=>{return client.query('INSERT INTO deletion_outbox(entity_id) SELECT id FROM hosted_members WHERE meeting_id=$1 AND user_id=$2',values);},
    deleteMembership:async(values:unknown[])=>{return client.query('DELETE FROM hosted_members WHERE meeting_id=$1 AND user_id=$2',values);},
    findOwnDocuments:async(values:unknown[])=>{return client.query('SELECT d.version,m.id AS membership_id FROM activity_documents d JOIN hosted_members m USING(meeting_id,user_id) WHERE d.meeting_id=$1 AND d.user_id=$2',values);},
    saveDocuments:async(values:unknown[])=>{return client.query(`INSERT INTO activity_documents(meeting_id,user_id,content,outcome,expenses) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(meeting_id,user_id) DO UPDATE SET content=EXCLUDED.content,outcome=EXCLUDED.outcome,expenses=EXCLUDED.expenses,updated_at=now(),version=activity_documents.version+1`,values);},
    findDownloadableDocuments:async(values:unknown[])=>{return client.query(`SELECT d.*,m.member_no FROM activity_documents d JOIN hosted_members m USING(meeting_id,user_id) WHERE d.meeting_id=$1 AND d.user_id=$2`,values);},
  },
  lists:{
    listVisibleCandidates:async(values:unknown[])=>{return client.query(`SELECT m.id,to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM meetings m JOIN terms t ON t.id=m.term_id WHERE t.school_id=$1 AND m.expires_at>now()
    AND ($2::text IS NULL OR m.type=$2)
    AND ($3::timestamptz IS NULL OR (m.created_at,m.id)<($3::timestamptz,$4::uuid))
    AND ($6::text='all' OR EXISTS(SELECT 1 FROM meeting_members mm WHERE mm.meeting_id=m.id AND mm.user_id=$5)=($6='joined'))
    AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$5 AND b.blocked_id=m.host_id) OR (b.blocked_id=$5 AND b.blocker_id=m.host_id)) ORDER BY m.created_at DESC,m.id DESC`,values);},
    listComments:async(values:unknown[])=>{return client.query(`SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM comments WHERE meeting_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)>($2::timestamptz,$3::uuid)) ORDER BY created_at,id LIMIT $4`,values);},
    listBlockedUsers:async(values:unknown[])=>{return client.query(`SELECT b.blocked_id AS id,b.created_at,to_char(b.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,u.department,u.entry_year,u.interests FROM blocks b JOIN users u ON u.id=b.blocked_id
    WHERE b.blocker_id=$1 AND ($2::timestamptz IS NULL OR (b.created_at,b.blocked_id)>($2::timestamptz,$3::uuid)) ORDER BY b.created_at,b.blocked_id LIMIT $4`,values);},
  },
  meetings:{
    countActiveReporters:async(values:unknown[])=>{return client.query(`SELECT count(DISTINCT reporter_id) AS n FROM reports WHERE target_user_id=$1 AND status<>'dismissed' AND expires_at>now()`,values);},
    listMembers:async(values:unknown[])=>{return client.query(`SELECT u.id AS user_id,u.department,u.entry_year,u.interests,mm.member_no,
    coalesce(a.slots,'{}'::smallint[]) AS slots
    FROM meeting_members mm JOIN users u ON u.id=mm.user_id JOIN meetings m ON m.id=mm.meeting_id
    JOIN terms t ON t.id=m.term_id JOIN schools s ON s.id=t.school_id
    LEFT JOIN availability a ON a.user_id=mm.user_id AND a.term_id=m.term_id AND now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone
    WHERE mm.meeting_id=$1 ORDER BY mm.member_no`,values);},
    findVisibleMeeting:async(values:unknown[])=>{return client.query(`SELECT m.*,p.name AS place_name,t.school_id,t.starts_on,t.ends_on,s.timezone,
    now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone AS term_available FROM meetings m
    JOIN terms t ON t.id=m.term_id JOIN schools s ON s.id=t.school_id JOIN places p ON p.id=m.place_id
    WHERE m.id=$1 AND t.school_id=$2 AND m.expires_at>now()
    AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$3 AND b.blocked_id=m.host_id) OR (b.blocked_id=$3 AND b.blocker_id=m.host_id))`,values);},
    findMyAvailability:async(values:unknown[])=>{return client.query(`SELECT a.slots FROM availability a JOIN terms t ON t.id=a.term_id JOIN schools s ON s.id=t.school_id
    WHERE a.user_id=$1 AND a.term_id=$2 AND now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone`,values);},
    hasBlockedMember:async(values:unknown[])=>{return client.query(`SELECT 1 FROM blocks b JOIN meeting_members mm ON mm.meeting_id=$2
    WHERE (b.blocker_id=$1 AND b.blocked_id=mm.user_id) OR (b.blocked_id=$1 AND b.blocker_id=mm.user_id) LIMIT 1`,values);},
    listAcceptances:async(values:unknown[])=>{return client.query(`SELECT a.user_id,mm.member_no FROM proposal_acceptances a JOIN meeting_members mm ON mm.user_id=a.user_id AND mm.meeting_id=$2 WHERE a.proposal_id=$1 ORDER BY mm.member_no`,values);},
    findPendingProposal:async(values:unknown[])=>{return client.query("SELECT * FROM proposals WHERE meeting_id=$1 AND status='pending'",values);},
    findMeeting:async(values:unknown[])=>{return client.query('SELECT * FROM meetings WHERE id=$1',values);},
    cancelPendingProposal:async(values:unknown[])=>{return client.query("UPDATE proposals SET status='cancelled' WHERE meeting_id=$1 AND status='pending'",values);},
    resetCoordination:async(values:unknown[])=>{return client.query(`UPDATE meetings SET state='undecided',confirmed_date=NULL,confirmed_slot=NULL,confirmation_source=NULL,
      expires_at=created_at+interval '90 days',version=version+1 WHERE id=$1`,values);},
    incrementVersion:async(values:unknown[])=>{return client.query('UPDATE meetings SET version=version+1 WHERE id=$1',values);},
    createMeeting:async(values:unknown[])=>{return client.query(`INSERT INTO meetings(host_id,term_id,topic,type,place_id,capacity) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,values);},
    addHost:async(values:unknown[])=>{return client.query('INSERT INTO meeting_members(meeting_id,user_id,member_no) VALUES($1,$2,1)',values);},
    addMember:async(values:unknown[])=>{return client.query('INSERT INTO meeting_members(meeting_id,user_id,member_no) VALUES($1,$2,$3)',values);},
    advanceMemberNumber:async(values:unknown[])=>{return client.query('UPDATE meetings SET next_member_no=next_member_no+1,version=version+1 WHERE id=$1',values);},
    removeMember:async(values:unknown[])=>{return client.query('DELETE FROM meeting_members WHERE meeting_id=$1 AND user_id=$2',values);},
    confirmSchedule:async(values:unknown[])=>{return client.query(`UPDATE meetings SET state='confirmed',confirmed_date=$2,confirmed_slot=$3,confirmation_source=$4,version=version+1,
    expires_at=least(created_at+interval '120 days',($2::date+30)::timestamp AT TIME ZONE $5) WHERE id=$1 RETURNING id,version,state`,values);},
    createProposal:async(values:unknown[])=>{return client.query('INSERT INTO proposals(meeting_id,proposed_date,proposed_slot) VALUES($1,$2,$3) RETURNING *',values);},
    beginProposal:async(values:unknown[])=>{return client.query("UPDATE meetings SET state='proposing',version=version+1 WHERE id=$1 RETURNING id,version",values);},
    findProposal:async(values:unknown[])=>{return client.query('SELECT * FROM proposals WHERE id=$1 AND meeting_id=$2',values);},
    acceptProposal:async(values:unknown[])=>{return client.query('INSERT INTO proposal_acceptances(proposal_id,user_id) VALUES($1,$2)',values);},
    completeProposal:async(values:unknown[])=>{return client.query("UPDATE proposals SET status='accepted' WHERE id=$1",values);},
    incrementVersionReturningState:async(values:unknown[])=>{return client.query('UPDATE meetings SET version=version+1 WHERE id=$1 RETURNING id,version,state',values);},
    createComment:async(values:unknown[])=>{return client.query('INSERT INTO comments(meeting_id,author_id,author_member_no,body) VALUES($1,$2,$3,$4) RETURNING *',values);},
  },
  profile:{
    clearOptionalProfile:async(values:unknown[])=>{return client.query('UPDATE users SET display_name=NULL,department=NULL,entry_year=NULL,interests=\'{}\',optional_profile_consented_at=NULL WHERE id=$1 RETURNING *',values);},
    findProfileOptions:async(values:unknown[])=>{return client.query('SELECT departments,entry_years FROM schools WHERE id=$1',values);},
    saveProfile:async(values:unknown[])=>{return client.query(`UPDATE users SET display_name=$2,department=$3,entry_year=$4,interests=$5,optional_profile_consented_at=coalesce(optional_profile_consented_at,now()) WHERE id=$1 RETURNING *`,values);},
    listSavedAvailability:async(values:unknown[])=>{return client.query(`SELECT t.id AS "termId",t.name,t.starts_on AS "startsOn",t.ends_on AS "endsOn",a.slots,
    (SELECT coalesce(json_agg(json_build_object('slot',ts.slot_code,'startsAt',ts.starts_at,'endsAt',ts.ends_at) ORDER BY ts.slot_code),'[]'::json)
      FROM term_slots ts WHERE ts.term_id=t.id) AS "termSlots"
    FROM availability a JOIN terms t ON t.id=a.term_id JOIN schools s ON s.id=t.school_id
    WHERE a.user_id=$1 AND t.school_id=$2 AND now()<(t.ends_on+30)::timestamp AT TIME ZONE s.timezone
    ORDER BY t.starts_on DESC,t.id`,values);},
    findAvailability:async(values:unknown[])=>{return client.query('SELECT * FROM availability WHERE user_id=$1 AND term_id=$2',values);},
    saveAvailability:async(values:unknown[])=>{return client.query(`INSERT INTO availability(user_id,term_id,slots) VALUES($1,$2,$3) ON CONFLICT(user_id,term_id) DO UPDATE SET slots=EXCLUDED.slots,updated_at=now() RETURNING updated_at`,values);},
    listJoinedMeetingIds:async(values:unknown[])=>{return client.query(`SELECT m.id FROM meetings m JOIN meeting_members mm ON mm.meeting_id=m.id WHERE mm.user_id=$1 AND m.term_id=$2 ORDER BY m.id`,values);},
    listAffectedMeetings:async(values:unknown[])=>{return client.query('SELECT meeting_id FROM meeting_members WHERE user_id=$1 ORDER BY meeting_id',values);},
    recordAccountDeletion:async(values:unknown[])=>{return client.query(`INSERT INTO deletion_outbox(entity_id)
    SELECT id FROM meetings WHERE host_id=$1 UNION ALL
    SELECT id FROM hosted_meetings WHERE host_id=$1 UNION ALL
    SELECT id FROM hosted_projects WHERE host_id=$1 UNION ALL SELECT $1::uuid`,values);},
    removeAccountChallenges:async(values:unknown[])=>{return client.query('DELETE FROM otp_challenges o USING users u WHERE u.id=$1 AND o.email=u.email',values);},
    deleteUser:async(values:unknown[])=>{return client.query('DELETE FROM users WHERE id=$1',values);},
  },
  retention:{
    listMeetingsWithExpiredAvailability:async()=>{return client.query(`SELECT DISTINCT mm.meeting_id FROM meeting_members mm JOIN meetings m ON m.id=mm.meeting_id
    JOIN terms t ON t.id=m.term_id JOIN schools s ON s.id=t.school_id WHERE now()>=(t.ends_on+30)::timestamp AT TIME ZONE s.timezone`);},
    deleteExpiredAvailability:async()=>{return client.query(`DELETE FROM availability a USING terms t,schools s WHERE a.term_id=t.id AND s.id=t.school_id AND now()>=(t.ends_on+30)::timestamp AT TIME ZONE s.timezone`);},
    deleteExpiredEntities:async(table:string)=>{if(!['meetings','hosted_projects','hosted_meetings','otp_challenges','auth_limits','sessions','reports'].includes(table)) throw new Error('INVALID_RETENTION_ENTITY'); return client.query(`WITH deleted AS (DELETE FROM ${table} WHERE expires_at<=now() RETURNING id)
      INSERT INTO deletion_outbox(entity_id) SELECT id FROM deleted`);},
    deleteExpiredRecords:async(table:string)=>{if(!['meetings','hosted_projects','hosted_meetings','otp_challenges','auth_limits','sessions','reports'].includes(table)) throw new Error('INVALID_RETENTION_ENTITY'); return client.query(`DELETE FROM ${table} WHERE expires_at<=now()`);},
    findEndedService:async()=>{return client.query(`SELECT a.school_id FROM app_settings a JOIN schools s ON s.id=a.school_id WHERE now() AT TIME ZONE s.timezone>=a.service_ends_on::timestamp`);},
    closeRegistration:async()=>{return client.query('UPDATE app_settings SET registration_open=false WHERE id=1');},
    listSchoolUsers:async(values:unknown[])=>{return client.query('SELECT id,school_id FROM users WHERE school_id=$1 ORDER BY id',values);},
    deleteDeliveredHistory:async()=>{return client.query("DELETE FROM deletion_outbox WHERE delivered_at IS NOT NULL AND deleted_at<now()-interval '8 days'");},
  },
  safety:{
    findVisibleUser:async(values:unknown[])=>{return client.query(`SELECT * FROM users u WHERE u.id=$1 AND u.school_id=$2
    AND ($4 OR NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=$3 AND b.blocked_id=u.id) OR (b.blocked_id=$3 AND b.blocker_id=u.id)))`,values);},
    createReport:async(values:unknown[])=>{return client.query('INSERT INTO reports(reporter_id,target_user_id,target_meeting_id,reason) VALUES($1,$2,$3,$4) RETURNING id,status,created_at',values);},
    removeBlock:async(values:unknown[])=>{return client.query('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2',values);},
    createBlock:async(values:unknown[])=>{return client.query('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING',values);},
    listSharedMeetings:async(values:unknown[])=>{return client.query(`SELECT m.id,m.host_id FROM meetings m JOIN meeting_members a ON a.meeting_id=m.id AND a.user_id=$1
    JOIN meeting_members b ON b.meeting_id=m.id AND b.user_id=$2 ORDER BY m.id`,values);},
    removeConflictingMember:async(values:unknown[])=>{return client.query('DELETE FROM meeting_members WHERE meeting_id=$1 AND user_id=$2',values);},
    findBlock:async(values:unknown[])=>{return client.query('SELECT created_at FROM blocks WHERE blocker_id=$1 AND blocked_id=$2',values);},
  },
};}
