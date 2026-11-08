import type {Slot} from './client';

export type SavedAvailability={termId:string,name:string,startsOn:string,endsOn:string,slots:number[],termSlots:Slot[]};

export function reusableSlots(source:SavedAvailability,target:Slot[]) {
  return source.slots.filter(code=>{
    const previous=source.termSlots.find(s=>s.slot===code);
    return previous && target.some(s=>s.slot===code && s.startsAt===previous.startsAt && s.endsAt===previous.endsAt);
  });
}
