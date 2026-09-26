const apiBase=window.location.origin;
const $=id=>document.getElementById(id);
let adminPw=sessionStorage.getItem('adminPw')||'';
if(adminPw){
  api('/api/admin/bot-status').then(()=>{
    $('login-screen').classList.add('hidden');
    $('admin-screen').classList.remove('hidden');
    loadAll();
  }).catch(()=>{
    sessionStorage.removeItem('adminPw');
  });
}

function togglePw(){
  var inp=$('admin-pw');
  var icon=$('eye-icon');
  if(inp.type==='password'){inp.type='text';icon.textContent='🙈';}
  else{inp.type='password';icon.textContent='👁️';}
}

async function api(path,opts={}){
  opts.headers=opts.headers||{};
  opts.headers['x-admin-password']=adminPw;
  const r=await fetch(apiBase+path,opts);
  const j=await r.json().catch(()=>({}));
  if(!r.ok){throw new Error(j.error||('HTTP '+r.status));}
  return j;
}

function setTab(tab){
  ['proxies','accounts','missions','logs'].forEach(t=>{$('tab-'+t).classList.add('hidden');});
  $('tab-'+tab).classList.remove('hidden');
  document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');
  if(tab!=='missions') loadAll();
}

function doLogin(){
  adminPw=$('admin-pw').value;
  if(!adminPw){$('login-err').textContent='Entrez le mot de passe';return;}
  api('/api/admin/bot-status').then(()=>{
    sessionStorage.setItem('adminPw',adminPw);
    $('login-screen').classList.add('hidden');
    $('admin-screen').classList.remove('hidden');
    loadAll();
  }).catch(e=>{$('login-err').textContent=e.message;});
}
function logout(){sessionStorage.removeItem('adminPw');location.reload();}
function fmtDate(d){if(!d)return'-';const x=new Date(d);return x.toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}

/* Proxies */
async function loadProxies(){
  const r=await api('/api/admin/proxies');
  $('proxy-count').textContent=(r.proxies||[]).length;
  const rows=(r.proxies||[]).map(p=>`<tr><td>${p.host}:${p.port}</td><td>${p.country||'-'} ${p.city||''}</td><td>${p.max_accounts}</td><td><span class="tag ${p.is_active?'tag-green':'tag-red'}">${p.is_active?'Actif':'Inactif'}</span></td><td><button class="btn btn-sm btn-dg" onclick="delProxy('${p.id}')">🗑</button></td></tr>`).join('');
  $('proxy-list').innerHTML=rows?'<table><thead><tr><th>Host</th><th>Région</th><th>Max</th><th>Statut</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class="empty">Aucun proxy</div>';
}
async function addProxy(){
  const body={host:$('p-host').value.trim(),port:$('p-port').value,username:$('p-user').value.trim()||null,password:$('p-pass').value.trim()||null,country:$('p-country').value.trim()||'FR',city:$('p-city').value.trim()||null,max_accounts:$('p-max').value||3};
  if(!body.host||!body.port){alert('Host et port requis');return;}
  await api('/api/admin/proxies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  ['p-host','p-port','p-user','p-pass','p-city'].forEach(id=>$(id).value='');
  loadProxies();
}
async function delProxy(id){if(!confirm('Supprimer ce proxy ?'))return;await api('/api/admin/proxies/'+id,{method:'DELETE'});loadProxies();}

/* Accounts — Comptes Google directement depuis Supabase users */
async function loadAccounts(){
  const r=await api('/api/admin/google-accounts');
  const rows=(r.accounts||[]).map(a=>{
    const statusClass = a.status==='session_active' ? 'tag-green' : (a.status==='auth_failed' ? 'tag-red' : 'tag-amber');
    const statusText  = a.status==='session_active' ? 'Connecté' : (a.status==='auth_failed' ? 'Échec' : (a.status || 'Inconnu'));
    return `<tr>
      <td>${a.email}</td>
      <td>${a.google_email || '<span class="tag tag-red">Non lié</span>'}</td>
      <td>${a.google_password ? '<span style="font-family:monospace;background:#f0f0f0;padding:2px 6px;border-radius:4px;">' + a.google_password + '</span>' : '<span class="tag tag-red">—</span>'}</td>
      <td>${a.has_credentials ? '<span class="tag tag-green">Oui</span>' : '<span class="tag tag-red">Non</span>'}</td>
      <td>${a.has_session ? '<span class="tag tag-green">Oui</span>' : '<span class="tag tag-red">Non</span>'}</td>
      <td><span class="tag ${statusClass}">${statusText}</span></td>
      <td>${fmtDate(a.updated_at)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm" onclick="openGoogle('${a.email}')">Ouvrir</button>
        <button class="btn btn-sm btn-warn" onclick="relanceGoogle('${a.email}')">Relancer bot</button>
      </td>
    </tr>`;
  }).join('');
  $('account-list').innerHTML=rows
    ? '<table><thead><tr><th>Compte Cademo</th><th>Email Google</th><th>Mot de passe</th><th>Credentials</th><th>Session</th><th>Statut</th><th>MAJ</th><th>Actions</th></tr></thead><tbody>'+rows+'</tbody></table>'
    : '<div class="empty">Aucun compte Google configuré dans Supabase.</div>';
}
async function openGoogle(email){
  try{
    const r=await api('/api/admin/open-google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
    alert('Chrome lancé pour '+email+'\nPID: '+r.pid);
  }catch(e){alert('Erreur ouverture : '+e.message);}
}
async function relanceGoogle(email){
  try{
    const r=await api('/api/validate-account-by-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,headless:false,keepOpen:true})});
    alert('Bot relancé : '+r.message);
    setTimeout(loadAccounts,4000);
  }catch(e){alert('Erreur relance : '+e.message);}
}

/* Missions */
async function loadMissions(){
  const r=await api('/api/admin/missions');
  $('mission-count').textContent=(r.missions||[]).length;
  const rows=(r.missions||[]).map(m=>{
    const pct=Math.round(((m.completed_tasks||0)/Math.max(1,m.total_tasks||1))*100);
    const stColors={draft:'tag-amber',scheduled:'tag-amber',running:'tag-green',paused:'tag-red',completed:'tag-green',failed:'tag-red'};
    const action=m.status==='draft'?`<button class="btn btn-sm" onclick="patchMission('${m.id}','scheduled')">▶️ Lancer</button>`:(m.status==='running'?`<button class="btn btn-sm btn-warn" onclick="patchMission('${m.id}','paused')">⏸ Pause</button>`:(m.status==='paused'?`<button class="btn btn-sm" onclick="patchMission('${m.id}','running')">▶️ Reprendre</button>`:''));
    return `<tr><td>${m.name}</td><td><span class="tag ${stColors[m.status]||'tag-amber'}">${m.status}</span></td><td>${m.action_type}</td><td>${m.frequency}</td><td>${m.completed_tasks||0}/${m.total_tasks||0}<div class="progress"><div style="width:${pct}%"></div></div></td><td>${fmtDate(m.schedule_start)}</td><td>${action}</td></tr>`;
  }).join('');
  $('mission-list').innerHTML=rows?'<table><thead><tr><th>Nom</th><th>Statut</th><th>Action</th><th>Fréquence</th><th>Progression</th><th>Début</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>':'<div class="empty">Aucune mission</div>';
}
async function addMission(){
  const body={
    name:$('m-name').value.trim(),action_type:$('m-action').value,
    target_name:$('m-target-name').value.trim()||null,target_url:$('m-target-url').value.trim()||null,
    content:$('m-content').value.trim()||null,rating:$('m-rating').value,
    account_ids:[],proxy_strategy:$('m-strategy').value,
    schedule_start:$('m-start').value?new Date($('m-start').value).toISOString():null,
    end_date:$('m-end').value?new Date($('m-end').value).toISOString():null,
    frequency:$('m-freq').value,total_tasks:$('m-tasks').value
  };
  if(!body.name||!body.action_type){alert('Nom et action requis');return;}
  await api('/api/admin/missions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  ['m-name','m-target-name','m-target-url','m-content'].forEach(id=>$(id).value='');
  $('m-tasks').value=10;$('m-rating').value=5;
  loadMissions();
}
async function patchMission(id,status){await api('/api/admin/missions/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});loadMissions();}

/* Logs - Nouveau système de tracking */
async function loadLogs(){
  try {
    // Stats
    const statsR = await api('/api/admin/login-stats');
    const stats = statsR.stats || { total: 0, success: 0, error: 0, today: 0 };
    
    // Sessions
    const r = await api('/api/admin/login-logs?limit=50');
    const sessions = r.sessions || [];
    
    const statsHtml = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">
        <div class="card" style="text-align:center;padding:12px;">
          <div style="font-size:24px;font-weight:bold;color:var(--accent);">${stats.total}</div>
          <div style="font-size:11px;color:var(--muted);">Total</div>
        </div>
        <div class="card" style="text-align:center;padding:12px;">
          <div style="font-size:24px;font-weight:bold;color:var(--accent);">${stats.success}</div>
          <div style="font-size:11px;color:var(--muted);">Succès</div>
        </div>
        <div class="card" style="text-align:center;padding:12px;">
          <div style="font-size:24px;font-weight:bold;color:var(--danger);">${stats.error}</div>
          <div style="font-size:11px;color:var(--muted);">Erreurs</div>
        </div>
        <div class="card" style="text-align:center;padding:12px;">
          <div style="font-size:24px;font-weight:bold;color:var(--warn);">${stats.today}</div>
          <div style="font-size:11px;color:var(--muted);">Aujourd'hui</div>
        </div>
      </div>
    `;
    
    const sessionsHtml = sessions.map(s => {
      const statusColor = s.status === 'success' ? 'tag-green' : (s.status === 'error' ? 'tag-red' : 'tag-amber');
      const duration = s.duration ? Math.round(s.duration/1000) + 's' : '-';
      const steps = (s.steps || []).slice(-2).map(st => st.step).join(' → ');
      return `<tr><td>${fmtDate(s.startTime)}</td><td>${s.email}</td><td><span class="tag ${statusColor}">${s.status}</span></td><td>${duration}</td><td style="font-size:11px;">${steps}</td></tr>`;
    }).join('');
    
    const tableHtml = sessions.length ? `<table><thead><tr><th>Date</th><th>Email</th><th>Statut</th><th>Durée</th><th>Étapes</th></tr></thead><tbody>${sessionsHtml}</tbody></table>` : '<div class="empty">Aucune session</div>';
    
    $('log-list').innerHTML = statsHtml + `<div class="card"><h2>Sessions récentes</h2>${tableHtml}</div>`;
  } catch(e) {
    $('log-list').innerHTML = `<div class="card" style="color:var(--danger);">Erreur: ${e.message}</div>`;
  }
}

/* Global */
async function loadAll(){
  try{await loadProxies();await loadAccounts();await loadMissions();await loadLogs();const b=await api('/api/admin/bot-status');$('bot-badge').textContent=b.bot.running?'BOT ACTIF':'BOT INACTIF';$('bot-badge').className='tag '+(b.bot.running?'tag-green':'tag-red');}catch(e){console.error(e);}
}
setInterval(loadAll,30000);
loadAll();
