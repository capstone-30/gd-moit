import 'server-only';
import {ApiError, requireThat} from '../errors';
import {normalizeEmail} from '../models/auth';
import {meetingTypes} from '../../../shared/meeting-types';
import {parseDate} from '../../../shared/date';

const maxBodyBytes = 16384;

export function hostedProject(value:unknown) {
  const v=object(value,['title']);return {title:text(v.title,100)};
}
export function hostedMeetingBatch(value:unknown) {
  const v=object(value,['meetings']);
  requireThat(Array.isArray(v.meetings)&&v.meetings.length>=1&&v.meetings.length<=20,400,'INVALID_INPUT');
  return {meetings:v.meetings.map(hostedMeeting)};
}

export function hostedMeeting(value:unknown) {
  const v=object(value,['title','studentEmails']);
  requireThat(Array.isArray(v.studentEmails)&&v.studentEmails.length>=2&&v.studentEmails.length<=4,400,'INVALID_INPUT');
  const studentEmails=v.studentEmails.map((email:unknown)=>normalizeEmail(text(email,254)));
  requireThat(new Set(studentEmails).size===studentEmails.length,400,'INVALID_INPUT');
  return {title:text(v.title,100),studentEmails};
}
export function hostedSchedule(value:unknown) {
  const v=object(value,['date','slot','placeId']);
  return {date:date(v.date),slot:integer(v.slot,101,799),placeId:uuid(v.placeId)};
}
export function hostedNotice(value:unknown) {
  const v=object(value,['meetingIds','title','body']);
  requireThat(Array.isArray(v.meetingIds)&&v.meetingIds.length>=1&&v.meetingIds.length<=100,400,'INVALID_INPUT');
  return {meetingIds:[...new Set<string>(v.meetingIds.map(uuid))],title:text(v.title,100),body:text(v.body,5000)};
}

export function activityDocuments(value:unknown) {
  const v=object(value,['content','outcome','expenses']);
  requireThat(Array.isArray(v.expenses)&&v.expenses.length<=20,400,'INVALID_INPUT');
  const expenses=v.expenses.map((item:unknown)=>{
    const e=object(item,['date','description','amount']);const d=date(e.date);
    requireThat(parseDate(d),400,'INVALID_INPUT');
    return {date:d,description:text(e.description,120),amount:integer(e.amount,1,100000000)};
  });
  requireThat(expenses.reduce((n:number,e:{amount:number})=>n+e.amount,0)<=100000000,400,'INVALID_INPUT');
  return {content:text(v.content,5000),outcome:text(v.outcome,2000),expenses};
}

export function object(value: unknown, keys: string[]): Record<string, any> {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), 400, 'INVALID_INPUT');
  const input = value as Record<string, any>;
  requireThat(Object.keys(input).every(key => keys.includes(key)), 400, 'INVALID_INPUT');
  return input;
}

export function uuid(value: unknown) {
  requireThat(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value), 400, 'INVALID_INPUT');
  return value;
}

export function text(value: unknown, max: number, optional = false): string {
  requireThat(typeof value === 'string' && value.length <= max && (optional || value.trim().length > 0), 400, 'INVALID_INPUT');
  return value.trim();
}

export function integer(value: unknown, min: number, max: number) {
  requireThat(typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max, 400, 'INVALID_INPUT');
  return value;
}

export function boolean(value: unknown) {
  requireThat(typeof value === 'boolean', 400, 'INVALID_INPUT');
  return value;
}

export function slots(value: unknown) {
  requireThat(Array.isArray(value) && value.length <= 693, 400, 'INVALID_INPUT');
  return [...new Set(value.map(slot => integer(slot, 101, 799)))].sort((a, b) => a - b);
}

export function date(value: unknown) {
  requireThat(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 400, 'INVALID_INPUT');
  return value;
}

export function choice(value: unknown, allowed: string[]) {
  requireThat(typeof value === 'string' && allowed.includes(value), 400, 'INVALID_INPUT');
  return value;
}

export function profileUpdate(value: unknown) {
  const v = object(value, ['displayName', 'department', 'entryYear', 'interests', 'optionalProfileConsent']);
  for (const key of ['displayName', 'department']) {
    if (v[key] != null) v[key] = text(v[key], 100, true);
  }
  if (v.entryYear != null) v.entryYear = integer(v.entryYear, 1, 9999);
  if (v.interests != null) {
    requireThat(Array.isArray(v.interests) && v.interests.length <= 10, 400, 'INVALID_INPUT');
    v.interests = [...new Set(v.interests.map((interest: unknown) => text(interest, 100)))];
  }
  if (v.optionalProfileConsent !== undefined) boolean(v.optionalProfileConsent);
  return v;
}

export function meetingCreate(value: unknown) {
  const v = object(value, ['termId', 'topic', 'type', 'placeId', 'capacity', 'twoPersonAcknowledged']);
  if (v.twoPersonAcknowledged !== undefined) boolean(v.twoPersonAcknowledged);
  return {
    termId: uuid(v.termId),
    topic: text(v.topic, 100),
    type: choice(v.type, Object.keys(meetingTypes)),
    placeId: uuid(v.placeId),
    capacity: v.capacity === undefined ? 3 : integer(v.capacity, 2, 4),
    twoPersonAcknowledged: v.twoPersonAcknowledged,
  };
}

export function meetingFilter(query: URLSearchParams) {
  return {
    topic: query.has('topic') ? text(query.get('topic'), 100, true) : '',
    type: query.has('type') ? choice(query.get('type'), Object.keys(meetingTypes)) : null,
    membership: query.has('membership') ? choice(query.get('membership'), ['all', 'joined', 'unjoined']) : 'all',
    overlapOnly: query.has('overlapOnly') ? choice(query.get('overlapOnly'), ['true', 'false']) === 'true' : false,
  };
}

export async function body(request: Request,limit=maxBodyBytes) {
  if (Number(request.headers.get('content-length') ?? 0) > limit) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE');
  }
  if (request.body === null) return {};

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE');
    }
    chunks.push(value);
  }
  if (!size) return {};

  requireThat(request.headers.get('content-type')?.split(';')[0].trim() === 'application/json', 400, 'INVALID_INPUT');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'INVALID_INPUT');
  }
}
