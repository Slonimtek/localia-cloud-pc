/* Localía · portal en vivo. Todo lo que se ve acá llama a la infraestructura real. */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COUNTRY_NAMES={US:'Estados Unidos',BR:'Brasil',AR:'Argentina',UY:'Uruguay',IL:'Israel',ES:'España',CL:'Chile',MX:'México',PE:'Perú',CO:'Colombia',PY:'Paraguay',DE:'Alemania',GB:'Reino Unido'};
const cname=c=>COUNTRY_NAMES[c]||c||'?';
const KASM='resize=remote&reconnect=true&reconnect_delay=2000&clipboard_seamless=true&idle_disconnect=240';
const directUrl=pc=>`https://${pc.host}/?${KASM}`;

/* ---------- estado ---------- */
const S={cfg:null,user:null,pcs:[],pc:null,ops:null,wiz:{exits:['AR'],active:'AR',tier:'mini',name:'Mi PC'},tab:'resumen',timers:[],busy:false};

/* ---------- API ---------- */
async function api(path,opts={}){
  const r=await fetch(path,{credentials:'include',headers:{'Content-Type':'application/json'},...opts,body:opts.body?JSON.stringify(opts.body):undefined});
  let j={};try{j=await r.json()}catch(e){}
  if(!r.ok){const e=new Error(j.error||('Error '+r.status));e.status=r.status;throw e}
  return j;
}

/* ---------- íconos y sello (mismo diseño que el mockup) ---------- */
const P=d=>`<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ico={
 check:P('<path d="M5 12.5l4.2 4.2L19 7"/>'),
 shield:P('<path d="M12 3l7 3v5.5c0 4.4-3 8.1-7 9.5-4-1.4-7-5.1-7-9.5V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>'),
 monitor:P('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>'),
 globe:P('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5S9.5 6.1 12 3.5z"/>'),
 link:P('<path d="M9 15l6-6"/><path d="M11 6l1-1a4 4 0 015.7 5.7l-1 1M13 18l-1 1a4 4 0 01-5.7-5.7l1-1"/>'),
 arrow:P('<path d="M5 12h14M13 6l6 6-6 6"/>'),
 back:P('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
 power:P('<path d="M12 3v8"/><path d="M6.3 7.2a7.5 7.5 0 1011.4 0"/>'),
 restart:P('<path d="M4.5 12a7.5 7.5 0 102.2-5.3"/><path d="M4 4.5v4h4"/>'),
 plus:P('<path d="M12 5v14M5 12h14"/>'),
 trash:P('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
 full:P('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
 exit:P('<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/><path d="M10 8l-4 4 4 4M6 12h10"/>'),
 alert:P('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.1"/>'),
 info:P('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.1"/>'),
 cpu:P('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3"/>'),
 moon:P('<path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z"/>'),
 pin:P('<path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
 lock:P('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>'),
 home:P('<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>'),
 copy:P('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>'),
 scissors:P('<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5L20 17M8 15.5L20 7"/>'),
};
const logo=()=>`<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.5c-6.4 0-11.5 5-11.5 11.2C4.5 21.6 16 29.5 16 29.5s11.5-7.9 11.5-15.8C27.5 7.5 22.4 2.5 16 2.5z" fill="var(--sky)"/><rect x="9.6" y="8.2" width="12.8" height="8.6" rx="1.8" fill="#fff"/><rect x="13.2" y="18.4" width="5.6" height="1.8" rx=".9" fill="#fff"/></svg>`;
const TODAY=new Date();const SD=[TODAY.getDate(),TODAY.getMonth()+1,TODAY.getFullYear()%100].map(n=>String(n).padStart(2,'0')).join('·');
let sid=0;
function stamp(code,name,city,size){const id='sp'+(++sid);const txt=`LOCALÍA · ${String(name).toUpperCase()} · ${String(city).toUpperCase()} · `;
 return `<svg class="stamp" viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true"><g filter="url(#ink)"><defs><path id="${id}" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0"/></defs>
 <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="60" cy="60" r="33" fill="none" stroke="currentColor" stroke-width="1.4"/>
 <text font-family="JetBrains Mono,monospace" font-size="8.6" font-weight="600" letter-spacing=".8" fill="currentColor"><textPath href="#${id}" xlink:href="#${id}" textLength="268" lengthAdjust="spacing">${esc(txt)}</textPath></text>
 <text x="60" y="67" text-anchor="middle" font-family="Bricolage Grotesque,sans-serif" font-weight="800" font-size="25" fill="currentColor">${esc(code)}</text>
 <text x="60" y="80" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="6.8" fill="currentColor">${SD}</text></g></svg>`}
const ex=code=>(S.cfg&&S.cfg.exits.find(x=>x.code===code))||{code,name:cname(code),city:''};
const exStamp=(code,size)=>{const e=ex(code);return stamp(e.country||code,e.name,e.city,size)};
const D=()=>!!(S.cfg&&S.cfg.direct);   // modo directo: sin salidas por país, la PC sale desde su ubicación
const provider=()=>(S.cfg&&S.cfg.cloud&&S.cfg.cloud.label)||'la nube';
function clock(tz){try{return new Intl.DateTimeFormat('es-UY',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date())}catch(e){return '--:--'}}
const ago=iso=>{if(!iso)return '';const s=(Date.now()-Date.parse(iso))/1000;if(s<60)return 'recién';if(s<3600)return `hace ${Math.round(s/60)} min`;if(s<86400)return `hace ${Math.round(s/3600)} h`;return new Date(iso).toLocaleDateString('es-UY')};
const bytes=b=>b>1e9?(b/1e9).toFixed(1)+' GB':b>1e6?(b/1e6).toFixed(1)+' MB':b>1e3?Math.round(b/1e3)+' kB':b+' B';

/* ---------- UI común ---------- */
function toast(msg,bad){const t=document.createElement('div');t.className='toast';t.innerHTML=`${bad?ico.alert:ico.check}<span>${esc(msg)}</span>`;$('#toast-root').appendChild(t);setTimeout(()=>t.remove(),4200)}
function openModal(html){$('#modal-root').innerHTML=`<div class="modal-bg" data-bg><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`}
function closeModal(){$('#modal-root').innerHTML=''}
function ribbon(){const r=parse().r;const items=[['inicio','Inicio'],['armar','Crear PC'],['panel','Mi panel']];if(S.user&&S.user.admin)items.push(['operacion','Operación']);
 $('#rib').innerHTML=`<span class="live-dot"><i></i>En vivo</span>`+items.map(([k,l])=>`<a href="#${k}${k==='armar'?'/1':''}" class="${r===k?'on':''}">${l}</a>`).join('')+(S.user?`<span class="rib-sep">·</span><a href="#salir" data-act="logout">Salir (${esc(S.user.name)})</a>`:`<span class="rib-sep">·</span><a href="#entrar" class="${r==='entrar'?'on':''}">Entrar</a>`);
 const rb=$('.ribbon');if(rb)document.documentElement.style.setProperty('--rib',rb.offsetHeight+'px')}
function topbar(){return `<header class="top"><div class="wrap top-in"><a class="brand" href="#inicio">${logo()}<b>Localía</b><small>by Slonimtek</small></a>
 <nav class="top-nav">${S.user?`<a class="lnk" href="#panel">Mi panel</a>`:`<a class="lnk" href="#entrar">Entrar</a>`}<button class="icon-btn" data-act="theme" aria-label="Cambiar tema">${ico.moon}</button><a class="btn btn-primary btn-sm" href="#armar/1">Crear mi PC</a></nav></div></header>`}
const stPill=st=>{const m={running:['st-on','Prendida'],stopped:['st-off','Apagada'],pending:['st-busy','Prendiendo…'],stopping:['st-busy','Apagando…'],'shutting-down':['st-busy','Borrando…'],terminated:['st-off','Borrada']}[st]||['st-busy',st||'…'];return `<span class="st-pill ${m[0]}"><i></i>${m[1]}</span>`};
function idLine(pc){const id=pc.identity;if(!id)return '<span class="muted">Sin chequear todavía</span>';
 if(!id.online)return `<span style="color:var(--bad);font-weight:600">${ico.alert} Sin internet</span> <span class="muted sm">(${ago(id.at)})</span>`;
 const ok=id.country===pc.active;return `<span class="okt" style="${ok?'':'color:var(--warn)'}">${ok?ico.check:ico.alert} ${esc(id.city||'?')}, ${esc(cname(id.country))}</span> <span class="mono sm muted">${esc(id.ip)}</span> <span class="muted sm">· ${ago(id.at)}</span>`}

/* ---------- inicio ---------- */
function vHome(){const e=S.cfg?S.cfg.exits.filter(x=>x.available):[];
 return `${topbar()}
 <section class="hero"><div class="wrap hero-in">
  <div class="hero-copy"><div class="eyebrow">Slonimtek · Localía · demo en vivo</div>
   <h1>${D()?'Tu computadora en la nube, <em>lista en minutos.</em>':'Tu computadora en tu país, <em>estés donde estés.</em>'}</h1>
   <p class="lead">${D()?'Esto no es un mockup: cada PC es una computadora real en la nube, en la ubicación que elijas. La abrís desde el navegador, sin instalar nada, y queda siempre igual a como la dejaste.':'Esto no es un mockup: cada PC es una computadora real en la nube, cerca tuyo, que sale a internet por el país que elijas con una IP de ahí. La abrís desde el navegador y cambiás de país en un clic.'}</p>
   <div class="cta-row"><a class="btn btn-primary btn-lg" href="#armar/1">Crear mi PC ${ico.arrow}</a>${S.user?`<a class="btn btn-ghost btn-lg" href="#panel">Ir a mi panel</a>`:`<a class="btn btn-ghost btn-lg" href="#entrar">Entrar</a>`}</div>
   <ul class="proof">${D()?`<li>${ico.check} Ubicaciones hoy: ${e.map(x=>esc(x.city)).join(', ')||'…'}</li><li>${ico.check} Subí y bajá archivos con un botón</li>`:`<li>${ico.check} Países disponibles hoy: ${e.map(x=>esc(x.name)).join(', ')||'…'}</li><li>${ico.check} Corte automático real</li>`}<li>${ico.check} Sin instalar nada</li></ul></div>
  <div class="hero-vis"><div class="flow" style="grid-template-columns:1fr;margin:0">
   <div class="fn"><span class="k">Vos</span><b>Donde estés</b><small>abrís tu PC en una pestaña</small></div>
   <div class="fa" style="flex-direction:row;max-width:none;justify-content:flex-start;padding-left:16px;text-align:left">${ico.arrow}<span>escritorio remoto cifrado</span></div>
   <div class="fn"><span class="k">Tu PC</span><b>${D()?e.map(x=>esc(x.city)).join(' · ')||'…':'AWS · Virginia'}</b><small>${D()?'la ubicación la elegís vos':'Linux con escritorio y navegador'}</small></div>
${D()?`<div class="fa" style="flex-direction:row;max-width:none;justify-content:flex-start;padding-left:16px;text-align:left">${ico.arrow}<span>internet directo</span></div>
   <div class="fn hl"><span class="k">Internet</span><b>Sale desde su ubicación</b><small>con su propia IP</small></div>`:`<div class="fa" style="flex-direction:row;max-width:none;justify-content:flex-start;padding-left:16px;text-align:left">${ico.arrow}<span>túnel WireGuard · corte automático</span></div>
   <div class="fn hl"><span class="k">Salida</span><b>${e.map(x=>esc(x.city)).join(' · ')||'…'}</b><small>los sitios te ven ahí</small></div>`}</div></div>
 </div></section>
 <section class="sec"><div class="wrap"><div class="sec-head"><div class="eyebrow">Cómo se prueba</div><h2>Tres pasos, de punta a punta.</h2></div>
  <div class="steps3">
   <div class="st"><span class="n">01</span><h3>Creá tu PC</h3><p>${D()?'Elegí dónde la querés y el tamaño.':'Elegí el tamaño y confirmá.'} En unos minutos está prendida, de verdad.</p></div>
   <div class="st"><span class="n">02</span>${D()?'<h3>Abrila desde el navegador</h3><p>Abre directo en una página de inicio, sin menús raros. Desde tu compu, tu tablet o tu celular.</p>':'<h3>Abrila y mirá tu IP</h3><p>Se abre sola en "¿Desde dónde me ven?". Probá ipinfo.io o browserleaks: te ven en el país elegido.</p>'}</div>
   <div class="st"><span class="n">03</span>${D()?'<h3>Pasá tus archivos</h3><p>Subí un archivo desde tu compu o bajate lo que descargaste en la PC, con un botón.</p>':'<h3>Elegí tu país desde adentro</h3><p>Con el ícono "Cambiar país" de tu PC. En segundos sale por otro país, sin reiniciar nada.</p>'}</div>
  </div></div></section>
 <footer class="foot"><div class="wrap foot-in"><div class="brand">${logo()}<b>Localía</b><small>by Slonimtek</small></div><p>Demo en vivo por invitación. Precios y pagos: modo demo, no se cobra nada.</p></div></footer>`}

/* ---------- entrar ---------- */
function vAuth(){const mode=S.authMode||'login';
 return `${topbar()}<main class="wrap"><div class="card auth">
  <div class="eyebrow">${mode==='login'?'Entrar':'Crear cuenta'}</div><h2>${mode==='login'?'Hola de nuevo':'Sumate al demo'}</h2>
  <p class="sub">${S.back?'Entrá y te llevamos directo al escritorio de tu PC.':mode==='login'?'Entrá para ver y manejar tus PCs.':'Necesitás el código de invitación que te pasó Slonimtek.'}</p>
  <form class="form" id="authForm">
   ${mode==='signup'?'<label>Nombre<input name="name" autocomplete="name" required></label>':''}
   <label>Email<input name="email" type="email" autocomplete="email" required></label>
   <label>Contraseña<input name="password" type="password" autocomplete="${mode==='login'?'current-password':'new-password'}" minlength="8" required></label>
   ${mode==='signup'?'<label>Código de invitación<input name="invite" autocomplete="off" required></label>':''}
   <button class="btn btn-primary" type="submit">${mode==='login'?'Entrar':'Crear cuenta'} ${ico.arrow}</button>
  </form><div id="authErr"></div>
  <p class="sm" style="margin-top:16px">${mode==='login'?'¿No tenés cuenta? <a href="#entrar" data-act="auth-mode" data-m="signup">Creá una con tu invitación</a>':'¿Ya tenés cuenta? <a href="#entrar" data-act="auth-mode" data-m="login">Entrá</a>'}</p>
 </div></main>`}

/* ---------- crear PC ---------- */
const wsteps=()=>D()?['Ubicación','Tamaño','Confirmar']:['Tamaño','Confirmar'];
function vWizard(n){const w=S.wiz;const exits=S.cfg.exits;const WSTEPS=wsteps();const N=WSTEPS.length;n=Math.min(N,Math.max(1,n));const step=WSTEPS[n-1];const loc=D()?ex(w.location):null;
 let body='';
 if(step==='Ubicación'){body=`<div class="step-head"><div class="eyebrow">Paso ${n} de ${N} · Ubicación</div><h2>¿Dónde querés tu PC?</h2><p class="sub">Elegí la más cercana a vos para que el escritorio vaya fluido. Tu PC sale a internet desde ahí, y no se puede mudar después.</p></div>
  <div class="tiers" style="margin-top:20px">${exits.map(x=>`<button class="tier${w.location===x.code?' on':''}" data-act="w-loc" data-code="${x.code}" ${x.available?'':'disabled style="opacity:.55;cursor:not-allowed"'}><span class="tier-name">${esc(x.city)}</span><span class="tier-for mono">${esc(x.name)}</span>${!x.available?'<span class="tier-sel ghost">Próximamente</span>':w.location===x.code?`<span class="tier-sel">${ico.check} Elegida</span>`:'<span class="tier-sel ghost">Elegir</span>'}</button>`).join('')}</div>`}
 if(step==='Tamaño'){body=`<div class="step-head"><div class="eyebrow">Paso ${n} de ${N} · Tamaño</div><h2>¿Qué tan potente la querés?</h2></div>
  <div class="tiers" style="margin-top:20px">${Object.entries(S.cfg.tiers).map(([k,t])=>`<button class="tier t-${k}${w.tier===k?' on':''}" data-act="w-tier" data-tier="${k}"><span class="tier-name">${t.name}</span><span class="tier-for mono">${t.type}</span>
   <span class="tier-specs mono"><span>${t.cpu} vCPU</span><span>${t.ram} GB RAM</span><span>${t.disk} GB SSD</span></span>${w.tier===k?`<span class="tier-sel">${ico.check} Elegida</span>`:'<span class="tier-sel ghost">Elegir</span>'}</button>`).join('')}</div>`}
 if(step==='Confirmar'){const t=S.cfg.tiers[w.tier];body=`<div class="step-head"><div class="eyebrow">Paso ${n} de ${N} · Confirmar</div><h2>Todo listo para crearla</h2><p class="sub">Al confirmar se prende una máquina real en ${esc(provider())}. Tarda unos minutos.${D()?'':' El país desde donde te ven lo elegís después, adentro de tu PC, con el ícono "Cambiar país".'}</p></div>
  <div class="form" style="grid-template-columns:1fr;max-width:420px"><label>Nombre de tu PC<input id="pcName" value="${esc(w.name)}" maxlength="40"></label></div>
  <div class="lines"><div><span>PC ${t.name} (${t.type})</span><span class="mono">${t.cpu} vCPU · ${t.ram} GB</span></div>${D()?`<div><span>Ubicación</span><span>${esc(loc.city)}, ${esc(loc.name)}</span></div>`:'<div><span>País de identidad</span><span>lo elegís adentro de tu PC</span></div>'}<div><span>Verificación de identidad y pago</span><span class="mono">modo demo</span></div>${S.cfg.idleStopMin>0?`<div><span>Se apaga sola si no la usás</span><span class="mono">${S.cfg.idleStopMin} min</span></div>`:'<div><span>Siempre prendida</span><span>abre al instante</span></div>'}</div>
  <div class="cta-row" style="margin:22px 0 8px"><button class="btn btn-primary btn-lg" data-act="create" id="createBtn">${ico.power} Crear mi PC</button></div><div id="createErr"></div>`}
 return `${topbar()}<main class="wrap wiz"><nav class="stepper">${WSTEPS.map((s,i)=>`<a class="stp${i+1===n?' on':''}${i+1<n?' done':''}" href="#armar/${i+1}"><span class="n">${i+1<n?'✓':i+1}</span>${s}</a>`).join('')}</nav>
  <div class="wiz-grid"><section class="wiz-main">${body}<div class="wiz-nav"><a class="btn btn-ghost" href="${n>1?'#armar/'+(n-1):'#inicio'}">${ico.back} ${n>1?'Atrás':'Inicio'}</a>${n<N?`<a class="btn btn-primary" href="#armar/${n+1}" style="display:inline-flex">Siguiente: ${WSTEPS[n]} ${ico.arrow}</a>`:''}</div></section>
  <aside class="card sum"><div class="sum-head"><div><div class="eyebrow">Tu PC</div><h3>${esc(S.cfg.tiers[w.tier].name)}</h3></div></div>
   ${D()?`<dl><div><dt>Tu PC está en</dt><dd>${esc(loc.city)}, ${esc(loc.name)}</dd></div><div><dt>Tamaño</dt><dd>${S.cfg.tiers[w.tier].name}</dd></div></dl>
   <ul class="sum-inc"><li>${ico.check} Abre directo en el navegador</li><li>${ico.check} Subí y bajá archivos con un botón</li><li>${ico.check} Nadie entra a tu PC desde internet</li></ul>`:`<dl><div><dt>Tu PC está en</dt><dd>AWS Virginia</dd></div><div><dt>Tamaño</dt><dd>${S.cfg.tiers[w.tier].name}</dd></div><div><dt>País de identidad</dt><dd>lo elegís adentro</dd></div><div><dt>Disponibles hoy</dt><dd>${S.cfg.exits.filter(x=>x.available).map(x=>esc(x.name)).join(' · ')}</dd></div></dl>
   <ul class="sum-inc"><li>${ico.check} Corte automático: nunca sale por otro país</li><li>${ico.check} DNS por el túnel</li><li>${ico.check} Escritorio en el navegador</li></ul>`}</aside></div></main>`}

/* ---------- armando ---------- */
const PSTEPS=[['reserving','Reservando la máquina'],['tunnel','Preparando la conexión'],['booting','Prendiendo la PC'],['desktop','Arrancando el escritorio'],['ready','Chequeo final']];
function vBuilding(){const pc=S.pc;if(!pc)return `${topbar()}<main class="build"><div class="card build-card"><p>Cargando…</p></div></main>`;
 const P=pc.provision||{steps:[]};const idx=PSTEPS.findIndex(s=>s[0]===P.step);const done=P.done;
 return `${topbar()}<main class="build"><div class="card build-card">
  <div class="build-stamp${done?' stamped':''}">${exStamp(pc.active,130)}</div>
  <div class="build-head"><div class="eyebrow">${done?'Lista':P.error?'Error':'Armando tu PC · en vivo'}</div><h2>${done?(D()?'¡Listo! Tu PC está prendida':`¡Listo! Te ven en ${esc(pc.activeName)}`):'Estamos armando tu PC'}</h2><p class="sub">${P.error?esc(P.error):done?(D()?'Abrila: arranca directo en el navegador.':'Abrila y mirá tu IP: se abre sola en "¿Desde dónde me ven?".'):'Esto pasa de verdad. Tarda unos minutos.'}</p></div>
  <div class="bar"><span style="width:${done?100:Math.max(6,(idx+.5)/PSTEPS.length*100)}%"></span></div>
  <ol class="bsteps">${PSTEPS.map(([k,l],i)=>{const st=P.steps.filter(s=>s.step===k).pop();const cls=done||i<idx?'done':i===idx?'now':'';return `<li class="${cls}"><span class="bi"></span><span>${st?esc(st.text):l}</span></li>`}).join('')}</ol>
  ${done?`<div class="cta-row" style="margin:22px 0 0"><a class="btn btn-primary" href="#pc/${pc.id}">${ico.monitor} Abrir mi PC</a><a class="btn btn-ghost" href="#panel">Ir a mi panel</a></div>`:''}
 </div></main>`}

/* ---------- la PC en el navegador ---------- */
function idChip(pc){const id=pc.identity;return !id?`<span class="idchip wait">${ico.globe} chequeando…</span>`:!id.online?`<span class="idchip bad">${ico.alert} sin internet</span>`:`<span class="idchip${id.country===(pc.expect||pc.active)?'':' bad'}">${ico.check} ${esc(id.city||'')}, ${esc(id.country)} · <span class="mono">${esc(id.ip)}</span></span>`}
function vSession(){const pc=S.pc;if(!pc)return '<div class="ses"><div class="center-msg"><div>Cargando…</div></div></div>';
 const e=ex(pc.active);const running=pc.state==='running'&&pc.desktop==='active';
 return `<div class="ses"><div class="ses-bar">
  <a class="brand" href="#panel">${logo()}<b>Localía</b></a>
  <span class="ses-chip hide-m">${ico.monitor} ${esc(pc.name)} · ${esc(pc.place||'')}</span>
  ${pc.exits.length>1?`<label class="ses-sel"><span>Te ven en</span><select data-chg="exit" aria-label="País por donde salís a internet">${pc.exits.map(c=>`<option value="${c}" ${c===pc.active?'selected':''}>${esc(ex(c).name)}</option>`).join('')}</select></label>`:''}
  <span id="idchip">${idChip(pc)}</span>
  <span class="ses-sp"></span>
  <button class="ses-btn" data-act="check">${ico.shield}<span>Verificar IP</span></button>
  <button class="ses-btn" data-act="fullscreen">${ico.full}<span>Pantalla completa</span></button>
  <a class="ses-btn" href="${directUrl(pc)}" target="_blank" rel="noopener">${ico.link}<span>Link directo</span></a>
  <a class="ses-btn exit" href="#panel">${ico.exit}<span>Salir</span></a></div>
  <div class="desk wall" id="desk" style="display:flex">
   ${running?`<iframe class="pc-frame" id="pcFrame" src="${directUrl(pc)}" allow="clipboard-read; clipboard-write; fullscreen; keyboard-map" allowfullscreen title="Escritorio de ${esc(pc.name)}"></iframe>`
   :`<div class="center-msg"><div>${exStamp(pc.active,96)}<h3 style="font-size:20px;color:#fff">${pc.state==='stopped'?'Tu PC está apagada':pc.state==='running'?'Arrancando el escritorio…':'Tu PC está '+esc(pc.state)}</h3>${pc.state==='stopped'?`<button class="btn btn-primary" data-act="pc-start" data-id="${pc.id}">${ico.power} Prenderla</button>`:'<p style="color:#9fb2c9">Esto se actualiza solo.</p>'}</div></div>`}
  </div></div>`}

/* ---------- panel ---------- */
function pcCardFull(pc){const e=ex(pc.active);const busy=['pending','stopping','shutting-down'].includes(pc.state);
 const P=pc.provision;const provisioning=P&&!P.done&&!P.error;
 return `<section class="pcrow"><div class="pcd-head"><div><h2>${esc(pc.name)} ${stPill(pc.state)}</h2>
  <div class="pcd-meta"><span class="chip">${ico.monitor} ${esc(provider())} ${esc(pc.place||'')}${D()?', '+esc(pc.activeName||''):''} · ${esc(pc.tierName)} (${pc.specs.type})</span>${D()?'':`<span class="chip">${ico.link} Túnel con corte automático</span>`}</div>
  ${pc.exits.length>1?`<div class="exit-switch"><span>Te ven en</span><div class="seg">${pc.exits.map(c=>`<button class="${c===pc.active?'on':''}" data-act="set-exit" data-id="${pc.id}" data-code="${c}">${esc(ex(c).name)}</button>`).join('')}</div>
</div>`:''}
  <p style="margin-top:12px;font-size:14.5px">${ico.globe} <b>Así te ven ahora:</b> ${idLine(pc)}</p></div>
  <div class="pcd-act">${provisioning?`<a class="btn btn-primary" href="#armando/${pc.id}">Ver cómo se arma</a>`:`<a class="btn btn-primary" href="#pc/${pc.id}" ${pc.state!=='running'?'':''}>${ico.monitor} Abrir mi PC</a>`}
   ${pc.state==='stopped'?`<button class="btn btn-ghost btn-sm" data-act="pc-start" data-id="${pc.id}">${ico.power} Prender</button>`:`<button class="btn btn-ghost btn-sm" data-act="pc-stop" data-id="${pc.id}" ${pc.state!=='running'||busy?'disabled':''}>${ico.power} Apagar</button>`}
   <button class="btn btn-ghost btn-sm" data-act="pc-reboot" data-id="${pc.id}" ${pc.state!=='running'?'disabled':''}>${ico.restart} Reiniciar</button>
   <button class="btn btn-ghost btn-sm" data-act="pc-check" data-id="${pc.id}" ${pc.state!=='running'?'disabled':''}>${ico.shield} Verificar IP</button>
   <button class="btn btn-ghost btn-sm" data-act="pc-delete" data-id="${pc.id}">${ico.trash} Borrar</button></div></div>
  <div class="tab-body direct"><div><h3>${ico.link} Acceso directo, sin pasar por el portal</h3>
   <p class="sm muted">Tu PC tiene su propia dirección. Abrila desde cualquier compu o celular: te pide entrar una vez y va directo al escritorio${D()?'':', con un botón para cambiar de país'}. Guardala en favoritos o instalala como app.</p>
   <div class="cmd"><span class="dlink">${esc(directUrl(pc).split('?')[0])}</span></div>
   <div class="cta-row" style="margin:12px 0 0"><button class="btn btn-ghost btn-sm" data-act="copy-link" data-url="${esc(directUrl(pc))}">${ico.copy} Copiar link</button><a class="btn btn-ghost btn-sm" href="${directUrl(pc)}" target="_blank" rel="noopener">${ico.monitor} Abrir a pantalla completa</a></div>
   <details class="tbl" style="margin-top:12px"><summary>Cómo instalarla como app</summary><ul class="steps-ol" style="list-style:disc"><li><b>Compu (Chrome o Edge):</b> abrí el link y tocá el ícono de instalar en la barra de direcciones (o menú ⋮ → "Instalar").</li><li><b>iPhone o iPad (Safari):</b> abrí el link → Compartir → "Agregar a inicio".</li><li><b>Android (Chrome):</b> abrí el link → menú ⋮ → "Agregar a la pantalla principal".</li></ul></details></div>
   <div class="qrbox"><div class="qr-slot" data-url="${esc(directUrl(pc))}"></div><small class="muted">Escaneala con el celular</small></div></div>
  <div class="tab-body winapp"${D()?' style="display:none"':''}><div><h3>${ico.monitor} Con la app de escritorio remoto de Microsoft</h3>
   <p class="sm muted">Entrá a tu PC con <b>Windows App</b> (Windows, Mac, iPhone, iPad o Android). Es el mismo escritorio que ves en el navegador. Por seguridad, el acceso se habilita solo para la red donde estás, por 12 horas.</p></div>
   <button class="btn btn-primary btn-sm" data-act="rdp" data-id="${pc.id}" ${pc.state!=='running'?'disabled title="Prendé la PC primero"':''}>${ico.monitor} Conectar con Windows App</button></div>
  <div class="tab-body" style="border-top:1px solid var(--line)"><h3 style="font-size:15px;font-family:var(--font);font-weight:700;margin-bottom:6px">Actividad</h3><ul class="feed">${(pc.events||[]).slice(0,6).map(e=>`<li><time>${ago(e.at)}</time><span>${esc(e.text)}</span></li>`).join('')||'<li><span class="muted">Sin actividad todavía.</span></li>'}</ul></div></section>`}
function vPanel(){if(!S.user)return vAuth();
 const n=S.pcs.length;
 return `${topbar()}<main class="wrap app-main"><div class="app-head"><div><div class="eyebrow">Mi panel · en vivo</div><h1>Hola, ${esc(S.user.name)}</h1><p>${n?`Tenés ${n} PC${n>1?'s':''}. Todo lo que ves acá es real.`:'Todavía no tenés PCs.'}</p></div>${n<S.cfg.limits.perUser?`<a class="btn btn-primary btn-sm" href="#armar/1">${ico.plus} Crear una PC</a>`:''}</div>
 ${S.pcs.map(pcCardFull).join('')||`<div class="card" style="padding:28px;text-align:center"><p class="sub" style="margin:0 auto 14px">Creá tu primera PC: tarda unos 3 minutos.</p><a class="btn btn-primary" href="#armar/1">Crear mi PC ${ico.arrow}</a></div>`}
 <p class="fine">Se apagan solas tras ${S.cfg.idleStopMin} minutos sin uso, para no gastar de más.</p></main>`}

/* ---------- operación ---------- */
function vOps(){const o=S.ops;if(!S.user||!S.user.admin)return `${topbar()}<main class="wrap app-main"><p>Solo para el equipo de Slonimtek.</p></main>`;
 if(!o)return `${topbar()}<main class="wrap app-main"><p>Cargando…</p></main>`;
 const running=o.pcs.filter(p=>p.state==='running').length;const reg=o.exits.filter(x=>x.registered&&!x.off);const healthy=reg.filter(x=>x.healthy).length;
 return `<header class="app-bar dark"><div class="wrap top-in"><a class="brand" href="#inicio">${logo()}<b>Localía</b><span class="int-badge">Operación · en vivo</span></a><div class="top-nav"><button class="icon-btn" data-act="ops-refresh" aria-label="Actualizar">${ico.restart}</button></div></div></header>
 <main class="wrap app-main">
 <div class="kpis"><div class="kpi"><div class="l">PCs</div><div class="v">${o.pcs.length}</div><div class="s">${running} prendidas</div></div><div class="kpi"><div class="l">Salidas sanas</div><div class="v">${healthy}/${reg.length}</div><div class="s">${o.exits.length-reg.length?`+ ${o.exits.length-reg.length} por conectar`:'túnel con handshake reciente'}</div></div><div class="kpi"><div class="l">Cuentas</div><div class="v">${o.users}</div><div class="s">por invitación</div></div><div class="kpi"><div class="l">Datos por salidas</div><div class="v">${bytes(o.exits.reduce((a,b)=>a+(b.rx||0)+(b.tx||0),0))}</div><div class="s">desde el último reinicio</div></div><div class="kpi"><div class="l">Fugas</div><div class="v">${o.events.filter(e=>/fuga/.test(e.text)&&e.kind==='bad').length}</div><div class="s">en pruebas de corte</div></div></div>
 <section class="box" style="margin-bottom:16px"><h3>${ico.globe} Salidas por país</h3><p class="sm muted">"Probar corte" baja el túnel unos segundos y verifica que las PCs de ese país se queden sin internet en vez de salir por otro lado.</p>
 <div class="tbl-wrap"><table class="ops-t"><thead><tr><th>País</th><th>Estado</th><th>IP pública</th><th>Ubicación real (ipinfo)</th><th class="num">Último handshake</th><th class="num">Datos</th><th class="num">PCs</th><th></th></tr></thead><tbody>
 ${o.exits.map(x=>`<tr><td><span class="cty"><span class="c">${x.code}</span>${esc(x.name)}</span></td>
  <td>${x.off?'<span class="sev sev-info" style="min-width:0">apagada</span>':!x.registered?'<span class="sev sev-info" style="min-width:0">sin conectar</span>':x.healthy?'<span class="sev" style="min-width:0;background:var(--ok-soft);color:var(--ok)">'+ico.check+' sana</span>':'<span class="sev sev-warn" style="min-width:0">'+ico.alert+' caída</span>'} ${x.ec2&&x.ec2!=='running'?`<span class="muted sm">(${esc(x.ec2)})</span>`:''}</td>
  <td class="mono sm">${esc(x.publicIp||'—')}</td><td>${x.geo&&x.geo.city?`${esc(x.geo.city)}, ${esc(x.geo.country)} <span class="muted sm">${esc((x.geo.org||'').replace(/^AS\d+\s*/,''))}</span>`:'—'}</td>
  <td class="num">${x.kind==='gateway'?'directo':x.handshakeAge==null?'—':x.handshakeAge+' s'}</td><td class="num">${bytes((x.rx||0)+(x.tx||0))}</td><td class="num">${x.pcs}</td>
  <td style="white-space:nowrap">${x.kind==='gateway'?'<span class="muted sm">sale por el gateway</span>':''}${x.registered&&x.kind!=='gateway'?`<button class="btn btn-ghost" data-act="ops-cut" data-code="${x.code}">${ico.scissors} Probar corte</button>`:''} ${x.instanceId?(x.off||x.ec2==='stopped'?`<button class="btn btn-ghost" data-act="ops-exit" data-code="${x.code}" data-op="start">Prender</button>`:`<button class="btn btn-ghost" data-act="ops-exit" data-code="${x.code}" data-op="stop">Apagar</button>`):''} ${x.kind==='home'?`<button class="btn btn-ghost" data-act="ops-token" data-code="${x.code}">${ico.home} ${x.registered?'Reconectar':'Conectar'} salida en casa</button>`:''}</td></tr>`).join('')}
 </tbody></table></div></section>
 <section class="box" style="margin-bottom:16px"><h3>${ico.monitor} PCs</h3><div class="tbl-wrap"><table class="ops-t"><thead><tr><th>PC</th><th>Cuenta</th><th>Estado</th><th>IP privada</th><th>Te ven en</th><th>Chequeo</th></tr></thead><tbody>
 ${o.pcs.map(p=>`<tr><td><b>${esc(p.name)}</b> <span class="muted mono sm">${p.id} · ${p.specs.type}</span></td><td class="sm">${esc(p.user)}</td><td>${stPill(p.state)}</td><td class="mono sm">${esc(p.privateIp||'—')}</td><td>${esc(p.activeName)}</td><td class="sm">${idLine(p)}</td></tr>`).join('')||'<tr><td colspan="6" class="muted">Sin PCs.</td></tr>'}
 </tbody></table></div></section>
 <section class="box"><h3>Eventos</h3><ul class="feed">${o.events.slice(0,25).map(e=>`<li><time>${ago(e.at)}</time><span>${e.kind==='bad'?'⚠️ ':e.kind==='ok'?'✅ ':''}${esc(e.text)}</span></li>`).join('')}</ul></section></main>`}

/* ---------- QR del acceso directo ---------- */
let qrLib=null;
function drawQRs(){const slots=$$('.qr-slot');if(!slots.length)return;
 const draw=()=>slots.forEach(el=>{try{const q=qrcode(0,'M');q.addData(el.dataset.url);q.make();el.innerHTML=q.createSvgTag({cellSize:4,margin:2,scalable:true})}catch(e){}});
 if(window.qrcode)return draw();
 if(!qrLib){qrLib=new Promise(r=>{const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';sc.onload=r;document.head.appendChild(sc)})}
 qrLib.then(draw)}

/* ---------- router ---------- */
function parse(){const h=(location.hash||'#inicio').slice(1);const [r,a]=h.split('/');return{r:r||'inicio',a}}
function clearTimers(){S.timers.forEach(t=>clearInterval(t));S.timers=[]}
function every(fn,ms){const t=setInterval(fn,ms);S.timers.push(t);return t}
async function route(){clearTimers();closeModal();const {r,a}=parse();const app=$('#app');ribbon();
 const needAuth=['armar','armando','pc','panel','operacion'].includes(r);
 if(needAuth&&!S.user){S.authMode='login';S.after=location.hash;app.innerHTML=vAuth();bindAuth();return}
 if(r==='entrar'){if(a)S.back=a;app.innerHTML=vAuth();bindAuth();return}
 if(r==='armar'){const n=Math.min(wsteps().length,Math.max(1,+a||1));app.innerHTML=vWizard(n);window.scrollTo(0,0);return}
 if(r==='armando'){S.pc=null;app.innerHTML=vBuilding();await loadPc(a);app.innerHTML=vBuilding();every(async()=>{await loadPc(a);if(parse().r==='armando')app.innerHTML=vBuilding();if(S.pc&&S.pc.provision&&(S.pc.provision.done||S.pc.provision.error))clearTimers()},3000);return}
 if(r==='pc'){S.pc=null;app.innerHTML=vSession();await loadPc(a);app.innerHTML=vSession();checkIdentity(false);
  every(async()=>{const was=S.pc&&S.pc.state+'/'+S.pc.desktop;await loadPc(a);const is=S.pc&&S.pc.state+'/'+S.pc.desktop;if(was!==is&&parse().r==='pc')app.innerHTML=vSession()},6000);return}
 if(r==='panel'){await loadPcs();app.innerHTML=vPanel();drawQRs();every(async()=>{await loadPcs();if(parse().r==='panel'&&!S.busy){app.innerHTML=vPanel();drawQRs()}},8000);return}
 if(r==='operacion'){S.ops=null;app.innerHTML=vOps();await loadOps();app.innerHTML=vOps();every(async()=>{await loadOps();if(parse().r==='operacion'&&!S.busy)app.innerHTML=vOps()},10000);return}
 app.innerHTML=vHome();
}
async function loadPc(id){try{S.pc=(await api('/api/pcs/'+id)).pc}catch(e){if(e.status===401){S.user=null;route()}else toast(e.message,true)}}
async function loadPcs(){try{S.pcs=(await api('/api/pcs')).pcs}catch(e){toast(e.message,true)}}
async function loadOps(){try{S.ops=await api('/api/ops')}catch(e){toast(e.message,true)}}
async function checkIdentity(showToast){if(!S.pc)return;const chip=$('#idchip');if(chip)chip.innerHTML=`<span class="idchip wait">${ico.globe} chequeando…</span>`;
 try{const r=await api(`/api/pcs/${S.pc.id}/identity`);S.pc=r.pc;S.pc.identity=r.identity;if(parse().r==='pc'){const c=$('#idchip');if(c)c.innerHTML=idChip(S.pc)}
  if(showToast&&r.identity)toast(r.identity.online?`Te ven en ${r.identity.city||'?'}, ${cname(r.identity.country)} (${r.identity.ip})`:'La PC no tiene internet ahora mismo',!r.identity.online)}catch(e){toast(e.message,true)}}
function bindAuth(){const f=$('#authForm');if(!f)return;f.addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));const btn=f.querySelector('button');btn.disabled=true;
 try{const r=await api(S.authMode==='signup'?'/api/signup':'/api/login',{method:'POST',body:d});S.user=r.user;toast(`Hola, ${S.user.name}`);if(S.back){location.href=`https://pc-${S.back}.${S.cfg.base}/?${KASM}`;return}location.hash=S.after&&S.after!=='#entrar'?S.after:'#panel';S.after=null;route()}
 catch(err){$('#authErr').innerHTML=`<div class="err">${esc(err.message)}</div>`;btn.disabled=false}})}
window.addEventListener('hashchange',route);

/* ---------- acciones ---------- */
async function pcAction(id,action,msg){S.busy=true;try{await api(`/api/pcs/${id}/${action}`,{method:'POST',body:{}});if(msg)toast(msg)}catch(e){toast(e.message,true)}S.busy=false;await loadPcs();if(parse().r==='panel')$('#app').innerHTML=vPanel()}
async function switchExit(id,code){
 const desk=$('#desk');if(desk)desk.insertAdjacentHTML('beforeend',`<div class="switching" id="swOv"><div>${exStamp(code,96)}<b>Cambiando tu salida a ${esc(ex(code).name)}…</b><small>Tu PC no sale a internet hasta que el túnel nuevo esté listo.</small></div></div>`);
 try{const r=await api(`/api/pcs/${id}/exit`,{method:'POST',body:{code}});if(S.pc&&S.pc.id===id)S.pc=r.pc;
  let id2=null;for(let k=0;k<6;k++){await new Promise(r=>setTimeout(r,2000));try{const q=await api(`/api/pcs/${id}/identity`);id2=q.identity;if(S.pc&&S.pc.id===id){S.pc=q.pc;S.pc.identity=id2}if(id2&&id2.online&&id2.country===code)break}catch(e){}}
  const o=$('#swOv');if(o)o.remove();
  if(parse().r==='pc'){const c=$('#idchip');if(c)c.innerHTML=idChip(S.pc)}
  toast(id2&&id2.online?`Listo: ahora te ven en ${id2.city||'?'}, ${cname(id2.country)} (${id2.ip})`:`Cambiado a ${ex(code).name}. El chequeo tarda un poco más: probá "Verificar IP".`,!(id2&&id2.online))}
 catch(e){const o=$('#swOv');if(o)o.remove();toast(e.message,true)}}
const A={
 theme:()=>{const cur=document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');const nx=cur==='dark'?'light':'dark';document.documentElement.dataset.theme=nx;try{localStorage.setItem('localia-theme',nx)}catch(e){}},
 'auth-mode':el=>{S.authMode=el.dataset.m;$('#app').innerHTML=vAuth();bindAuth()},
 logout:async()=>{await api('/api/logout',{method:'POST',body:{}}).catch(()=>{});S.user=null;location.hash='#inicio';route()},
 'w-exit':el=>{const c=el.dataset.code;const w=S.wiz;if(w.exits.includes(c)){if(w.exits.length>1){w.exits=w.exits.filter(x=>x!==c);if(w.active===c)w.active=w.exits[0]}}else{w.exits.push(c);if(w.exits.length===1)w.active=c}$('#app').innerHTML=vWizard(1)},
 'w-active':el=>{S.wiz.active=el.dataset.code;$('#app').innerHTML=vWizard(1)},
 'w-tier':el=>{S.wiz.tier=el.dataset.tier;location.hash='#armar/'+wsteps().length},
 'w-loc':el=>{S.wiz.location=el.dataset.code;location.hash='#armar/2'},
 create:async el=>{const nm=$('#pcName');if(nm)S.wiz.name=nm.value||'Mi PC';el.disabled=true;el.innerHTML=`${ico.restart} Creando…`;
  try{const r=await api('/api/pcs',{method:'POST',body:S.wiz});location.hash='#armando/'+r.pc.id}catch(e){$('#createErr').innerHTML=`<div class="err">${esc(e.message)}</div>`;el.disabled=false;el.innerHTML=`${ico.power} Crear mi PC`}},
 check:()=>checkIdentity(true),
 'pc-start':el=>pcAction(el.dataset.id,'start','Prendiendo tu PC: tarda menos de un minuto.'),
 'pc-stop':el=>pcAction(el.dataset.id,'stop','Apagando tu PC. Tus archivos quedan guardados.'),
 'pc-reboot':el=>pcAction(el.dataset.id,'reboot','Reiniciando tu PC.'),
 'pc-check':async el=>{S.busy=true;el.disabled=true;el.innerHTML=`${ico.restart} Chequeando…`;try{const r=await api(`/api/pcs/${el.dataset.id}/identity`);const i=r.identity;toast(i&&i.online?`Te ven en ${i.city||'?'}, ${cname(i.country)} (${i.ip})`:'Sin internet ahora mismo',!(i&&i.online))}catch(e){toast(e.message,true)}S.busy=false;await loadPcs();$('#app').innerHTML=vPanel()},
 'pc-delete':el=>{const pc=S.pcs.find(p=>p.id===el.dataset.id);openModal(`<h3>¿Borrar "${esc(pc&&pc.name)}"?</h3><p>Se borra la máquina con todo lo que tenga adentro. No se puede deshacer.</p><div class="modal-act"><button class="btn btn-ghost" data-act="close-modal">Cancelar</button><button class="btn btn-primary" style="background:var(--bad)" data-act="do-delete" data-id="${el.dataset.id}">Sí, borrarla</button></div>`)},
 'do-delete':el=>{closeModal();pcAction(el.dataset.id,'delete','PC borrada.')},
 'set-exit':async el=>{S.busy=true;try{await api(`/api/pcs/${el.dataset.id}/exit`,{method:'POST',body:{code:el.dataset.code}});toast(`Ahora sale por ${ex(el.dataset.code).name}. Verificando…`);await new Promise(r=>setTimeout(r,2500));await api(`/api/pcs/${el.dataset.id}/identity`).catch(()=>{})}catch(e){toast(e.message,true)}S.busy=false;await loadPcs();$('#app').innerHTML=vPanel()},
 'add-exit':async el=>{try{await api(`/api/pcs/${el.dataset.id}/exits`,{method:'POST',body:{code:el.dataset.code}});toast(`Sumaste ${ex(el.dataset.code).name}.`)}catch(e){toast(e.message,true)}await loadPcs();$('#app').innerHTML=vPanel()},
 'close-modal':()=>closeModal(),
 'ops-refresh':async()=>{await loadOps();$('#app').innerHTML=vOps()},
 'ops-cut':async el=>{S.busy=true;const c=el.dataset.code;el.disabled=true;el.innerHTML=`${ico.scissors} Cortando…`;
  try{const r=await api(`/api/ops/exits/${c}/cut`,{method:'POST',body:{}});openModal(`<h3>Prueba de corte · ${esc(ex(c).name)}</h3><p>${r.tested?`Cortamos el túnel y chequeamos ${r.tested} PC(s) que salían por ${esc(ex(c).name)}:`:'No hay PCs prendidas saliendo por este país: la prueba bajó y subió el túnel sin nadie afectado.'}</p>
   ${r.results.map(x=>`<p style="margin-top:8px">${x.online?`<b style="color:var(--bad)">⚠️ PC ${x.pc}: SALIÓ por ${esc(x.ip)} (${esc(x.country)})</b>`:`<b class="okt">${ico.check} PC ${x.pc}: sin internet durante el corte</b> <span class="muted">— no salió por otro lado</span>`}</p>`).join('')}
   <p class="note">${ico.info}<span>El túnel ya se restableció. ${r.leaked?'Hubo fugas: revisar.':'Cero fugas.'}</span></p><div class="modal-act"><button class="btn btn-primary" data-act="close-modal">Listo</button></div>`)}
  catch(e){toast(e.message,true)}S.busy=false;await loadOps();$('#app').innerHTML=vOps()},
 'ops-exit':async el=>{try{await api(`/api/ops/exits/${el.dataset.code}/${el.dataset.op}`,{method:'POST',body:{}});toast(el.dataset.op==='start'?'Prendiendo la salida…':'Apagando la salida…')}catch(e){toast(e.message,true)}await loadOps();$('#app').innerHTML=vOps()},
 'ops-token':async el=>{try{const r=await api(`/api/ops/exits/${el.dataset.code}/token`,{method:'POST',body:{}});openModal(`<h3>Conectar la salida de ${esc(ex(el.dataset.code).name)}</h3>
   <p>En una compu con Linux, una Raspberry Pi o un VPS en ${esc(ex(el.dataset.code).city)}, abrí una terminal y pegá esto. La compu "llama" al gateway: no hace falta abrir puertos en el router.</p>
   <div class="cmd"><span id="cmdTxt">${esc(r.command)}</span></div><div class="modal-act"><button class="btn btn-ghost" data-act="copy-cmd">${ico.copy} Copiar</button><button class="btn btn-primary" data-act="close-modal">Listo</button></div><p class="fine">El código sirve una sola vez.</p>`)}catch(e){toast(e.message,true)}},
 fullscreen:()=>{const f=$('#pcFrame')||$('#desk');try{document.fullscreenElement?document.exitFullscreen():f.requestFullscreen()}catch(e){}},
 'copy-link':el=>{navigator.clipboard&&navigator.clipboard.writeText(el.dataset.url).then(()=>toast('Link copiado')).catch(()=>toast(el.dataset.url))},
 rdp:async el=>{S.busy=true;el.disabled=true;const old=el.innerHTML;el.innerHTML=`${ico.restart} Habilitando…`;
  try{const r=(await api(`/api/pcs/${el.dataset.id}/rdp`,{method:'POST',body:{}})).rdp;const until=new Date(r.until).toLocaleTimeString('es-UY',{hour:'2-digit',minute:'2-digit'});
   openModal(`<h3>Conectar con Windows App</h3><p class="okbox">${ico.check} Listo: tu red (<span class="mono">${esc(r.network)}</span>) puede entrar hasta las ${until}.</p>
   <ol class="steps-ol" style="margin-top:14px;gap:10px">
    <li><b>Instalá Windows App</b> (gratis, de Microsoft): <a href="https://apps.microsoft.com/detail/9n1f85v9t8bn" target="_blank" rel="noopener">Windows</a> · <a href="https://apps.apple.com/app/windows-app/id1295203466" target="_blank" rel="noopener">Mac</a> · <a href="https://apps.apple.com/app/windows-app-mobile/id714464092" target="_blank" rel="noopener">iPhone/iPad</a> · <a href="https://play.google.com/store/apps/details?id=com.microsoft.rdc.androidx" target="_blank" rel="noopener">Android</a>. En Windows también sirve "Conexión a Escritorio remoto", que ya viene instalada.</li>
    <li><b>Abrí tu PC:</b> bajá el archivo de conexión y abrilo con Windows App.<div class="cta-row" style="margin:8px 0 0"><a class="btn btn-ghost btn-sm" href="/api/pcs/${el.dataset.id}/rdp-file">${ico.link} Bajar archivo .rdp</a></div>
     <span class="sm muted">O agregala a mano: "Agregar PC" → nombre <span class="mono">${esc(r.address)}</span>, usuario <span class="mono">${esc(r.username)}</span>.</span></li>
    <li><b>Contraseña:</b> <span class="cmd" style="display:inline-flex;margin:4px 0 0"><span id="rdpPw">${esc(r.password)}</span></span> <button class="btn btn-ghost btn-sm" data-act="copy-link" data-url="${esc(r.password)}">${ico.copy} Copiar</button></li>
   </ol>
   <p class="note">${ico.info}<span>La primera vez, la app avisa que no puede verificar el certificado de la PC: tocá "Continuar". Si cambiás de red (otro wifi o el celular), volvé a tocar "Conectar con Windows App".</span></p>
   <div class="modal-act"><button class="btn btn-primary" data-act="close-modal">Listo</button></div>`)}
  catch(e){toast(e.message,true)}el.disabled=false;el.innerHTML=old;S.busy=false},
 'copy-cmd':()=>{const t=$('#cmdTxt').textContent;navigator.clipboard&&navigator.clipboard.writeText(t).then(()=>toast('Copiado')).catch(()=>{})},
};
document.addEventListener('click',e=>{if(e.target.matches('[data-bg]')){closeModal();return}const el=e.target.closest('[data-act]');if(!el||el.disabled)return;const f=A[el.dataset.act];if(f){e.preventDefault();f(el,e)}});
document.addEventListener('change',e=>{const el=e.target.closest('[data-chg]');if(el&&el.dataset.chg==='exit'&&S.pc)switchExit(S.pc.id,el.value)});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
try{const t=localStorage.getItem('localia-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}

/* ---------- arranque ---------- */
(async()=>{try{S.cfg=await api('/api/config');const m=await api('/api/me');S.user=m.user}catch(e){}
 if(S.cfg&&S.cfg.direct){const av=S.cfg.exits.filter(x=>x.available).map(x=>x.code);if(!av.includes(S.wiz.location))S.wiz.location=av[0]}
 if(S.cfg){const av=S.cfg.exits.filter(x=>x.available).map(x=>x.code);S.wiz.exits=S.wiz.exits.filter(c=>av.includes(c));if(!S.wiz.exits.length&&av.length)S.wiz.exits=[av[0]];S.wiz.active=S.wiz.exits[0]}
 route()})();
})();
