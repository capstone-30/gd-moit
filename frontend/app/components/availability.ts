import type {Slot} from './client';

export type SavedAvailability={termId:string,name:string,startsOn:string,endsOn:string,slots:number[],termSlots:Slot[]};

export function reusableSlots(source:SavedAvailability,target:Slot[]) {
  return source.slots.filter(code=>{
    const previous=source.termSlots.find(s=>s.slot===code);
    return previous && target.some(s=>s.slot===code && s.startsAt===previous.startsAt && s.endsAt===previous.endsAt);
  });
}

// 목업은 이미지 내용과 무관한 예시 수업을 사용한다. 실제 인식 연동 시 교체한다.
export function mockImageAvailability(slots:Slot[]) {
  const classes=[101,102,203,204,301,302,405,406,503,504];
  return slots.filter(s=>!classes.includes(s.slot)).map(s=>s.slot);
}
