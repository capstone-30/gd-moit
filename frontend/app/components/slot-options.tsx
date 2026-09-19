import type {Slot} from './client';
import {slotLabel} from './client';
import {slotMatchesDate} from '../../../shared/date';

export function SlotOptions({slots,date,allowUndated=false}:{slots:Slot[];date:string;allowUndated?:boolean}) {
  return slots.filter(s=>allowUndated&&!date||slotMatchesDate(date,s.slot)).map(s=>
    <option key={s.slot} value={s.slot}>{slotLabel(s.slot)} · {s.startsAt.slice(0,5)}~{s.endsAt.slice(0,5)}</option>);
}
