import type {Slot} from './client';

// 시간표 앱 캡처(단색 배경·요일 열·가로 격자선·색 수업 블록)를 픽셀로 분석한다. 브라우저에서만 실행한다.
// 격자 한 줄은 1시간(첫 줄 오전 9시) 또는 1교시(첫 줄 1교시)다. 블록 경계가 격자선에 맞으면 교시형으로 본다.
export type Pixels={width:number;height:number;data:ArrayLike<number>};
export type TimetableFailure='background'|'columns'|'grid'|'start'|'blocks';
export type TimetableGrid='hour'|'period';
export type TimetableAnalysis={ok:true;available:number[];busy:number[];blocks:number;grid:TimetableGrid}|{ok:false;reason:TimetableFailure};

const startHour=9,overlapMinutes=10,periodOverlap=0.2,alignedEdge=0.1;
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
  const peak=buckets.indexOf(Math.max(...buckets));
  if(buckets[peak]/sampled<0.25)return {ok:false,reason:'background'};
  let sum=0,count=0;
  for(let y=0;y<height;y+=3)for(let x=0;x<width;x+=3){const i=at(x,y);if(chroma(i)<16&&Math.floor(lum(i)/8)===peak){sum+=lum(i);count++;}}
  const background=sum/count;
  // 격자선은 배경과 밝기만 조금 다른 무채색, 수업 블록은 옅은 파스텔까지 포함한 유채색이다.
  const isLine=(i:number)=>{const d=Math.abs(lum(i)-background);return chroma(i)<6&&d>=3&&d<=70;};
  const isColor=(i:number)=>chroma(i)>=10;

  // 2. 가장 긴 세로선(바깥 테두리·시간 열 경계)이 이어진 구간을 시간표 영역으로 보고, 상태 표시줄·탭 등 바깥은 뺀다.
  // 선에 붙은 수업 블록 색 번짐은 선이 이어진 것으로 본다.
  let top=0,bottom=height,longest=0;
  for(let x=0;x<width;x++){
    let start=-1,last=-1,alive=-1;
    const close=()=>{if(start>=0&&last-start+1>longest){longest=last-start+1;top=start;bottom=last+1;}};
    for(let y=0;y<height;y++){
      const i=at(x,y),line=isLine(i);
      if(!line&&!isColor(i))continue;
      if(start>=0&&y-alive>Math.max(3,height*0.01)){close();start=-1;}
      alive=y;
      if(line){if(start<0)start=y;last=y;}
    }
    close();
  }
  if(longest<height*0.3){top=0;bottom=height;}
  const span=bottom-top;

  // 3. 세로 격자선으로 요일 열을 찾는다. 요일 열은 너비가 같고, 시간 열은 이보다 좁다.
  const vertical:number[]=[];
  // 수업 블록이 세로선을 가리므로 높이의 30%가 보이거나, 블록에 가리지 않은 부분 대부분이 선이면 선으로 본다.
  // 블록 경계로 생긴 가까운 후보는 합친다.
  for(let x=0;x<width;x++){
    let n=0,colored=0;
    for(let y=top;y<bottom;y++){const i=at(x,y);if(isLine(i))n++;else if(isColor(i))colored++;}
    if(n>=span*0.3||(n>=span*0.1&&n>=(span-colored)*0.6))vertical.push(x);
  }
  const bounds=[0,...groups(groups(vertical),width*0.02),width].filter((v,i,a)=>i===0||v-a[i-1]>3);
  const spans=bounds.slice(1).map((end,i)=>({start:bounds[i],end})).filter(s=>s.end-s.start>=width*0.06);
  const widest=Math.max(0,...spans.map(s=>s.end-s.start));
  const wide=spans.filter(s=>s.end-s.start>=widest*0.6),columnWidth=median(wide.map(c=>c.end-c.start));
  const columns=wide.filter(c=>Math.abs(c.end-c.start-columnWidth)<=columnWidth*0.04);
  if(columns.length<5||columns.length>7||columns.some((c,i)=>i>0&&c.start!==columns[i-1].end))return {ok:false,reason:'columns'};
  const inner=columns.map(c=>({start:Math.ceil(c.start)+4,end:Math.floor(c.end)-4}));
  const innerWidth=inner.reduce((n,c)=>n+c.end-c.start,0);

  // 4. 가로 격자선 간격을 한 줄로 보고 y → 줄 번호 변환식을 맞춘다.
  // 세로선과 같은 기준으로 후보 행을 찾고, JPEG 번짐으로 생긴 가까운 후보 중 선 픽셀이 가장 많은 행을 선으로 둔다.
  const strength=new Array<number>(height).fill(0),candidates:number[]=[];
  for(let y=top;y<bottom;y++){
    let n=0,colored=0;
    for(const c of inner)for(let x=c.start;x<c.end;x++){const i=at(x,y);if(isLine(i))n++;else if(isColor(i))colored++;}
    strength[y]=n;
    if(n>=innerWidth*0.3||(n>=innerWidth*0.1&&n>=(innerWidth-colored)*0.6))candidates.push(y);
  }
  const lines:number[]=[];
  for(let k=0;k<candidates.length;) {
    let end=k;
    while(end+1<candidates.length&&candidates[end+1]-candidates[end]<=Math.max(2,height*0.01))end++;
    const cluster=candidates.slice(k,end+1),peak=Math.max(...cluster.map(y=>strength[y]));
    const strongest=cluster.filter(y=>strength[y]>=peak*0.95);
    lines.push((strongest[0]+strongest[strongest.length-1])/2);
    k=end+1;
  }
  const gaps=lines.slice(1).map((y,i)=>y-lines[i]).filter(d=>d>=height*0.02);
  if(gaps.length<3)return {ok:false,reason:'grid'};
  const row=median(gaps),near=(d:number)=>Math.abs(d-Math.round(d/row)*row)<=row*0.08;
  if(gaps.filter(d=>Math.abs(d-row)<=row*0.08).length<3)return {ok:false,reason:'grid'};
  const first=lines.find(y=>lines.some(o=>Math.abs(o-y-row)<=row*0.08));
  if(first===undefined)return {ok:false,reason:'grid'};
  const matched=lines.filter(y=>y>=first&&near(y-first)).map(y=>({k:Math.round((y-first)/row),y}));
  if(matched.length<4)return {ok:false,reason:'grid'};
  const mk=matched.reduce((n,p)=>n+p.k,0)/matched.length,my=matched.reduce((n,p)=>n+p.y,0)/matched.length;
  const slope=matched.reduce((n,p)=>n+(p.k-mk)*(p.y-my),0)/matched.reduce((n,p)=>n+(p.k-mk)**2,0);
  const origin=my-slope*mk,toRow=(y:number)=>(y-origin)/slope;
  // 첫 줄 위에 요일 머리글 없이 빈 줄 일부만 보이면 아래로 스크롤한 캡처라 첫 줄 시각을 알 수 없다.
  // 시간표 영역 위 탭 밑줄 등과 섞이지 않도록, 첫 줄 바로 위의 가로선(머리글 윗선)부터 본다.
  const header=Math.max(top,...lines.filter(y=>y<origin-2))+3;
  if(origin-header>=slope*0.1) {
    let text=0;
    for(let y=header;y<origin-2;y++)for(const c of inner)for(let x=c.start;x<c.end;x++){const i=at(x,y);if(chroma(i)<16&&Math.abs(lum(i)-background)>40)text++;}
    if(text<innerWidth*0.1)return {ok:false,reason:'start'};
  }

  // 5. 열마다 색이 채워진 행 구간을 수업 블록으로 본다.
  const blocks:{day:number;from:number;to:number;cut:boolean}[]=[];let busyRows=0;
  const base=Math.max(top,Math.round(origin));
  for(const [index,c] of inner.entries()) {
    const fill:number[]=[];
    for(let y=base;y<bottom;y++){let n=0;for(let x=c.start;x<c.end;x++)if(isColor(at(x,y)))n++;fill.push(n/(c.end-c.start));}
    let start=-1,end=-1,broken=false;
    const close=()=>{
      if(start<0)return;
      const length=end-start+1;
      if(length>=slope*0.25){
        if(fill.slice(start,end+1).reduce((n,v)=>n+v,0)/length<0.5)broken=true;
        else{blocks.push({day:index+1,from:toRow(base+start),to:toRow(base+end+1),cut:base+end+1>=bottom-2});busyRows+=length;}
      }
      start=-1;
    };
    for(let y=0;y<fill.length&&!broken;y++){
      if(fill[y]>=0.25){if(start<0)start=y;end=y;continue;}
      if(start>=0&&y-end>Math.max(3,slope*0.04))close();
    }
    close();
    if(broken)return {ok:false,reason:'blocks'};
  }
  if(!blocks.length||busyRows>(bottom-origin)*inner.length*0.85)return {ok:false,reason:'blocks'};

  // 6. 시간형은 수업과 10분 이상, 교시형은 해당 줄의 20% 이상 겹치는 교시만 불가능으로 둔다.
  const offset=(v:number)=>Math.abs(v-Math.round(v));
  // 캡처 아래 끝에서 잘린 블록의 끝은 격자선과 무관하므로 판정에서 뺀다.
  const grid:TimetableGrid=blocks.every(b=>offset(b.from)<=alignedEdge&&(b.cut||offset(b.to)<=alignedEdge))?'period':'hour';
  const overlaps=(b:typeof blocks[number],s:Slot)=>grid==='period'
    ?Math.min(b.to,s.slot%100)-Math.max(b.from,s.slot%100-1)>=periodOverlap
    :Math.min(startHour*60+b.to*60,minutes(s.endsAt))-Math.max(startHour*60+b.from*60,minutes(s.startsAt))>=overlapMinutes;
  const busy=slots.filter(s=>blocks.some(b=>b.day===Math.floor(s.slot/100)&&overlaps(b,s))).map(s=>s.slot);
  return {ok:true,busy,available:slots.filter(s=>!busy.includes(s.slot)).map(s=>s.slot),blocks:blocks.length,grid};
}
