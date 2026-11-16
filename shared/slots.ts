export const weekdays=['','월','화','수','목','금','토','일'];
export function slotLabel(slot:number){return `${weekdays[Math.floor(slot/100)]}요일 ${slot%100}교시`;}
