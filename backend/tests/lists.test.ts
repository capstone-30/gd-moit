import test from 'node:test';
import assert from 'node:assert/strict';
import type {DB} from '../adapters/db';
import {repositories} from '../adapters/repositories';
import {runtime} from '../composition';
import {listMeetings} from '../application/lists';
import {page} from '../adapters/http/pagination';

process.env.AUTH_SECRET='test-secret-that-is-longer-than-thirty-two-characters';

test('탐색은 전체 모임을 시간 겹침·최신순으로 페이지화하고 삭제된 커서 다음도 조회한다',async()=>{
  const actor={id:'viewer',school_id:'school'};
  const rows=[1,2,3,4].map(n=>({id:`00000000-0000-0000-0000-00000000000${n}`,cursor_at:`2026-10-16T00:00:00.00000${5-n}Z`,overlap:n%2===0}));
  let visible=rows;
  let mine=[101];
  const db={query:async(sql:string,params:unknown[])=>{
    if(sql.includes('SELECT m.id,to_char')) {
      assert.equal(params[2],null); // Rank is applied before the date cursor.
      return {rows:visible};
    }
    const row=rows.find(r=>r.id===params[0]);
    if(sql.includes('SELECT m.*')) return {rows:[{id:row!.id,topic:row!.id,type:'study',place_id:'place',place_name:'공개 장소',host_id:'host',term_id:'term',state:row!.id.endsWith('4')?'undecided':'confirmed',confirmed_slot:row!.overlap?101:201,confirmed_date:'2026-10-19',capacity:3,version:1,expires_at:new Date('2026-12-01')}]};
    if(sql.includes('FROM meeting_members mm JOIN users')) return {rows:[{user_id:'host',member_no:1,slots:row!.overlap?[101]:[201]}]};
    if(sql.includes('SELECT a.slots')) return {rows:[{slots:mine}]};
    if(sql.includes('FROM blocks b JOIN meeting_members')) return {rows:[],rowCount:0};
    throw new Error(`Unexpected query: ${sql}`);
  }} as unknown as DB;
  const filter={type:null,membership:'unjoined'};
  const fetchPage=(cursor?:string)=>listMeetings(repositories(db,runtime),actor,filter,page(new URLSearchParams({limit:'1',...(cursor?{cursor}:{})}),'discovery'));
  const ids:string[]=[];
  let next:string|undefined;
  do {
    const result=await fetchPage(next);
    ids.push(...result.data.map(m=>m.id));
    next=result.nextCursor??undefined;
  } while(next);
  assert.deepEqual(ids,[rows[1].id,rows[3].id,rows[0].id,rows[2].id]);
  const first=await fetchPage();
  visible=rows.filter(r=>r.id!==rows[1].id);
  assert.deepEqual((await fetchPage(first.nextCursor!)).data.map(m=>m.id),[rows[3].id]);
  visible=rows;
  const managed=await listMeetings(repositories(db,runtime),actor,{...filter,membership:'joined'},page(new URLSearchParams(),'managed'));
  assert.deepEqual(managed.data.map(m=>m.id),rows.map(r=>r.id));
  mine=[];
  const unset=await listMeetings(repositories(db,runtime),actor,filter,page(new URLSearchParams(),'unset'));
  assert.deepEqual(unset.data.map(m=>m.id),rows.map(r=>r.id));
  assert.ok(unset.data.every(m=>!m.overlapsMyAvailability));
});
