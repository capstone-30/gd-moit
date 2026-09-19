import type {DB} from './ports';
import {demoAccounts} from './demo';
import {settings} from './configuration';
import {availability,saveAvailability} from './profile';
import {addComment,coordinate,createMeeting,detail,etag,join} from './meetings';
import * as hosted from './hosted-meetings';
import {hostedActivities,type HostedActivityType} from '../../shared/hosted-activities';

function weekdayDate(today:string,direction:1|-1) {
  const date=new Date(`${today}T00:00:00Z`);
  while(date.getUTCDay()===0||date.getUTCDay()===6) date.setUTCDate(date.getUTCDate()+direction);
  return {date:date.toISOString().slice(0,10),slot:date.getUTCDay()*100+1};
}

export async function seedDemoActivities(db:DB) {
  const config=await settings(db),termId=config.current_term_id;
  const accounts=[];
  for(const account of demoAccounts) accounts.push((await db.auth.findUserByEmail([account.email])).rows[0]);
  const [staff,student,peer]=accounts;
  const places=(await db.configuration.listActivePlaces([config.school_id])).rows;
  const placeId=places.find(p=>p.name==='TIP').id;
  for(const actor of [student,peer]) {
    if(!(await availability(db,actor,termId)).registered) await saveAvailability(db,actor,termId,[101,102,301,302,501,502]);
  }

  const existing=new Set((await db.demo.listDemoMeetings([[student.id,peer.id],termId])).rows.map(m=>m.topic));
  const scenarios=[
    {topic:'[데모] 함께 만드는 첫 웹 서비스',type:'study',host:peer,capacity:4,joined:false},
    {topic:'[데모] 개발 진로 커피챗',type:'coffee',host:peer,capacity:3,joined:false},
    {topic:'[데모] 점심 먹으며 프로젝트 이야기',type:'lunch',host:student,capacity:3,joined:true},
    {topic:'[데모] 둘이서 알고리즘 모각공',type:'study',host:student,capacity:2,joined:true},
    {topic:'[데모] 이번 주 배움과 다음 시도',type:'reflection',host:student,capacity:4,joined:true},
  ];
  for(const scenario of scenarios) {
    if(existing.has(scenario.topic)) continue;
    const meeting=await createMeeting(db,scenario.host,{termId,placeId,...scenario,twoPersonAcknowledged:scenario.capacity===2});
    if(scenario.joined) await join(db,peer,meeting.id);
    if(scenario.type==='lunch') {
      const current=await detail(db,student,meeting.id);
      const slot='intersectionSlots' in current?current.intersectionSlots?.[0]:undefined;
      if(slot) {
        const date=new Date(`${config.today}T00:00:00Z`);
        while(date.getUTCDay()!==Math.floor(slot/100)) date.setUTCDate(date.getUTCDate()+1);
        await coordinate(db,student,meeting.id,date.toISOString().slice(0,10),slot,etag(current));
      }
    }
    if(scenario.joined) {
      await addComment(db,student,meeting.id,scenario.type==='reflection'
        ?'경험: 작은 기능을 끝까지 구현했어요.\n배운 점: 먼저 API 계약을 맞추니 협업이 수월했어요.\n다음 시도: 빈 상태와 오류 화면도 함께 확인하려고 해요.'
        :'안녕하세요! 이번 모임에서 서로의 프로젝트 경험을 나눠봐요.');
      await addComment(db,peer,meeting.id,scenario.type==='reflection'
        ?'경험: 함께 코드를 리뷰했어요.\n배운 점: 변경 이유를 짧게 적으니 이해하기 쉬웠어요.\n다음 시도: 다음 작업부터 작은 단위로 리뷰를 요청할게요.'
        :'좋아요. TIP에서 만나요! 장소나 일정이 바뀌면 여기에 남길게요.');
    }
  }

  const projects=new Set((await db.demo.listDemoProjects([staff.id,termId])).rows.map(p=>p.title));
  const past=weekdayDate(config.today,-1),future=weekdayDate(config.today,1);
  for(const activityType of Object.keys(hostedActivities) as HostedActivityType[]) {
    const template=hostedActivities[activityType],title=`[데모] ${template.label} 프로젝트`;
    if(projects.has(title)) continue;
    const project=await hosted.createProject(db,staff,{title,activityType});
    const titles=activityType==='mentoring'?['멘토링 1조 · 서류 제출 예시','멘토링 2조 · 일정 조율']: [`${template.label} 1조`];
    const batch=await hosted.createBatch(db,staff,project.id,{meetings:titles.map(title=>({title,studentEmails:[student.email,peer.email]}))});
    await hosted.publishProjectNotice(db,staff,project.id,{title:'[데모] 활동 안내',body:'합성 데이터로 구성한 시연용 활동입니다. 배정된 학생이 일정과 장소를 정하고, 활동 후 공지의 제출 안내를 확인해주세요.'});
    const meeting=batch.meetings[0];
    if(activityType==='mentoring'||activityType==='plogging') {
      // 제출·미제출 비교를 위한 과거 활동은 시드에서만 직접 배치한다.
      await db.hostedMeetings.updateSchedule([meeting.id,past.date,past.slot,placeId,config.school_id]);
    } else if(activityType==='learning') {
      await hosted.schedule(db,student,meeting.id,{...future,placeId},meeting.etag);
    }
    if(activityType==='mentoring') {
      await hosted.submit(db,student,meeting.id,{content:'학교 생활과 웹 개발 학습 계획을 함께 정리했습니다.',outcome:'각자 다음 주에 시도할 학습 목표를 정했습니다.',expenses:[{date:past.date,description:'멘토링 활동 자료 인쇄',amount:3000}]},null);
      await hosted.submit(db,peer,meeting.id,{content:'관심 직무와 프로젝트 경험을 나누고 학습 방법을 정리했습니다.',outcome:'작은 프로젝트를 완성하고 다음 모임에서 공유하기로 했습니다.'},null);
    }
    if(activityType==='plogging') await hosted.submit(db,student,meeting.id,{content:'캠퍼스 주변을 걸으며 환경 실천 활동을 진행했습니다.',outcome:'다음 활동의 동선과 준비물을 함께 정했습니다.'},null);
  }
}
