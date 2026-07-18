state.photos ||= {};
state.groups ||= {};
state.profileMeta ||= {};
state.profiles.forEach(n=>state.groups[n]||='Sonstige');

const avatar=n=>state.photos[n]?`<img class="avatar" src="${state.photos[n]}" alt="">`:'👤';
const total=n=>Object.entries(state.done[n]||{}).reduce((s,[k,v])=>v?s+(exercise[+k.split('-').pop()]?.[2]||0):s,0);
const groupOrder=['U12.1','U14.1','Eltern','Sonstige'];
const normalizeName=n=>n.trim().toLocaleLowerCase('de-DE');
const validProfileName=n=>typeof n==='string'&&/^[\p{L}\p{N} .'-]{1,24}$/u.test(n.trim());
const validDoneKey=key=>{
  if(typeof key!=='string')return false;
  const match=key.match(/^(2026-\d{2}-\d{2})-(\d{1,2})$/);
  if(!match)return false;
  const id=Number(match[2]);
  return match[1]>='2026-07-18'&&match[1]<='2026-09-01'&&id>=0&&id<exercise.length;
};
const randomToken=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const ensureProfileMeta=n=>state.profileMeta[n]||=( {id:crypto.randomUUID(),token:randomToken()} );
state.profiles.forEach(ensureProfileMeta);

const baseRender=render;
render=function(){
  baseRender();
  const groups=groupOrder.map(g=>{
    const members=[...state.profiles].filter(n=>state.groups[n]===g).sort((a,b)=>total(b)-total(a));
    return members.length?`<section class="rank-group"><h3>${g}</h3>${members.map((n,i)=>`<div class="rank"><b>${i+1}.</b>${avatar(n)}<strong>${n}</strong><strong>${total(n)} P</strong></div>`).join('')}</section>`:'';
  }).join('');
  $('#ranking').innerHTML=groups;
  $('#profileButton span').innerHTML=`${avatar(state.active)} ${state.active}`;
};

async function removeGlobalProfile(n){
  const cfg=window.BASKETBALL_BACKUP_CONFIG,m=state.profileMeta?.[n];
  if(!cfg||!m)return;
  try{
    await fetch(`${cfg.url}/rest/v1/rpc/delete_fitness_ranking`,{
      method:'POST',
      headers:{apikey:cfg.key,Authorization:`Bearer ${cfg.key}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_profile_id:m.id,p_owner_token:m.token})
    });
  }catch{}
}

function renameProfile(oldName){
  const newName=prompt('Neuer Name:',oldName)?.trim();
  if(!newName||newName===oldName)return;
  if(!validProfileName(newName))return alert('Bitte nur Buchstaben, Zahlen, Leerzeichen, Punkt, Bindestrich oder Apostroph verwenden.');
  if(state.profiles.some(n=>n!==oldName&&normalizeName(n)===normalizeName(newName)))return alert('Dieser Name ist bereits vorhanden.');
  state.profiles=state.profiles.map(n=>n===oldName?newName:n);
  for(const key of ['done','groups','photos','profileMeta'])if(state[key]?.[oldName]!==undefined){
    state[key][newName]=state[key][oldName];
    delete state[key][oldName];
  }
  state.active=newName;
  store();
  profiles();
  render();
}

async function deleteProfile(n){
  if(state.profiles.length===1)return alert('Mindestens ein Profil muss erhalten bleiben.');
  if(!confirm(`${n} und den gesamten Fortschritt wirklich löschen?`))return;
  await removeGlobalProfile(n);
  state.profiles=state.profiles.filter(x=>x!==n);
  for(const key of ['done','groups','photos','profileMeta'])if(state[key])delete state[key][n];
  if(state.active===n)state.active=state.profiles[0];
  store();
  profiles();
  render();
}

const baseProfiles=profiles;
profiles=function(){
  baseProfiles();
  $('#photoName').textContent=state.active;
  $('#groupSelect').value=state.groups[state.active]||'Sonstige';
  document.querySelectorAll('.profile-row').forEach(row=>{
    const main=row.querySelector('button[data-name]'),n=main.dataset.name;
    main.innerHTML=`${avatar(n)} <span>${n}<small>${state.groups[n]||'Sonstige'}</small></span>`;
    const edit=document.createElement('button');
    edit.type='button';
    edit.className='profile-action';
    edit.textContent='✏️';
    edit.onclick=()=>renameProfile(n);
    const del=document.createElement('button');
    del.type='button';
    del.className='profile-action danger-mini';
    del.textContent='🗑️';
    del.onclick=()=>deleteProfile(n);
    row.append(edit,del);
  });
};

$('#groupSelect').onchange=e=>{
  state.groups[state.active]=e.target.value;
  store();
  profiles();
  render();
};

$('#addProfile').onclick=()=>{
  const n=$('#newProfile').value.trim(),group=$('#newGroup').value;
  if(!n)return;
  if(!validProfileName(n))return alert('Bitte nur Buchstaben, Zahlen, Leerzeichen, Punkt, Bindestrich oder Apostroph verwenden.');
  const duplicate=state.profiles.find(existing=>normalizeName(existing)===normalizeName(n));
  if(duplicate){
    const sameGroup=(state.groups[duplicate]||'Sonstige')===group;
    return alert(sameGroup
      ?`${duplicate} ist in der Gruppe ${group} bereits vorhanden. Bitte „Vorhandenes Profil wiederherstellen“ verwenden.`
      :`${duplicate} ist bereits als Profil vorhanden. Bitte zuerst prüfen, ob es dasselbe Kind ist.`);
  }
  state.profiles.push(n);
  state.active=n;
  state.groups[n]=group;
  ensureProfileMeta(n);
  $('#newProfile').value='';
  store();
  profiles();
  render();
};

$('#photoInput').onchange=async e=>{
  const f=e.target.files[0];
  if(!f)return;
  const img=new Image();
  img.src=URL.createObjectURL(f);
  await img.decode();
  const c=document.createElement('canvas');
  c.width=c.height=180;
  const x=c.getContext('2d'),s=Math.min(img.width,img.height);
  x.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,180,180);
  state.photos[state.active]=c.toDataURL('image/jpeg',.75);
  URL.revokeObjectURL(img.src);
  store();
  profiles();
  render();
  e.target.value='';
};

const encodeUtf8=value=>btoa(String.fromCharCode(...new TextEncoder().encode(value))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decodeUtf8=value=>new TextDecoder().decode(Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0)));

function createPersonalRecoveryCode(n){
  const meta=ensureProfileMeta(n);
  const payload={
    v:1,
    id:meta.id,
    token:meta.token,
    name:n,
    group:state.groups[n]||'Sonstige',
    done:Object.entries(state.done[n]||{}).filter(([,checked])=>checked).map(([key])=>key),
    created:new Date().toISOString()
  };
  return `BFP1.${encodeUtf8(JSON.stringify(payload))}`;
}

function parsePersonalRecoveryCode(raw){
  const code=raw.trim();
  if(code.length>20000)throw new Error('length');
  if(!code.startsWith('BFP1.'))throw new Error('prefix');
  const payload=JSON.parse(decodeUtf8(code.slice(5)));
  if(payload.v!==1||!validProfileName(payload.name))throw new Error('name');
  if(!groupOrder.includes(payload.group))throw new Error('group');
  if(typeof payload.id!=='string'||!/^[0-9a-f-]{36}$/i.test(payload.id))throw new Error('id');
  if(typeof payload.token!=='string'||payload.token.length<20||payload.token.length>100)throw new Error('token');
  if(!Array.isArray(payload.done)||payload.done.length>exercise.length*46||payload.done.some(key=>!validDoneKey(key)))throw new Error('done');
  return payload;
}

function restorePersonalProfile(code){
  let payload;
  try{payload=parsePersonalRecoveryCode(code)}catch{return alert('Dieser persönliche Wiederherstellungscode ist nicht gültig.');}
  const sameId=state.profiles.find(n=>state.profileMeta?.[n]?.id===payload.id);
  const sameName=state.profiles.find(n=>normalizeName(n)===normalizeName(payload.name));
  if(sameName&&!sameId)return alert(`${sameName} ist bereits als anderes Profil vorhanden. Es wurde keine Dublette angelegt.`);
  const target=sameId||payload.name.trim();
  if(!sameId)state.profiles.push(target);
  state.done[target]||={};
  payload.done.forEach(key=>state.done[target][key]=true);
  state.groups[target]=payload.group;
  state.profileMeta[target]={id:payload.id,token:payload.token};
  state.active=target;
  store();
  profiles();
  render();
  $('#restoreProfileDialog').close();
  $('#profileDialog').close();
  alert(`${target} wurde wiederhergestellt. Vorhandene Häkchen blieben erhalten.`);
}

function loadQrLibrary(){
  if(window.QRCode)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-qrcode-library]');
    if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}
    const script=document.createElement('script');
    script.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.integrity='sha512-CNgIRecGo7nphbeZ04Sc13ka07paqdeTu0WR1IM4kNcpmBAUSHSQX0FslNhTDadL4O5SAGapGt4FodqL8My0mA==';
    script.crossOrigin='anonymous';
    script.referrerPolicy='no-referrer';
    script.dataset.qrcodeLibrary='';
    script.onload=resolve;
    script.onerror=reject;
    document.head.append(script);
  });
}

const recoveryDialog=document.createElement('dialog');
recoveryDialog.id='personalRecoveryDialog';
recoveryDialog.innerHTML=`<form method="dialog" class="recovery-form">
  <div class="dialog-head"><h2>🔐 Persönlicher Profilcode</h2><button class="close-x" aria-label="Schließen">×</button></div>
  <p>Dieser Code gehört zu <strong id="recoveryProfileName"></strong>. Privat aufbewahren und nach neuen Einträgen bei Bedarf neu speichern.</p>
  <div id="personalQr" class="personal-qr" aria-label="Persönlicher QR-Code"></div>
  <label>Persönlicher Wiederherstellungscode<textarea id="personalRecoveryCode" readonly></textarea></label>
  <button id="copyPersonalCode" type="button">Code kopieren</button>
  <button id="sharePersonalCode" type="button">QR-Link teilen</button>
  <small id="personalRecoveryStatus">Der QR-Link nutzt ein privates URL-Fragment und wird nicht an GitHub übertragen. Fotos sind nicht enthalten.</small>
  <button>Schließen</button>
</form>`;
document.body.append(recoveryDialog);

const restoreDialog=document.createElement('dialog');
restoreDialog.id='restoreProfileDialog';
restoreDialog.innerHTML=`<form method="dialog" class="recovery-form">
  <div class="dialog-head"><h2>Profil wiederherstellen</h2><button class="close-x" aria-label="Schließen">×</button></div>
  <p>Persönlichen Code einfügen oder den QR-Code mit der Handykamera öffnen.</p>
  <label>Wiederherstellungscode<textarea id="personalRestoreInput" placeholder="BFP1.…"></textarea></label>
  <button id="confirmPersonalRestore" type="button">Profil wiederherstellen</button>
  <small>Ein vorhandenes Profil mit derselben Profil-ID wird zusammengeführt. Eine namensgleiche Dublette wird nicht angelegt.</small>
  <button>Abbrechen</button>
</form>`;
document.body.append(restoreDialog);

const recoveryActions=document.createElement('section');
recoveryActions.className='profile-recovery-actions';
recoveryActions.innerHTML=`<h3>Profil sichern oder wiederherstellen</h3>
  <button id="showPersonalRecovery" type="button">🔐 Persönlichen QR-/Wiederherstellungscode anzeigen</button>
  <button id="restorePersonalProfile" type="button">♻️ Vorhandenes Profil wiederherstellen</button>`;
document.querySelector('.profile-form .new-child').before(recoveryActions);

let currentPersonalCode='';
$('#showPersonalRecovery').onclick=async()=>{
  currentPersonalCode=createPersonalRecoveryCode(state.active);
  $('#recoveryProfileName').textContent=state.active;
  $('#personalRecoveryCode').value=currentPersonalCode;
  $('#personalQr').replaceChildren();
  recoveryDialog.showModal();
  const restoreUrl=`${location.origin}${location.pathname}#restore=${encodeURIComponent(currentPersonalCode)}`;
  try{
    await loadQrLibrary();
    new QRCode($('#personalQr'),{text:restoreUrl,width:210,height:210,colorDark:'#571018',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  }catch{$('#personalQr').textContent='QR-Code konnte offline nicht geladen werden. Der Textcode kann weiterhin kopiert werden.';}
};

$('#copyPersonalCode').onclick=async()=>{
  try{await navigator.clipboard.writeText(currentPersonalCode);$('#personalRecoveryStatus').textContent='Code wurde kopiert. Bitte privat aufbewahren.';}
  catch{$('#personalRecoveryCode').select();document.execCommand('copy');$('#personalRecoveryStatus').textContent='Code wurde kopiert. Bitte privat aufbewahren.';}
};

$('#sharePersonalCode').onclick=async()=>{
  const restoreUrl=`${location.origin}${location.pathname}#restore=${encodeURIComponent(currentPersonalCode)}`;
  if(navigator.share)try{await navigator.share({title:`Basketball Fitness – ${state.active}`,text:'Privater Profil-Wiederherstellungslink',url:restoreUrl});}catch{}
  else try{await navigator.clipboard.writeText(restoreUrl);$('#personalRecoveryStatus').textContent='QR-Link wurde kopiert.';}catch{}
};

$('#restorePersonalProfile').onclick=()=>{profiles();$('#personalRestoreInput').value='';restoreDialog.showModal();};
$('#confirmPersonalRestore').onclick=()=>restorePersonalProfile($('#personalRestoreInput').value);

const hashParams=new URLSearchParams(location.hash.slice(1));
const recoveryFromHash=hashParams.get('restore');
if(recoveryFromHash){
  history.replaceState(null,'',location.pathname+location.search);
  setTimeout(()=>{
    $('#personalRestoreInput').value=recoveryFromHash;
    restoreDialog.showModal();
  },0);
}

store();
render();
