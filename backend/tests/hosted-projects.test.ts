import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteProject,projectDetail,renameProject,publishProjectNotice,updateProjectNotice,deleteProjectNotice} from '../application/hosted-meetings';
import type {DB} from '../application/ports';

test('프로젝트 상세는 본인 학교·담당자 권한으로 조회하고 필요한 정보만 반환한다',async()=>{
  const actor={id:'staff',school_id:'school',role:'institution' as const};
  let calls=0;
  const db={hostedMeetings:{findOwnedProject:async(values:unknown[])=>{
    calls++;assert.deepEqual(values,['project','staff','school']);
    return {rows:[{id:'project',title:'활동',activity_type:'plogging',host_id:'staff'}]};
  }}} as unknown as DB;
  assert.deepEqual(await projectDetail(db,actor,'project'),{id:'project',title:'활동',activityType:'plogging'});
  await assert.rejects(projectDetail(db,{...actor,role:'student'},'project'),{status:403});
  assert.equal(calls,1);
  const missing={hostedMeetings:{findOwnedProject:async()=>({rows:[]})}} as unknown as DB;
  await assert.rejects(projectDetail(missing,actor,'project'),{status:404});
});

test('제목 수정은 소유권·만료를 확인하고 오래된 제목의 덮어쓰기를 막는다',async()=>{
  const actor={id:'staff',school_id:'school',role:'institution' as const};
  let title='이전 제목',visible=true,updates=0,reads=0;
  const db={hostedMeetings:{
    findOwnedProject:async()=>{reads++;return {rows:visible?[{id:'project',title,activity_type:'general'}]:[]};},
    renameProject:async([id,next,previous]:unknown[])=>{
      updates++;assert.equal(id,'project');
      if(previous!==title)return {rows:[]};
      title=String(next);return {rows:[{id}]};
    },
  }} as unknown as DB;
  const input={title:'새 제목',previousTitle:'이전 제목'};
  assert.deepEqual(await renameProject(db,actor,'project',input),{id:'project',title:'새 제목',activityType:'general'});
  assert.equal(reads,1);
  await assert.rejects(renameProject(db,actor,'project',input),{status:412,code:'VERSION_CONFLICT'});
  assert.equal(title,'새 제목');
  await assert.rejects(renameProject(db,{...actor,role:'student'},'project',input),{status:403});
  visible=false;
  await assert.rejects(renameProject(db,actor,'project',input),{status:404});
  assert.equal(updates,2);
});

test('프로젝트 공지는 대상마다 한 번 권한을 확인하고 전체 검증 후 게시한다',async()=>{
  const actor={id:'staff',school_id:'school',role:'institution' as const};
  const calls:string[]=[];
  let invalid=false;
  const db={hostedMeetings:{
    findOwnedProject:async()=>({rows:[{id:'project'}]}),
    listProjectMeetingIds:async()=>({rows:[{id:'first'},{id:'second'}]}),
    findVisibleMeeting:async([id]:unknown[])=>{
      calls.push(String(id));
      return {rows:[{project_id:invalid&&id==='second'?'other':'project'}]};
    },
    createNotice:async([ids]:unknown[])=>{assert.deepEqual(ids,['first','second']);calls.push('publish');return {rows:[]};},
  }} as unknown as DB;
  const input={meetingIds:['first'],title:'안내',body:'내용'};
  assert.deepEqual(await publishProjectNotice(db,actor,'project',input),{publishedCount:2});
  assert.deepEqual(calls,['first','second','publish']);
  calls.length=0;invalid=true;
  await assert.rejects(publishProjectNotice(db,actor,'project',input),{status:404});
  assert.deepEqual(calls,['first','second']);
});

test('공지 수정·삭제는 권한·존재·전체 배포 버전을 확인한 뒤 요구 서류를 갱신한다',async()=>{
  const actor={id:'staff',school_id:'school',role:'institution' as const};
  for(const action of ['update','delete'] as const) {
    const calls:string[]=[];
    let rows=[{meeting_id:'first',version:2},{meeting_id:'second',version:2}];
    const mutate=async()=>{calls.push(action);return {rows};};
    const db={hostedMeetings:{
      findOwnedProject:async()=>({rows:[{id:'project'}]}),
      findProjectNotice:async()=>({rows}),
      updateProjectNotice:mutate,deleteProjectNotice:mutate,
      refreshDocumentRequirements:async(values:unknown[])=>{
        assert.deepEqual(values,[['first','second']]);calls.push('refresh');return {rows:[]};
      },
    }} as unknown as DB;
    const run=(role:typeof actor.role|'student'=actor.role)=>action==='update'
      ?updateProjectNotice(db,{...actor,role},'project','notice',{title:'제목',body:'본문',documentRequirements:null,version:2})
      :deleteProjectNotice(db,{...actor,role},'project','notice',2);
    await run();assert.deepEqual(calls,[action,'refresh']);calls.length=0;
    await assert.rejects(run('student'),{status:403});
    rows[1].version=3;
    await assert.rejects(run(),{status:412,code:'VERSION_CONFLICT'});
    rows=[];
    await assert.rejects(run(),{status:404});
    assert.deepEqual(calls,[]);
  }
});

test('프로젝트 삭제는 소유권·만료 확인 후 삭제하고 학생과 다른 담당자를 거부한다',async()=>{
  const actor={id:'staff',school_id:'school',role:'institution' as const};
  let visible=true,deleted=0;
  const db={hostedMeetings:{
    findOwnedProject:async(values:unknown[])=>{assert.deepEqual(values,['project','staff','school']);return {rows:visible?[{id:'project'}]:[]};},
    deleteProject:async(values:unknown[])=>{assert.deepEqual(values,['project']);deleted++;return {rows:[{entity_id:'project'}]};},
  }} as unknown as DB;
  await deleteProject(db,actor,'project');assert.equal(deleted,1);
  await assert.rejects(deleteProject(db,{...actor,role:'student'},'project'),{status:403});
  visible=false;
  await assert.rejects(deleteProject(db,actor,'project'),{status:404});assert.equal(deleted,1);
});

test('모임이 없는 프로젝트는 공지를 게시하지 않는다',async()=>{
  const db={hostedMeetings:{findOwnedProject:async()=>({rows:[{id:'p'}]}),listProjectMeetingIds:async()=>({rows:[]})}} as unknown as DB;
  await assert.rejects(publishProjectNotice(db,{id:'s',school_id:'school',role:'institution'},'p',{title:'제목',body:'내용'}),{status:409});
});
