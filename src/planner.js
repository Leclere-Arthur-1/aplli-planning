const minutes=(time)=>{const [h,m]=String(time||'').split(':').map(Number);return h*60+m};
const weekday=(date)=>new Date(`${date}T12:00:00Z`).getUTCDay()||7;
const isoDate=(year,month,day)=>`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
const distance=(a,b)=>{
  const rad=x=>x*Math.PI/180;
  const lat=rad(b.latitude-a.latitude),lon=rad(b.longitude-a.longitude);
  const h=Math.sin(lat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(lon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
};

function serviceSlotsFit(visits,settings){
  const start=minutes(settings.day_start||'08:00'),end=minutes(settings.day_end||'20:00');
  const byDeadline=[...visits].sort((a,b)=>minutes(a.window_end||settings.day_end||'20:00')-minutes(b.window_end||settings.day_end||'20:00'));
  let cursor=start;
  for(const v of byDeadline){
    cursor=Math.max(cursor,minutes(v.window_start||settings.day_start||'08:00'));
    const limit=Math.min(end,minutes(v.window_end||settings.day_end||'20:00'));
    if(cursor+v.duration_minutes>limit)return false;
    cursor+=v.duration_minutes;
  }
  return true;
}

function geographicPenalty(client,others){
  if(!others.length)return 4;
  return Math.min(...others.map(other=>{
    if(client.geocode_status==='verified'&&other.geocode_status==='verified'&&client.latitude!=null&&other.latitude!=null)return Math.min(12,distance(client,other)/6);
    if(client.postal_code===other.postal_code)return 0;
    if(client.city?.toLocaleLowerCase('fr')===other.city?.toLocaleLowerCase('fr'))return 1;
    return String(client.postal_code).slice(0,2)===String(other.postal_code).slice(0,2)?4:10;
  }));
}

export function generateMonthlyPlan(clients,existing,month,settings={}){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Mois invalide.');
  const [year,m]=month.split('-').map(Number),count=new Date(Date.UTC(year,m,0)).getUTCDate();
  const due_month=`${month}-01`,target=Number(settings.target_client_minutes||540);
  const workingDays=settings.working_days?.length?settings.working_days:[1,2,3,4,5];
  const days=Array.from({length:count},(_,i)=>({date:isoDate(year,m,i+1),index:i+1,visits:[],minutes:0})).filter(d=>workingDays.includes(weekday(d.date)));
  const byDate=new Map(days.map(d=>[d.date,d]));
  const existingByKey=new Map(existing.map(v=>[`${v.client_id}|${v.occurrence}`,v]));
  const active=clients.filter(c=>c.is_active!==false&&c.active_months?.includes(m));
  const byClient=new Map(active.map(c=>[c.id,c]));
  const entries=[];
  for(const client of active){
    for(let occurrence=1;occurrence<=client.visits_per_month;occurrence++){
      const previous=existingByKey.get(`${client.id}|${occurrence}`);
      entries.push({client,occurrence,previous,targetDay:(occurrence-.5)*count/client.visits_per_month});
    }
  }
  const preserved=entries.filter(e=>e.previous&&(e.previous.is_locked||['done','cancelled'].includes(e.previous.status)));
  for(const e of preserved){
    e.assignedDate=e.previous.scheduled_date;
    const d=byDate.get(e.previous.scheduled_date);
    if(d&&e.previous.status!=='cancelled'){
      d.visits.push({client:e.client,duration_minutes:e.previous.duration_minutes??e.client.visit_minutes,window_start:e.client.window_start,window_end:e.client.window_end});
      d.minutes+=e.previous.duration_minutes??e.client.visit_minutes;
    }
  }
  const candidates=entries.filter(e=>!preserved.includes(e)).sort((a,b)=>{
    const constrained=x=>(x.client.window_end?1:0)+(x.client.excluded_days?.length||0)/7;
    return constrained(b)-constrained(a)||a.targetDay-b.targetDay||b.client.visit_minutes-a.client.visit_minutes;
  });
  const output=[];
  for(const e of candidates){
    const client=e.client,exclude=client.excluded_days||[];
    const near=entries.filter(x=>x.client.id===client.id&&x!==e&&x.assignedDate).map(x=>x.assignedDate);
    const minGap=Math.max(2,Math.floor(count/(client.visits_per_month*2)));
    let choices=days.filter(d=>!exclude.includes(weekday(d.date))&&d.minutes+client.visit_minutes<=target&&serviceSlotsFit([...d.visits,{client,duration_minutes:client.visit_minutes,window_start:client.window_start,window_end:client.window_end}],settings));
    const spaced=choices.filter(d=>near.every(date=>Math.abs(d.index-Number(date.slice(-2)))>=minGap));
    if(spaced.length)choices=spaced;
    choices.sort((a,b)=>{
      const score=d=>Math.abs(d.index-e.targetDay)*1.5+geographicPenalty(client,d.visits.map(v=>v.client))-d.minutes/target;
      return score(a)-score(b)||a.date.localeCompare(b.date);
    });
    const selected=choices[0];
    if(selected){selected.visits.push({client,duration_minutes:client.visit_minutes,window_start:client.window_start,window_end:client.window_end});selected.minutes+=client.visit_minutes;e.assignedDate=selected.date}
    output.push({...(e.previous?.id?{id:e.previous.id}:{}),user_id:client.user_id,client_id:client.id,due_month,occurrence:e.occurrence,scheduled_date:selected?.date??null,scheduled_start:null,duration_minutes:client.visit_minutes,route_order:null,status:selected?'planned':'to_plan',is_locked:false,notes:e.previous?.notes??null});
  }
  return {visits:output,days,unplanned:output.filter(v=>!v.scheduled_date).length,preserved:preserved.length,total:entries.length,inactiveExisting:existing.filter(v=>!byClient.has(v.client_id)).length};
}
