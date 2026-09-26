import readXlsxFile from 'read-excel-file/browser';

const months=['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
const weekdays={lundi:1,mardi:2,mercredi:3,jeudi:4,vendredi:5,samedi:6,dimanche:7};
const value=(cell)=>String(cell??'').trim();
const days=(s,row,label)=>{
  if(!s)return null;
  const parts=s.toLowerCase().split(/[,;]+/).map(x=>x.trim()).filter(Boolean);
  const result=parts.map(x=>weekdays[x]);
  if(result.some(x=>!x))throw new Error(`Ligne ${row} : ${label} contient un jour inconnu.`);
  return [...new Set(result)];
};
const clock=(s,row,label)=>{
  if(!s)return null;
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw new Error(`Ligne ${row} : ${label} doit être au format HH:MM.`);
  return s;
};

export async function parseClients(file){
  let sheet;
  try {sheet=(await readXlsxFile(file)).find(s=>s.sheet==='Clients')?.data}
  catch {throw new Error('Impossible de lire l’onglet « Clients ». Utilise le modèle fourni au format .xlsx.')}
  if(!sheet)throw new Error('Onglet « Clients » introuvable. Utilise le modèle fourni.');
  const actual=Array.from({length:26},(_,i)=>value(sheet[0]?.[i]));
  if(actual[0]!=='Identifiant client'||actual[1]!=='Nom du client'||actual[8]!=='Jan'||actual[19]!=='Déc')throw new Error('En-têtes du modèle modifiés : utilise le fichier Excel prévu pour cette application.');
  const rows=[];const seen=new Set();
  for(let n=2;n<=sheet.length;n++){
    const r=sheet[n-1]??[];const get=i=>value(r[i-1]);
    if(!Array.from({length:26},(_,i)=>get(i+1)).some(Boolean))continue;
    const external_id=get(1);
    if(external_id.startsWith('EXEMPLE-'))continue;
    if(!external_id||!get(2)||!get(3)||!get(4)||!get(5))throw new Error(`Ligne ${n} : identifiant, nom et adresse complète obligatoires.`);
    if(seen.has(external_id))throw new Error(`Ligne ${n} : identifiant client en double (${external_id}).`);
    seen.add(external_id);
    const duration=Number(get(7)),frequency=Number(get(8));
    if(!Number.isInteger(duration)||duration<1||duration>1440)throw new Error(`Ligne ${n} : durée invalide (minutes entières).`);
    if(!Number.isInteger(frequency)||frequency<1||frequency>4)throw new Error(`Ligne ${n} : passages par mois : choisir 1 à 4.`);
    const active_months=[];
    for(let i=0;i<12;i++){
      const flag=get(i+9).toLowerCase();
      if(flag==='oui')active_months.push(i+1);
      else if(flag&&flag!=='non')throw new Error(`Ligne ${n} : ${months[i]} doit valoir Oui ou Non.`);
    }
    const allowed=days(get(21),n,'Jours autorisés');
    const excluded=days(get(22),n,'Jours exclus')??[];
    if(allowed?.every(x=>excluded.includes(x)))throw new Error(`Ligne ${n} : tous les jours autorisés sont exclus.`);
    const fixed=clock(get(23),n,'Heure fixe');
    const start=clock(get(24),n,'Début créneau');
    const end=clock(get(25),n,'Fin créneau');
    if(Boolean(start)!==Boolean(end)||start&&end<=start)throw new Error(`Ligne ${n} : renseigner un créneau de début et de fin cohérent.`);
    if(fixed&&start&&(fixed<start||fixed>=end))throw new Error(`Ligne ${n} : heure fixe hors créneau.`);
    rows.push({external_id,name:get(2),street_address:get(3),postal_code:get(4),city:get(5),country:get(6)||'France',visit_minutes:duration,visits_per_month:frequency,active_months,allowed_days:allowed,excluded_days:excluded,fixed_start_time:fixed,window_start:start,window_end:end,notes:get(26)||null});
  }
  if(!rows.length)throw new Error('Aucun client réel à importer. La ligne « EXEMPLE » est ignorée.');
  return rows;
}
