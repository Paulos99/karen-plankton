(()=>{'use strict';
const $=s=>document.querySelector(s), B=KarenBackend;
const T=180; // transition ms (120–220)
const LS=k=>localStorage.getItem('karen.'+k), SS=(k,v)=>localStorage.setItem('karen.'+k,v);
const DEFAULT_EP='https://d5dtcref7c17ac6u1m8s.d8epmcec.apigw.yandexcloud.net';
const cfg={endpoint:LS('endpoint')||DEFAULT_EP,token:LS('token')||'',cloud:LS('cloud')==='1',volume:+(LS('volume')||1),role:LS('role')||'guest',subs:LS('subs')==='1',llm:LS('llm')==='1',wake:LS('wake')!=='0'};
const log=(...a)=>{const l=$('#log');l.textContent=(new Date().toLocaleTimeString()+' '+a.join(' ')+'\n'+l.textContent).slice(0,4000)};

// ---------- faces (inline asset SVGs + animated particles, all precached) ----------
const faces={};
const heart=(cx,cy,s)=>`<path class="p heart" fill="#FE5362" d="M${cx} ${cy+40*s} C${cx-70*s} ${cy-5*s} ${cx-104*s} ${cy-32*s} ${cx-95*s} ${cy-68*s} C${cx-86*s} ${cy-108*s} ${cx-37*s} ${cy-110*s} ${cx} ${cy-70*s} C${cx+40*s} ${cy-110*s} ${cx+86*s} ${cy-106*s} ${cx+96*s} ${cy-68*s} C${cx+105*s} ${cy-31*s} ${cx+66*s} ${cy+5*s} ${cx} ${cy+40*s} Z"/>`;
const star=(x,y,r)=>`<path class="p star" fill="#BEFF31" d="M${x} ${y-r} L${x+r*.25} ${y-r*.25} L${x+r} ${y} L${x+r*.25} ${y+r*.25} L${x} ${y+r} L${x-r*.25} ${y+r*.25} L${x-r} ${y} L${x-r*.25} ${y-r*.25} Z"/>`;
const PARTICLES={
  love:heart(190,430,.35)+heart(770,420,.3)+heart(300,470,.22)+heart(650,470,.25)+heart(480,480,.2),
  sleep:[0,1,2].map(i=>`<text class="p z" x="${640+i*14}" y="${210-i*10}" font-size="${44+i*10}" fill="#BEFF31" font-family="monospace" font-weight="bold">Z</text>`).join(''),
  sad:`<ellipse class="p tear" cx="336" cy="285" rx="9" ry="14" fill="#5FD7FF"/><ellipse class="p tear" cx="622" cy="285" rx="9" ry="14" fill="#5FD7FF"/>`,
  photo:`<rect class="p flash" x="0" y="0" width="960" height="540" fill="#fff"/>`+star(180,140,26)+star(790,130,22)+star(820,400,18)+star(150,410,20),
  proud:star(760,150,22)+star(205,165,16),
};
const svgText=id=>fetch('assets/svg/'+id+'.svg').then(r=>r.text()).catch(()=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"></svg>`);
const facesReady=Promise.all(KAREN_EMOTIONS.map(async e=>{
  const d=document.createElement('div');d.className='face f-'+e.id;d.dataset.id=e.id;
  let s=await svgText(e.id);s=s.replace(/width="960" height="540"/,'preserveAspectRatio="xMidYMid meet"').replace('</svg>',(PARTICLES[e.id]||'')+'</svg>');
  d.innerHTML=s;$('#faces').append(d);faces[e.id]=d;
}));

// ---------- state machine ----------
const WAVE_STATES=new Set(['idle','listening','speaking','thinking','reboot']); // drawn live on canvas
let micLvl=0,state='idle',holdTimer=null,busy=null,level=0,targetLevel=0,mood=null,moodTimers=[];
function showFace(id,overlay){
  document.body.classList.toggle('faceon',!!id&&!overlay);
  document.body.classList.toggle('overlay',!!id&&overlay);
  document.body.dataset.mood=id||'';
  for(const k in faces) faces[k].classList.toggle('on',k===id);
}
function setState(s,holdMs){
  if(!B.IDS.includes(s)) s='idle';
  state=s;document.body.dataset.state=s;clearTimeout(holdTimer);
  if(!WAVE_STATES.has(s)) showFace(s,false);
  else if(s==='speaking'&&mood) showFace(mood,true);
  else showFace(null,false);
  if(holdMs) holdTimer=setTimeout(()=>setState('idle'),holdMs);
  renderAsr();
}
function setMood(m){mood=(m&&!WAVE_STATES.has(m))?m:null;if(state==='speaking')setState('speaking')}
function clearMood(){mood=null;moodTimers.forEach(clearTimeout);moodTimers=[]}
window.karen={setState,get state(){return state},get mood(){return mood},match:t=>KarenCommands.match(t),intent:t=>KarenCommands.intent(t),get lastLatency(){return lastLat},_voiceAt:0,get asr(){return ASR.state},handleText:(t)=>handleText(t,performance.now()),photo:()=>photoFlow(KarenCommands.line(KarenCommands.byId('photo')),null),get dance(){return dance}};

// ---------- waveform ----------
const cv=$('#wave'),cx=cv.getContext('2d');
function resize(){const r=devicePixelRatio||1;cv.width=innerWidth*r;cv.height=innerHeight*r}
addEventListener('resize',resize);resize();
let t0=performance.now();
const WS=['idle','listening','speaking','thinking','reboot'],wt={idle:1,listening:0,speaking:0,thinking:0,reboot:0};
function draw(now){
  const t=(now-t0)/1000,W=cv.width,H=cv.height,r=devicePixelRatio||1;const mid=document.body.classList.contains('overlay')?H*.78:H/2;
  level+=(targetLevel-level)*(state==='listening'?.12:.25);
  const cur=WS.includes(state)?state:'idle';for(const k of WS)wt[k]+=((k===cur?1:0)-wt[k])*.1; // smooth crossfade between wave states
  cx.fillStyle='#08141D';cx.fillRect(0,0,W,H);
  const x0=W*.11,x1=W*.89,n=160,L=wt.listening;
  cx.lineWidth=Math.max(4,H*.022)*(1+.25*L);cx.lineCap='round';cx.lineJoin='round';
  cx.strokeStyle='#BEFF31';cx.shadowColor='#BEFF31';cx.shadowBlur=(18+10*L)*r;
  cx.globalAlpha=1;cx.beginPath();
  const tc=(t*.6)%1;
  for(let i=0;i<=n;i++){
    const p=i/n,x=x0+(x1-x0)*p,env=Math.sin(Math.PI*p);let y=0;
    if(wt.idle>.001) y+=wt.idle*(Math.sin(p*18+t*2)*H*.006+Math.sin(p*22-t*3)*H*.05*micLvl)*env;
    if(wt.speaking>.001) y+=wt.speaking*(Math.sin(p*40+t*14)*.6+Math.sin(p*13-t*9)*.4)*H*.32*(.08+level)*env;
    if(L>.001) y+=L*(Math.sin(p*14+t*3)*.65+Math.sin(p*23-t*2.2)*.35)*H*(.006+.2*level)*env*env;
    if(wt.thinking>.001) y+=wt.thinking*Math.exp(-((p-tc)**2)/.002)*H*.06*Math.sin(p*60);
    i?cx.lineTo(x,mid-y):cx.moveTo(x,mid-y);
  }
  cx.stroke();
  if(wt.thinking>.02){for(let k=0;k<3;k++){const ang=t*2.4+k*2.094;cx.globalAlpha=wt.thinking*(.5+.5*Math.sin(t*3+k));cx.beginPath();cx.arc(W/2+Math.cos(ang)*H*.1,mid-H*.16+Math.sin(ang)*H*.04,H*.016,0,7);cx.fillStyle='#BEFF31';cx.fill()}}
  if(wt.reboot>.02){for(let k=0;k<3;k++){const a=(Math.sin(t*5-k*.8)+1)/2;cx.globalAlpha=wt.reboot*(.25+.75*a);cx.beginPath();cx.arc(W/2+(k-1)*W*.05,mid-H*.12,H*.018,0,7);cx.fillStyle='#BEFF31';cx.fill()}}
  if(L>.02){ // cute line-art ear + incoming sound arcs (listening)
    const S=H*.13,ex=W/2+S*.35,ey=mid-H*.2,tilt=Math.sin(t*1.6)*.06+level*.08;
    cx.save();cx.translate(ex,ey);cx.rotate(tilt);cx.scale(.9+.1*L,.9+.1*L);cx.globalAlpha=L;
    cx.lineWidth=Math.max(3,H*.012);cx.strokeStyle='#BEFF31';cx.shadowBlur=14*r;
    cx.beginPath();cx.moveTo(-S*.15,S*.95);cx.bezierCurveTo(-S*.75,S*.95,-S*.75,S*.35,-S*.55,S*.05);
    cx.bezierCurveTo(-S*.95,-S*.55,-S*.35,-S*1.05,S*.1,-S*.95);cx.bezierCurveTo(S*.65,-S*.85,S*.75,-S*.2,S*.35,S*.2);
    cx.bezierCurveTo(S*.1,S*.45,S*.2,S*.8,-S*.15,S*.95);cx.stroke();
    cx.beginPath();cx.moveTo(-S*.2,S*.35);cx.bezierCurveTo(-S*.5,S*.0,-S*.25,-S*.55,S*.1,-S*.5);cx.bezierCurveTo(S*.35,-S*.45,S*.35,-S*.15,S*.1,S*.0);cx.stroke();
    cx.restore();
    for(let k=0;k<3;k++){const ph=((t*.7+k/3)%1),a=Math.sin(Math.PI*ph)*(.25+.75*Math.min(1,level*2.5));
      cx.globalAlpha=L*a;cx.lineWidth=Math.max(3,H*.01);const R=S*(1.9-ph*.9);
      cx.beginPath();cx.arc(ex+S*.35,ey,R,Math.PI*.82,Math.PI*1.18);cx.stroke()}
  }
  cx.globalAlpha=1;cx.shadowBlur=0;
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// ---------- audio ----------
let actx,micStream,micAnalyser,playing=null;
function ac(){actx=actx||new (window.AudioContext||window.webkitAudioContext)();if(actx.state==='suspended')actx.resume();return actx}
function rms(an){const a=new Float32Array(an.fftSize);an.getFloatTimeDomainData(a);let s=0;for(const v of a)s+=v*v;return Math.min(1,Math.sqrt(s/a.length)*4)}
async function openMic(){
  if(micStream) return micStream;
  micStream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  const src=ac().createMediaStreamSource(micStream);micAnalyser=ac().createAnalyser();micAnalyser.fftSize=1024;src.connect(micAnalyser);
  return micStream;
}
function closeMic(){if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null;micAnalyser=null}}
// PCM recorder: 16 kHz mono 16-bit LPCM (SpeechKit v2 compatible), hard-capped 12 s (~384 KB < 1 MB)
let rec=null;
function startRecord(){
  const ctx=ac(),src=ctx.createMediaStreamSource(micStream),proc=ctx.createScriptProcessor(4096,1,1),chunks=[],rate=ctx.sampleRate;
  proc.onaudioprocess=e=>{chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))};
  src.connect(proc);proc.connect(ctx.destination);
  rec={stop(){proc.disconnect();src.disconnect();const len=chunks.reduce((a,c)=>a+c.length,0),ratio=rate/16000,out=new Int16Array(Math.min(Math.floor(len/ratio),16000*12));
    const all=new Float32Array(len);let o=0;for(const c of chunks){all.set(c,o);o+=c.length}
    for(let i=0;i<out.length;i++){const v=all[Math.floor(i*ratio)];out[i]=Math.max(-1,Math.min(1,v))*32767}
    return {blob:new Blob([out.buffer],{type:'audio/l16'}),seconds:out.length/16000}}};
}
function stopAudio(){if(playing){try{playing.stop()}catch{}playing=null}}
async function playBuf(buf,signal){
  const ctx=ac(),s=ctx.createBufferSource(),g=ctx.createGain(),an=ctx.createAnalyser();
  g.gain.value=cfg.volume;s.buffer=buf;s.connect(an);an.connect(g);g.connect(ctx.destination);an.fftSize=1024;playing=s;
  return new Promise(res=>{const tick=()=>{if(playing!==s)return res();targetLevel=rms(an);requestAnimationFrame(tick)};
    s.onended=()=>{if(playing===s)playing=null;targetLevel=0;wakeMute();res()};signal&&signal.addEventListener('abort',()=>{try{s.stop()}catch{}res()});s.start();window.karen._voiceAt=performance.now();tick()});
}
async function playBlob(blob,signal){return playBuf(await ac().decodeAudioData(await blob.arrayBuffer()),signal)}
// prerecorded SpeechKit (jane) lines: bytes fetched at boot (SW-precached), decoded once
const raw={},decoded={};
KarenCommands.ready.then(()=>{for(const f of KarenCommands.allFiles()) raw[f]=fetch(f).then(r=>r.ok?r.arrayBuffer():null).catch(()=>null)});
async function clip(f){if(decoded[f])return decoded[f];const ab=await (raw[f]||(raw[f]=fetch(f).then(r=>r.ok?r.arrayBuffer():null)));if(!ab)throw new Error('no audio '+f);return decoded[f]=await ac().decodeAudioData(ab.slice(0))}
let warmed=false;function warmDecode(){if(warmed)return;warmed=true;for(const f of Object.keys(raw)) clip(f).catch(()=>{})}
// silent envelope (never a browser voice) — only if an audio file is missing
function fakeVoice(text,signal){return new Promise(res=>{const ms=Math.min(6000,600+text.length*45),t=performance.now();let done=false;const fin=()=>{if(!done){done=true;targetLevel=0;wakeMute();res()}};
  (function env(){if(done)return;const k=(performance.now()-t)/1000;targetLevel=.35+.3*Math.abs(Math.sin(k*9));requestAnimationFrame(env)})();setTimeout(fin,ms);signal&&signal.addEventListener('abort',fin)})}

// ---------- backend ----------
function backend(){return (cfg.endpoint&&cfg.token)?B.Cloud(cfg.endpoint,cfg.token):B.Demo}
let history=[],lastTurn=0,lastLat=null;
const sleep=(ms,sig)=>new Promise(r=>{const t=setTimeout(r,ms);sig&&sig.addEventListener('abort',()=>{clearTimeout(t);r()})});
function newTurn(){stop(false);pauseDance();const a=new AbortController();busy=a;return a.signal}
function showSubs(t){const s=$('#subs');s.hidden=!cfg.subs||!t;s.textContent=t}
function stop(full=true){fx(null);if(full)stopDance();if(listenOn)listenCancel=true;listenOn=false;clearMood();if(busy){busy.abort();busy=null}stopAudio();targetLevel=0;if(rec){rec.stop();rec=null}if(full){closeMic();closeCam();showSubs('');setState('idle');if(wake.wanted)setTimeout(ensureWake,600)}}
function markLatency(t0){if(t0==null)return;lastLat=Math.round(window.karen._voiceAt-t0);log('задержка (конец речи → голос):',lastLat+' мс')}
// play one prerecorded line with its emotion; resolves when done
async function sayLine(l,sig,t0,{after=true}={}){
  if(!l)return;
  if(l.segments&&l.segments.length){ // v2.0 scenes: one clip per segment, own emotion, timed pauses, final hold
    const S=l.segments;log(`[сцена] ${l.id}`);
    for(let i=0;i<S.length;i++){const g=S[i];
      await sayLine({id:l.id+'#'+i,file:g.file,text:g.text,emotion:g.emotion,steps:[]},sig,i?null:t0,{after:false});if(sig.aborted)return;
      if(g.pause_after_ms&&i<S.length-1){mood=WAVE_STATES.has(g.emotion)?null:g.emotion;setState('speaking');await sleep(g.pause_after_ms,sig);if(sig.aborted)return}}
    if(after){const e=S[S.length-1].emotion,h=S[S.length-1].hold_after_ms||1800;WAVE_STATES.has(e)?setState('idle'):setState(e,h)}
    return}log(`[локально] ${l.id} ${l.emotion}: ${l.text}`);
  let buf=null;try{buf=await clip(l.file)}catch(e){log('audio:',e.message)}
  if(sig.aborted)return;
  clearMood();const st=l.steps||[];const first=st.length&&st[0].at<.05?st[0].emotion:l.emotion;
  mood=WAVE_STATES.has(first)?null:first;showSubs(l.text);setState('speaking');
  const dur=buf?buf.duration*1000:Math.max(1200,l.text.length*60);let endEmo=l.emotion;
  for(const x of st){endEmo=x.emotion;moodTimers.push(setTimeout(()=>{if(sig.aborted)return;
    if(WAVE_STATES.has(x.emotion)){mood=null;setState(x.emotion)}else{mood=x.emotion;setState('speaking')}},x.at*dur))} // timed face changes inside the line
  const p=buf?playBuf(buf,sig):fakeVoice(l.text,sig);if(buf)markLatency(t0);await p;
  if(sig.aborted)return;showSubs('');clearMood();
  if(after){const react=WAVE_STATES.has(endEmo)?null:endEmo;react?setState(react,react==='sleep'?6000:1800):setState('idle')}
}
// main router: text (from STT or debug field) → local intent → prerecorded voice. t0 = moment speech ended.
async function handleText(text,t0){
  const sig=newTurn();log('фраза:',text);
  if(follow&&Date.now()<follow.until){const f=follow;follow=null;const k=KarenCommands.yesno(text); // answer to Karen's yes/no question
    const kk=k||(f.f.any?'any':null);
    if(kk){const b=KarenCommands.branch(f.f,kk);await sayLine(b,sig,t0,{after:!b.follow});if(sig.aborted)return;if(busy&&busy.signal===sig)busy=null;
      if(b.follow){follow={f:b.follow,until:Date.now()+15000};if(ASR.state==='ready'||(cfg.cloud&&backend().name==='cloud'))return listen();setState('idle')}return}}
  follow=null;
  const it=KarenCommands.intent(text,{dancing:dance.on});
  if(it&&it.mode==='dance_stop'){busy=null;const was=dance.on;stopDance();log(was?'танец остановлен':'стоп (танца нет)');setState('idle');return}
  if(it&&it.mode==='photo'){busy=null;return photoFlow(KarenCommands.line(it),t0)}
  if(it&&it.mode==='dance'){if(dance.on&&!dance.intro){busy=null;log('танец уже идёт');return}busy=null;return startDance(it,sig,t0)}
  if(it&&it.mode==='love_declaration'){const l=KarenCommands.line(it);fx(it.visual);await sayLine(l,sig,t0);fx(null);if(busy&&busy.signal===sig)busy=null;return}
  if(it){const l=KarenCommands.line(it);await sayLine(l,sig,t0,{after:!l.follow});if(sig.aborted)return;if(busy&&busy.signal===sig)busy=null;
    if(l.follow){follow={f:l.follow,until:Date.now()+15000};if(ASR.state==='ready'||(cfg.cloud&&backend().name==='cloud'))return listen();setState('idle')}return}
  if(KarenCommands.hasName(text)&&KarenCommands.stripName(text).length<3){ // only «Карен» → short ack, then listen for the phrase
    await sayLine(KarenCommands.sys('name'),sig,t0,{after:false});if(sig.aborted)return;busy=null;return listen();}
  if(cfg.llm&&cfg.cloud&&backend().name==='cloud'){busy=null;return turnLLM(text,t0)}
  await sayLine(KarenCommands.sys('fallback'),sig,t0);if(busy&&busy.signal===sig)busy=null;
}
// optional slow path (setting «LLM для непонятных фраз», default off)
async function turnLLM(text,t0){
  const sig=newTurn();if(Date.now()-lastTurn>5*60e3)history=[];lastTurn=Date.now();setState('thinking');
  const be=backend();let r,blob=null;
  try{r=await be.chat({text:text.slice(0,500),role:cfg.role,history:history.slice(-10)},sig);blob=await be.tts({text:r.speech,emotion:r.emotion,voice:'jane'},sig)}
  catch(e){if(sig.aborted)return;log('llm failed:',e.message);return sayLine(KarenCommands.sys('fallback'),sig,t0)}
  if(sig.aborted)return;history.push({role:'user',content:text},{role:'assistant',content:r.speech});
  clearMood();mood=WAVE_STATES.has(r.emotion)?null:r.emotion;showSubs(r.speech);setState('speaking');
  const p=playBlob(blob,sig);markLatency(t0);try{await p}catch(e){log('play failed:',e.message)}
  if(sig.aborted)return;showSubs('');clearMood();const react=WAVE_STATES.has(r.emotion)?null:r.emotion;react?setState(react,1800):setState('idle');busy=null;
}

// ---------- tap-to-listen: own mic capture (getUserMedia → no system beep), simple VAD ----------
let listenOn=false,listenCancel=false,follow=null; // follow = pending yes/no question {f:{yes,no,none},until}
// ---- on-device recognition: vosk-browser (WASM) + slim vosk-model-small-ru-0.22 (grammar-only), restricted grammar from commands.json ----
// Model file is downloaded by the page itself (streamed, progress, resume via Range), stored in Cache Storage (persistent),
// and handed to the Vosk worker as a blob: URL — so the 33 MB download happens once and the worker never touches the network.
const MODEL_URL='vosk/vosk-ru-slim-v1.tar.gz',MODEL_CACHE='karen-model-v1',MODEL_MB=31;
const ASR={model:null,state:'none',got:0,total:0,err:'',t:0};
const MB=b=>(b/1048576).toFixed(1);
function renderAsr(){
  const s=ASR.state,pct=ASR.total?Math.floor(100*ASR.got/ASR.total):0;
  const txt={none:`Офлайн-распознавание не загружено (${MODEL_MB} МБ, один раз)`,downloading:`Скачиваю модель: ${MB(ASR.got)} / ${ASR.total?MB(ASR.total):'?'} МБ · ${pct} %`,
    starting:'Запускаю распознавание… (до 1 мин)',ready:'Распознавание готово (офлайн)',error:'Ошибка: '+ASR.err}[s];
  document.querySelectorAll('.mdl-text').forEach(e=>e.textContent=txt);
  document.querySelectorAll('.mdl-bar').forEach(e=>{e.hidden=!(s==='downloading'||s==='starting');e.value=s==='starting'?1:(ASR.total?ASR.got/ASR.total:0)});
  document.querySelectorAll('.mdl-btn').forEach(e=>{e.hidden=!(s==='none'||s==='error');e.textContent=s==='error'?'Повторить':'Скачать модель распознавания'});
  $('#modelPanel').hidden=s==='ready';document.body.dataset.asr=s;
  if(state)$('#status').textContent=`состояние: ${state} · ${txt}`;
}
const withTimeout=(p,ms,msg)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error(msg)),ms))]);
async function fetchModel(){ // streamed download with progress, stall timeout and resume
  const chunks=[];ASR.got=0;ASR.total=0;let tries=0;
  while(true){
    const ctl=new AbortController();let stall;const kick=()=>{clearTimeout(stall);stall=setTimeout(()=>ctl.abort(),25000)};
    try{
      kick();const r=await fetch(MODEL_URL,{cache:'no-store',signal:ctl.signal,headers:ASR.got?{Range:`bytes=${ASR.got}-`}:{}});
      if(ASR.got&&r.status!==206){chunks.length=0;ASR.got=0} // server ignored Range → restart
      if(!r.ok)throw new Error('HTTP '+r.status);
      if(!ASR.total)ASR.total=+(r.headers.get('Content-Length')||0)+ASR.got||MODEL_MB*1048576;
      const rd=r.body.getReader();
      for(;;){const {done,value}=await rd.read();if(done)break;chunks.push(value);ASR.got+=value.length;kick();renderAsr()}
      clearTimeout(stall);break;
    }catch(e){clearTimeout(stall);if(++tries>6)throw new Error(navigator.onLine?'загрузка прерывается ('+(e.name==='AbortError'?'нет данных 25 с':e.message)+')':'нет интернета');
      log('model download retry',tries,e.name);await new Promise(r=>setTimeout(r,1500*tries))}
  }
  const blob=new Blob(chunks,{type:'application/gzip'});
  if(blob.size<20e6)throw new Error('файл модели повреждён ('+MB(blob.size)+' МБ)');
  try{const c=await caches.open(MODEL_CACHE);await c.put(MODEL_URL,new Response(blob,{headers:{'Content-Type':'application/gzip','Content-Length':String(blob.size)}}))}
  catch(e){log('cache put failed:',e.name)} // still usable this session
  return blob;
}
async function startModel(blob){
  ASR.state='starting';renderAsr();const url=URL.createObjectURL(blob);
  const m=new Vosk.Model(url,-1);
  try{await withTimeout(new Promise((res,rej)=>{m.on('load',e=>e.result?res():rej(new Error('модель не открылась')));m.on('error',e=>rej(new Error(String(e.error||'ошибка движка'))));
      m.worker.addEventListener('error',e=>rej(new Error('сбой движка: '+(e.message||'нехватка памяти?'))))}),90000,'движок не запустился за 90 с (мало памяти?)')}
  catch(e){try{m.worker.terminate()}catch{}URL.revokeObjectURL(url);throw e}
  URL.revokeObjectURL(url);return m;
}
async function loadAsr(download){
  if(['downloading','starting','ready'].includes(ASR.state))return;
  if(!window.Vosk||!window.WebAssembly){ASR.state='error';ASR.err='браузер не поддерживает WebAssembly';return renderAsr()}
  ASR.t=performance.now();
  try{
    let blob=null;try{const r=await (await caches.open(MODEL_CACHE)).match(MODEL_URL);if(r)blob=await r.blob()}catch{}
    if(!blob){if(!download){ASR.state='none';return renderAsr()}
      ASR.state='downloading';renderAsr();try{await navigator.storage?.persist?.()}catch{}blob=await fetchModel();log('модель скачана',MB(blob.size)+' МБ за',Math.round((performance.now()-ASR.t)/1000)+' с')}
    ASR.model=await startModel(blob);ASR.state='ready';if(wake.wanted)setTimeout(ensureWake,0);ASR.loadMs=Math.round(performance.now()-ASR.t);log('офлайн-распознавание готово за',ASR.loadMs+' мс');
  }catch(e){ASR.state='error';ASR.err=e.message;log('распознавание:',e.message)}
  renderAsr();setState(state);
}
document.addEventListener('click',e=>{if(e.target.closest('.mdl-btn')){e.stopPropagation();loadAsr(true)}});
// ---- install to home screen ----
let installEvt=null;
const standalone=()=>matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches||navigator.standalone;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;renderInstall()});
addEventListener('appinstalled',()=>{installEvt=null;log('приложение установлено');renderInstall()});
function renderInstall(){document.querySelectorAll('.inst-btn').forEach(b=>b.hidden=standalone())}
document.addEventListener('click',async e=>{if(!e.target.closest('.inst-btn'))return;e.stopPropagation();
  if(installEvt){installEvt.prompt();const c=await installEvt.userChoice.catch(()=>({}));log('установка:',c.outcome||'?');installEvt=null;renderInstall()}
  else document.querySelectorAll('.inst-help').forEach(h=>h.hidden=!h.hidden)});
function grammar(){const d=KarenCommands.data;return JSON.stringify([...new Set([...(d.grammar||[]),...d.name.filter(n=>!n.includes(' '))])].concat('[unk]'))}
const VAD={silence:450,max:8000,noSpeech:5000};
async function listen(){
  if(listenOn){listenOn=false;return} // second tap = «я договорил»
  pauseDance();
  stop(false);ac();warmDecode();
  try{await openMic()}catch(e){log('mic error:',e.name);setState('error',1500);return}
  const offline=ASR.state==='ready',cloud=!offline&&cfg.cloud&&backend().name==='cloud';
  if(!offline&&!cloud){if(ASR.state==='none'||ASR.state==='error')loadAsr(true);const s=newTurn();await sayLine(KarenCommands.sys('asr_loading')||KarenCommands.sys('fallback'),s,null);busy=null;return}
  listenOn=true;listenCancel=false;setState('listening');
  let r=null,partial='',final=null,proc=null,src=null;
  if(offline){
    r=new ASR.model.KaldiRecognizer(16000,grammar());
    r.on('partialresult',e=>{partial=e.result.partial||partial});r.on('result',e=>{final=e.result.text||''});
    const ctx=ac();src=ctx.createMediaStreamSource(micStream);proc=ctx.createScriptProcessor(2048,1,1);
    proc.onaudioprocess=e=>{try{r.acceptWaveformFloat(new Float32Array(e.inputBuffer.getChannelData(0)),ctx.sampleRate)}catch{}};src.connect(proc);proc.connect(ctx.destination);
  } else startRecord();
  const tS=performance.now();let spoke=false,lastVoice=tS,floor=.02,n=0;
  await new Promise(res=>{(function loop(){
    if(!listenOn)return res();
    const v=micAnalyser?rms(micAnalyser):0,now=performance.now();targetLevel=Math.min(1,v*1.2);
    if(now-tS<300){floor=(floor*n+v)/(++n)}else{const th=Math.max(.05,floor*2.5);if(v>th){spoke=true;lastVoice=now}}
    const el=now-tS;
    if((spoke&&now-lastVoice>VAD.silence)||el>VAD.max||(!spoke&&el>VAD.noSpeech))return res();
    requestAnimationFrame(loop)})()});
  if(listenCancel){listenCancel=false;listenOn=false;targetLevel=0;try{proc&&proc.disconnect();src&&src.disconnect();r&&r.remove()}catch{}if(rec){rec.stop();rec=null}return} // another turn took over
  const manual=!listenOn;listenOn=false;targetLevel=0;const tEnd=performance.now(),tSpeech=spoke?lastVoice:tEnd;
  if(offline){
    if(!spoke&&!manual){proc.disconnect();src.disconnect();r.remove();
      if(follow){const f=follow;follow=null;const b=KarenCommands.branch(f.f,'none');if(b){const s=newTurn();await sayLine(b,s,null);busy=null;return}}
      setState('idle');return}
    if(final===null){r.retrieveFinalResult();const t=performance.now();await new Promise(z=>{(function w(){if(final!==null||performance.now()-t>700)return z();setTimeout(w,10)})()})}
    proc.disconnect();src.disconnect();try{r.remove()}catch{}
    const text=String(final||partial).replace(/\[unk\]/g,' ').replace(/\s+/g,' ').trim();
    window.karen._asrMs=Math.round(performance.now()-tEnd);log('офлайн:',text||'(пусто)',window.karen._asrMs+' мс');
    if(!text&&!(follow&&follow.f.any)){const s=newTurn();await sayLine(KarenCommands.sys('fallback'),s,tSpeech);busy=null;return}
    return handleText(text,tSpeech);
  }
  if(!rec)return;const {blob,seconds}=rec.stop();rec=null;
  if((!spoke&&!manual)||seconds<.5){setState('idle');return}
  processClip(blob,tSpeech);
}
async function processClip(blob,tEnd){
  const be=backend();setState('thinking');
  try{const r=await be.stt(blob);log('облако STT:',r.text||'(пусто)');
    if(!r.text){const s=newTurn();await sayLine(KarenCommands.sys('fallback'),s,tEnd);busy=null;return}handleText(r.text,tEnd)}
  catch(e){log('stt failed:',e.message);const s=newTurn();await sayLine(KarenCommands.sys('fallback'),s,tEnd);busy=null}
}

// ---------- hands-free wake word «Карен» on the same offline vosk model (no Google, no beep) ----------
// A second, always-on KaldiRecognizer is fed from the open mic only while Karen is idle (not speaking/listening/camera),
// resumes WAKE_RESUME ms after her audio ends, and fires only if a name word is recognised with conf ≥ WAKE_CONF + cooldown.
const WAKE_CONF=.6,WAKE_COOLDOWN=1500,WAKE_RESUME=300;
const wake={wanted:false,rec:null,proc:null,src:null,muteUntil:0,dirty:false,last:0,lastVoice:0,lock:null,count:0};
window.karen.wake=wake;
function wakeMute(){wake.muteUntil=performance.now()+WAKE_RESUME;wake.dirty=true}
const wakeBlocked=()=>!cfg.wake||listenOn||playing||state==='speaking'||document.body.classList.contains('cam')||performance.now()<wake.muteUntil;
function newWakeRec(){try{wake.rec&&wake.rec.remove()}catch{}const r=new ASR.model.KaldiRecognizer(16000,grammar());try{r.setWords(true)}catch{}
  r.on('result',e=>onWake(e.result||{}));wake.rec=r;wake.dirty=false}
async function ensureWake(){
  if(!wake.wanted||!cfg.wake)return;
  try{if(!micStream||micStream.getAudioTracks().every(t=>t.readyState==='ended')){micStream=null;stopWake(true);await openMic();
      micStream.getAudioTracks().forEach(t=>t.addEventListener('ended',()=>{log('микрофон отключился, перезапуск');micStream=null;stopWake(true);setTimeout(ensureWake,1000)}))}}
  catch(e){log('wake mic:',e.name);setTimeout(ensureWake,3000);return}
  if(actx&&actx.state!=='running')try{await actx.resume()}catch{}
  keepAwake();
  if(ASR.state!=='ready'){if(ASR.state==='none'||ASR.state==='error')loadAsr(true);return} // loadAsr calls ensureWake when ready
  if(wake.proc)return;
  const ctx=ac();wake.src=ctx.createMediaStreamSource(micStream);wake.proc=ctx.createScriptProcessor(2048,1,1);newWakeRec();
  wake.proc.onaudioprocess=e=>{const d=e.inputBuffer.getChannelData(0);let q=0;for(let i=0;i<d.length;i+=4)q+=d[i]*d[i];const v=Math.min(1,Math.sqrt(q/(d.length/4))*4);
    micLvl+=(v-micLvl)*.3;const now=performance.now();if(v>.06)wake.lastVoice=now;
    if(wakeBlocked()){wake.dirty=true;micLvl*=.5;return}
    if(wake.dirty)newWakeRec(); // drop whatever was half-heard while Karen talked
    try{wake.rec.acceptWaveformFloat(new Float32Array(d),ctx.sampleRate)}catch{}};
  const mute=ctx.createGain();mute.gain.value=0;wake.src.connect(wake.proc);wake.proc.connect(mute);mute.connect(ctx.destination);
  document.body.classList.add('wake');log('активация по имени: слушаю');renderWake();
}
function stopWake(keepWanted){try{wake.proc&&wake.proc.disconnect();wake.src&&wake.src.disconnect();wake.rec&&wake.rec.remove()}catch{}wake.proc=wake.src=wake.rec=null;micLvl=0;
  document.body.classList.remove('wake');if(!keepWanted)wake.wanted=false;renderWake()}
async function keepAwake(){try{if('wakeLock' in navigator&&!wake.lock&&document.visibilityState==='visible'){wake.lock=await navigator.wakeLock.request('screen');wake.lock.addEventListener('release',()=>{wake.lock=null})}}catch(e){log('wakeLock:',e.name)}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&wake.wanted){wake.dirty=true;setTimeout(ensureWake,300)}});
async function onWake(res){
  const text=String(res.text||'').trim();if(!text||wakeBlocked())return;
  if(!KarenCommands.hasName(text)){return} // no name → party noise, ignore
  const names=KarenCommands.data.name,nw=(res.result||[]).filter(w=>names.some(n=>KarenCommands.norm(w.word).trim().startsWith(n.split(' ')[0])));
  const conf=nw.length?Math.max(...nw.map(w=>w.conf??1)):1,now=performance.now();
  if(conf<WAKE_CONF){log('имя неуверенно',conf.toFixed(2),text);return}
  if(now-wake.last<WAKE_COOLDOWN)return;wake.last=now;wake.count++;wake.dirty=true;
  const t0=Math.min(now,wake.lastVoice||now);log('wake:',text,'conf',conf.toFixed(2));window.karen._wakeText=text;window.karen._wakeT0=t0;
  if(KarenCommands.stripName(text).length>=3)return handleText(text,t0); // «Карен, привет» → at once
  const s=newTurn();await sayLine(KarenCommands.sys('name'),s,t0,{after:false});if(s.aborted)return;busy=null;listen(); // only the name → «Да?» + ear
}
function renderWake(){const g=$('#wakeGate');if(g)g.hidden=!(cfg.wake&&!wake.wanted);const t=$('#wakeToggle');if(t)t.checked=cfg.wake}
$('#wakeGate').addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();wake.wanted=true;renderWake();ac();warmDecode();ensureWake()});
$('#wakeToggle').addEventListener('change',e=>{cfg.wake=e.target.checked;SS('wake',cfg.wake?'1':'0');if(cfg.wake){wake.wanted=true;ac();ensureWake()}else stopWake()});
renderWake();
$('#stage').addEventListener('pointerdown',e=>{if(document.body.classList.contains('cam'))return;e.preventDefault();listen()});
addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&$('#menu').hidden)listen()});

// ---------- v2.0: infinite dance (logic/dance.json) + one-shot SVG layers ----------
const svgCache={};
function svgFile(u){return svgCache[u]||(svgCache[u]=fetch(u).then(r=>r.text()).then(t=>t.replace(/width="960" height="540"/,'preserveAspectRatio="xMidYMid meet"')).catch(()=>''))}
const reduceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
async function fx(u){const el=$('#fxLayer');if(!u){el.hidden=true;el.innerHTML='';return}el.innerHTML=await svgFile(u);el.hidden=false;if(reduceMotion())el.querySelector('svg')?.pauseAnimations?.()}
const dance={on:false,intro:false,paused:true,pos:0,cycle:1,beat:null,spoken:new Set(),lastSpeech:-1e9,tick:null,last:0,ctl:null,idleSince:0};
async function startDance(it,sig,t0){
  dance.on=true;dance.intro=true;dance.pos=0;dance.cycle=1;dance.spoken=new Set();dance.lastSpeech=-1e9;log('танец: вступление');
  await sayLine(KarenCommands.line(it),sig,t0,{after:false});if(sig.aborted||!dance.on)return;
  setState('smile');await sleep(((KarenCommands.data.dance||{}).intro_hold||2.5)*1000,sig);if(sig.aborted||!dance.on)return;
  dance.intro=false;if(busy&&busy.signal===sig)busy=null;setState('idle');resumeDance();
}
function setBeatVisual(b){if(dance.beat===b.id)return;dance.beat=b.id;svgFile(b.svg).then(t=>{if(dance.beat!==b.id||dance.paused)return;const el=$('#danceLayer');el.innerHTML=t;if(reduceMotion())el.querySelector('svg')?.pauseAnimations?.()})}
function resumeDance(){if(!dance.on||!dance.paused)return;dance.paused=false;dance.beat=null;dance.last=performance.now();$('#danceLayer').hidden=false;document.body.classList.add('dancing');
  log('танец: цикл',dance.cycle,'позиция',Math.round(dance.pos)+' с');dance.tick=setInterval(danceTick,200);danceTick()}
function pauseDance(){if(dance.paused)return;dance.paused=true;clearInterval(dance.tick);dance.tick=null;if(dance.ctl){dance.ctl.abort();dance.ctl=null}
  const el=$('#danceLayer');el.hidden=true;el.innerHTML='';dance.beat=null;document.body.classList.remove('dancing')}
function stopDance(){if(dance.intro&&busy)busy.abort();dance.on=false;dance.intro=false;pauseDance()}
function danceTick(){
  const D=KarenCommands.data.dance;if(!D||dance.paused)return;const now=performance.now();dance.pos+=(now-dance.last)/1000;dance.last=now;
  if(dance.pos>=D.cycle){dance.pos-=D.cycle;dance.cycle++;dance.spoken=new Set()}
  const b=D.beats.find(x=>dance.pos>=x.at&&dance.pos<x.at+x.dur)||D.beats[0];setBeatVisual(b);
  const c=dance.cycle,list=c<=3?D.schedule[String(c)]:(c%3===0?D.schedule.every3:[]);
  for(const x of D.beats){if(dance.spoken.has(x.id)||dance.pos<x.speech_at||!list.includes(x.id))continue;
    if(dance.pos-x.speech_at>8){dance.spoken.add(x.id);continue} // too late → skip (queue at most one, ≤8 s)
    if(playing||listenOn||dance.ctl||(c>1&&now-dance.lastSpeech<D.min_gap*1000))continue;
    dance.spoken.add(x.id);dance.lastSpeech=now;const ctl=new AbortController();dance.ctl=ctl;log('танец: реплика',x.id);
    clip(x.line.file).then(buf=>ctl.signal.aborted?null:playBuf(buf,ctl.signal)).catch(e=>log('dance audio:',e.message)).finally(()=>{if(dance.ctl===ctl)dance.ctl=null});break}
}
// resume the dance after any scene / photo / listen once Karen is quiet and idle again (no second intro)
setInterval(()=>{if(!dance.on||!dance.paused||dance.intro){dance.idleSince=0;return}
  const quiet=!busy&&!listenOn&&!playing&&state==='idle'&&!document.body.classList.contains('cam')&&$('#menu').hidden;
  if(!quiet){dance.idleSince=0;return}if(!dance.idleSince)dance.idleSince=Date.now();else if(Date.now()-dance.idleSince>700)resumeDance()},150);

// ---------- «Карен, сделай фото»: front camera, 5 s countdown, frame «День Маркетолога StP 2026» ----------
let camStream=null,camTimer=null;
function closeCam(){clearTimeout(camTimer);const co=$('#camOverlay');if(co)co.innerHTML='';if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null}document.body.classList.remove('cam');const c=$('#cam');c.hidden=true;c.dataset.step=''}
function drawFrame(g,W,H){
  const u=Math.min(W,H)/100;g.save();
  // thin white inner border + subtle dark strip with caption — minimal, neutral
  g.strokeStyle='rgba(255,255,255,.85)';g.lineWidth=Math.max(2,.35*u);const m=2.6*u;g.strokeRect(m,m,W-2*m,H-2*m);
  const sh=15*u,gr=g.createLinearGradient(0,H-sh*1.8,0,H);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(.45,'rgba(0,0,0,.45)');gr.addColorStop(1,'rgba(0,0,0,.6)');g.fillStyle=gr;g.fillRect(0,H-sh*1.8,W,sh*1.8);
  g.textAlign='center';g.textBaseline='alphabetic';g.fillStyle='#fff';g.shadowColor='rgba(0,0,0,.35)';g.shadowBlur=1.2*u;
  g.font=`600 ${6.2*u}px "Montserrat","Helvetica Neue",Roboto,"Segoe UI",system-ui,sans-serif`;
  if('letterSpacing' in g)g.letterSpacing=`${.15*u}px`;
  g.fillText('День Маркетолога StP 2026',W/2,H-m-6.2*u);
  g.font=`400 ${2.4*u}px "Helvetica Neue",Roboto,"Segoe UI",system-ui,sans-serif`;g.fillStyle='rgba(255,255,255,.75)';if('letterSpacing' in g)g.letterSpacing=`${.5*u}px`;
  g.fillText('25 · 10 · 2026',W/2,H-m-2.4*u);
  g.restore();
}
async function photoFlow(line,t0){
  stop(false);const sig=newTurn();const cam=$('#cam'),v=$('#camVideo'),cd=$('#camCount'),res=$('#camResult');
  const voice=sayLine(line,sig,t0,{after:false});
  try{camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1920},height:{ideal:1080}},audio:false})}
  catch(e){log('camera:',e.name);await voice;if(sig.aborted)return;await sayLine(KarenCommands.sys('photo_fail'),sig);busy=null;return}
  if(sig.aborted){closeCam();return}
  v.srcObject=camStream;try{await v.play()}catch{}
  document.body.classList.add('cam');cam.hidden=false;cam.dataset.step='count';res.hidden=true;
  const ov=$('#camFrame');ov.width=innerWidth*(devicePixelRatio||1);ov.height=innerHeight*(devicePixelRatio||1);const og=ov.getContext('2d');og.clearRect(0,0,ov.width,ov.height);drawFrame(og,ov.width,ov.height);
  await voice;if(sig.aborted){closeCam();return}
  const P=KarenCommands.data.photo||{},CD=P.countdown||[],secs=P.seconds||5,co=$('#camOverlay');
  for(let i=secs;i>0;i--){
    if(i<=3&&P.overlay){cd.textContent='';if(i===3)co.innerHTML=await svgFile(P.overlay);const c=CD[3-i];if(c)clip(c.file).then(b=>{if(!sig.aborted)playBuf(b,sig)}).catch(()=>{})}
    else{cd.textContent=i;cd.classList.remove('tick');void cd.offsetWidth;cd.classList.add('tick')}
    await sleep(1000,sig);if(sig.aborted){closeCam();return}}
  cd.textContent='';co.innerHTML='';cam.dataset.step='flash';
  const W=v.videoWidth||1280,H=v.videoHeight||720,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  g.save();g.translate(W,0);g.scale(-1,1);g.drawImage(v,0,0,W,H);g.restore();drawFrame(g,W,H); // mirrored like the preview (selfie)
  camStream.getTracks().forEach(t=>t.stop());camStream=null;stopAudio();
  const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.92));const name=`Karen_DenMarketologa_StP2026_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.jpg`;
  const url=URL.createObjectURL(blob);$('#camImg').src=url;window.karen._lastPhoto={name,size:blob.size,W,H};
  cam.dataset.step='result';res.hidden=false;
  try{const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();log('фото сохранено (Загрузки):',name)}catch(e){log('download:',e.message)}
  const file=new File([blob],name,{type:'image/jpeg'});
  $('#camShare').hidden=!(navigator.canShare&&navigator.canShare({files:[file]}));
  $('#camShare').onclick=async ev=>{ev.stopPropagation();try{await navigator.share({files:[file],title:'День Маркетолога StP 2026'})}catch(e){log('share:',e.name)}};
  $('#camDone').onclick=ev=>{ev.stopPropagation();closeCam();setState('idle')};
  busy=null;const s2=newTurn();busy=null;sayLine(KarenCommands.sys('photo_done'),s2,null,{after:false}).then(()=>{if(!s2.aborted&&state==='speaking')setState('proud',3000)});
  camTimer=setTimeout(()=>{closeCam();setState('idle')},dance.on?9000:45000); // dancing → back to the dance after the photo
}

// ---------- hidden menu: 2 s long-press top-right ----------
const corner=$('#corner');let lp=null;
corner.addEventListener('pointerdown',()=>{lp=setTimeout(openMenu,2000)});
['pointerup','pointercancel','pointerleave'].forEach(ev=>corner.addEventListener(ev,()=>clearTimeout(lp)));
function openMenu(){$('#menu').hidden=false;setState(state)}
const grid=$('#emoGrid');
for(const e of KAREN_EMOTIONS){const b=document.createElement('button');b.dataset.emo=e.id;b.title=e.description;b.innerHTML=`<img src="assets/${e.asset_svg}" alt=""><span>${e.name_ru}</span><small>${e.id}</small>`;
  b.onclick=()=>{stop(false);$('#menu').hidden=true;setState(e.id,e.id==='idle'?0:(e.id==='photo'?5000:2500))};grid.append(b)}
const acts={
  close:()=>$('#menu').hidden=true,
  stop:()=>{stop(true);log('STOP')},
  fullscreen:async()=>{try{await document.documentElement.requestFullscreen({navigationUI:'hide'});await screen.orientation?.lock?.('landscape')}catch(e){log('fullscreen:',e.message)}},
  photo:()=>{$('#menu').hidden=true;photoFlow(KarenCommands.line(KarenCommands.byId('photo')),null)},
  send:()=>{const t=$('#debugText').value.trim();if(t){$('#menu').hidden=true;handleText(t,performance.now())}},
  mictest:async()=>{try{await openMic();const m=$('#micMeter'),end=Date.now()+5000;(function l(){m.value=micAnalyser?rms(micAnalyser):0;if(Date.now()<end)requestAnimationFrame(l);else if(!wake.wanted)closeMic()})()}catch(e){log('mic test:',e.name)}},
  health:async()=>{try{const h=await backend().health();log('health:',JSON.stringify(h))}catch(e){log('health failed:',e.message)}},
};
$('#menu').addEventListener('click',e=>{const a=e.target.closest('[data-act]');if(a)acts[a.dataset.act]()});
const bind=(id,key,prop='value',cast=String)=>{const el=$(id);el[prop]=cfg[key];el.addEventListener('change',()=>{cfg[key]=cast(el[prop]);SS(key,prop==='checked'?(el[prop]?'1':'0'):el[prop]);setState(state)})};
bind('#endpoint','endpoint');bind('#token','token');bind('#cloudToggle','cloud','checked',Boolean);if(location.hash==='#advanced')$('#adv').hidden=false;bind('#volume','volume','value',Number);bind('#role','role');bind('#subsToggle','subs','checked',Boolean);
bind('#llmToggle','llm','checked',Boolean);
$('#endpoint').addEventListener('change',e=>{if(/api-key|iam|token=|[?&]key=/i.test(e.target.value)){e.target.value='';cfg.endpoint='';SS('endpoint','');log('URL с ключом отклонён')}});

const CMD_TITLE={dance_stop:'Остановить танец («Карен, стоп», «хватит танцевать»)',photo:'Фото с таймером 5 с («сделай фото», «селфи»)',love_declaration:'Признание («я тебя люблю»)',love:'«Ты меня любишь?»',dance:'Бесконечный танец («потанцуем», «танцуй»)',hello:'Знакомство («привет», «кто ты»)',plankton:'Про Планктона',worldplan:'План захвата мира',smarter:'Кто умнее / кто главный',marketer:'Про маркетологов',jealous:'Ревность («Алиса», «другая нейросеть»)',rateme:'Оцени меня',reboot:'Перезагрузка'};
KarenCommands.ready.then(()=>{const d=KarenCommands.data;$('#cmdList').innerHTML='<p>Коснитесь экрана и скажите фразу (можно с «Карен, …»).</p>'+d.commands.map(c=>`<p><b>${CMD_TITLE[c.id]||c.id}</b><br><small>${c.phrases.map(p=>p.replace(/\.$/,'')).join(', ')} · ${c.lines.length} вар.</small></p>`).join('')});
// idle -> sleep after 3 min inactivity
let lastAct=Date.now();addEventListener('pointerdown',()=>{lastAct=Date.now();if(state==='sleep')setState('idle')});
setInterval(()=>{if(state==='idle'&&!dance.on&&Date.now()-lastAct>180e3)setState('sleep')},5000);

// boot: reboot -> idle
try{indexedDB.deleteDatabase("/vosk")}catch{} // v1.4 left a ~90 MB IndexedDB copy of the model; we keep only the Cache Storage tar now
facesReady.then(()=>{KarenCommands.ready.then(()=>loadAsr(false));renderInstall();setState('reboot');setTimeout(()=>state==='reboot'&&setState('idle'),1400)});
if('serviceWorker' in navigator&&location.protocol!=='file:') navigator.serviceWorker.register('sw.js').catch(e=>log('sw:',e.message));
})();
