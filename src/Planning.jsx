import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from './supabase';
import {generateMonthlyPlan} from './planner';

export const currentMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit'}).format(new Date());
const label=date=>new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
const weekday=date=>new Date(`${date}T12:00:00Z`).getUTCDay()||7;
const statuses={to_plan:'À planifier',planned:'Planifié',done:'Effectué',cancelled:'Annulé',to_reschedule:'À replanifier'};

export default function Planning({user,clients,settings,setError,setNotice,onVisitsChanged}){
  const [month,setMonth]=useState(currentMonth),[visits,setVisits]=useState([]),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
  const byClient=useMemo(()=>new Map(clients.map(c=>[c.id,c])),[clients]);
  const due=useMemo(()=>clients.filter(c=>c.is_active!==false&&c.active_months?.includes(Number(month.slice(-2)))),[clients,month]);
  async function load(){setReady(false);const {data,error}=await supabase.from('visits').select('*').eq('due_month',`${month}-01`).order('scheduled_date',{ascending:true,nullsFirst:false});if(error)setError(error.message);else setVisits(data??[]);setReady(true)}
  useEffect(()=>{load()},[month,user.id]);
  async function generate(){setError('');setBusy(true);try{
    if(!due.length)throw new Error('Aucun client à visiter pendant ce mois. Vérifie les mois cochés dans ton Excel.');
    const result=generateMonthlyPlan(clients,visits,month,settings??{});
    for(let i=0;i<result.visits.length;i+=100){const {error}=await supabase.from('visits').upsert(result.visits.slice(i,i+100),{onConflict:'user_id,client_id,due_month,occurrence'});if(error)throw error}
    await load();await onVisitsChanged();
    setNotice(`${result.total} visites dues : ${result.visits.filter(v=>v.scheduled_date).length} nouvelles visites datées, ${result.unplanned} à planifier. ${result.preserved} visite(s) verrouillée(s) ou terminée(s) conservée(s).`);
  }catch(err){setError(err.message)}finally{setBusy(false)}}
  async function update(v,patch){setError('');setBusy(true);try{const {error}=await supabase.from('visits').update(patch).eq('id',v.id).eq('user_id',user.id);if(error)throw error;await load();await onVisitsChanged()}catch(err){setError(err.message)}finally{setBusy(false)}}
  function move(v,date){const c=byClient.get(v.client_id);if(!date){update(v,{scheduled_date:null,scheduled_start:null,status:'to_reschedule',is_locked:false});return}
    if(!date.startsWith(month)||!(settings?.working_days??[1,2,3,4,5]).includes(weekday(date))||(c?.excluded_days??[]).includes(weekday(date))){setError('Choisis une date du mois travaillé, en dehors des jours exclus pour ce client.');return}
    update(v,{scheduled_date:date,scheduled_start:null,status:'planned',is_locked:true});
  }
  const dated=visits.filter(v=>v.scheduled_date&&v.status!=='cancelled');
  const unplanned=visits.filter(v=>!v.scheduled_date&&v.status!=='cancelled');
  const cancelled=visits.filter(v=>v.status==='cancelled');
  const groups=dated.reduce((all,v)=>{(all[v.scheduled_date]??=[]).push(v);return all},{});
  const totalMinutes=dated.reduce((n,v)=>n+v.duration_minutes,0);
  return <><header className="page-head"><div><div className="eyebrow">ORGANISATION</div><h1>Planning mensuel</h1><p>Les journées sont construites avec le temps passé chez les clients.</p></div><div className="planning-controls"><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/><button className="primary" disabled={busy||!ready} onClick={generate}>{busy?'Calcul…':visits.length?'Réorganiser les visites':'Générer le mois'}</button></div></header>
    <div className="stats"><div><strong>{due.reduce((n,c)=>n+c.visits_per_month,0)}</strong><span>passages demandés</span></div><div><strong>{dated.length}</strong><span>visites datées</span></div><div><strong>{Math.round(totalMinutes/60*10)/10} h</strong><span>chez les clients</span></div></div>
    <div className="planning-hint">La durée cible est de <strong>{settings?.target_client_minutes??540} min chez les clients</strong> par jour. Les trajets et heures exactes ne sont pas encore calculés. Déplacer une visite la verrouille pour la prochaine génération.</div>
    {!visits.length&&ready?<section className="panel empty"><div className="empty-icon">▦</div><h3>{due.length?'Ton mois est prêt à être organisé':'Aucun client prévu ce mois'}</h3><p>{due.length?'Clique sur « Générer le mois » pour répartir les passages.':'Choisis un mois indiqué dans la fiche de tes clients.'}</p></section>:<>
      {Object.keys(groups).sort().map(date=>{const day=groups[date],duration=day.reduce((n,v)=>n+v.duration_minutes,0);return <section className="panel day-card" key={date}><div className="day-head"><div><h2>{label(date)}</h2><span>{day.length} client{day.length>1?'s':''}</span></div><span className="duration-pill">{Math.floor(duration/60)} h {String(duration%60).padStart(2,'0')} / {Math.floor((settings?.target_client_minutes??540)/60)} h {String((settings?.target_client_minutes??540)%60).padStart(2,'0')}</span></div><div className="visit-list">{day.map(v=><VisitRow key={v.id} v={v} client={byClient.get(v.client_id)} busy={busy} month={month} move={move} update={update}/>)}</div></section>})}
      {unplanned.length>0&&<section className="panel day-card"><div className="day-head"><div><h2>À planifier</h2><span>{unplanned.length} visite{unplanned.length>1?'s':''} sans date</span></div></div><div className="visit-list">{unplanned.map(v=><VisitRow key={v.id} v={v} client={byClient.get(v.client_id)} busy={busy} month={month} move={move} update={update}/>)}</div></section>}
      {cancelled.length>0&&<section className="panel day-card"><div className="day-head"><div><h2>Annulées</h2><span>{cancelled.length} visite{cancelled.length>1?'s':''}</span></div></div><div className="visit-list">{cancelled.map(v=><VisitRow key={v.id} v={v} client={byClient.get(v.client_id)} busy={busy} month={month} move={move} update={update}/>)}</div></section>}
    </>}
  </>;
}

function VisitRow({v,client,busy,month,move,update}){
  const [date,setDate]=useState(v.scheduled_date??'');useEffect(()=>setDate(v.scheduled_date??''),[v.scheduled_date]);
  return <div className="visit-row"><div><strong>{client?.name??'Client supprimé'}</strong><small>{client?.city} · {v.duration_minutes} min{client?.window_start&&client?.window_end?` · créneau ${client.window_start.slice(0,5)}–${client.window_end.slice(0,5)}`:''}</small></div><span className={`status status-${v.status}`}>{statuses[v.status]??v.status}{v.is_locked?' · verrouillé':''}</span><div className="visit-actions"><input aria-label={`Date pour ${client?.name}`} type="date" min={`${month}-01`} max={`${month}-${new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate()}`} value={date} onChange={e=>setDate(e.target.value)}/><button disabled={busy||date===(v.scheduled_date??'')} onClick={()=>move(v,date)}>Déplacer</button>{v.status==='planned'&&<button disabled={busy} onClick={()=>update(v,{status:'done',is_locked:true})}>Effectué</button>}{v.status!=='cancelled'&&<button disabled={busy} onClick={()=>update(v,{status:'to_reschedule',scheduled_date:null,scheduled_start:null,is_locked:false})}>Reporter</button>}{v.status!=='done'&&v.status!=='cancelled'&&<button disabled={busy} onClick={()=>update(v,{status:'cancelled',is_locked:true})}>Annuler</button>}</div></div>;
}
