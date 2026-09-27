import readXlsxFile from 'read-excel-file/browser';

const months=['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
const weekdays={lundi:1,mardi:2,mercredi:3,jeudi:4,vendredi:5,samedi:6,dimanche:7};
const value=(cell)=>String(cell??'').trim();
const normalize=(s)=>String(s??'').normalize('NFKC').toLocaleLowerCase('fr').replace(/\s+/g,' ').trim();
export const clientKey=(name,postal)=>`${normalize(name)}|${normalize(postal)}`;
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
  const actual=Array.from({length:23},(_,i)=>value(sheet[0]?.[i]));
  if(actual[0]!=='Nom du client'||actual[1]!=='Adresse (numéro et voie)'||actual[7]!=='Jan'||actual[18]!=='Déc'||actual[19]!=='Jours exclus')throw new Error('En-têtes du modèle modifiés : utilise le nouveau fichier Excel de l’application.');
  const rows=[];const seen=new Set();
  for(let n=2;n<=sheet.length;n++){
    const r=sheet[n-1]??[];const get=i=>value(r[i-1]);
    if(!Array.from({length:23},(_,i)=>get(i+1)).some(Boolean))continue;
    if(get(23).startsWith('EXEMPLE FICTIF'))continue;
    if(!get(1)||!get(2)||!get(3)||!get(4))throw new Error(`Ligne ${n} : nom et adresse complète obligatoires.`);
    const key=clientKey(get(1),get(3));
    if(seen.has(key))throw new Error(`Ligne ${n} : le même nom et code postal figurent déjà dans le fichier (${get(1)}).`);
    seen.add(key);
    const duration=Number(get(6)),frequency=Number(get(7));
    if(!Number.isInteger(duration)||duration<1||duration>1440)throw new Error(`Ligne ${n} : durée invalide (minutes entières).`);
    if(!Number.isInteger(frequency)||frequency<1||frequency>4)throw new Error(`Ligne ${n} : passages par mois : choisir 1 à 4.`);
    const active_months=[];
    for(let i=0;i<12;i++){
      const flag=get(i+8).toLowerCase();
      if(flag==='oui')active_months.push(i+1);
      else if(flag)throw new Error(`Ligne ${n} : ${months[i]} doit valoir Oui ou rester vide.`);
    }
    const excluded=days(get(20),n,'Jours exclus')??[];
    const start=clock(get(21),n,'Début créneau');
    const end=clock(get(22),n,'Fin créneau');
    if(Boolean(start)!==Boolean(end)||start&&end<=start)throw new Error(`Ligne ${n} : renseigner un créneau de début et de fin cohérent.`);
    rows.push({name:get(1),street_address:get(2),postal_code:get(3),city:get(4),country:get(5)||'France',visit_minutes:duration,visits_per_month:frequency,active_months,allowed_days:null,excluded_days:excluded,fixed_start_time:null,window_start:start,window_end:end,notes:get(23)||null});
  }
  if(!rows.length)throw new Error('Aucun client réel à importer. La ligne « EXEMPLE » est ignorée.');
  return rows;
}
