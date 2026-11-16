import type {MeetingType} from './meeting-types';
import type {AccountRole} from './account';

export type Config={demoAccounts?:readonly {email:string,role:AccountRole,label:string}[],school:null|{id:string,name:string,timezone:string,departments:string[],entryYears:number[]},term:null|{id:string,startsOn:string,endsOn:string,slots:Slot[]},places:{id:string,name:string}[],registrationAvailable:boolean,privacyVersion:string|null,privacyNotice:Record<string,unknown>|null};
export type Slot={slot:number,startsAt:string,endsAt:string};
export type Profile={department:string|null,entryYear:number|null,interests:string[]};
export type Me=Profile&{role:AccountRole,id:string,email:string,displayName:string|null,optionalProfileConsent:boolean,creationRestricted:boolean};
export type MeetingSummary={id:string,topic:string,type:MeetingType,place:{id:string,name:string},capacity:number,memberCount:number,state:string,confirmation:null|{date:string,slot:number,source:string},overlapsMyAvailability:boolean,canJoin:boolean,expiresAt:string,version:number,isMember:boolean};
export type Meeting=MeetingSummary&{termId:string,term:Config['term'],hostId:string,members:{userId:string,memberNo:number,isHost:boolean,profile:Profile}[],intersectionSlots?:number[],proposal?:null|{id:string,date:string,slot:number,acceptedMemberNos:number[],myAccepted:boolean}};
export type Comment={id:string,memberNo:number,body:string,createdAt:string,isMine:boolean};
export type Availability={registered:boolean;slots:number[]};
