import test from 'node:test';
import assert from 'node:assert/strict';
import {generateMonthlyPlan} from './planner.js';

const base={user_id:'user',street_address:'10 rue Test',postal_code:'25000',city:'Besançon',visit_minutes:90,visits_per_month:2,active_months:[10],excluded_days:[5]};
const settings={target_client_minutes:180,working_days:[1,2,3,4,5],day_start:'08:00',day_end:'17:00'};
const weekday=d=>new Date(`${d}T12:00:00Z`).getUTCDay()||7;

test('espace deux visites et exclut les vendredis',()=>{
  const result=generateMonthlyPlan([{...base,id:'A',name:'A'}],[],'2026-10',settings);
  assert.equal(result.total,2);
  assert.equal(result.unplanned,0);
  assert.ok(result.visits.every(v=>!Object.hasOwn(v,'id')));
  assert.ok(result.visits.every(v=>weekday(v.scheduled_date)!==5));
  assert.ok(Math.abs(Number(result.visits[1].scheduled_date.slice(-2))-Number(result.visits[0].scheduled_date.slice(-2)))>=7);
});

test('ne dépasse pas la cible et signale le surplus',()=>{
  const clients=Array.from({length:50},(_,i)=>({...base,id:String(i),name:String(i),visits_per_month:4,visit_minutes:180}));
  const result=generateMonthlyPlan(clients,[],'2026-10',settings);
  assert.ok(result.unplanned>0);
  assert.ok(result.days.every(d=>d.minutes<=180));
});

test('préserve les visites verrouillées et terminées',()=>{
  const client={...base,id:'A',name:'A'};
  const existing=[{id:'locked',client_id:'A',occurrence:1,scheduled_date:'2026-10-06',duration_minutes:90,status:'planned',is_locked:true}];
  const result=generateMonthlyPlan([client],existing,'2026-10',settings);
  assert.equal(result.preserved,1);
  assert.equal(result.visits.length,1);
  assert.equal(result.days.find(d=>d.date==='2026-10-06').minutes,90);
  assert.notEqual(result.visits[0].scheduled_date,'2026-10-06');
});

test('laisse à planifier un créneau trop court',()=>{
  const client={...base,id:'A',name:'A',visits_per_month:1,visit_minutes:120,window_start:'08:00',window_end:'09:00'};
  const result=generateMonthlyPlan([client],[],'2026-10',settings);
  assert.equal(result.unplanned,1);
  assert.equal(result.visits[0].scheduled_date,null);
});

test('conserve l’identifiant d’une visite déjà enregistrée',()=>{
  const client={...base,id:'A',name:'A',visits_per_month:1};
  const existing=[{id:'existing',client_id:'A',occurrence:1,status:'planned',scheduled_date:'2026-10-01',is_locked:false}];
  const result=generateMonthlyPlan([client],existing,'2026-10',settings);
  assert.equal(result.visits[0].id,'existing');
});
