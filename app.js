(function(){
'use strict';

/* ---------- constants ---------- */
const BASE_EXP=[['food','Groceries'],['dining','Dining out'],['transport','Transport'],['housing','Housing & utilities'],['health','Health'],['shopping','Shopping'],['fun','Entertainment'],['bills','Bills & subscriptions'],['edu','Education'],['other','Other']];
const BASE_INC=[['salary','Salary'],['freelance','Freelance'],['invest','Investments'],['gift','Gifts'],['otherinc','Other income']];
const CURRENCIES=['PHP','USD','EUR','GBP','JPY','AUD','CAD','SGD','INR'];
const SKINS=[
  {id:'auto',label:'Match device',bg:'linear-gradient(105deg,#EEF1F0 50%,#0F171C 50%)',surface:'#8A9AA3',accent:'#5C6BD0'},
  {id:'mist',label:'Mist',bg:'#EEF1F0',surface:'#FFFFFF',accent:'#2B45D8'},
  {id:'sage',label:'Sage',bg:'#E8EFE7',surface:'#FFFFFF',accent:'#2E6B4D'},
  {id:'ocean',label:'Ocean',bg:'#E5EEF4',surface:'#FFFFFF',accent:'#0A62A8'},
  {id:'blush',label:'Blush',bg:'#F5EBEE',surface:'#FFFFFF',accent:'#B3315A'},
  {id:'night',label:'Night',bg:'#0F171C',surface:'#1D2B33',accent:'#8FA2FF'},
  {id:'dusk',label:'Dusk',bg:'#16131F',surface:'#271F36',accent:'#B79CFF'}
];
const SKIN_IDS=SKINS.map(s=>s.id);
const SKIN_KEY='where-it-went:skin';

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const pad=n=>String(n).padStart(2,'0');
const todayStr=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const addM=(ym,k)=>{const [y,m]=ym.split('-').map(Number);const d=new Date(y,m-1+k,1);return d.getFullYear()+'-'+pad(d.getMonth()+1);};
const monthName=(ym,o)=>{const [y,m]=ym.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString(undefined,o||{month:'long',year:'numeric'});};
const r2=n=>Math.round(n*100)/100;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>(window.crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,10);
const reduceMotion=()=>window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

function detectCurrency(){
  const region=((navigator.language||'en-US').split('-')[1]||'').toUpperCase();
  const map={PH:'PHP',US:'USD',GB:'GBP',JP:'JPY',AU:'AUD',CA:'CAD',SG:'SGD',IN:'INR',DE:'EUR',FR:'EUR',ES:'EUR',IT:'EUR',NL:'EUR',IE:'EUR'};
  return map[region]||'USD';
}
const fmts={};
const fmt=c=>fmts[c]||(fmts[c]=new Intl.NumberFormat(undefined,{style:'currency',currency:c,currencyDisplay:'narrowSymbol'}));
const state={tx:[],currency:detectCurrency(),
  prefs:{name:'',skin:'auto',opening:null,openOn:'dashboard',onboarded:false,customCats:[]},
  view:'dashboard',month:todayStr().slice(0,7),trend:'days',
  filters:{q:'',type:'all',cat:'all',period:'month'},editingId:null};
const account={signedIn:false,email:''};
const money=n=>fmt(state.currency).format(n);
const signed=n=>(n<0?'\u2212':n>0?'+':'')+money(Math.abs(n));
const compact=new Intl.NumberFormat(undefined,{notation:'compact',maximumFractionDigits:1});
const symbolOf=c=>{const p=fmt(c).formatToParts(0).find(x=>x.type==='currency');return p?p.value:c;};
const dayLabel=ds=>{
  const [y,m,d]=ds.split('-').map(Number);
  const o={weekday:'short',day:'numeric',month:'short'};
  if(y!==new Date().getFullYear())o.year='numeric';
  const s=new Date(y,m-1,d).toLocaleDateString(undefined,o);
  const t=new Date();const yest=new Date(t.getFullYear(),t.getMonth(),t.getDate()-1);
  if(ds===todayStr())return 'Today, '+s;
  if(ds===yest.getFullYear()+'-'+pad(yest.getMonth()+1)+'-'+pad(yest.getDate()))return 'Yesterday, '+s;
  return s;
};
function parseSigned(raw){          // '' -> null, invalid -> undefined
  const s=String(raw).trim().replace(/,/g,'');
  if(s==='')return null;
  if(/^-?(\d+\.?\d*|\.\d+)$/.test(s)){const n=parseFloat(s);return Math.abs(n)>1e12?undefined:r2(n);}
  return undefined;
}

/* ---------- categories (built-in + custom) ---------- */
let CAT={};
function rebuildCats(){
  CAT={};
  BASE_EXP.forEach(([id,label])=>CAT[id]={id,label,type:'expense',color:'var(--c-'+id+')'});
  BASE_INC.forEach(([id,label])=>CAT[id]={id,label,type:'income',color:'var(--inc)'});
  state.prefs.customCats.forEach(c=>CAT[c.id]={id:c.id,label:c.label,type:c.type,color:'var(--u'+c.ci+')',custom:true});
}
function catList(type){
  const base=type==='income'?BASE_INC:BASE_EXP, fb=type==='income'?'otherinc':'other';
  const cust=state.prefs.customCats.filter(c=>c.type===type).map(c=>[c.id,c.label]);
  return [...base.filter(([id])=>id!==fb),...cust,...base.filter(([id])=>id===fb)];
}
function cleanCat(c){
  if(!c||typeof c!=='object')return null;
  const label=String(c.label||'').trim().slice(0,30), ci=Math.round(Number(c.ci));
  if(!/^u-[a-z0-9]{3,12}$/.test(String(c.id))||!label||!(ci>=1&&ci<=8))return null;
  return {id:String(c.id),label,type:c.type==='income'?'income':'expense',ci};
}

/* ---------- settings ---------- */
function applySettings(o){
  if(!o||typeof o!=='object')return;
  const p=state.prefs;
  if(CURRENCIES.includes(o.currency))state.currency=o.currency;
  if(typeof o.name==='string')p.name=o.name.trim().slice(0,40);
  if(SKIN_IDS.includes(o.skin))p.skin=o.skin;
  if('opening' in o){const n=(o.opening===null||o.opening==='')?null:Number(o.opening);p.opening=(n===null||!isFinite(n))?null:r2(n);}
  if(o.openOn==='dashboard'||o.openOn==='records')p.openOn=o.openOn;
  if(typeof o.onboarded==='boolean')p.onboarded=o.onboarded;
  if(Array.isArray(o.customCats))p.customCats=o.customCats.map(cleanCat).filter(Boolean).slice(0,30);
  rebuildCats(); applySkin();
}
function applySkin(){
  const root=document.documentElement;
  if(state.prefs.skin==='auto')root.removeAttribute('data-skin'); else root.setAttribute('data-skin',state.prefs.skin);
  try{localStorage.setItem(SKIN_KEY,state.prefs.skin);}catch(e){}
}

/* ---------- data + Supabase ---------- */
const cfg=window.APP_CONFIG||{};
const configured=!!(cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY)&&!/YOUR[-_]/i.test(String(cfg.SUPABASE_URL)+String(cfg.SUPABASE_ANON_KEY));
let sb=null, userId=null, channel=null, loaded=false, trendTouched=false;
let settingsTimer=null, renderTimer=null;

function cleanTx(t){
  if(!t||typeof t!=='object')return null;
  const amount=Number(t.amount);
  if(!isFinite(amount)||amount<=0)return null;
  if(typeof t.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(t.date))return null;
  const type=t.type==='income'?'income':'expense';
  const category=(CAT[t.category]&&CAT[t.category].type===type)?t.category:(type==='income'?'otherinc':'other');
  return {id:String(t.id||uid()),type,category,amount:r2(amount),date:t.date,note:String(t.note||'').slice(0,80),createdAt:Number(t.createdAt)||0};
}
const sortTx=()=>state.tx.sort((a,b)=>a.date===b.date?b.createdAt-a.createdAt:(a.date<b.date?1:-1));
const mapTx=r=>({id:r.id,type:r.type,category:r.category,amount:Number(r.amount),date:r.date,note:r.note||'',createdAt:Date.parse(r.created_at)||0});
const txRow=t=>{
  const row={id:t.id,type:t.type,category:t.category,amount:t.amount,date:t.date,note:t.note};
  if(t.createdAt>0)row.created_at=new Date(t.createdAt).toISOString();
  return row;
};
const catToPref=r=>({id:r.id,label:r.label,type:r.type,ci:r.color_index});

function loadSkinCache(){          // so the chosen theme shows before sign-in
  try{const s=localStorage.getItem(SKIN_KEY);if(SKIN_IDS.includes(s))state.prefs.skin=s;}catch(e){}
}
function setStatus(s){
  const map={loading:'Loading\u2026',saving:'Saving\u2026',synced:'All changes saved',error:'Could not save. Check your connection.'};
  const el=$('#status'); el.dataset.s=s==='synced'?'synced':s==='error'?'error':'device';
  $('#statusText').textContent=map[s]||'';
}
async function dbRun(promise){
  setStatus('saving');
  try{
    const {error}=await promise;
    if(error)throw error;
    setStatus('synced'); return true;
  }catch(e){console.error(e);setStatus('error');return false;}
}
function autoTrend(){
  const months=new Set(state.tx.map(t=>t.date.slice(0,7)));
  state.trend=months.size>1?'months':'days';
}
function scheduleRender(){
  clearTimeout(renderTimer);
  renderTimer=setTimeout(()=>{renderAll();},120);
}

async function fetchAllTx(){
  const out=[], size=1000;
  for(let from=0;;from+=size){
    const {data,error}=await sb.from('transactions')
      .select('id,type,category,amount,date,note,created_at')
      .order('date',{ascending:false}).order('created_at',{ascending:false}).order('id')
      .range(from,from+size-1);
    if(error)throw error;
    out.push(...data);
    if(data.length<size)break;
  }
  return out;
}
async function loadAll(){
  setStatus('loading');
  const [s,c]=await Promise.all([
    sb.from('settings').select('currency,name,skin,opening,open_on,onboarded').maybeSingle(),
    sb.from('categories').select('id,label,type,color_index').order('created_at')
  ]);
  if(s.error)throw s.error;
  if(c.error)throw c.error;
  let row=s.data;
  if(!row){                       // the signup trigger normally creates this row
    const ins=await sb.from('settings').upsert({user_id:userId}).select('currency,name,skin,opening,open_on,onboarded').single();
    if(ins.error)throw ins.error;
    row=ins.data;
  }
  applySettings({currency:row.currency,name:row.name,skin:row.skin,opening:row.opening,openOn:row.open_on,onboarded:row.onboarded,customCats:c.data.map(catToPref)});
  const rows=await fetchAllTx();
  state.tx=rows.map(mapTx).map(cleanTx).filter(Boolean);
  sortTx();
}
async function reloadTx(){
  try{
    const rows=await fetchAllTx();
    state.tx=rows.map(mapTx).map(cleanTx).filter(Boolean);
    sortTx(); renderAll();
  }catch(e){console.error(e);}
}

/* realtime: keeps a second open device or tab in step */
let catBusy=false;
function onTxEvent(p){
  if(p.eventType==='DELETE'){
    const id=p.old&&p.old.id, i=state.tx.findIndex(x=>x.id===id);
    if(i>=0){state.tx.splice(i,1);scheduleRender();}
    return;
  }
  const t=cleanTx(mapTx(p.new)); if(!t)return;
  const i=state.tx.findIndex(x=>x.id===t.id);
  if(i>=0)state.tx[i]=t; else state.tx.push(t);
  sortTx(); scheduleRender();
}
async function reloadCats(){
  if(catBusy||!sb)return;
  const {data,error}=await sb.from('categories').select('id,label,type,color_index').order('created_at');
  if(error)return;
  applySettings({customCats:data.map(catToPref)});
  refreshCatUIs(); scheduleRender();
}
function subscribe(){
  if(channel){sb.removeChannel(channel);channel=null;}
  const mine='user_id=eq.'+userId;
  channel=sb.channel('where-it-went-'+userId)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'transactions',filter:mine},onTxEvent)
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'transactions',filter:mine},onTxEvent)
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'transactions'},onTxEvent)
    .on('postgres_changes',{event:'*',schema:'public',table:'categories'},()=>{setTimeout(reloadCats,250);})
    .subscribe();
}

/* settings are saved a moment after the last change */
function saveSettings(){
  renderAll();
  clearTimeout(settingsTimer); settingsTimer=setTimeout(flushSettings,500);
}
async function flushSettings(){
  if(!sb||!userId)return;
  const p=state.prefs;
  const ok=await dbRun(sb.from('settings').upsert({
    user_id:userId,currency:state.currency,name:p.name,skin:p.skin,
    opening:p.opening,open_on:p.openOn,onboarded:p.onboarded,updated_at:new Date().toISOString()
  }));
  if(!ok)toast("Couldn't save your settings. Check your connection.");
}

/* ---------- mutations ---------- */
async function upsert(t){
  const i=state.tx.findIndex(x=>x.id===t.id);
  const prev=i>=0?state.tx[i]:null;
  if(i>=0)state.tx[i]=t; else state.tx.push(t);
  sortTx(); renderAll();
  const ok=await dbRun(sb.from('transactions').upsert(txRow(t)));
  if(!ok){
    const j=state.tx.findIndex(x=>x.id===t.id);
    if(prev){if(j>=0)state.tx[j]=prev;}else if(j>=0)state.tx.splice(j,1);
    sortTx(); renderAll();
    toast("Couldn't save that. Check your connection and try again.");
  }
  return ok;
}
async function removeTx(id){
  const i=state.tx.findIndex(x=>x.id===id); if(i<0)return null;
  const [t]=state.tx.splice(i,1); renderAll();
  const ok=await dbRun(sb.from('transactions').delete().eq('id',id));
  if(!ok){
    state.tx.push(t); sortTx(); renderAll();
    toast("Couldn't delete that. Check your connection and try again.");
    return null;
  }
  return t;
}
async function addMany(list){
  state.tx.push(...list); sortTx(); renderAll();
  setStatus('saving');
  try{
    for(let i=0;i<list.length;i+=400){
      const {error}=await sb.from('transactions').insert(list.slice(i,i+400).map(txRow));
      if(error)throw error;
    }
    setStatus('synced'); return true;
  }catch(e){
    console.error(e); setStatus('error');
    await reloadTx();
    toast("Couldn't save everything. Your list was refreshed from the server.");
    return false;
  }
}
function loadSample(){
  const scale={PHP:50,JPY:140,INR:80}[state.currency]||1;
  const r=(a,b)=>r2((a+Math.random()*(b-a))*scale);
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  const now=new Date(), out=[];
  for(let k=2;k>=0;k--){
    const base=new Date(now.getFullYear(),now.getMonth()-k,1);
    const dim=new Date(base.getFullYear(),base.getMonth()+1,0).getDate();
    const last=k===0?now.getDate():dim;
    const ym=base.getFullYear()+'-'+pad(base.getMonth()+1);
    const add=(d,type,cat,amt,note)=>{
      if(d>last)return;
      out.push({id:uid(),type,category:cat,amount:r2(amt),date:ym+'-'+pad(d),note,createdAt:Date.now()+out.length});
    };
    add(1,'income','salary',3200*scale,'Monthly pay');
    add(2,'expense','housing',850*scale,'Rent');
    add(5,'expense','bills',15*scale,'Streaming');
    add(9,'expense','housing',r(60,110),'Electricity and water');
    if(Math.random()<.7)add(10+Math.floor(Math.random()*15),'income','freelance',r(150,500),'Side project');
    for(let d=1;d<=last;d++){
      if(Math.random()<.35)add(d,'expense','food',r(18,80),pick(['Market','Supermarket','Corner store']));
      if(Math.random()<.2)add(d,'expense','dining',r(8,35),pick(['Lunch','Coffee and pastry','Dinner out']));
      if(Math.random()<.4)add(d,'expense','transport',r(2,14),pick(['Commute','Ride','Fuel']));
      if(Math.random()<.06)add(d,'expense','shopping',r(20,120),pick(['Clothes','Household','Accessories']));
      if(Math.random()<.05)add(d,'expense','fun',r(10,40),pick(['Movie','Game','Concert ticket']));
      if(Math.random()<.02)add(d,'expense','health',r(15,60),'Pharmacy');
    }
  }
  if(!trendTouched)state.trend='months';
  addMany(out).then(ok=>{if(ok)toast('Sample data added. Use Erase all transactions in Settings when you are done.');});
}
async function eraseAll(){
  const snap=state.tx; state.tx=[]; if(state.editingId)exitEdit(); renderAll();
  const ok=await dbRun(sb.from('transactions').delete().not('id','is',null));
  if(!ok){state.tx=snap;renderAll();toast("Couldn't erase. Check your connection and try again.");return;}
  toast('All transactions erased.');
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg,label,fn){
  const t=$('#toast'); t.innerHTML='';
  const s=document.createElement('span'); s.textContent=msg; t.appendChild(s);
  if(label){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{hideToast();fn&&fn();};t.appendChild(b);}
  clearTimeout(toastTimer); toastTimer=setTimeout(hideToast,6500);
}
function hideToast(){$('#toast').innerHTML='';}
function confirmTap(btn,confirmText,fn){
  if(btn.dataset.armed){clearTimeout(+btn.dataset.armed);delete btn.dataset.armed;btn.textContent=btn.dataset.label;fn();return;}
  btn.dataset.label=btn.textContent; btn.textContent=confirmText;
  btn.dataset.armed=String(setTimeout(()=>{delete btn.dataset.armed;btn.textContent=btn.dataset.label;},3500));
}

/* ---------- entry form ---------- */
const lastCat={expense:'food',income:'salary'};
const getType=()=>document.querySelector('input[name="type"]:checked').value;
function fillCategories(type,sel){
  const c=$('#category');
  c.innerHTML=catList(type).map(([id,l])=>'<option value="'+esc(id)+'">'+esc(l)+'</option>').join('');
  c.value=sel||lastCat[type];
  if(c.selectedIndex<0)c.selectedIndex=0;
}
function setType(type){
  document.getElementById(type==='income'?'tInc':'tExp').checked=true;
  $('#entry').dataset.type=type;
}
function showErr(msg,focusEl){$('#formErr').textContent=msg;if(focusEl)focusEl.focus();}
function resetForm(){$('#amount').value='';$('#note').value='';$('#formErr').textContent='';}
function enterEdit(id){
  const t=state.tx.find(x=>x.id===id); if(!t)return;
  state.editingId=id;
  setType(t.type); fillCategories(t.type,t.category);
  $('#amount').value=String(t.amount); $('#date').value=t.date; $('#note').value=t.note;
  $('#entry').classList.add('editing');
  $('#entryTitle').textContent='Edit transaction';
  $('#saveBtn').textContent='Save changes';
  $('#cancelEdit').hidden=false; $('#formErr').textContent='';
  $('#entry').scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'center'});
  $('#amount').focus({preventScroll:true});
}
function exitEdit(){
  state.editingId=null;
  $('#entry').classList.remove('editing');
  $('#entryTitle').textContent='Log a transaction';
  $('#saveBtn').textContent='Save';
  $('#cancelEdit').hidden=true;
  resetForm(); $('#date').value=todayStr();
}
function onSubmit(e){
  e.preventDefault();
  const type=getType();
  const raw=$('#amount').value.trim().replace(/,/g,'');
  if(!raw||!/^(\d+\.?\d*|\.\d+)$/.test(raw)||parseFloat(raw)<=0){showErr('Enter an amount greater than zero, using numbers only.',$('#amount'));return;}
  const amount=r2(parseFloat(raw));
  if(amount>1e9){showErr('That amount is too large to log.',$('#amount'));return;}
  const date=$('#date').value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){showErr('Pick a date for this transaction.',$('#date'));return;}
  const category=$('#category').value;
  lastCat[type]=category;
  const note=$('#note').value.trim().slice(0,80);
  const editing=state.editingId&&state.tx.find(x=>x.id===state.editingId);
  const t={id:editing?editing.id:uid(),type,category,amount,date,note,createdAt:editing?editing.createdAt:Date.now()};
  upsert(t);
  const label=(type==='income'?'Income ':'Expense ')+money(amount);
  const m=date.slice(0,7);
  if(editing){
    exitEdit(); toast('Changes saved');
  }else{
    resetForm(); $('#amount').focus();
    if(m!==state.month)toast(label+' saved to '+monthName(m)+'.','View',()=>{state.month=m;setView('dashboard');renderAll();});
    else toast(label+' saved.');
  }
}
function refreshCatUIs(){
  const t=getType(), cur=$('#category').value;
  fillCategories(t);
  if([...$('#category').options].some(o=>o.value===cur))$('#category').value=cur;
  const fc=$('#fCat').value;
  fillFilterCats();
  $('#fCat').value=[...$('#fCat').options].some(o=>o.value===fc)?fc:'all';
  state.filters.cat=$('#fCat').value;
}

/* ---------- views ---------- */
function setView(v){
  state.view=v;
  $('#viewDash').hidden=v!=='dashboard'; $('#viewRecords').hidden=v!=='records'; $('#viewSettings').hidden=v!=='settings';
  $('#entry').hidden=v==='settings';
  document.querySelectorAll('.tabs button').forEach(b=>{if(b.dataset.view===v)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  if(v==='dashboard')drawTrend(); else if(v==='records')renderRecords(); else syncSettingsUI();
}
const monthTx=m=>state.tx.filter(t=>t.date.startsWith(m));
function totals(list){let e=0,i=0;list.forEach(t=>{if(t.type==='expense')e+=t.amount;else i+=t.amount;});return {exp:r2(e),inc:r2(i)};}
const curYM=()=>todayStr().slice(0,7);
function greeting(){
  const h=new Date().getHours();
  const g=h<5?'Up late':h<12?'Good morning':h<18?'Good afternoon':'Good evening';
  return g+(state.prefs.name?', '+state.prefs.name:'')+'.';
}

function renderHero(){
  const m=state.month, list=monthTx(m), tt=totals(list);
  $('#greet').textContent=greeting();
  $('#monthLabel').textContent=monthName(m);
  const maxM=[curYM(),...state.tx.map(t=>t.date.slice(0,7))].sort().pop();
  $('#nextM').disabled=m>=maxM;
  $('#thisM').hidden=m===curYM();
  $('#heroNum').textContent=money(tt.exp);
  $('#incNum').textContent=money(tt.inc);
  const net=r2(tt.inc-tt.exp), nn=$('#netNum');
  nn.textContent=signed(net); nn.className=net>0?'pos':net<0?'neg':'';
  const hasOpen=state.prefs.opening!==null;
  $('#balBox').hidden=!hasOpen;
  if(hasOpen){const all=totals(state.tx);const bal=r2(state.prefs.opening+all.inc-all.exp);$('#balNum').textContent=money(bal);$('#balNum').className=bal<0?'neg':'';}
  const prevM=addM(m,-1), isCur=m===curYM();
  const cutoff=isCur?new Date().getDate():99;
  const prev=r2(monthTx(prevM).filter(t=>t.type==='expense'&&+t.date.slice(8,10)<=cutoff).reduce((s,t)=>s+t.amount,0));
  let txt='';
  if(!list.length)txt='Nothing logged in '+monthName(m,{month:'long'})+' yet.';
  else if(prev>0){
    const pct=Math.round(Math.abs(tt.exp-prev)/prev*100);
    const pn=monthName(prevM,{month:'long'});
    const ref=isCur?'by this day in '+pn:'in '+pn;
    txt=pct===0?'About the same as '+ref+'.':pct+'% '+(tt.exp>prev?'more':'less')+' than '+ref+'.';
  }
  $('#heroDelta').textContent=txt;
}
function renderCats(){
  const list=monthTx(state.month).filter(t=>t.type==='expense');
  const by={}; list.forEach(t=>by[t.category]=(by[t.category]||0)+t.amount);
  const rows=Object.entries(by).map(([id,v])=>({id,v:r2(v)})).sort((a,b)=>b.v-a.v);
  const box=$('#cats');
  if(!rows.length){
    box.innerHTML='<div class="empty"><p>No expenses in '+esc(monthName(state.month))+'.</p>'+
      (state.tx.length?'<p>Log one above to see the breakdown.</p>':'<p>Log your first expense above, or <button type="button" class="linkbtn" data-act="sample">try it with sample data</button>.</p>')+'</div>';
    return;
  }
  const total=rows.reduce((s,r)=>s+r.v,0), max=rows[0].v;
  box.innerHTML=rows.map(r=>{
    const c=CAT[r.id]||CAT.other;
    return '<button type="button" class="catrow" data-cat="'+esc(r.id)+'" aria-label="'+esc(c.label)+', '+esc(money(r.v))+', '+Math.round(r.v/total*100)+' percent. Show transactions">'+
      '<span class="cat-top"><span class="dot" style="background:'+c.color+'"></span><span class="cat-name">'+esc(c.label)+'</span><span class="cat-amt">'+esc(money(r.v))+'</span><span class="cat-pct">'+Math.round(r.v/total*100)+'%</span></span>'+
      '<span class="bar"><span style="width:'+Math.max(2,r.v/max*100).toFixed(1)+'%;background:'+c.color+'"></span></span></button>';
  }).join('');
}

/* ---------- trend chart ---------- */
function trendData(){
  const m=state.month;
  if(state.trend==='days'){
    const [y,mo]=m.split('-').map(Number), n=new Date(y,mo,0).getDate();
    const last=m===curYM()?new Date().getDate():n;
    const e=new Array(n).fill(0), i=new Array(n).fill(0);
    monthTx(m).forEach(t=>{(t.type==='expense'?e:i)[+t.date.slice(8,10)-1]+=t.amount;});
    for(let k=1;k<n;k++){e[k]+=e[k-1];i[k]+=i[k-1];}
    const exp=e.slice(0,last).map(r2), inc=i.slice(0,last).map(r2);
    return {kind:'days',n,last,exp,inc,totExp:exp[exp.length-1]||0,totInc:inc[inc.length-1]||0,
      caption:'Running totals for '+monthName(m)+'.'};
  }
  const ms=[]; for(let k=5;k>=0;k--)ms.push(addM(m,-k));
  const exp=[],inc=[];
  ms.forEach(x=>{const t=totals(monthTx(x));exp.push(t.exp);inc.push(t.inc);});
  return {kind:'months',n:6,last:6,ms,exp,inc,totExp:r2(exp.reduce((a,b)=>a+b,0)),totInc:r2(inc.reduce((a,b)=>a+b,0)),
    caption:'Monthly totals, '+monthName(ms[0],{month:'short',year:'numeric'})+' to '+monthName(ms[5],{month:'short',year:'numeric'})+'.'};
}
function yScale(v){
  if(v<=0)return {max:4,step:1};
  const raw=v/4, p=Math.pow(10,Math.floor(Math.log10(raw))), f=raw/p;
  const step=(f<=1?1:f<=2?2:f<=5?5:10)*p;
  return {step,max:step*Math.ceil(v/step)};
}
function drawTrend(){
  const wrap=$('#chartWrap'); if(!wrap)return;
  document.querySelectorAll('[data-trend]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.trend===state.trend)));
  const d=trendData();
  $('#caption').textContent=d.caption;
  $('#legend').innerHTML=
    '<span><svg viewBox="0 0 26 6" aria-hidden="true"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--inc)" stroke-width="3" stroke-dasharray="6 4" stroke-linecap="round"/></svg>Income <b>'+esc(money(d.totInc))+'</b></span>'+
    '<span><svg viewBox="0 0 26 6" aria-hidden="true"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--exp)" stroke-width="3" stroke-linecap="round"/></svg>Expenses <b>'+esc(money(d.totExp))+'</b></span>';
  const any=d.exp.some(v=>v>0)||d.inc.some(v=>v>0);
  if(!any){wrap.innerHTML='<div class="empty"><p>No income or expenses to chart for this range yet.</p></div>';return;}

  const W=Math.max(wrap.clientWidth,260), H=250, L=46, R=14, T=10, B=26;
  const iw=W-L-R, ih=H-T-B;
  const peak=Math.max(...d.exp,...d.inc,0), sc=yScale(peak*1.04);
  const yAt=v=>T+ih-(v/sc.max)*ih;
  const xAt=i=>d.kind==='days'?L+(d.n>1?i/(d.n-1):.5)*iw:L+(i+.5)/6*iw;
  const path=a=>a.map((v,i)=>(i?'L':'M')+xAt(i).toFixed(1)+' '+yAt(v).toFixed(1)).join(' ');

  let grid='';
  for(let v=0;v<=sc.max+1e-9;v+=sc.step){
    const y=yAt(v).toFixed(1);
    grid+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'" stroke="var(--line)" stroke-width="1"/>'+
      '<text x="'+(L-8)+'" y="'+(+y+4)+'" text-anchor="end">'+esc(compact.format(v))+'</text>';
  }
  let xl='';
  if(d.kind==='days'){
    const ticks=[1]; for(let k=5;k<=d.n;k+=5)ticks.push(k);
    if(d.n-ticks[ticks.length-1]>=3)ticks.push(d.n);
    ticks.forEach(k=>{xl+='<text x="'+xAt(k-1).toFixed(1)+'" y="'+(H-7)+'" text-anchor="middle">'+k+'</text>';});
  }else{
    d.ms.forEach((x,i)=>{
      const lab=monthName(x,{month:'short'})+(x.endsWith('-01')?' '+x.slice(2,4):'');
      xl+='<text x="'+xAt(i).toFixed(1)+'" y="'+(H-7)+'" text-anchor="middle">'+esc(lab)+'</text>';
    });
  }
  let marks='';
  const lastI=d.exp.length-1;
  const dotIdx=d.kind==='months'?d.exp.map((_,i)=>i):[lastI];
  dotIdx.forEach(i=>{
    marks+='<circle cx="'+xAt(i).toFixed(1)+'" cy="'+yAt(d.inc[i]).toFixed(1)+'" r="4" fill="var(--surface)" stroke="var(--inc)" stroke-width="2.2"/>'+
           '<circle cx="'+xAt(i).toFixed(1)+'" cy="'+yAt(d.exp[i]).toFixed(1)+'" r="4" fill="var(--exp)" stroke="var(--surface)" stroke-width="1.5"/>';
  });
  const label='Line chart of income and expenses. '+d.caption+' Income '+money(d.totInc)+', expenses '+money(d.totExp)+'.';
  wrap.innerHTML='<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(label)+'">'+grid+xl+
    '<path d="'+path(d.inc)+'" fill="none" stroke="var(--inc)" stroke-width="2.6" stroke-dasharray="7 5" stroke-linecap="round" stroke-linejoin="round"/>'+
    '<path d="'+path(d.exp)+'" fill="none" stroke="var(--exp)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'+
    marks+
    '<g id="hov" visibility="hidden"><line id="hovLine" y1="'+T+'" y2="'+(T+ih)+'" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3"/>'+
    '<circle id="hovI" r="5" fill="var(--surface)" stroke="var(--inc)" stroke-width="2.4"/><circle id="hovE" r="5" fill="var(--exp)" stroke="var(--surface)" stroke-width="1.5"/></g>'+
    '<rect id="hit" x="'+L+'" y="'+T+'" width="'+iw+'" height="'+ih+'" fill="transparent"/></svg><div class="tip" id="tip" hidden></div>';

  const svg=wrap.querySelector('svg'), hit=$('#hit'), tip=$('#tip'), hov=$('#hov');
  function show(ev){
    const rect=svg.getBoundingClientRect();
    const x=(ev.clientX-rect.left)*(W/rect.width);
    let idx=d.kind==='days'?Math.round((x-L)/iw*(d.n-1)):Math.floor((x-L)/iw*6);
    idx=Math.max(0,Math.min(d.exp.length-1,idx));
    const cx=xAt(idx);
    hov.setAttribute('visibility','visible');
    $('#hovLine').setAttribute('x1',cx);$('#hovLine').setAttribute('x2',cx);
    $('#hovI').setAttribute('cx',cx);$('#hovI').setAttribute('cy',yAt(d.inc[idx]));
    $('#hovE').setAttribute('cx',cx);$('#hovE').setAttribute('cy',yAt(d.exp[idx]));
    const title=d.kind==='days'?'Through '+dayLabel(state.month+'-'+pad(idx+1)).replace(/^(Today|Yesterday), /,''):monthName(d.ms[idx]);
    tip.innerHTML='<b>'+esc(title)+'</b>Income '+esc(money(d.inc[idx]))+'<br>Expenses '+esc(money(d.exp[idx]));
    tip.hidden=false;
    const tw=tip.offsetWidth;
    tip.style.left=Math.max(0,Math.min(W-tw,cx-tw/2))+'px';
  }
  function hide(){hov.setAttribute('visibility','hidden');tip.hidden=true;}
  hit.addEventListener('pointermove',show);
  hit.addEventListener('pointerdown',show);
  hit.addEventListener('pointerleave',hide);
  hit.addEventListener('pointercancel',hide);
}

/* ---------- records ---------- */
const ICON_EDIT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
const ICON_DEL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
function filtered(){
  const f=state.filters, q=f.q.trim().toLowerCase();
  return state.tx.filter(t=>
    (f.period==='all'||t.date.startsWith(state.month))&&
    (f.type==='all'||t.type===f.type)&&
    (f.cat==='all'||t.category===f.cat)&&
    (!q||(t.note+' '+(CAT[t.category]||CAT.other).label).toLowerCase().includes(q)));
}
function renderRecords(){
  $('#fPeriod').options[0].textContent=monthName(state.month);
  const list=$('#recList'), sum=$('#recSum');
  if(!state.tx.length){
    sum.textContent='';
    list.innerHTML='<div class="empty"><p>No transactions yet. Use the form above to log your first one.</p><p><button type="button" class="linkbtn" data-act="sample">Add sample data</button> to see how the charts look.</p></div>';
    return;
  }
  const rows=filtered();
  if(!rows.length){
    sum.textContent='';
    list.innerHTML='<div class="empty"><p>No transactions match these filters.</p><p><button type="button" class="linkbtn" data-act="clear-filters">Clear filters</button></p></div>';
    return;
  }
  const tt=totals(rows);
  sum.textContent=rows.length+' transaction'+(rows.length===1?'':'s')+'. Spent '+money(tt.exp)+', earned '+money(tt.inc)+'.';
  const groups=[]; rows.forEach(t=>{const g=groups[groups.length-1];if(g&&g.date===t.date)g.items.push(t);else groups.push({date:t.date,items:[t]});});
  list.innerHTML=groups.map(g=>{
    const ge=r2(g.items.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0));
    return '<h3 class="day"><span>'+esc(dayLabel(g.date))+'</span><span>'+(ge?'Spent '+esc(money(ge)):'')+'</span></h3><ul class="rows">'+
      g.items.map(t=>{
        const c=CAT[t.category]||CAT.other, amt=(t.type==='income'?'+':'\u2212')+money(t.amount), nm=c.label+', '+money(t.amount);
        return '<li class="row" data-id="'+esc(t.id)+'"><span class="dot" style="background:'+c.color+'"></span>'+
          '<div class="row-main"><span class="row-cat">'+esc(c.label)+'</span>'+(t.note?'<span class="row-note">'+esc(t.note)+'</span>':'')+'</div>'+
          '<span class="row-amt '+(t.type==='income'?'inc':'')+'">'+esc(amt)+'</span>'+
          '<div class="acts"><button type="button" class="icon" data-act="edit" aria-label="Edit '+esc(nm)+'" title="Edit">'+ICON_EDIT+'</button>'+
          '<button type="button" class="icon del" data-act="delete" aria-label="Delete '+esc(nm)+'" title="Delete">'+ICON_DEL+'</button></div></li>';
      }).join('')+'</ul>';
  }).join('');
}
function fillFilterCats(){
  const opt=([id,l])=>'<option value="'+esc(id)+'">'+esc(l)+'</option>';
  $('#fCat').innerHTML='<option value="all">All categories</option>'+
    '<optgroup label="Expenses">'+catList('expense').map(opt).join('')+'</optgroup>'+
    '<optgroup label="Income">'+catList('income').map(opt).join('')+'</optgroup>';
}
function syncFilterUI(){
  $('#fQ').value=state.filters.q; $('#fType').value=state.filters.type;
  $('#fCat').value=state.filters.cat; $('#fPeriod').value=state.filters.period;
}
function syncCurrencyUI(){
  $('#curSym').textContent=symbolOf(state.currency);
  $('#currency').value=state.currency; $('#wCurrency').value=state.currency;
}

/* ---------- account, themes, settings ---------- */
function accountHTML(withBtn){
  if(account.signedIn){
    return '<p>Signed in as <b>'+esc(account.email)+'</b>. Your data lives in your Supabase project and is protected by row-level security, so only your account can read it.</p>'+
      (withBtn?'<button type="button" class="secondary" data-act="signout">Sign out</button>':'');
  }
  return '<p><b>Not signed in.</b></p>';
}
function renderAccount(){
  $('#acct').innerHTML=accountHTML(true); $('#wAccount').innerHTML=accountHTML(false);
  $('#dataHint').textContent='Everything is saved to your Supabase project. Export a copy any time, or import a CSV from the earlier version of this app.';
}
function skinPickerHTML(){
  return SKINS.map(s=>'<button type="button" class="skin" role="radio" aria-checked="'+(state.prefs.skin===s.id)+'" data-skin="'+s.id+'">'+
    '<div class="pv" style="background:'+s.bg+'"><i style="background:'+s.surface+';width:72%"></i><i style="background:'+s.accent+';width:40%"></i></div>'+
    '<span>'+esc(s.label)+'</span></button>').join('');
}
function renderSkinPickers(){
  $('#skinPick').innerHTML=skinPickerHTML(); $('#wSkins').innerHTML=skinPickerHTML();
}
function pickSkin(id){
  if(!SKIN_IDS.includes(id))return;
  state.prefs.skin=id; applySkin(); renderSkinPickers();
  if(!welcomeOpen&&userId){saveSettings();}
}
function renderCatList(){
  const items=state.prefs.customCats;
  $('#catList').innerHTML=items.length?items.map(c=>
    '<li><span class="dot" style="background:var(--u'+c.ci+')"></span><span class="cl-name">'+esc(c.label)+'</span><span class="cl-type">'+(c.type==='income'?'Income':'Expense')+'</span>'+
    '<button type="button" class="linkbtn danger" data-act="rm-cat" data-id="'+esc(c.id)+'">Remove</button></li>').join('')
    :'<li><span class="cl-type">No custom categories yet.</span></li>';
}
function renderSettingsLists(){renderAccount();renderSkinPickers();renderCatList();}
function syncSettingsUI(){
  $('#sName').value=state.prefs.name;
  $('#sOpenOn').value=state.prefs.openOn;
  $('#sOpening').value=state.prefs.opening===null?'':String(state.prefs.opening);
  $('#sMoneyErr').textContent='';
  syncCurrencyUI(); renderSettingsLists();
}
async function addCustomCat(e){
  e.preventDefault();
  const err=$('#ccErr'), name=$('#ccName').value.trim().slice(0,30), type=$('#ccType').value;
  const picked=document.querySelector('input[name="cc"]:checked'), ci=picked?+picked.value:1;
  if(!name){err.textContent='Give the category a name.';$('#ccName').focus();return;}
  if(catList(type).some(([,l])=>l.toLowerCase()===name.toLowerCase())){err.textContent='You already have a '+(type==='income'?'income':'expense')+' category called '+name+'.';$('#ccName').focus();return;}
  if(state.prefs.customCats.length>=30){err.textContent='You can have up to 30 custom categories.';return;}
  err.textContent='';
  const cat={id:'u-'+(Math.random().toString(36)+'000000').slice(2,8),label:name,type,ci};
  state.prefs.customCats.push(cat);
  rebuildCats(); refreshCatUIs(); $('#ccName').value=''; renderAll();
  catBusy=true;
  const ok=await dbRun(sb.from('categories').insert({id:cat.id,label:cat.label,type:cat.type,color_index:cat.ci}));
  catBusy=false;
  if(!ok){
    state.prefs.customCats=state.prefs.customCats.filter(x=>x.id!==cat.id);
    rebuildCats(); refreshCatUIs(); renderAll();
    toast("Couldn't add that category. Check your connection and try again.");
    return;
  }
  toast('Added '+name+'.');
}
async function removeCustomCat(id){
  const c=state.prefs.customCats.find(x=>x.id===id); if(!c)return;
  const fb=c.type==='income'?'otherinc':'other';
  let n=0;
  state.tx=state.tx.map(t=>{if(t.category===id){n++;return Object.assign({},t,{category:fb});}return t;});
  state.prefs.customCats=state.prefs.customCats.filter(x=>x.id!==id);
  if(state.editingId)exitEdit();
  rebuildCats(); refreshCatUIs(); renderAll();
  catBusy=true; setStatus('saving');
  const {error}=await sb.rpc('remove_category',{p_id:id});
  catBusy=false;
  if(error){
    console.error(error); setStatus('error');
    toast("Couldn't remove that category.");
    try{await loadAll();refreshCatUIs();renderAll();}catch(e){}
    return;
  }
  setStatus('synced');
  toast('Removed '+c.label+'.'+(n?' '+n+' transaction'+(n===1?'':'s')+' moved to '+CAT[fb].label+'.':''));
}

/* CSV export / import */
function exportCsv(){
  if(!state.tx.length){toast('Nothing to export yet.');return;}
  const q=s=>'"'+String(s).replace(/"/g,'""')+'"';
  const rows=['Date,Type,Category,Amount,Note'].concat(state.tx.slice().sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0)
    .map(t=>[t.date,t.type,q((CAT[t.category]||CAT.other).label),t.amount.toFixed(2),q(t.note)].join(',')));
  const blob=new Blob(['\ufeff'+rows.join('\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='where-it-went-'+todayStr()+'.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function parseCSV(text){
  const rows=[]; let row=[], cur='', q=false;
  text=text.replace(/^\ufeff/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){
      if(c==='"'){if(text[i+1]==='"'){cur+='"';i++;}else q=false;}
      else cur+=c;
    }else if(c==='"')q=true;
    else if(c===','){row.push(cur);cur='';}
    else if(c==='\n'||c==='\r'){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(cur);cur='';
      if(row.some(x=>x!==''))rows.push(row);
      row=[];
    }else cur+=c;
  }
  row.push(cur); if(row.some(x=>x!==''))rows.push(row);
  return rows;
}
async function importCsv(file){
  let rows;
  try{rows=parseCSV(await file.text());}catch(e){toast("Couldn't read that file.");return;}
  const head=(rows.shift()||[]).map(x=>x.trim().toLowerCase());
  if(head[0]!=='date'||head[1]!=='type'||head[2]!=='category'||head[3]!=='amount'){
    toast('That file needs the columns Date, Type, Category, Amount, Note.');return;
  }
  const byLabel={};
  Object.values(CAT).forEach(c=>{byLabel[c.type+'|'+c.label.toLowerCase()]=c.id;});
  const out=[]; let skipped=0;
  rows.forEach(r=>{
    const type=String(r[1]||'').trim().toLowerCase()==='income'?'income':'expense';
    const t=cleanTx({id:uid(),type,category:byLabel[type+'|'+String(r[2]||'').trim().toLowerCase()]||'',
      amount:parseFloat(String(r[3]||'').replace(/,/g,'')),date:String(r[0]||'').trim(),note:String(r[4]||'').trim(),createdAt:Date.now()+out.length});
    if(t)out.push(t); else skipped++;
  });
  if(!out.length){toast('No valid rows found in that file.');return;}
  const ok=await addMany(out);
  if(ok)toast('Imported '+out.length+' transaction'+(out.length===1?'':'s')+(skipped?'. Skipped '+skipped+' invalid row'+(skipped===1?'':'s')+'.':'.'));
}

/* ---------- welcome ---------- */
let welcomeOpen=false, welcomeAuto=false, settled=false;
function openWelcome(auto){
  welcomeOpen=true; welcomeAuto=!!auto;
  $('#wName').value=state.prefs.name;
  $('#wOpening').value=state.prefs.opening===null?'':String(state.prefs.opening);
  $('#wErr').textContent='';
  syncCurrencyUI(); renderAccount(); renderSkinPickers();
  $('#wStart').textContent=state.prefs.onboarded?'Save changes':'Start tracking';
  $('#wSample').hidden=state.tx.length>0;
  $('#welcome').hidden=false; $('#app').inert=true;
  setTimeout(()=>$('#wName').focus(),30);
}
function closeWelcome(){
  welcomeOpen=false; $('#welcome').hidden=true; $('#app').inert=false;
}
function finishWelcome(sample){
  const op=parseSigned($('#wOpening').value);
  if(op===undefined){$('#wErr').textContent='Starting balance should be a number, like 1200 or -50.';$('#wOpening').focus();return;}
  const first=!state.prefs.onboarded;
  state.prefs.name=$('#wName').value.trim().slice(0,40);
  state.prefs.opening=op;
  state.currency=$('#wCurrency').value;
  state.prefs.onboarded=true;
  closeWelcome(); syncCurrencyUI();
  saveSettings();
  if(sample&&!state.tx.length)loadSample();
  else toast(first?(state.prefs.name?'All set, '+state.prefs.name+'. Log your first transaction above.':'All set. Log your first transaction above.'):'Settings saved.');
}
function settle(){
  if(settled)return; settled=true;
  if(!state.prefs.onboarded&&!welcomeOpen)openWelcome(true);
}

/* ---------- render ---------- */
function renderAll(){
  renderHero(); renderCats(); renderRecords();
  if(state.view==='dashboard')drawTrend();
  if(state.view==='settings'){renderAccount();renderSkinPickers();renderCatList();}
}

/* ---------- authentication (Supabase Auth) ---------- */
let authMode='signin', authWorking=false, booting=false;
const redirectUrl=()=>location.href.split('#')[0].split('?')[0];

function showBanner(msg,retry){
  const b=$('#banner'); b.innerHTML='';
  const s=document.createElement('span'); s.textContent=msg; b.appendChild(s);
  if(retry){const btn=document.createElement('button');btn.type='button';btn.className='linkbtn';btn.textContent='Try again';btn.onclick=()=>{hideBanner();retry();};b.appendChild(btn);}
  b.hidden=false;
}
function hideBanner(){$('#banner').hidden=true;}

function authMsg(msg,kind){
  $('#aErr').textContent=kind==='info'?'':(msg||'');
  $('#aInfo').textContent=kind==='info'?msg:'';
}
function showAuth(mode){
  authMode=mode;
  closeWelcome(); $('#setup').hidden=true;
  const rec=mode==='recovery', up=mode==='signup';
  $('#aTitle').textContent=rec?'Choose a new password':up?'Create your account':'Welcome back';
  $('#aLead').textContent=rec?'Pick a new password for your account.':up?'Your spending data is private to your account.':'Sign in to see your spending.';
  $('#aEmailWrap').hidden=rec; $('#authToggle').hidden=rec;
  $('#authLinks').hidden=rec;
  $('#aForgot').hidden=up;
  $('#aPassLbl').textContent=rec?'New password':'Password';
  $('#aPass').autocomplete=mode==='signin'?'current-password':'new-password';
  $('#aSubmit').textContent=rec?'Update password':up?'Create account':'Sign in';
  document.querySelectorAll('[data-amode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.amode===mode)));
  authMsg('');
  $('#auth').hidden=false; $('#app').inert=true;
  setTimeout(()=>(rec?$('#aPass'):$('#aEmail')).focus(),30);
}
function hideAuth(){$('#auth').hidden=true;$('#app').inert=false;$('#aPass').value='';}
function showSetup(kind){
  $('#auth').hidden=true; $('#app').inert=true;
  $('#setupMsg').innerHTML=kind==='lib'
    ?'The Supabase library could not be loaded. Check your internet connection and reload, or host <span class="code">supabase.js</span> yourself and update the script tag in <span class="code">index.html</span>.'
    :'Open <span class="code">config.js</span> and paste your Supabase project URL and anon key, then reload this page. The README walks through it.';
  $('#setup').hidden=false;
}
function authBusy(on){
  authWorking=on;
  ['#aSubmit','#aMagic','#aForgot'].forEach(s=>{$(s).disabled=on;});
}
const friendly=e=>{
  const m=(e&&e.message)||'Something went wrong. Try again.';
  return /invalid login credentials/i.test(m)?'That email and password do not match.':m;
};
async function onAuthSubmit(e){
  e.preventDefault(); if(authWorking||!sb)return;
  const email=$('#aEmail').value.trim(), pass=$('#aPass').value;
  authMsg('');
  if(authMode!=='recovery'&&!/^\S+@\S+\.\S+$/.test(email)){authMsg('Enter a valid email address.');$('#aEmail').focus();return;}
  if(!pass){authMsg(authMode==='recovery'?'Choose a new password.':'Enter your password.');$('#aPass').focus();return;}
  if(authMode!=='signin'&&pass.length<8){authMsg('Use at least 8 characters for your password.');$('#aPass').focus();return;}
  authBusy(true);
  try{
    if(authMode==='signin'){
      const {error}=await sb.auth.signInWithPassword({email,password:pass});
      if(error)throw error;
    }else if(authMode==='signup'){
      const {data,error}=await sb.auth.signUp({email,password:pass,options:{emailRedirectTo:redirectUrl()}});
      if(error)throw error;
      if(!data.session){
        const dup=data.user&&Array.isArray(data.user.identities)&&data.user.identities.length===0;
        authMsg(dup?'That email already has an account. Try signing in.':'Check your email to confirm your account, then sign in.','info');
      }
    }else{
      const {error}=await sb.auth.updateUser({password:pass});
      if(error)throw error;
      authMode='signin'; hideAuth();
      const {data}=await sb.auth.getSession();
      if(data.session)onSignedIn(data.session);
      toast('Password updated.');
    }
  }catch(err){authMsg(friendly(err));}
  finally{authBusy(false);}
}
async function sendLink(kind){
  if(authWorking||!sb)return;
  const email=$('#aEmail').value.trim();
  authMsg('');
  if(!/^\S+@\S+\.\S+$/.test(email)){authMsg('Enter your email address first.');$('#aEmail').focus();return;}
  authBusy(true);
  try{
    const res=kind==='magic'
      ?await sb.auth.signInWithOtp({email,options:{emailRedirectTo:redirectUrl()}})
      :await sb.auth.resetPasswordForEmail(email,{redirectTo:redirectUrl()});
    if(res.error)throw res.error;
    authMsg(kind==='magic'?'Check your email for a sign-in link.':'If that email has an account, a reset link is on its way.','info');
  }catch(err){authMsg(friendly(err));}
  finally{authBusy(false);}
}
function wireAuth(){
  $('#authForm').addEventListener('submit',onAuthSubmit);
  document.querySelectorAll('[data-amode]').forEach(b=>b.addEventListener('click',()=>showAuth(b.dataset.amode)));
  $('#aMagic').addEventListener('click',()=>sendLink('magic'));
  $('#aForgot').addEventListener('click',()=>sendLink('reset'));
}

async function onSignedIn(session){
  if(booting||(loaded&&userId===session.user.id))return;
  booting=true;
  userId=session.user.id; account.signedIn=true; account.email=session.user.email||'';
  hideAuth(); hideBanner();
  try{
    await loadAll(); loaded=true;
    if(!trendTouched)autoTrend();
    syncCurrencyUI(); refreshCatUIs(); setView(state.prefs.openOn); renderAll();
    subscribe(); setStatus('synced');
    settle();
  }catch(e){
    console.error(e); setStatus('error'); userId=null; account.signedIn=false;
    const hint=/relation|does not exist|schema cache|PGRST20/i.test(String((e&&e.message)||''))
      ?' Run supabase/schema.sql in your project first.':'';
    showBanner("Couldn't load your data."+hint,()=>{booting=false;onSignedIn(session);});
  }finally{booting=false;}
}
function onSignedOut(){
  loaded=false; userId=null; account.signedIn=false; account.email='';
  if(channel&&sb){sb.removeChannel(channel);channel=null;}
  state.tx=[];
  state.prefs=Object.assign({},state.prefs,{name:'',opening:null,onboarded:false,customCats:[],openOn:'dashboard'});
  rebuildCats(); exitEdit(); settled=false;
  setView('dashboard'); renderAll(); refreshCatUIs();
  showAuth('signin');
}
function bootAuth(){
  if(!configured){showSetup('config');return;}
  if(!(window.supabase&&typeof window.supabase.createClient==='function')){showSetup('lib');return;}
  sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  sb.auth.onAuthStateChange((event,session)=>{
    setTimeout(()=>{            // never await Supabase calls directly inside this callback
      if(event==='PASSWORD_RECOVERY'){showAuth('recovery');return;}
      if(event==='SIGNED_OUT'){onSignedOut();return;}
      if(authMode==='recovery'&&!$('#auth').hidden)return;
      if(session&&(event==='SIGNED_IN'||event==='INITIAL_SESSION'))onSignedIn(session);
      else if(event==='INITIAL_SESSION'&&!session)showAuth('signin');
    },0);
  });
}

/* ---------- wiring ---------- */
function init(){
  loadSkinCache(); rebuildCats(); applySkin(); wireAuth();
  $('#currency').innerHTML=CURRENCIES.map(c=>'<option value="'+c+'">'+c+' ('+esc(symbolOf(c))+')</option>').join('');
  $('#wCurrency').innerHTML=$('#currency').innerHTML;
  $('.sw').innerHTML=[1,2,3,4,5,6,7,8].map(i=>'<label><input type="radio" name="cc" value="'+i+'"'+(i===1?' checked':'')+' aria-label="Color '+i+'"><span style="background:var(--u'+i+')"></span></label>').join('');
  fillCategories('expense'); fillFilterCats(); syncFilterUI(); syncCurrencyUI();
  $('#date').value=todayStr();

  document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  document.querySelectorAll('input[name="type"]').forEach(r=>r.addEventListener('change',()=>{
    const t=getType(); $('#entry').dataset.type=t; fillCategories(t);
  }));
  $('#category').addEventListener('change',()=>{lastCat[getType()]=$('#category').value;});
  $('#txForm').addEventListener('submit',onSubmit);
  $('#cancelEdit').addEventListener('click',exitEdit);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.editingId&&!welcomeOpen)exitEdit();});

  $('#prevM').addEventListener('click',()=>{state.month=addM(state.month,-1);renderAll();});
  $('#nextM').addEventListener('click',()=>{state.month=addM(state.month,1);renderAll();});
  $('#thisM').addEventListener('click',()=>{state.month=curYM();renderAll();});
  document.querySelectorAll('[data-trend]').forEach(b=>b.addEventListener('click',()=>{
    state.trend=b.dataset.trend; trendTouched=true; drawTrend();
  }));
  $('#cats').addEventListener('click',e=>{
    const b=e.target.closest('[data-cat]'); if(!b)return;
    state.filters={q:'',type:'expense',cat:b.dataset.cat,period:'month'};
    syncFilterUI(); setView('records');
    window.scrollTo({top:0,behavior:reduceMotion()?'auto':'smooth'});
  });

  $('#fQ').addEventListener('input',e=>{state.filters.q=e.target.value;renderRecords();});
  $('#fType').addEventListener('change',e=>{state.filters.type=e.target.value;renderRecords();});
  $('#fCat').addEventListener('change',e=>{state.filters.cat=e.target.value;renderRecords();});
  $('#fPeriod').addEventListener('change',e=>{state.filters.period=e.target.value;renderRecords();});

  /* settings */
  $('#sName').addEventListener('change',e=>{state.prefs.name=e.target.value.trim().slice(0,40);saveSettings();});
  $('#sOpenOn').addEventListener('change',e=>{state.prefs.openOn=e.target.value;saveSettings();});
  $('#currency').addEventListener('change',e=>{state.currency=e.target.value;syncCurrencyUI();saveSettings();});
  $('#sOpening').addEventListener('change',e=>{
    const v=parseSigned(e.target.value);
    if(v===undefined){$('#sMoneyErr').textContent='Starting balance should be a number, like 1200 or -50.';return;}
    $('#sMoneyErr').textContent=''; state.prefs.opening=v; saveSettings();
  });
  $('#catForm').addEventListener('submit',addCustomCat);
  $('#importFile').addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(f)importCsv(f);});
  document.addEventListener('click',e=>{
    const s=e.target.closest('.skin'); if(s){pickSkin(s.dataset.skin);return;}
    const a=e.target.closest('[data-act]'); if(!a)return;
    const act=a.dataset.act;
    if(act==='sample')loadSample();
    else if(act==='clear-filters'){state.filters={q:'',type:'all',cat:'all',period:'month'};syncFilterUI();renderRecords();}
    else if(act==='export')exportCsv();
    else if(act==='replay')openWelcome(false);
    else if(act==='import')$('#importFile').click();
    else if(act==='signout'){if(sb)sb.auth.signOut();}
    else if(act==='erase')confirmTap(a,'Click again to erase everything',eraseAll);
    else if(act==='rm-cat')confirmTap(a,'Click again to remove',()=>removeCustomCat(a.dataset.id));
    else if(act==='edit'||act==='delete'){
      const id=a.closest('.row').dataset.id;
      if(act==='edit')enterEdit(id);
      else{
        if(state.editingId===id)exitEdit();
        removeTx(id).then(t=>{if(t)toast('Transaction deleted.','Undo',()=>upsert(t));});
      }
    }
  });

  /* welcome */
  $('#wStart').addEventListener('click',()=>finishWelcome(false));
  $('#wSample').addEventListener('click',()=>finishWelcome(true));
  $('#wCurrency').addEventListener('change',e=>{state.currency=e.target.value;syncCurrencyUI();});
  ['#wName','#wOpening'].forEach(s=>$(s).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();finishWelcome(false);}}));

  if('ResizeObserver' in window){
    let lastW=0;
    new ResizeObserver(()=>{
      const w=$('#chartWrap').clientWidth;
      if(w&&w!==lastW){lastW=w;if(state.view==='dashboard')drawTrend();}
    }).observe($('#chartWrap'));
  }

  setView('dashboard'); renderAll(); renderAccount();
  bootAuth();
}
init();
})();
