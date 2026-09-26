import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {supabase,configured} from './supabase';
import {parseClients} from './importExcel';
import './style.css';

const monthLabels=['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
const dayLabels=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

function App(){
  const [session,setSession]=useState(null),[loading,setLoading]=useState(true);
  const [tab,setTab]=useState('clients'),[clients,setClients]=useState([]),[settings,setSettings]=useState(null);
  const [notice,setNotice]=useState(''),[error,setError]=useState('');
  useEffect(()=>{
    if(!supabase){setLoading(false);return}
    supabase.auth.getSession().then(({data,error})=>{if(error)setError(error.message);setSession(data?.session??null);setLoading(false)});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>setSession(s));
    return ()=>subscription.unsubscribe();
  },[]);
  async function refresh(){
    if(!session)return;
    const [a,b]=await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase.from('user_settings').select('*').eq('user_id',session.user.id).maybeSingle()
    ]);
    if(a.error||b.error)setError(a.error?.message||b.error?.message);
    else {setClients(a.data??[]);setSettings(b.data)}
  }
  useEffect(()=>{refresh()},[session?.user?.id]);
  if(!configured)return <main className="center"><div className="panel"><h1>Configuration nécessaire</h1><p>Copie <code>.env.example</code> vers <code>.env.local</code> et renseigne l’adresse et la clé publique de ton projet Supabase.</p></div></main>;
  if(loading)return <main className="center">Chargement…</main>;
  if(!session)return <Auth/>;
  return <div className="app">
    <aside className="sidebar"><div className="brand"><span className="brand-icon">◈</span><span>Mes tournées<small>Planification clients</small></span></div>
      <nav>{[['clients','Clients','◎'],['import','Import Excel','⇧'],['settings','Paramètres','⚙']].map(([id,label,icon])=><button key={id} className={tab===id?'active':''} onClick={()=>{setTab(id);setError('');setNotice('')}}><span>{icon}</span>{label}</button>)}</nav>
      <div className="sidebar-bottom"><span className="account">{session.user.email}</span><button className="logout" onClick={()=>supabase.auth.signOut()}>Se déconnecter ↗</button></div>
    </aside>
    <main className="content"><div className="topline"><span>ESPACE DE TRAVAIL</span><span className="pill">Projet personnel</span></div>
      {error&&<div className="alert error" role="alert">{error}<button onClick={()=>setError('')}>×</button></div>}
      {notice&&<div className="alert success" role="status">{notice}<button onClick={()=>setNotice('')}>×</button></div>}
      {tab==='clients'&&<Clients clients={clients} onImport={()=>setTab('import')}/>}
      {tab==='import'&&<Import user={session.user} onSaved={async()=>{await refresh();setTab('clients')}} setError={setError} setNotice={setNotice}/>}
      {tab==='settings'&&<Settings user={session.user} saved={settings} onSaved={refresh} setError={setError} setNotice={setNotice}/>}
    </main>
  </div>;
}

function Auth(){
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[mode,setMode]=useState('login'),[pending,setPending]=useState(false),[message,setMessage]=useState('');
  async function submit(e){e.preventDefault();setPending(true);setMessage('');
    const {data,error}=mode==='login'?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+import.meta.env.BASE_URL}});
    setPending(false);setMessage(error?.message||(mode==='signup'&&!data.session?'Vérifie ta boîte mail pour confirmer ton compte.':''));
  }
  return <main className="center auth-bg"><form className="auth-card" onSubmit={submit}><div className="auth-logo">◈</div><h1>{mode==='login'?'Bon retour':'Créer mon compte'}</h1><p>Ton planning clients au même endroit.</p><label>Adresse e-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="vous@exemple.fr"/></label><label>Mot de passe<input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/></label>{message&&<div className="auth-message">{message}</div>}<button className="primary" disabled={pending}>{pending?'Un instant…':mode==='login'?'Se connecter':'Créer mon compte'}</button><button type="button" className="text-button" onClick={()=>{setMode(mode==='login'?'signup':'login');setMessage('')}}>{mode==='login'?'Créer un compte':'J’ai déjà un compte'}</button></form></main>
}

function Clients({clients,onImport}){
  const [query,setQuery]=useState('');
  const filtered=useMemo(()=>clients.filter(c=>`${c.name} ${c.external_id} ${c.city}`.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr'))),[clients,query]);
  return <><header className="page-head"><div><div className="eyebrow">RÉPERTOIRE</div><h1>Clients</h1><p>Retrouve les adresses et les règles de passage de tes clients.</p></div><button className="primary" onClick={onImport}>＋ Importer un Excel</button></header>
    <div className="stats"><div><strong>{clients.length}</strong><span>clients enregistrés</span></div><div><strong>{clients.filter(c=>c.active_months?.length).length}</strong><span>avec des mois de visite</span></div><div><strong>{clients.filter(c=>c.allowed_days?.length||c.fixed_start_time||c.window_start).length}</strong><span>avec des contraintes</span></div></div>
    <section className="panel"><div className="table-top"><h2>Liste des clients</h2><input aria-label="Rechercher un client" value={query} onChange={e=>setQuery(e.target.value)} placeholder="⌕  Rechercher un nom, une ville…"/></div>
      {!clients.length?<div className="empty"><div className="empty-icon">▦</div><h3>Ta liste est encore vide</h3><p>Importe ton fichier Excel pour voir tous tes clients ici.</p><button onClick={onImport}>Importer un fichier →</button></div>:<div className="table-scroll"><table><thead><tr><th>CLIENT</th><th>VILLE</th><th>PASSAGES</th><th>DURÉE</th><th>MOIS</th></tr></thead><tbody>{filtered.map(c=><tr key={c.id}><td><strong>{c.name}</strong><small>{c.street_address} · {c.postal_code}</small></td><td>{c.city}</td><td>{c.visits_per_month} / mois</td><td>{c.visit_minutes} min</td><td><span className="month-count">{c.active_months?.length??0} mois</span></td></tr>)}</tbody></table>{!filtered.length&&<p className="no-results">Aucun client trouvé.</p>}</div>}
    </section></>;
}

function Import({user,onSaved,setError,setNotice}){
  const [rows,setRows]=useState([]),[fileName,setFileName]=useState(''),[busy,setBusy]=useState(false);
  async function fileChanged(e){setError('');setRows([]);const file=e.target.files?.[0];if(!file)return;setFileName(file.name);try{setRows(await parseClients(file))}catch(err){setError(err.message)}}
  async function save(){setBusy(true);setError('');try{
    for(let i=0;i<rows.length;i+=100){const batch=rows.slice(i,i+100).map(r=>({...r,user_id:user.id}));const {error}=await supabase.from('clients').upsert(batch,{onConflict:'user_id,external_id'});if(error)throw error}
    setNotice(`${rows.length} clients importés ou mis à jour.`);await onSaved();
  }catch(err){setError(`Import interrompu : ${err.message}. Certains lots ont peut-être été enregistrés ; tu peux relancer l’import sans créer de doublons.`)}finally{setBusy(false)}}
  return <><header className="page-head"><div><div className="eyebrow">DONNÉES CLIENTS</div><h1>Importer un Excel</h1><p>Ajoute tes clients à partir du modèle préparé ensemble.</p></div><a className="download" href={`${import.meta.env.BASE_URL}Modele_clients_tournees.xlsx`} download>Télécharger le modèle ↓</a></header>
    <section className="panel import-panel"><div className="step">01 <span>CHOISIR LE FICHIER</span></div><label className="dropzone"><span className="upload-icon">⇧</span><strong>{fileName||'Clique ici pour sélectionner ton fichier'}</strong><small>Format .xlsx · onglet « Clients » du modèle</small><input type="file" accept=".xlsx" onChange={fileChanged}/></label>
    <div className="step second">02 <span>VÉRIFIER ET IMPORTER</span></div>{rows.length?<><div className="preview-note"><strong>{rows.length} clients prêts à importer</strong><span>La ligne d’exemple est automatiquement ignorée. Un identifiant déjà connu met à jour ce client.</span></div><div className="table-scroll"><table><thead><tr><th>IDENTIFIANT</th><th>CLIENT</th><th>VILLE</th><th>VISITES / MOIS</th></tr></thead><tbody>{rows.slice(0,5).map(c=><tr key={c.external_id}><td>{c.external_id}</td><td>{c.name}</td><td>{c.city}</td><td>{c.visits_per_month}</td></tr>)}</tbody></table></div>{rows.length>5&&<p className="muted">… et {rows.length-5} autres clients.</p>}<button className="primary" disabled={busy} onClick={save}>{busy?'Import en cours…':`Importer ${rows.length} clients`}</button></>:<p className="muted">Ton fichier sera vérifié avant tout enregistrement.</p>}</section>
  </>;
}

function Settings({user,saved,onSaved,setError,setNotice}){
  const [form,setForm]=useState({home_address:'',home_postal_code:'',home_city:'',home_country:'France',target_client_minutes:540,day_start:'08:00',day_end:'20:00',working_days:[1,2,3,4,5],max_travel_minutes:''});const [busy,setBusy]=useState(false);
  useEffect(()=>{if(saved)setForm({...saved,max_travel_minutes:saved.max_travel_minutes??''})},[saved]);
  const update=(key,value)=>setForm(f=>({...f,[key]:value}));
  async function submit(e){e.preventDefault();setError('');setBusy(true);
    const payload={user_id:user.id,home_address:form.home_address||null,home_postal_code:form.home_postal_code||null,home_city:form.home_city||null,home_country:form.home_country||'France',target_client_minutes:Number(form.target_client_minutes),day_start:form.day_start,day_end:form.day_end,working_days:form.working_days,max_travel_minutes:form.max_travel_minutes===''?null:Number(form.max_travel_minutes)};
    if(!payload.working_days.length||payload.day_end<=payload.day_start||payload.target_client_minutes<1){setError('Vérifie les jours travaillés, les horaires et la durée cible.');setBusy(false);return}
    const {error}=await supabase.from('user_settings').upsert(payload,{onConflict:'user_id'});setBusy(false);
    if(error)setError(error.message);else{setNotice('Paramètres enregistrés.');onSaved()}
  }
  return <><header className="page-head"><div><div className="eyebrow">PRÉFÉRENCES</div><h1>Paramètres</h1><p>Définis ton point de départ et ton rythme de travail.</p></div></header><form className="panel settings-panel" onSubmit={submit}><h2>Adresse de départ et de retour</h2><div className="form-grid"><label className="wide">Numéro et voie<input value={form.home_address??''} onChange={e=>update('home_address',e.target.value)} placeholder="10 rue…"/></label><label>Code postal<input value={form.home_postal_code??''} onChange={e=>update('home_postal_code',e.target.value)} placeholder="25000"/></label><label>Ville<input value={form.home_city??''} onChange={e=>update('home_city',e.target.value)} placeholder="Besançon"/></label></div><hr/><h2>Journée de travail</h2><p className="muted">La cible concerne uniquement le temps chez les clients. Les trajets seront calculés séparément.</p><div className="form-grid"><label>Objectif chez les clients (minutes)<input type="number" min="1" max="1440" value={form.target_client_minutes} onChange={e=>update('target_client_minutes',e.target.value)}/></label><label>Trajet maximum souhaité (minutes)<input type="number" min="0" value={form.max_travel_minutes} onChange={e=>update('max_travel_minutes',e.target.value)} placeholder="Facultatif"/></label><label>Début habituel<input type="time" value={form.day_start} onChange={e=>update('day_start',e.target.value)}/></label><label>Fin habituelle<input type="time" value={form.day_end} onChange={e=>update('day_end',e.target.value)}/></label></div><div className="days"><span>Jours travaillés</span><div>{dayLabels.map((d,i)=><button type="button" key={d} className={form.working_days?.includes(i+1)?'selected':''} onClick={()=>update('working_days',form.working_days?.includes(i+1)?form.working_days.filter(x=>x!==i+1):[...form.working_days,i+1].sort())}>{d}</button>)}</div></div><button className="primary" disabled={busy}>{busy?'Enregistrement…':'Enregistrer les paramètres'}</button></form></>;
}

createRoot(document.getElementById('root')).render(<App/>);
