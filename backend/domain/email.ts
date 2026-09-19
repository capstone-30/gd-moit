import {requireThat} from './errors';
export function normalizeEmail(email:string) {const trimmed=email.trim();const at=trimmed.lastIndexOf('@');requireThat(at>0 && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(trimmed) && trimmed.length<=254,400,'INVALID_INPUT');return `${trimmed.slice(0,at)}@${trimmed.slice(at+1).toLowerCase()}`;}
