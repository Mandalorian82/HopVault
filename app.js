'use strict';
const $=id=>document.getElementById(id), status=t=>$('status').textContent=t;
let db,user,state={stock:[],archive:[]},view='Bestand',busy=false;
const places=['Bestellt','Kühlschrank','Kühlschrank Garage','Weinkühlschrank','Ungeklärt'];
// Accept both current codes and legacy code 4 on import/migration.
const placeFromCode=v=>({'1':'Kühlschrank','2':'Kühlschrank Garage','3':'Weinkühlschrank','4':'Kühlschrank','Bestellt':'Bestellt','Kühlschrank':'Kühlschrank','Kühlschrank Garage':'Kühlschrank Garage','Weinkühlschrank':'Weinkühlschrank'}[String(v).trim()]||'Ungeklärt');
const exportPlace=b=>({'Kühlschrank':1,'Kühlschrank Garage':2,'Weinkühlschrank':3}[b.place]??(b.place==='Ungeklärt'?b.legacyPlace:b.place));
const tabs=['Bestand','SL1','SL2','SL3','Frische','Bestellt','Archiv'];
const today=()=>new Date().toISOString().slice(0,10), id=()=>crypto.randomUUID();
const text=v=>v==null?'':String(v), date=v=>v instanceof Date?v.toISOString().slice(0,10):typeof v==='number'?new Date(Date.UTC(1899,11,30)+v*86400000).toISOString().slice(0,10):text(v);
const keyOf=b=>[b.brewery,b.name].map(s=>text(s).trim().toLowerCase()).join('|');
function el(tag,t,parent){const e=document.createElement(tag);e.textContent=t;parent?.append(e);return e}
function btn(t,p,fn){const e=el('button',t,p);e.type='button';e.onclick=fn;return e}
async function save(next){if(busy)throw Error('Speicherung läuft');busy=true;try{const {error}=await db.from('hopvault_rows').upsert({user_id:user.id,data:next,updated_at:new Date().toISOString()});if(error)throw error;state=next;render();status('Gespeichert');}finally{busy=false}}
async function action(fn){try{await fn()}catch(e){status('Fehler: '+e.message)}}
$('url').value=localStorage.getItem('hv_url')||'';$('key').value=localStorage.getItem('hv_key')||'';
$('connect').onclick=()=>action(async()=>{db=supabase.createClient($('url').value.trim(),$('key').value.trim());const {data,error}=await db.auth.signInWithPassword({email:$('email').value,password:$('pw').value});if(error)throw error;user=data.user;localStorage.setItem('hv_url',$('url').value);localStorage.setItem('hv_key',$('key').value);const r=await db.from('hopvault_rows').select('data').eq('user_id',user.id).maybeSingle();if(r.error)throw r.error;state=r.data?.data||{stock:[],archive:[]};const migrated=structuredClone(state);let changed=false;for(const b of migrated.stock){if(b.place==='Ungeklärt'&&placeFromCode(b.legacyPlace)!=='Ungeklärt'){b.place=placeFromCode(b.legacyPlace);changed=true;}}if(changed)await save(migrated);$('login').hidden=true;$('main').hidden=false;$('pw').value='';render();status('Angemeldet')});
$('logout').onclick=()=>action(async()=>{await db.auth.signOut();location.reload()});
for(const t of tabs)btn(t,$('nav'),()=>{view=t;render()});$('search').oninput=render;
function estimate(b){
 if(b.window && /^\d{4}-\d{2}-\d{2}$/.test(b.window))return {end:b.window,source:'manuell'};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(b.ordered||'')||!Number.isFinite(Date.parse(b.ordered)))return null;
 const style=hopKey(b.style);if(!/ipa|pale ale|neipa|dipa|tipa|qipa|oat cream/.test(style))return null;
 let weeks=/wet hop/.test(style)?4:/ddh|tdh|hazy|neipa|oat cream/.test(style)?6:8;
 if(b.place==='Weinkühlschrank')weeks-=1;
 return {end:new Date(Date.parse(b.ordered)+weeks*7*86400000).toISOString().slice(0,10),source:'grobe Schätzung ab Bestellung'};
}
function daysLeft(b){const e=estimate(b);return e?Math.round((Date.parse(e.end)-Date.parse(today()))/86400000):null;}
function freshness(b){const e=estimate(b),d=daysLeft(b);if(!e)return 'Trinkfenster unbekannt';return (d<0?'Geschätztes Trinkfenster überschritten':d<=14?'Geschätztes Trinkfenster zeitnah':'Im geschätzten Trinkfenster')+' · '+e.end+' ('+e.source+')';}
function displayHop(h){return text(h).split(/(\s+|-)/).map(w=>/^(hbc|cgj|cgx|t90|bbc|id7|cryo)$/i.test(w)&&!/^cryo$/i.test(w)?w.toUpperCase():w.charAt(0).toUpperCase()+w.slice(1)).join('');}
const hopKeys=b=>[...new Set(text(b.hops).split(/[,;\n]+/).map(hopEvidenceKey).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'));
const sortDate=b=>b.planned||estimate(b)?.end||'';
const compareText=(a,b)=>text(a).localeCompare(text(b),'de',{numeric:true,sensitivity:'base'});
const placeOrder=b=>({'Kühlschrank':1,'Kühlschrank Garage':2,'Weinkühlschrank':3,'Bestellt':4,'Ungeklärt':5}[b.place]||6);
const allowedSort=['date','hop','place','brewery','name'];
const savedSort=localStorage.getItem('hv_sort');if(allowedSort.includes(savedSort))$('sortBy').value=savedSort;
$('sortBy').onchange=()=>{localStorage.setItem('hv_sort',$('sortBy').value);render()};
$('filterHop').onchange=$('filterPlace').onchange=()=>render();
$('resetFilters').onclick=()=>{$('filterHop').value='';$('filterPlace').value='';$('search').value='';render()};
function render(){
 for(const button of $('nav').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.textContent===view));
 const archive=view==='Archiv';$('filterPlace').disabled=archive;
 const options=[...new Set((archive?state.archive:state.stock).flatMap(hopKeys))].sort(compareText);
 const sel=$('filterHop'),previous=sel.value;sel.replaceChildren();const all=el('option','Alle',sel);all.value='';for(const k of options){const o=el('option',displayHop(k),sel);o.value=k;}sel.value=options.includes(previous)?previous:'';
 let rows=archive?state.archive:state.stock.filter(b=>view==='Bestand'||view==='Bestellt'&&b.place==='Bestellt'||view==='Frische'&&b.place!=='Bestellt'&&((daysLeft(b)!==null&&daysLeft(b)<=14)||(b.planned&&b.planned<=today()))||b.sl===view&&b.place!=='Bestellt');
 const q=$('search').value.toLowerCase(),hop=sel.value,place=$('filterPlace').value,sort=$('sortBy').value;
 rows=rows.filter(b=>[b.name,b.brewery,b.style,b.hops].join(' ').toLowerCase().includes(q)&&(!hop||hopKeys(b).includes(hop))&&(archive||!place||b.place===place));
 rows.sort((a,b)=>{let c=0;if(sort==='date')c=compareText((archive?a.archived:sortDate(a))||'9999-99-99',(archive?b.archived:sortDate(b))||'9999-99-99');else if(sort==='hop')c=compareText(hopKeys(a).join(', ')||'\uffff',hopKeys(b).join(', ')||'\uffff');else if(sort==='place')c=placeOrder(a)-placeOrder(b);else if(sort==='brewery')c=compareText(a.brewery,b.brewery);return c||compareText(a.name,b.name);});
 $('summary').textContent=`${view}: ${new Set(rows.map(keyOf)).size} Sorten · ${rows.reduce((s,b)=>s+(Number(b.qty)||1),0)} ${archive?'Archiveinträge':'Exemplare'}`;
 const p=$('list');p.replaceChildren();if(!rows.length){el('p','Keine passenden Biere.',p);return;}
 for(const b of rows){const a=el('article','',p),toggle=btn('',a,()=>{detail.hidden=!detail.hidden;toggle.setAttribute('aria-expanded',String(!detail.hidden));});toggle.className='beer-toggle';toggle.setAttribute('aria-expanded','false');
 const head=el('span','',toggle);head.className='beer-head';const title=el('strong',(b.sl==='SL1'&&!archive&&daysLeft(b)!==null&&daysLeft(b)<=14?'★ ':'')+b.name,head);title.style.fontSize='17px';
 const meta=el('span',`${b.brewery} · ${b.style} · ${b.abv==null?'?':b.abv} %`,toggle);meta.className='beer-meta';meta.style.display='block';
 const hops=el('span',text(b.hops).split(/[,;\n]+/).map(h=>displayHop(h.trim())).join(' · '),toggle);hops.className='beer-hops';hops.style.display='block';
 const loc=el('span',archive?`${b.mark||''} · ${b.archived||''}`:`${b.place||'Ungeklärt'}${b.place==='Ungeklärt'?' (Excel: '+(b.legacyPlace||'leer')+')':''}${sortDate(b)?' · '+sortDate(b).split('-').reverse().join('.')+(b.planned?' (Planung)':' (geschätzt)'):''}`,toggle);loc.className='beer-date';loc.style.display='block';
 const right=el('div','',a);right.className='beer-right';const qty=el('div',`${b.qty||1}×`,right);qty.className='beer-qty';if(!archive&&b.sl){const tag=el('span',b.sl,right);tag.className='sl-tag sl-'+b.sl;}
 const detail=el('div','',a);detail.className='beer-detail-wrap';detail.hidden=true;if(!archive){el('div',freshness(b),detail);if(b.planned)el('small','Bisherige Planung: '+b.planned,detail);if(b.ordered)el('div','Bestellt: '+b.ordered,detail);if(b.mhd)el('div','MHD: '+b.mhd,detail);}
 btn('Bearbeiten',detail,()=>edit(b,archive));if(!archive&&b.place!=='Bestellt')btn('1 ausbuchen',detail,()=>action(async()=>{if(!confirm('Ein Exemplar ausbuchen und archivieren?'))return;const n=structuredClone(state),x=n.stock.find(x=>x.id===b.id);n.archive.push({...x,id:id(),qty:1,archived:today()});if(--x.qty===0)n.stock=n.stock.filter(y=>y.id!==b.id);if(x.sl==='SL2'&&!n.stock.some(y=>keyOf(y)===keyOf(x)&&y.qty>=2&&y.place!=='Bestellt'))for(const y of n.stock.filter(y=>keyOf(y)===keyOf(x)))y.sl='';await save(n)}));
 }
}

const fields=[['brewery','Brauerei'],['name','Bier'],['style','Stil (eigene Schreibweise)'],['hops','Hopfen'],['abv','Alkohol %','number'],['qty','Menge','number'],['place','Lagerort',places],['sl','Shortlist',['','SL1','SL2','SL3']],['ordered','Bestelldatum','date'],['planned','Bisherige Trinkplanung','date'],['window','Geschätztes Trinkfenster bis','date'],['mhd','MHD (Text)'],['mark','Markierung (Favorit / Nochmals)'],['archived','Archivdatum','date']];
function edit(b={},archive=false){const form=$('form');form.replaceChildren();$('editor').hidden=false;for(const [k,label,type] of fields){const l=el('label',label,form);let e;if(Array.isArray(type)){e=document.createElement('select');for(const v of type){const o=el('option',v||'Keine',e);o.value=v}}else{e=document.createElement('input');e.type=type||'text';if(k==='abv')e.step='0.1';if(k==='qty')e.min='1';}e.name=k;e.value=b[k]??(k==='qty'?1:k==='place'?'Bestellt':'');if(['brewery','name','qty'].includes(k))e.required=true;l.append(e)}btn('Abbrechen',form,()=>$('editor').hidden=true);const submit=el('button','Speichern',form);submit.type='submit';form.onsubmit=e=>{e.preventDefault();action(async()=>{const d=Object.fromEntries(new FormData(form));d.qty=Number(d.qty);d.abv=d.abv===''?null:Number(d.abv);if(!Number.isInteger(d.qty)||d.qty<1)throw Error('Ungültige Menge');const n=structuredClone(state),arr=archive?n.archive:n.stock;const x={...b,...d,id:b.id||id()};if(!archive){const same=arr.filter(y=>y.id!==x.id&&keyOf(y)===keyOf(x));for(const y of same)y.sl=x.sl;if(x.sl==='SL2'&&x.qty<2)throw Error('SL2 benötigt ein Paar am selben Ort');}const i=arr.findIndex(y=>y.id===x.id);if(i<0)arr.push(x);else arr[i]=x;await save(n);$('editor').hidden=true})};$('editor').scrollIntoView()}
$('add').onclick=()=>edit();
function val(c){const v=c.value;return v&&typeof v==='object'&&!(v instanceof Date)?v.result??v.text??(v.richText||[]).map(x=>x.text).join(''):v}
$('file').onchange=()=>action(async()=>{if(state.stock.length||state.archive.length)throw Error('Import nur in leere Datenbank, um Duplikate zu vermeiden');const f=$('file').files[0];if(!f)return;const w=new ExcelJS.Workbook();await w.xlsx.load(await f.arrayBuffer());const s=w.getWorksheet('IPA Sammlung'),a=w.getWorksheet('Getrunken');if(!s||!a)throw Error('Tabellenblätter fehlen');const n={stock:[],archive:[]};s.eachRow((r,i)=>{if(i===1||!val(r.getCell(3)))return;const v=j=>val(r.getCell(j)),tr=v(9),loc=text(v(7));n.stock.push({id:id(),number:v(1),brewery:text(v(2)),name:text(v(3)),style:text(v(4)),hops:text(v(5)),abv:v(6)==null?null:Math.round(Number(v(6))*1000)/10,legacyPlace:loc,place:placeFromCode(loc),ordered:date(v(8)),sl:/^SL[123]$/.test(text(tr))?text(tr):'',planned:/^SL[123]$/.test(text(tr))?'':date(tr),window:'',qty:Number(v(10))||1})});a.eachRow((r,i)=>{if(i===1||!val(r.getCell(2)))return;const v=j=>val(r.getCell(j));n.archive.push({id:id(),brewery:text(v(1)),name:text(v(2)),style:text(v(3)),hops:text(v(4)),abv:v(5)==null?null:Math.round(Number(v(5))*1000)/10,legacyF:v(6),ordered:date(v(7)),mark:text(v(8)),qty:1})});if(!confirm(`${n.stock.length} Bestandszeilen und ${n.archive.length} Archiveinträge importieren? Lagercodes 1, 2, 3 sowie der alte Code 4 werden automatisch zugeordnet.`))return;await save(n)});
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
$('backup').onclick=()=>download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'HopVault-backup.json');
$('export').onclick=()=>action(async()=>{const w=new ExcelJS.Workbook(),s=w.addWorksheet('IPA Sammlung'),a=w.addWorksheet('Getrunken');s.addRow([state.stock.reduce((t,b)=>t+b.qty,0),'Brauerei','Bier','Stil','Hopfen','Alk.','Ort','Bestellung','Trinken','Menge']);const dt=v=>v?new Date(v+'T00:00:00Z'):null;state.stock.forEach((b,i)=>s.addRow([i+1,b.brewery,b.name,b.style,b.hops,b.abv==null?null:b.abv/100,exportPlace(b),dt(b.ordered),b.sl||dt(b.planned||b.window),b.qty]));a.addRow(['Getrunken']);state.archive.forEach(b=>a.addRow([b.brewery,b.name,b.style,b.hops,b.abv==null?null:b.abv/100,b.legacyF??null,dt(b.ordered),b.mark]));s.getColumn(6).numFmt='0.0%';a.getColumn(5).numFmt='0.0%';s.getColumn(8).numFmt='dd.mm.yyyy';s.getColumn(9).numFmt='dd.mm.yyyy';a.getColumn(7).numFmt='dd.mm.yyyy';for(const sheet of [s,a])sheet.columns.forEach(c=>c.width=22);download(new Blob([await w.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'HopVault.xlsx')});

// Smart Import: browser OCR and editable preview, no paid API.
function parseBeerScreenshot(raw){
 const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const out=[]; let brewery='';
 const field=/^(?:Stil|Style|Zutaten|Ingredients|Alkoholgehalt|Alkohol|ABV|Farbe|Inhalt|Best before|MHD)\s*:/i;
 const isStyle=x=>/^(?:Stil|Style)\s*:/i.test(x);
 const heading=x=>x&&!field.test(x)&&!/[(),:%]/.test(x)&&/^[\p{L}\d][\p{L}\d\s&'’./-]*$/u.test(x);
 for(let i=0;i<lines.length;i++){
  if(!isStyle(lines[i]))continue;
  const name=heading(lines[i-1])?lines[i-1]:'';
  if(!out.length&&heading(lines[i-2]))brewery=lines[i-2];
  let end=lines.length;for(let j=i+1;j<lines.length;j++)if(isStyle(lines[j])){end=j-1;break;}
  const block=lines.slice(i,end).join(' ');
  const style=lines[i].replace(/^.*?:\s*/,'');
  const normalized=({'india pale ale':'IPA','double india pale ale':'DIPA','double ipa':'DIPA','triple india pale ale':'TIPA','triple ipa':'TIPA','new england ipa':'NEIPA'})[style.toLowerCase()]||style;
  const hops=block.match(/(?:Hopfen|Hops)\s*\(([^)]*)\)/i)?.[1]||'';
  const abv=block.match(/(?:Alkoholgehalt|Alkohol|ABV)\s*:\s*(\d+(?:[.,]\d+)?)\s*%/i)?.[1]?.replace(',','.')||'';
  const mhd=block.match(/(?:Best before|MHD)\s*:\s*(\d{1,2}[./-]\d{2,4}(?:[./-]\d{2,4})?)/i)?.[1]||'';
  out.push({brewery,name,style:normalized,hops,abv,mhd});
 }
 return out;
}
const smart=el('section','',$('main'));smart.hidden=true;
$('main').insertBefore(smart,$('search'));
const smartButton=btn('Smart Import 📸',$('add').parentElement,()=>{smart.hidden=!smart.hidden;if(!smart.hidden)smart.scrollIntoView({block:'nearest'});});
el('h2','Screenshot importieren',smart);
el('p','Bild wählen, erkannte Daten prüfen und erst dann speichern. Neue Bestellungen werden als Bestellt erfasst.',smart);
const shot=document.createElement('input');shot.type='file';shot.accept='image/*';smart.append(shot);
const msg=el('p','',smart);msg.setAttribute('role','status');
const rawBox=document.createElement('textarea');rawBox.placeholder='Erkannter Text (bei Bedarf korrigieren)';smart.append(rawBox);
const review=el('div','',smart);let scanning=false;
function showReview(rows){
 review.replaceChildren();if(!rows.length){el('p','Keine Biere erkannt. Prüfe den Text oder füge einen Datensatz manuell hinzu.',review);return;}
 el('h2',`${rows.length} Bier(e) erkannt – bitte prüfen`,review);
 const entries=[];
 for(const b of rows){const box=el('article','',review),inputs={};const selected=document.createElement('input');selected.type='checkbox';selected.checked=true;const lab=el('label','Übernehmen',box);lab.prepend(selected);
  for(const [k,label] of [['brewery','Brauerei'],['name','Bier'],['style','Stil (frei anpassbar)'],['hops','Hopfen'],['abv','Alkohol %'],['mhd','MHD'],['qty','Menge'],['ordered','Bestelldatum']]){const l=el('label',label,box),inp=document.createElement('input');inp.value=k==='ordered'?today():k==='qty'?'':b[k]||'';if(k==='qty'||k==='abv'){inp.type='number';inp.min=k==='qty'?'1':'0';inp.step=k==='qty'?'1':'0.1';}if(k==='ordered')inp.type='date';if(k==='qty')inp.placeholder='Bitte eingeben';l.append(inp);inputs[k]=inp;}
  const matches=state.stock.filter(x=>keyOf(x)===keyOf(b));if(matches.length)el('p','Bereits im Bestand – nur übernehmen, wenn es eine weitere Bestellung ist.',box);
  entries.push({selected,inputs});
 }
 const commit=btn('Ausgewählte Biere als bestellt speichern',review,async()=>{commit.disabled=true;try{const n=structuredClone(state);let added=0;for(const e of entries){if(!e.selected.checked)continue;const d=Object.fromEntries(Object.entries(e.inputs).map(([k,v])=>[k,v.value.trim()]));if(!d.brewery||!d.name||!d.style||!Number.isInteger(Number(d.qty))||Number(d.qty)<1)throw Error('Bitte Brauerei, Bier, Stil und Menge prüfen.');d.qty=Number(d.qty);d.abv=d.abv===''?null:Number(d.abv);if(d.abv!==null&&(!Number.isFinite(d.abv)||d.abv<0||d.abv>100))throw Error('Alkoholgehalt prüfen.');const same=n.stock.filter(x=>keyOf(x)===keyOf(d));if(same.length&&!confirm(`${d.name} ist bereits vorhanden. Weitere Bestellung über ${d.qty} Exemplar(e) hinzufügen?`))continue;n.stock.push({...d,id:id(),place:'Bestellt',legacyPlace:'',sl:same[0]?.sl||'',planned:'',window:''});added++;}if(!added){msg.textContent='Keine Datensätze gespeichert.';return;}await save(n);view='Bestellt';render();review.replaceChildren();rawBox.value='';shot.value='';msg.textContent=`${added} Datensatz/Datensätze gespeichert.`;}catch(e){msg.textContent='Fehler: '+e.message;}finally{commit.disabled=false;}});
}
btn('Text erneut auswerten',smart,()=>showReview(parseBeerScreenshot(rawBox.value)));
btn('Datensatz manuell vorbereiten',smart,()=>showReview([{brewery:'',name:'',style:'',hops:'',abv:'',mhd:''}]));
shot.onchange=async()=>{if(scanning||!shot.files[0])return;scanning=true;shot.disabled=true;review.replaceChildren();rawBox.value='';let worker;try{msg.textContent='Texterkennung wird geladen …';if(!window.Tesseract)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('Texterkennung konnte nicht geladen werden'));};document.head.append(script);});worker=await Tesseract.createWorker('deu+eng',1,{logger:m=>{if(m.status==='recognizing text')msg.textContent=`Texterkennung: ${Math.round(m.progress*100)} %`;}});const r=await worker.recognize(shot.files[0]);rawBox.value=r.data.text;showReview(parseBeerScreenshot(rawBox.value));msg.textContent='Texterkennung abgeschlossen. Bitte Angaben prüfen.';}catch(e){msg.textContent='Fehler: '+e.message+' – du kannst den Text auch manuell einfügen.';}finally{if(worker)try{await worker.terminate()}catch{}scanning=false;shot.disabled=false;}};

// Hop Library: personal preferences, separate from consumption and freshness.
const hopKey=s=>text(s).trim().replace(/\s+/g,' ').toLocaleLowerCase('de');
function hopCatalog(data){
 const map=new Map();
 for(const b of [...data.stock,...data.archive])for(const raw of text(b.hops).split(/[,;\n]+/)){
  const name=raw.trim();if(name&&!map.has(hopKey(name)))map.set(hopKey(name),name);
 }
 for(const h of Object.values(data.hopProfile||{}))if(h?.name)map.set(hopKey(h.name),h.name);
 return [...map.values()].sort((a,b)=>a.localeCompare(b,'de'));
}
const hopPanel=el('section','',$('main'));hopPanel.hidden=true;
$('main').insertBefore(hopPanel,$('search'));
btn('Hop Library',$('add').parentElement,()=>{hopPanel.hidden=!hopPanel.hidden;if(!hopPanel.hidden){smart.hidden=true;drawHops();hopPanel.scrollIntoView({block:'nearest'});}});
el('h2','Mein Hopfenprofil',hopPanel);
el('p','Manuelle Bewertungen sind freiwillig. My Hop DNA liefert Hinweise auf deine Vorlieben.',hopPanel);
const hopSearch=document.createElement('input');hopSearch.placeholder='Hopfen suchen';hopPanel.append(hopSearch);
const hopFilter=document.createElement('select');for(const [v,t] of [['all','Alle'],['rated','Bewertet'],['new','Unbewertet']]){const o=el('option',t,hopFilter);o.value=v;}hopPanel.append(hopFilter);
const hopAdd=document.createElement('input');hopAdd.placeholder='Neue Hopfensorte';hopPanel.append(hopAdd);
const hopStatus=el('p','',hopPanel);hopStatus.setAttribute('role','status');
const hopRows=el('div','',hopPanel);
async function writeHop(name,rating){
 if(busy)throw Error('Speicherung läuft');const n=structuredClone(state);n.hopProfile=n.hopProfile||{};const k=hopKey(name);if(!k||['__proto__','constructor','prototype'].includes(k))throw Error('Ungültiger Name');n.hopProfile[k]={name,rating};await save(n);drawHops();hopStatus.textContent='Hopfenprofil gespeichert.';
}
btn('Hopfen hinzufügen',hopPanel,async()=>{try{const name=hopAdd.value.trim();if(!name)return;if(hopCatalog(state).some(h=>hopKey(h)===hopKey(name)))throw Error('Hopfen bereits vorhanden');await writeHop(name,null);hopAdd.value='';}catch(e){hopStatus.textContent=e.message;}});
function drawHops(){
 const catalog=hopCatalog(state),profile=state.hopProfile||{},q=hopKey(hopSearch.value);hopRows.replaceChildren();
 el('p',`${catalog.length} Bezeichnungen · ${catalog.filter(h=>Number.isInteger(profile[hopKey(h)]?.rating)).length} bewertet`,hopRows);
 for(const name of catalog){const value=profile[hopKey(name)]?.rating??null;if(!hopKey(name).includes(q)||hopFilter.value==='rated'&&value===null||hopFilter.value==='new'&&value!==null)continue;
 const row=el('label',displayHop(name)+' ',hopRows),select=document.createElement('select');for(const [v,t] of [['','Nicht bewertet'],['1','1 – Mag ich weniger'],['2','2 – Eher nicht'],['3','3 – Neutral'],['4','4 – Mag ich'],['5','5 – Lieblingshopfen']]){const o=el('option',t,select);o.value=v;}select.value=value===null?'':String(value);row.append(select);select.onchange=async()=>{select.disabled=true;try{await writeHop(name,select.value===''?null:Number(select.value));}catch(e){hopStatus.textContent='Fehler: '+e.message;drawHops();}finally{select.disabled=false;}};
 }
}
hopSearch.oninput=drawHops;hopFilter.onchange=drawHops;

// Read-only preference evidence; no changes to inventory or manual ratings.
function hopEvidenceKey(s){const k=hopKey(s);return ({'azaca':'azacca','bru1':'bru-1','nelson':'nelson sauvin','idaho7':'idaho 7','id7':'idaho 7'})[k]||k;}
function inferHopProfile(data){
 const beers=new Map();
 for(const b of [...data.stock,...data.archive]){const key=keyOf(b);if(!beers.has(key))beers.set(key,{hops:new Set(),sl:false,fav:false,again:false});const x=beers.get(key);for(const h of text(b.hops).split(/[,;\n]+/)){const k=hopEvidenceKey(h);if(k)x.hops.add(k);} }
 for(const b of data.stock)if(b.sl==='SL1')beers.get(keyOf(b)).sl=true;
 for(const b of data.archive){const x=beers.get(keyOf(b)),m=hopKey(b.mark);if(m==='favorit')x.fav=true;if(m==='nochmals')x.again=true;}
 const stats=new Map();let total=0,positive=0;
 for(const b of beers.values()){if(!b.hops.size)continue;total++;const signal=b.fav||b.again||b.sl;if(signal)positive++;for(const h of b.hops){if(!stats.has(h))stats.set(h,{name:h,n:0,yes:0,fav:0,again:0,sl:0});const s=stats.get(h);s.n++;s.yes+=Number(signal);s.fav+=Number(b.fav);s.again+=Number(b.again);s.sl+=Number(b.sl);}}
 const base=total?positive/total:0;return [...stats.values()].map(s=>({...s,rate:(s.yes+5*base)/(s.n+5),base})).sort((a,b)=>b.rate-a.rate||b.n-a.n||a.name.localeCompare(b.name));
}
const dna=el('section','',hopPanel);hopPanel.insertBefore(dna,hopSearch);
el('h2','My Hop DNA – automatisch',dna);
el('p','Aus SL1, Favoriten und Nochmals abgeleitet. Jede Biersorte zählt einmal, unabhängig von Menge oder Anzahl Verkostungen. Fehlende Markierung bedeutet nicht, dass ein Bier schlecht ist.',dna);
const dnaRows=el('div','',dna);
const dnaAll=document.createElement('input');dnaAll.type='checkbox';const dnaLabel=el('label',' Alle Hinweise anzeigen',dna);dnaLabel.prepend(dnaAll);
function drawDNA(){dnaRows.replaceChildren();const stats=inferHopProfile(state);const strong=stats.filter(s=>s.n>=3&&s.yes>=2&&s.rate>s.base);const rows=dnaAll.checked?stats:strong.slice(0,10);if(!rows.length)el('p','Noch keine ausreichend gestützten Hinweise.',dnaRows);for(const s of rows){const a=el('article','',dnaRows);el('strong',displayHop(s.name),a);el('div',`${s.yes} von ${s.n} verschiedenen Bieren mit positivem Signal`,a);el('small',`SL1: ${s.sl} · Favorit: ${s.fav} · Nochmals: ${s.again}${s.n<3?' · Wenige Daten':''}`,a);}el('p','Hinweise auf Zusammenhänge, keine isolierten Hopfenbewertungen. Schreibvarianten werden nur für die Analyse zusammengeführt. Manuelle Bewertungen bleiben separat und freiwillig.',dnaRows);}
dnaAll.onchange=drawDNA;
const oldDrawHops=drawHops;drawHops=function(){oldDrawHops();drawDNA();};hopSearch.oninput=drawHops;hopFilter.onchange=drawHops;

// Situation-based suggestions, never automatic assignments or consumption targets.
const ready=el('section','',$('main'));ready.hidden=true;$('main').insertBefore(ready,$('search'));
el('h2','Auswahl & Lagerung',ready);
el('p','Vorschläge aus deinem vorhandenen Bestand. SL1 bleibt geschützt. Trinkfenster sind grobe Aroma-Schätzungen ab Bestellung, keine Haltbarkeits- oder Konsumvorgaben. Hopfenprofil beeinflusst die Auswahl, nicht eine ungesicherte Haltbarkeitsformel.',ready);
const situation=document.createElement('select');for(const [v,t] of [['SL1','SL1'],['SL2','SL2'],['SL3','SL3'],['Frische','Frischeübersicht – unabhängig von SL']]){const o=el('option',t,situation);o.value=v;}ready.append(situation);
const readyRows=el('div','',ready);
btn('Auswahl & Lagerung',$('add').parentElement,()=>{ready.hidden=!ready.hidden;if(!ready.hidden){hopPanel.hidden=true;smart.hidden=true;drawReady();ready.scrollIntoView({block:'nearest'});}});
function affinity(b,stats){const keys=[...new Set(text(b.hops).split(/[,;\n]+/).map(hopEvidenceKey).filter(Boolean))];let sum=0,n=0;for(const k of keys){const manual=Object.values(state.hopProfile||{}).find(h=>h&&hopEvidenceKey(h.name)===k&&Number.isInteger(h.rating));const s=stats.get(k);if(manual){sum+=(manual.rating-3)/2;n++;}else if(s&&s.n>=3){sum+=Math.max(-1,Math.min(1,(s.rate-s.base)*4));n++;}}return n?sum/n:null;}
function preferredPlace(b,sl){if(sl==='SL3')return 'Kühlschrank';if(/ipa|pale ale|neipa|dipa|tipa|qipa|oat cream/i.test(b.style)||sl==='SL1')return ['Kühlschrank','Kühlschrank Garage'].includes(b.place)?b.place:'Kühlschrank Garage';return b.place==='Ungeklärt'?'Weinkühlschrank':b.place;}
function drawReady(){
 readyRows.replaceChildren();const sl=situation.value,stats=new Map(inferHopProfile(state).map(s=>[s.name,s]));const groups=new Map();
 for(const b of state.stock){const k=keyOf(b);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(b);}
 const candidates=[];let existing=0;
 for(const [k,all] of groups){const available=all.filter(b=>['Kühlschrank','Kühlschrank Garage','Weinkühlschrank'].includes(b.place));if(!available.length)continue;const b=available[0], assigned=all.find(x=>x.sl==='SL1')?'SL1':all.find(x=>x.sl==='SL2')?'SL2':all.find(x=>x.sl==='SL3')?'SL3':'';
 const qty=available.reduce((a,x)=>a+x.qty,0),byPlace={};for(const x of available)byPlace[x.place]=(byPlace[x.place]||0)+x.qty;const pair=Object.values(byPlace).some(q=>q>=2);const dates=available.map(daysLeft).filter(x=>x!==null),days=dates.length?Math.min(...dates):null,match=affinity(b,stats);const urgent=days!==null&&days<=14;const freshScore=days===null?0:days<=14?0.6:0.1;
 if(sl==='Frische'){if(!urgent&&!available.some(x=>x.planned&&x.planned<=today()))continue;}else if(assigned===sl){existing++;}else if(assigned)continue;else if(sl==='SL1'&&!(match!==null&&match>0.12))continue;else if(sl==='SL2'&&(!pair||match!==null&&match>0.12))continue;else if(sl==='SL3'&&(!urgent||match!==null&&match>0.12))continue;
 if(sl==='SL2'&&!pair)continue;
 const score=sl==='SL1'?(match??0)*4+freshScore:sl==='SL2'?(match===null?1:1-Math.abs(match))+freshScore:sl==='SL3'?freshScore+(qty===1?0.3:0)+(b.place==='Kühlschrank'?0.2:0)+(match??0):freshScore+(match??0);
 candidates.push({all,b,assigned,qty,pair,days,match,score,byPlace});}
 candidates.sort((a,b)=>Number(b.assigned===sl)-Number(a.assigned===sl)||b.score-a.score||a.b.name.localeCompare(b.b.name));
 el('p',sl==='Frische'?'Alle passenden Hinweise, unabhängig von Shortlists.':`${existing} bereits zugeordnet · Richtwert ca. 10 Sorten. Vorschläge nur für noch nicht zugeordnete Biere.`,readyRows);
 const limit=sl==='Frische'?Infinity:Math.max(0,10-existing);let proposed=0;
 for(const c of candidates){if(sl!=='Frische'&&c.assigned!==sl&&proposed++>=limit)continue;const {b,assigned,qty,days,match,byPlace}=c;const a=el('article','',readyRows);el('h2',((assigned==='SL1'||sl==='SL1')&&days!==null&&days<=14?'★ ':'')+b.name,a);el('div',`${b.brewery} · ${b.style} · ${qty}× · ${assigned||'Keine SL'}`,a);el('div',Object.entries(byPlace).map(([p,q])=>`${p}: ${q}×`).join(' · '),a);el('small',freshness(b),a);el('p',match===null?'Hopfenprofil: noch keine belastbaren Hinweise':match>0.12?'Hopfenprofil: positive Hinweise':'Hopfenprofil: keine klare positive Übereinstimmung',a);
 const target=preferredPlace(b,sl==='Frische'?assigned:sl);el('div','Lagerungsvorschlag: '+target,a);
 if(sl!=='Frische'&&!assigned)btn('Vorschlag '+sl+' übernehmen',a,()=>action(async()=>{const n=structuredClone(state);for(const x of n.stock.filter(x=>keyOf(x)===keyOf(b)))x.sl=sl;await save(n);drawReady();}));
 btn('Bearbeiten / Lagerort ändern',a,()=>edit(b));
 }
 if(!candidates.length)el('p','Keine passenden Einträge gefunden.',readyRows);
}
situation.onchange=drawReady;
const renderBase=render;render=function(){renderBase();if(!ready.hidden)drawReady();};
