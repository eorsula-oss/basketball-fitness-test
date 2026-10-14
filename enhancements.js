state.photos ||= {};state.groups ||= {};state.profiles.forEach(n=>state.groups[n]||='Sonstige');
const currentSeasonEntry=k=>{const d=String(k).slice(0,10);return d>=key(START)&&d<=key(END)};
const avatar=n=>{const photo=state.photos[n];return typeof photo==='string'&&/^data:image\/(?:jpeg|png|webp);base64,/i.test(photo)?`<img class="avatar" src="${photo}" alt="">`:'👤'};
const total=n=>Object.entries(state.done[n]||{}).reduce((s,[k,v])=>v&&currentSeasonEntry(k)?s+(exercise[+k.split('-').pop()]?.[2]||0):s,0);
const groupOrder=['U12.1','U14.1','Eltern','Sonstige'];
const baseRender=render;render=function(){
  baseRender();
  const groups=groupOrder.map(g=>{
    const members=[...state.profiles].filter(n=>state.groups[n]===g).sort((a,b)=>total(b)-total(a));
    return members.length?`<section class="rank-group"><h3>${esc(g)}</h3>${members.map((n,i)=>`<div class="rank"><b>${i+1}.</b>${avatar(n)}<strong>${esc(n)}</strong><strong>${total(n)} P</strong></div>`).join('')}</section>`:'';
  }).join('');
  $('#ranking').innerHTML=groups;
  $('#profileButton span').innerHTML=state.active?`${avatar(state.active)} ${esc(state.active)}`:'Profil anlegen';
};
async function removeGlobalProfile(n){
  const cfg=window.BASKETBALL_BACKUP_CONFIG,m=state.profileMeta?.[n];
  if(!cfg||!m||cfg.testMode)return;
  try{await fetch(`${cfg.url}/rest/v1/rpc/delete_fitness_ranking`,{method:'POST',headers:{apikey:cfg.key,Authorization:`Bearer ${cfg.key}`,'Content-Type':'application/json'},body:JSON.stringify({p_profile_id:m.id,p_owner_token:m.token})})}catch{}
}
function renameProfile(oldName){
  const newName=prompt('Neuer Name:',oldName)?.trim().replace(/\s+/g,' ');
  if(!validProfileName(newName)||newName===oldName)return;
  if(state.profiles.some(n=>normalizeProfileName(n)===normalizeProfileName(newName)))return alert('Dieser Name ist bereits vorhanden.');
  state.profiles=state.profiles.map(n=>n===oldName?newName:n);
  for(const bucket of ['done','groups','photos','profileMeta'])if(state[bucket]?.[oldName]!==undefined){state[bucket][newName]=state[bucket][oldName];delete state[bucket][oldName]}
  state.active=newName;store();profiles();render();
}
async function deleteProfile(n){
  if(!confirm(`${n} und den gesamten Fortschritt wirklich löschen?`))return;
  await removeGlobalProfile(n);
  state.profiles=state.profiles.filter(x=>x!==n);
  for(const bucket of ['done','groups','photos','profileMeta'])if(state[bucket])delete state[bucket][n];
  if(state.active===n)state.active=state.profiles[0]||'';
  store();profiles();render();
}
const baseProfiles=profiles;profiles=function(){
  baseProfiles();
  $('#photoName').textContent=state.active||'kein Profil';
  $('#groupSelect').disabled=!state.active;
  $('#photoInput').disabled=!state.active;
  if(state.active)$('#groupSelect').value=state.groups[state.active]||'Sonstige';
  document.querySelectorAll('.profile-row').forEach(row=>{
    const main=row.querySelector('button[data-name]'),n=main.dataset.name;
    main.innerHTML=`${avatar(n)} <span>${esc(n)}<small>${esc(state.groups[n]||'Sonstige')}</small></span>`;
    const edit=document.createElement('button');edit.type='button';edit.className='profile-action';edit.textContent='✏️';edit.setAttribute('aria-label',`${n} bearbeiten`);edit.onclick=()=>renameProfile(n);
    const del=document.createElement('button');del.type='button';del.className='profile-action danger-mini';del.textContent='🗑️';del.setAttribute('aria-label',`${n} löschen`);del.onclick=()=>deleteProfile(n);
    row.append(edit,del);
  });
};
$('#groupSelect').onchange=e=>{if(!state.active)return;state.groups[state.active]=e.target.value;store();profiles();render()};
const normalizeProfileName=value=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('de-DE');
async function matchingCloudProfiles(name,group){
  const cfg=window.BASKETBALL_BACKUP_CONFIG,wanted=normalizeProfileName(name);
  if(cfg?.testMode){
    const p=new URLSearchParams(location.search),testName=p.get('duplicateTestName'),testGroup=p.get('duplicateTestGroup')||'U12.1';
    return testName&&normalizeProfileName(testName)===wanted&&testGroup===group?[{profile_id:'00000000-0000-4000-8000-000000000001',display_name:testName,group_name:testGroup,total_points:0}]:[];
  }
  if(!cfg?.url||!cfg?.key)return[];
  const r=await fetch(`${cfg.url}/rest/v1/fitness_rankings?select=profile_id,display_name,group_name,total_points&order=updated_at.desc`,{headers:{apikey:cfg.key,Authorization:`Bearer ${cfg.key}`},cache:'no-store'});
  if(!r.ok)throw new Error('Dublettenprüfung nicht verfügbar');
  return(await r.json()).filter(row=>normalizeProfileName(row.display_name||'')===wanted&&row.group_name===group);
}
function createProfile(n,group){
  state.profiles.push(n);state.active=n;state.groups[n]=group;state.done[n]={};$('#newProfile').value='';store();profiles();render();
}
$('#addProfile').onclick=async function addProfile2(){
  const button=$('#addProfile'),n=$('#newProfile').value.trim().replace(/\s+/g,' '),group=$('#newGroup').value;
  if(!validProfileName(n))return alert('Bitte einen richtigen Namen eingeben. „Kind 1“ ist nicht zulässig.');
  const localMatch=state.profiles.find(existing=>normalizeProfileName(existing)===normalizeProfileName(n));
  if(localMatch)return alert(`Das Profil „${localMatch}“ ist auf diesem Gerät bereits vorhanden.`);
  button.disabled=true;
  try{
    const matches=await matchingCloudProfiles(n,group);
    if(matches.length){
      const answer=prompt(`In der Gruppe ${group} gibt es bereits ${matches.length===1?'ein Profil':'mehrere Profile'} mit dem Namen „${n}“.\n\nBitte zuerst den Wiederherstellungscode verwenden oder Eva fragen.\n\nNur wenn es wirklich ein anderes Kind ist, NEU eingeben:`,'');
      if(answer?.trim().toLocaleUpperCase('de-DE')!=='NEU')return;
    }
    createProfile(n,group);
  }catch{
    if(confirm('Die Online-Dublettenprüfung war gerade nicht möglich. Profil trotzdem neu anlegen?'))createProfile(n,group);
  }finally{button.disabled=false}
};
$('#photoInput').onchange=async function photoChange2(e){
  const f=e.target.files[0];if(!f||!state.active)return;
  const img=new Image();img.src=URL.createObjectURL(f);await img.decode();
  const c=document.createElement('canvas');c.width=c.height=180;const x=c.getContext('2d'),s=Math.min(img.width,img.height);
  x.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,180,180);
  state.photos[state.active]=c.toDataURL('image/jpeg',.75);URL.revokeObjectURL(img.src);store();profiles();render();e.target.value='';
};
normalizeSeasonState();store();render();
