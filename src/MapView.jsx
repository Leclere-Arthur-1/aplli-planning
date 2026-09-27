import React,{useEffect,useMemo,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {supabase} from './supabase';
import {currentMonth} from './Planning';

const color=date=>`hsl(${(Number(date.slice(-2))*137.508)%360} 72% 42%)`;
const label=date=>new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export default function MapView({user,clients,settings,setError,setNotice,onChanged}){
  const [month,setMonth]=useState(currentMonth),[visits,setVisits]=useState([]),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[progress,setProgress]=useState('');
  const element=useRef(null),map=useRef(null),layer=useRef(null);
  const byClient=useMemo(()=>new Map(clients.map(c=>[c.id,c])),[clients]);
  const planned=visits.filter(v=>v.scheduled_date&&v.status!=='cancelled');
  const dates=[...new Set(planned.map(v=>v.scheduled_date))].sort();
  const shown=planned.filter(v=>!selected||v.scheduled_date===selected);
  const located=shown.filter(v=>{const c=byClient.get(v.client_id);return c?.latitude!=null&&c?.longitude!=null});
  const missing=clients.filter(c=>(!c.country||c.country.toLocaleLowerCase('fr')==='france')&&(c.latitude==null||c.longitude==null));
  const pendingHome=Boolean(settings?.home_address&&settings?.home_city&&(settings?.home_latitude==null||settings?.home_longitude==null));
  useEffect(()=>{let alive=true;supabase.from('visits').select('id,client_id,scheduled_date,status,route_order').eq('due_month',`${month}-01`).then(({data,error})=>{if(!alive)return;if(error)setError(error.message);else setVisits(data??[])});return()=>{alive=false}},[month,user.id]);
  useEffect(()=>{
    if(!element.current)return;
    const instance=L.map(element.current,{scrollWheelZoom:false}).setView([46.65,2.55],6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(instance);
    const group=L.layerGroup().addTo(instance);map.current=instance;layer.current=group;
    return()=>{instance.remove();map.current=null;layer.current=null};
  },[]);
  useEffect(()=>{
    if(!map.current||!layer.current)return;
    const group=layer.current;group.clearLayers();const points=[];
    for(const visit of located){const client=byClient.get(visit.client_id);const point=[client.latitude,client.longitude];points.push(point);
      const marker=L.circleMarker(point,{radius:9,color:color(visit.scheduled_date),fillColor:color(visit.scheduled_date),fillOpacity:.85,weight:2}).addTo(group);
      marker.bindPopup(()=>{const box=document.createElement('div');const title=document.createElement('strong');title.textContent=client.name;box.append(title);for(const line of [`${client.street_address}, ${client.postal_code} ${client.city}`,label(visit.scheduled_date),client.geocode_status==='review'?'Position approximative à vérifier':'']){if(!line)continue;const p=document.createElement('p');p.textContent=line;box.append(p)}return box});
    }
    if(settings?.home_latitude!=null&&settings?.home_longitude!=null){const home=[settings.home_latitude,settings.home_longitude];points.push(home);L.circleMarker(home,{radius:11,color:'#163b52',fillColor:'#fff',fillOpacity:1,weight:4}).bindPopup('Domicile / départ').addTo(group)}
    if(points.length)map.current.fitBounds(L.latLngBounds(points).pad(.2),{maxZoom:13});
  },[clients,visits,selected,settings]);
  async function lookup(address){
    const url=new URL('https://data.geopf.fr/geocodage/search');url.searchParams.set('q',address);url.searchParams.set('limit','1');
    let response=await fetch(url);if(response.status===429){await wait(5500);response=await fetch(url)}
    if(!response.ok)throw new Error(`Géocodage indisponible (HTTP ${response.status}). Réessaie plus tard.`);
    const json=await response.json();return json.features?.[0];
  }
  async function geocodeOne(client){
    const feature=await lookup(`${client.street_address} ${client.postal_code} ${client.city}`);
    const coords=feature?.geometry?.coordinates,score=Number(feature?.properties?.score??0),postcode=String(feature?.properties?.postcode??'');
    const valid=coords?.length===2&&Number.isFinite(coords[0])&&Number.isFinite(coords[1]);
    const quality=valid&&score>=.7&&(!postcode||postcode===client.postal_code)?'verified':'review';
    const payload=valid?{longitude:coords[0],latitude:coords[1],geocode_status:quality}:{geocode_status:'review'};
    const {error}=await supabase.from('clients').update(payload).eq('id',client.id).eq('user_id',user.id);if(error)throw error;
    return quality;
  }
  async function locate(){setBusy(true);setError('');let done=0,review=0;try{
    for(const c of missing){setProgress(`${done+review+1} / ${missing.length} : ${c.name}`);const result=await geocodeOne(c);if(result==='verified')done++;else review++;await wait(220)}
    if(pendingHome){setProgress('Localisation du domicile…');const feature=await lookup(`${settings.home_address} ${settings.home_postal_code??''} ${settings.home_city}`);const coords=feature?.geometry?.coordinates,score=Number(feature?.properties?.score??0);if(coords?.length===2&&score>=.7){const {error}=await supabase.from('user_settings').update({home_longitude:coords[0],home_latitude:coords[1]}).eq('user_id',user.id);if(error)throw error}else review++}
    await onChanged();setNotice(`${done} adresses localisées ; ${review} adresse(s) à vérifier. Coordonnées conservées dans Supabase.`);
  }catch(err){await onChanged();setError(`${err.message} Les adresses déjà localisées sont conservées ; tu pourras reprendre plus tard.`)}finally{setBusy(false);setProgress('')}}
  return <><header className="page-head"><div><div className="eyebrow">VUE GÉOGRAPHIQUE</div><h1>Carte des visites</h1><p>Une couleur par date prévue, avec le domicile comme point de départ.</p></div><div className="planning-controls"><input type="month" value={month} onChange={e=>{setMonth(e.target.value);setSelected('')}}/><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Tout le mois</option>{dates.map(d=><option key={d} value={d}>{label(d)}</option>)}</select></div></header>
    <div className="map-toolbar"><span>{located.length} point{located.length>1?'s':''} affiché{located.length>1?'s':''} · {shown.length-located.length} visite{shown.length-located.length>1?'s':''} sans coordonnées</span>{(missing.length>0||pendingHome)&&<button disabled={busy} onClick={locate}>{busy?progress:`Localiser ${missing.length} adresse${missing.length>1?'s':''}${pendingHome?' et le domicile':''}`}</button>}</div>
    {(missing.length>0||pendingHome)&&<p className="map-note">En cliquant sur « Localiser », les adresses françaises sans coordonnées et le domicile sont envoyés une fois au service public de géocodage IGN. Les résultats sont enregistrés ; une position imprécise reste à vérifier.</p>}
    <div className="map-frame" ref={element} aria-label="Carte des visites planifiées"/>
    <div className="map-legend">{dates.map(d=><span key={d}><i style={{background:color(d)}}/>{label(d)}</span>)}</div>
    {!planned.length&&<p className="muted">Génère d’abord les journées dans Planning pour afficher les clients du mois.</p>}
  </>;
}
