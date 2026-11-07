import type {Slot} from './client';

// 시간표 앱 캡처(단색 배경·요일 열·1시간 격자선·색 수업 블록)를 픽셀로 분석한다. 브라우저에서만 실행한다.
export type Pixels={width:number;height:number;data:ArrayLike<number>};
export type TimetableFailure='background'|'columns'|'grid'|'blocks';
export type TimetableAnalysis={ok:true;available:number[];busy:number[];blocks:number}|{ok:false;reason:TimetableFailure};

const overlapMinutes=10,startHour=9; // 첫 가로선은 오전 9시로 고정한다.
const minutes=(time:string)=>{const [h,m]=time.split(':').map(Number);return h*60+m;};

function groups(indices:number[],gap=2) {
  const result:number[]=[];
  let start=-1,last=-1;
  for(const i of indices) {
    if(start<0){start=last=i;continue;}
    if(i-last<=gap){last=i;continue;}
    result.push((start+last)/2);start=last=i;
  }
  if(start>=0)result.push((start+last)/2);
  return result;
}
const median=(values:number[])=>{const s=[...values].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};

export function analyzeTimetable(image:Pixels,slots:Slot[]):TimetableAnalysis {
  const {width,height,data}=image;
  if(width<50||height<50)return {ok:false,reason:'background'};
  const at=(x:number,y:number)=>(y*width+x)*4;
  const chroma=(i:number)=>Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2]);
  const lum=(i:number)=>(data[i]*299+data[i+1]*587+data[i+2]*114)/1000;

  // 1. 가장 많은 무채색 밝기를 배경으로 본다(라이트·다크 공통).
  const buckets=new Array(32).fill(0);let sampled=0;
  for(let y=0;y<height;y+=3)for(let x=0;x<width;x+=3){const i=at(x,y);sampled++;if(chroma(i)<16)buckets[Math.min(31,Math.floor(lum(i)/8))]++;}
  const top=buckets.indexOf(Math.max(...buckets));
  if(buckets[top]/sampled<0.25)return {ok:false,reason:'background'};
  let sum=0,count=0;
  for(let y=0;y<height;y+=3)for(let x=0;x<width;x+=3){const i=at(x,y);if(chroma(i)<16&&Math.floor(lum(i)/8)===top){sum+=lum(i);count++;}}
  const background=sum/count;
  const isLine=(i:number)=>{const d=Math.abs(lum(i)-background);return chroma(i)<20&&d>=6&&d<=70;};
  const isColor=(i:number)=>chroma(i)>=40;

  // 2. 세로 격자선으로 요일 열을 찾는다.
  const vertical:number[]=[];
  for(let x=0;x<width;x++){let n=0;for(let y=0;y<height;y++)if(isLine(at(x,y)))n++;if(n>=height*0.5)vertical.push(x);}
  const bounds=[0,...groups(vertical),width].filter((v,i,a)=>i===0||v-a[i-1]>3);
  const spans=bounds.slice(1).map((end,i)=>({start:bounds[i],end})).filter(s=>s.end-s.start>=width*0.06);
  const widest=Math.max(0,...spans.map(s=>s.end-s.start));
  const columns=spans.filter(s=>s.end-s.start>=widest*0.6);
  const columnWidth=median(columns.map(c=>c.end-c.start));
  if(columns.length<5||columns.length>7||columns.some(c=>Math.abs(c.end-c.start-columnWidth)>columnWidth*0.12)
    ||columns.some((c,i)=>i>0&&c.start!==columns[i-1].end))return {ok:false,reason:'columns'};
  const inner=columns.map(c=>({start:Math.ceil(c.start)+4,end:Math.floor(c.end)-4}));
  const innerWidth=inner.reduce((n,c)=>n+c.end-c.start,0);

  // 3. 가로 격자선 간격을 1시간으로 보고 y → 시각 변환식을 맞춘다.
  const horizontal:number[]=[];
  for(let y=0;y<height;y++){let n=0;for(const c of inner)for(let x=c.start;x<c.end;x++)if(isLine(at(x,y)))n++;if(n>=innerWidth*0.3)horizontal.push(y);}
  const lines=groups(horizontal);
  const gaps=lines.slice(1).map((y,i)=>y-lines[i]).filter(d=>d>=height*0.02);
  if(gaps.length<3)return {ok:false,reason:'grid'};
  const hour=median(gaps),near=(d:number)=>Math.abs(d-Math.round(d/hour)*hour)<=hour*0.08;
  if(gaps.filter(d=>Math.abs(d-hour)<=hour*0.08).length<3)return {ok:false,reason:'grid'};
  const first=lines.find(y=>lines.some(o=>Math.abs(o-y-hour)<=hour*0.08));
  if(first===undefined)return {ok:false,reason:'grid'};
  const matched=lines.filter(y=>y>=first&&near(y-first)).map(y=>({k:Math.round((y-first)/hour),y}));
  if(matched.length<4)return {ok:false,reason:'grid'};
  const mk=matched.reduce((n,p)=>n+p.k,0)/matched.length,my=matched.reduce((n,p)=>n+p.y,0)/matched.length;
  const slope=matched.reduce((n,p)=>n+(p.k-mk)*(p.y-my),0)/matched.reduce((n,p)=>n+(p.k-mk)**2,0);
  const origin=my-slope*mk,toMinutes=(y:number)=>startHour*60+(y-origin)/slope*60;

  // 4. 열마다 색이 채워진 행 구간을 수업 블록으로 본다.
  const blocks:{day:number;from:number;to:number}[]=[];let busyRows=0;
  for(const [index,c] of inner.entries()) {
    const fill:number[]=[];
    for(let y=Math.max(0,Math.round(origin));y<height;y++){let n=0;for(let x=c.start;x<c.end;x++)if(isColor(at(x,y)))n++;fill.push(n/(c.end-c.start));}
    const base=Math.max(0,Math.round(origin));
    let start=-1,end=-1;
    const close=()=>{
      if(start<0)return;
      const run=fill.slice(start,end+1),length=end-start+1;
      if(length>=slope*0.25){
        if(run.reduce((n,v)=>n+v,0)/length<0.5){start=-2;return;}
        blocks.push({day:index+1,from:toMinutes(base+start),to:toMinutes(base+end+1)});busyRows+=length;
      }
      start=-1;
    };
    for(let y=0;y<fill.length;y++){
      if(fill[y]>=0.25){if(start<0)start=y;else if(start===-2)break;end=y;continue;}
      if(start>=0&&y-end>Math.max(3,slope*0.04))close();
      if(start===-2)return {ok:false,reason:'blocks'};
    }
    close();
    if(start===-2)return {ok:false,reason:'blocks'};
  }
  if(!blocks.length||busyRows>(height-origin)*inner.length*0.85)return {ok:false,reason:'blocks'};

  // 5. 수업과 10분 이상 겹치는 교시만 불가능으로 둔다. 캡처에 없는 요일·시간은 가능으로 본다.
  const busy=slots.filter(s=>blocks.some(b=>b.day===Math.floor(s.slot/100)
    &&Math.min(b.to,minutes(s.endsAt))-Math.max(b.from,minutes(s.startsAt))>=overlapMinutes)).map(s=>s.slot);
  return {ok:true,busy,available:slots.filter(s=>!busy.includes(s.slot)).map(s=>s.slot),blocks:blocks.length};
}
