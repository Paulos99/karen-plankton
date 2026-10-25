(()=>{'use strict';
const $=s=>document.querySelector(s), B=KarenBackend;
const T=180; // transition ms (120–220)
const LS=k=>localStorage.getItem('karen.'+k), SS=(k,v)=>localStorage.setItem('karen.'+k,v);
const DEFAULT_EP='https://d5dtcref7c17ac6u1m8s.d8epmcec.apigw.yandexcloud.net';
const cfg={endpoint:LS('endpoint')||DEFAULT_EP,token:LS('token')||'',offline:LS('offline')==='1',volume:+(LS('volume')||1),role:LS('role')||'guest',subs:LS('subs')==='1'};
const WAVE_STATES=new Set(['idle','speaking','listening','thinking','reboot','sleep']); // drawn live on canvas
const log=(...a)=>{const l=$('#log');l.textContent=(new Date().toLocaleTimeString()+' '+a.join(' ')+'\n'+l.textContent).slice(0,4000)};

// ---------- faces (SVG assets, precached) ----------
const faces={};
for(const e of KAREN_EMOTIONS){const i=new Image();i.src='assets/'+e.asset_svg;i.alt='';i.dataset.id=e.id;$('#faces').append(i);faces[e.id]=i;}

// ---------- state machine ----------
let state='idle',holdTimer=null,busy=null,level=0,targetLevel=0;
function setState(s,holdMs){
  if(!B.IDS.includes(s)) s='idle';
  state=s;document.body.dataset.state=s;clearTimeout(holdTimer);
  const face=!WAVE_STATES.has(s);
  document.body.classList.toggle('face',face);
  for(const id in faces) faces[id].classList.toggle('on',face&&id===s);
  if(holdMs) holdTimer=setTimeout(()=>setState(s==='photo'?'idle':'idle'),holdMs);
  $('#status').textContent=`состояние: ${s} · режим: ${backend().name}`;
}
window.karen={setState,get state(){return state}}; // test hook

// ---------- waveform ----------
const cv=$('#wave'),cx=cv.getContext('2d');
function resize(){const r=devicePixelRatio||1;cv.width=innerWidth*r;cv.height=innerHeight*r}
addEventListener('resize',resize);resize();
let t0=performance.now();
function draw(now){
  const t=(now-t0)/1000,W=cv.width,H=cv.height,mid=H/2,r=devicePixelRatio||1;
  level+=(targetLevel-level)*.25;
  cx.fillStyle='#08141D';cx.fillRect(0,0,W,H);
  const x0=W*.11,x1=W*.89,n=160;
  cx.lineWidth=Math.max(4,H*.022);cx.lineCap='round';cx.lineJoin='round';
  cx.strokeStyle='#BEFF31';cx.shadowColor='#BEFF31';cx.shadowBlur=18*r;
  let alpha=1;
  if(state==='sleep') alpha=.35+.1*Math.sin(t*1.2);
  cx.globalAlpha=alpha;cx.beginPath();
  for(let i=0;i<=n;i++){
    const p=i/n,x=x0+(x1-x0)*p,env=Math.sin(Math.PI*p);let y=0;
    if(state==='idle') y=Math.sin(p*18+t*2)*H*.006*env;
    else if(state==='speaking') y=(Math.sin(p*40+t*14)*.6+Math.sin(p*13-t*9)*.4)*H*.32*(.08+level)*env;
    else if(state==='listening') y=Math.sin(p*26+t*8)*H*.22*(.03+level)*env;
    else if(state==='thinking'){const c=(t*.6)%1;y=Math.exp(-((p-c)**2)/.002)*H*.06*Math.sin(p*60)}
    else if(state==='reboot') y=0;
    i?cx.lineTo(x,mid-y):cx.moveTo(x,mid-y);
  }
  if(state==='thinking'){cx.stroke();cx.beginPath()} else cx.stroke();
  if(state==='reboot'){for(let k=0;k<3;k++){const a=(Math.sin(t*5-k*.8)+1)/2;cx.globalAlpha=.25+.75*a;cx.beginPath();cx.arc(W/2+(k-1)*W*.05,mid-H*.12,H*.018,0,7);cx.fillStyle='#BEFF31';cx.fill()}}
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
function stopAudio(){if(playing){try{playing.stop()}catch{}playing=null}speechSynthesis&&speechSynthesis.cancel()}
async function playBlob(blob,signal){
  const ctx=ac(),buf=await ctx.decodeAudioData(await blob.arrayBuffer()),s=ctx.createBufferSource(),g=ctx.createGain(),an=ctx.createAnalyser();
  g.gain.value=cfg.volume;s.buffer=buf;s.connect(an);an.connect(g);g.connect(ctx.destination);an.fftSize=1024;playing=s;
  return new Promise(res=>{const tick=()=>{if(playing!==s)return res();targetLevel=rms(an);requestAnimationFrame(tick)};
    s.onended=()=>{if(playing===s)playing=null;targetLevel=0;res()};signal&&signal.addEventListener('abort',()=>{try{s.stop()}catch{}});s.start();tick()});
}
// offline/demo speech: browser voice if present (explicitly NOT SpeechKit) + simulated envelope
function speakLocal(text,signal){
  return new Promise(res=>{
    const ms=Math.min(9000,600+text.length*55);let done=false,t=performance.now();
    const fin=()=>{if(done)return;done=true;targetLevel=0;res()};
    const env=()=>{if(done)return;const k=(performance.now()-t)/1000;targetLevel=.35+.3*Math.abs(Math.sin(k*9))*Math.abs(Math.sin(k*2.3));requestAnimationFrame(env)};env();
    try{if('speechSynthesis' in window&&speechSynthesis.getVoices().some(v=>/ru/i.test(v.lang))){const u=new SpeechSynthesisUtterance(text);u.lang='ru-RU';u.volume=cfg.volume;u.rate=1.02;u.pitch=.9;u.onend=fin;u.onerror=fin;speechSynthesis.speak(u);setTimeout(fin,ms+4000)}else setTimeout(fin,ms)}catch{setTimeout(fin,ms)}
    signal&&signal.addEventListener('abort',()=>{speechSynthesis&&speechSynthesis.cancel();fin()});
  });
}

// ---------- backend ----------
function backend(){return (!cfg.offline&&cfg.endpoint&&cfg.token)?B.Cloud(cfg.endpoint,cfg.token):B.Demo}
let history=[],lastTurn=0;
async function turn(text){
  stop(false);const ac_=new AbortController();busy=ac_;const sig=ac_.signal;
  if(Date.now()-lastTurn>5*60e3) history=[];lastTurn=Date.now();
  setState('thinking');
  let r,be=backend();
  try{r=await be.chat({text:text.slice(0,500),role:cfg.role,history:history.slice(-10)},sig)}
  catch(e){if(sig.aborted)return;log('chat failed:',e.message);setState('error',900);await sleep(900,sig);be=B.Demo;r=await B.Demo.chat({text,role:cfg.role})}
  if(sig.aborted) return;
  history.push({role:'user',content:text},{role:'assistant',content:r.speech});
  log(`[${r.source}] ${r.emotion}: ${r.speech}`);
  showSubs(r.speech);setState('speaking');
  let blob=null;
  if(be.name==='cloud'){try{blob=await be.tts({text:r.speech,emotion:r.emotion},sig)}catch(e){log('tts failed:',e.message)}}
  if(sig.aborted) return;
  try{blob?await playBlob(blob,sig):await speakLocal(r.speech,sig)}catch(e){log('play failed:',e.message)}
  if(sig.aborted) return;
  showSubs('');
  const react=['speaking','idle','listening','thinking'].includes(r.emotion)?null:r.emotion;
  if(react) setState(react,Math.min(r.hold_ms,react==='photo'?5000:3500)); else setState('idle');
  busy=null;
}
const sleep=(ms,sig)=>new Promise(r=>{const t=setTimeout(r,ms);sig&&sig.addEventListener('abort',()=>{clearTimeout(t);r()})});
function stop(full=true){if(busy){busy.abort();busy=null}stopAudio();targetLevel=0;if(rec){rec.stop();rec=null}if(full){closeMic();showSubs('');setState('idle')}}
function showSubs(t){const s=$('#subs');s.hidden=!cfg.subs||!t;s.textContent=t}

// ---------- push-to-talk ----------
const ptt=$('#ptt');let pttOn=false,pttStart=0,lvlLoop=null;
ptt.addEventListener('pointerdown',async e=>{e.preventDefault();if(pttOn)return;pttOn=true;ptt.classList.add('held');stop(false);pttStart=Date.now();
  try{await openMic();if(!pttOn)return;setState('listening');startRecord();
    const loop=()=>{if(!pttOn)return;targetLevel=micAnalyser?rms(micAnalyser):0;lvlLoop=requestAnimationFrame(loop)};loop();
    setTimeout(()=>{if(pttOn)endPtt()},12000);
  }catch(err){pttOn=false;ptt.classList.remove('held');log('mic error:',err.name);setState('error',1200)}});
async function endPtt(){if(!pttOn)return;pttOn=false;ptt.classList.remove('held');cancelAnimationFrame(lvlLoop);targetLevel=0;
  if(!rec){return}const {blob,seconds}=rec.stop();rec=null;
  if(seconds<.6){setState('idle');return}
  const be=backend();
  if(be.name==='demo'){turn(B.Demo.randomLine(cfg.role));return} // offline: no STT, scripted line
  setState('thinking');
  try{const r=await be.stt(blob);if(!r.text){setState('confused',1500);return}turn(r.text)}catch(e){log('stt failed:',e.message);setState('error',900);setTimeout(()=>turn(B.Demo.randomLine(cfg.role)),900)}}
['pointerup','pointercancel','pointerleave'].forEach(ev=>ptt.addEventListener(ev,endPtt));
addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&$('#menu').hidden)ptt.dispatchEvent(new PointerEvent('pointerdown'))});
addEventListener('keyup',e=>{if(e.code==='Space')endPtt()});

// ---------- hidden menu: 2 s long-press top-right ----------
const corner=$('#corner');let lp=null;
corner.addEventListener('pointerdown',()=>{lp=setTimeout(openMenu,2000)});
['pointerup','pointercancel','pointerleave'].forEach(ev=>corner.addEventListener(ev,()=>clearTimeout(lp)));
function openMenu(){$('#menu').hidden=false;$('#status').textContent=`состояние: ${state} · режим: ${backend().name}`}
const grid=$('#emoGrid');
for(const e of KAREN_EMOTIONS){const b=document.createElement('button');b.dataset.emo=e.id;b.title=e.description;b.innerHTML=`<img src="assets/${e.asset_svg}" alt=""><span>${e.name_ru}</span><small>${e.id}</small>`;
  b.onclick=()=>{stop(false);$('#menu').hidden=true;setState(e.id,e.id==='idle'?0:(e.id==='photo'?5000:2500))};grid.append(b)}
const acts={
  close:()=>$('#menu').hidden=true,
  stop:()=>{stop(true);log('STOP')},
  fullscreen:async()=>{try{await document.documentElement.requestFullscreen({navigationUI:'hide'});await screen.orientation?.lock?.('landscape')}catch(e){log('fullscreen:',e.message)}},
  photo:()=>{stop(false);$('#menu').hidden=true;document.body.classList.add('photo');setState('photo',12000);setTimeout(()=>document.body.classList.remove('photo'),12000)},
  send:()=>{const t=$('#debugText').value.trim();if(t){$('#menu').hidden=true;turn(t)}},
  demoline:()=>{$('#menu').hidden=true;turn(B.Demo.randomLine(cfg.role))},
  mictest:async()=>{try{await openMic();const m=$('#micMeter'),end=Date.now()+5000;(function l(){m.value=micAnalyser?rms(micAnalyser):0;if(Date.now()<end)requestAnimationFrame(l);else closeMic()})()}catch(e){log('mic test:',e.name)}},
  health:async()=>{try{const h=await backend().health();log('health:',JSON.stringify(h))}catch(e){log('health failed:',e.message)}},
};
$('#menu').addEventListener('click',e=>{const a=e.target.closest('[data-act]');if(a)acts[a.dataset.act]()});
const bind=(id,key,prop='value',cast=String)=>{const el=$(id);el[prop]=cfg[key];el.addEventListener('change',()=>{cfg[key]=cast(el[prop]);SS(key,prop==='checked'?(el[prop]?'1':'0'):el[prop]);setState(state)})};
bind('#endpoint','endpoint');bind('#token','token');bind('#offline','offline','checked',Boolean);bind('#volume','volume','value',Number);bind('#role','role');bind('#subsToggle','subs','checked',Boolean);
$('#endpoint').addEventListener('change',e=>{if(/api-key|iam|token=|[?&]key=/i.test(e.target.value)){e.target.value='';cfg.endpoint='';SS('endpoint','');log('URL с ключом отклонён')}});

// idle -> sleep after 3 min inactivity
let lastAct=Date.now();addEventListener('pointerdown',()=>{lastAct=Date.now();if(state==='sleep')setState('idle')});
setInterval(()=>{if(state==='idle'&&Date.now()-lastAct>180e3)setState('sleep')},5000);

// boot: reboot -> idle
setState('reboot');setTimeout(()=>state==='reboot'&&setState('idle'),1400);
if('serviceWorker' in navigator&&location.protocol!=='file:') navigator.serviceWorker.register('sw.js').catch(e=>log('sw:',e.message));
})();
