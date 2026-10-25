(()=>{'use strict';
const $=s=>document.querySelector(s), B=KarenBackend;
const T=180; // transition ms (120–220)
const LS=k=>localStorage.getItem('karen.'+k), SS=(k,v)=>localStorage.setItem('karen.'+k,v);
const DEFAULT_EP='https://d5dtcref7c17ac6u1m8s.d8epmcec.apigw.yandexcloud.net';
const cfg={endpoint:LS('endpoint')||DEFAULT_EP,token:LS('token')||'',cloud:LS('cloud')==='1',volume:+(LS('volume')||1),role:LS('role')||'guest',subs:LS('subs')==='1',llm:LS('llm')==='1'};
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
const WAVE_STATES=new Set(['idle','speaking','thinking','reboot']); // drawn live on canvas
let state='idle',holdTimer=null,busy=null,level=0,targetLevel=0,mood=null,moodTimers=[];
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
  $('#status').textContent=`состояние: ${s} · распознавание: ${ASR.state==='ready'?'офлайн, готово':ASR.state==='loading'?'загружается…':'нет'}`;
}
function setMood(m){mood=(m&&!WAVE_STATES.has(m))?m:null;if(state==='speaking')setState('speaking')}
function clearMood(){mood=null;moodTimers.forEach(clearTimeout);moodTimers=[]}
window.karen={setState,get state(){return state},get mood(){return mood},match:t=>KarenCommands.match(t),intent:t=>KarenCommands.intent(t),get lastLatency(){return lastLat},_voiceAt:0,get asr(){return ASR.state},handleText:(t)=>handleText(t,performance.now()),photo:()=>photoFlow(KarenCommands.line(KarenCommands.intent('фото')),null)};

// ---------- waveform ----------
const cv=$('#wave'),cx=cv.getContext('2d');
function resize(){const r=devicePixelRatio||1;cv.width=innerWidth*r;cv.height=innerHeight*r}
addEventListener('resize',resize);resize();
let t0=performance.now();
function draw(now){
  const t=(now-t0)/1000,W=cv.width,H=cv.height,r=devicePixelRatio||1;const mid=document.body.classList.contains('overlay')?H*.78:H/2;
  level+=(targetLevel-level)*.25;
  cx.fillStyle='#08141D';cx.fillRect(0,0,W,H);
  const x0=W*.11,x1=W*.89,n=160;
  cx.lineWidth=Math.max(4,H*.022);cx.lineCap='round';cx.lineJoin='round';
  cx.strokeStyle='#BEFF31';cx.shadowColor='#BEFF31';cx.shadowBlur=18*r;
  let alpha=1;
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
  if(state==='thinking'){for(let k=0;k<3;k++){const ang=t*2.4+k*2.094;cx.globalAlpha=.5+.5*Math.sin(t*3+k);cx.beginPath();cx.arc(W/2+Math.cos(ang)*H*.1,mid-H*.16+Math.sin(ang)*H*.04,H*.016,0,7);cx.fillStyle='#BEFF31';cx.fill()}}
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
function stopAudio(){if(playing){try{playing.stop()}catch{}playing=null}}
async function playBuf(buf,signal){
  const ctx=ac(),s=ctx.createBufferSource(),g=ctx.createGain(),an=ctx.createAnalyser();
  g.gain.value=cfg.volume;s.buffer=buf;s.connect(an);an.connect(g);g.connect(ctx.destination);an.fftSize=1024;playing=s;
  return new Promise(res=>{const tick=()=>{if(playing!==s)return res();targetLevel=rms(an);requestAnimationFrame(tick)};
    s.onended=()=>{if(playing===s)playing=null;targetLevel=0;res()};signal&&signal.addEventListener('abort',()=>{try{s.stop()}catch{}res()});s.start();window.karen._voiceAt=performance.now();tick()});
}
async function playBlob(blob,signal){return playBuf(await ac().decodeAudioData(await blob.arrayBuffer()),signal)}
// prerecorded SpeechKit (jane) lines: bytes fetched at boot (SW-precached), decoded once
const raw={},decoded={};
KarenCommands.ready.then(()=>{for(const f of KarenCommands.allFiles()) raw[f]=fetch(f).then(r=>r.ok?r.arrayBuffer():null).catch(()=>null)});
async function clip(f){if(decoded[f])return decoded[f];const ab=await (raw[f]||(raw[f]=fetch(f).then(r=>r.ok?r.arrayBuffer():null)));if(!ab)throw new Error('no audio '+f);return decoded[f]=await ac().decodeAudioData(ab.slice(0))}
let warmed=false;function warmDecode(){if(warmed)return;warmed=true;for(const f of Object.keys(raw)) clip(f).catch(()=>{})}
// silent envelope (never a browser voice) — only if an audio file is missing
function fakeVoice(text,signal){return new Promise(res=>{const ms=Math.min(6000,600+text.length*45),t=performance.now();let done=false;const fin=()=>{if(!done){done=true;targetLevel=0;res()}};
  (function env(){if(done)return;const k=(performance.now()-t)/1000;targetLevel=.35+.3*Math.abs(Math.sin(k*9));requestAnimationFrame(env)})();setTimeout(fin,ms);signal&&signal.addEventListener('abort',fin)})}

// ---------- backend ----------
function backend(){return (cfg.endpoint&&cfg.token)?B.Cloud(cfg.endpoint,cfg.token):B.Demo}
let history=[],lastTurn=0,lastLat=null;
const sleep=(ms,sig)=>new Promise(r=>{const t=setTimeout(r,ms);sig&&sig.addEventListener('abort',()=>{clearTimeout(t);r()})});
function newTurn(){stop(false);const a=new AbortController();busy=a;return a.signal}
function showSubs(t){const s=$('#subs');s.hidden=!cfg.subs||!t;s.textContent=t}
function stop(full=true){listenOn=false;clearMood();if(busy){busy.abort();busy=null}stopAudio();targetLevel=0;if(rec){rec.stop();rec=null}if(full){closeMic();closeCam();showSubs('');setState('idle')}}
function markLatency(t0){if(t0==null)return;lastLat=Math.round(window.karen._voiceAt-t0);log('задержка (конец речи → голос):',lastLat+' мс')}
// play one prerecorded line with its emotion; resolves when done
async function sayLine(l,sig,t0,{after=true}={}){
  if(!l)return;log(`[локально] ${l.id} ${l.emotion}: ${l.text}`);
  let buf=null;try{buf=await clip(l.file)}catch(e){log('audio:',e.message)}
  if(sig.aborted)return;
  clearMood();mood=WAVE_STATES.has(l.emotion)?null:l.emotion;showSubs(l.text);setState('speaking');
  const p=buf?playBuf(buf,sig):fakeVoice(l.text,sig);if(buf)markLatency(t0);await p;
  if(sig.aborted)return;showSubs('');clearMood();
  if(after){const react=WAVE_STATES.has(l.emotion)?null:l.emotion;react?setState(react,1800):setState('idle')}
}
// main router: text (from STT or debug field) → local intent → prerecorded voice. t0 = moment speech ended.
async function handleText(text,t0){
  const sig=newTurn();log('фраза:',text);
  const it=KarenCommands.intent(text);
  if(it&&it.id==='photo'){busy=null;return photoFlow(KarenCommands.line(it),t0)}
  if(it){await sayLine(KarenCommands.line(it),sig,t0);if(busy&&busy.signal===sig)busy=null;return}
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
let listenOn=false;
// ---- on-device recognition: vosk-browser (WASM) + vosk-model-small-ru, restricted grammar from commands.json ----
const ASR={model:null,state:'off',t:0};
function loadAsr(){
  if(ASR.state==='loading'||ASR.state==='ready'||!window.Vosk)return;ASR.state='loading';ASR.t=performance.now();
  Vosk.createModel(new URL('vosk/vosk-ru-small.tar.gz',location.href).href,-1).then(m=>{ASR.model=m;ASR.state='ready';ASR.loadMs=Math.round(performance.now()-ASR.t);log('офлайн-распознавание готово за',ASR.loadMs+' мс');setState(state)})
   .catch(e=>{ASR.state='off';log('vosk:',e&&e.message)});
}
function grammar(){const d=KarenCommands.data;return JSON.stringify([...new Set([...(d.grammar||[]),...d.name.filter(n=>!n.includes(' '))])].concat('[unk]'))}
const VAD={silence:450,max:8000,noSpeech:5000};
async function listen(){
  if(listenOn){listenOn=false;return} // second tap = «я договорил»
  stop(false);ac();warmDecode();
  try{await openMic()}catch(e){log('mic error:',e.name);setState('error',1500);return}
  const offline=ASR.state==='ready',cloud=!offline&&cfg.cloud&&backend().name==='cloud';
  if(!offline&&!cloud){const s=newTurn();await sayLine(KarenCommands.sys('asr_loading')||KarenCommands.sys('fallback'),s,null);busy=null;return}
  listenOn=true;setState('listening');
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
    const v=micAnalyser?rms(micAnalyser):0,now=performance.now();targetLevel=Math.min(1,v*1.5);
    if(now-tS<300){floor=(floor*n+v)/(++n)}else{const th=Math.max(.05,floor*2.5);if(v>th){spoke=true;lastVoice=now}}
    const el=now-tS;
    if((spoke&&now-lastVoice>VAD.silence)||el>VAD.max||(!spoke&&el>VAD.noSpeech))return res();
    requestAnimationFrame(loop)})()});
  const manual=!listenOn;listenOn=false;targetLevel=0;const tEnd=performance.now(),tSpeech=spoke?lastVoice:tEnd;
  if(offline){
    if(!spoke&&!manual){proc.disconnect();src.disconnect();r.remove();setState('idle');return}
    if(final===null){r.retrieveFinalResult();const t=performance.now();await new Promise(z=>{(function w(){if(final!==null||performance.now()-t>700)return z();setTimeout(w,10)})()})}
    proc.disconnect();src.disconnect();try{r.remove()}catch{}
    const text=String(final||partial).replace(/\[unk\]/g,' ').replace(/\s+/g,' ').trim();
    window.karen._asrMs=Math.round(performance.now()-tEnd);log('офлайн:',text||'(пусто)',window.karen._asrMs+' мс');
    if(!text){const s=newTurn();await sayLine(KarenCommands.sys('fallback'),s,tSpeech);busy=null;return}
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
$('#stage').addEventListener('pointerdown',e=>{if(document.body.classList.contains('cam'))return;e.preventDefault();listen()});
addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&$('#menu').hidden)listen()});

// ---------- «Карен, сделай фото»: front camera, 5 s countdown, frame «День Маркетолога StP 2026» ----------
let camStream=null,camTimer=null;
function closeCam(){clearTimeout(camTimer);if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null}document.body.classList.remove('cam');const c=$('#cam');c.hidden=true;c.dataset.step=''}
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
  for(let i=5;i>0;i--){cd.textContent=i;cd.classList.remove('tick');void cd.offsetWidth;cd.classList.add('tick');await sleep(1000,sig);if(sig.aborted){closeCam();return}}
  cd.textContent='';cam.dataset.step='flash';
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
  busy=null;const s2=newTurn();busy=null;sayLine(KarenCommands.sys('photo_done'),s2,null,{after:false}).then(()=>{if(!s2.aborted&&state==='speaking')setState('proud')});
  camTimer=setTimeout(()=>{closeCam();setState('idle')},45000);
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
  photo:()=>{$('#menu').hidden=true;photoFlow(KarenCommands.line(KarenCommands.intent('фото')),null)},
  send:()=>{const t=$('#debugText').value.trim();if(t){$('#menu').hidden=true;handleText(t,performance.now())}},
  mictest:async()=>{try{await openMic();const m=$('#micMeter'),end=Date.now()+5000;(function l(){m.value=micAnalyser?rms(micAnalyser):0;if(Date.now()<end)requestAnimationFrame(l);else closeMic()})()}catch(e){log('mic test:',e.name)}},
  health:async()=>{try{const h=await backend().health();log('health:',JSON.stringify(h))}catch(e){log('health failed:',e.message)}},
};
$('#menu').addEventListener('click',e=>{const a=e.target.closest('[data-act]');if(a)acts[a.dataset.act]()});
const bind=(id,key,prop='value',cast=String)=>{const el=$(id);el[prop]=cfg[key];el.addEventListener('change',()=>{cfg[key]=cast(el[prop]);SS(key,prop==='checked'?(el[prop]?'1':'0'):el[prop]);setState(state)})};
bind('#endpoint','endpoint');bind('#token','token');bind('#cloudToggle','cloud','checked',Boolean);if(location.hash==='#advanced')$('#adv').hidden=false;bind('#volume','volume','value',Number);bind('#role','role');bind('#subsToggle','subs','checked',Boolean);
bind('#llmToggle','llm','checked',Boolean);
$('#endpoint').addEventListener('change',e=>{if(/api-key|iam|token=|[?&]key=/i.test(e.target.value)){e.target.value='';cfg.endpoint='';SS('endpoint','');log('URL с ключом отклонён')}});

KarenCommands.ready.then(()=>{const d=KarenCommands.data;$('#cmdList').innerHTML='<p>Коснитесь экрана → «Карен, …» (имя можно не говорить). Только «Карен» → «Слушаю», затем фраза.</p>'+d.commands.map(c=>`<p><b>${c.id}</b> (${c.emotion}): ${c.phrases.map(p=>p.replace(/\.$/,'')).join(', ')}</p>`).join('')});
// idle -> sleep after 3 min inactivity
let lastAct=Date.now();addEventListener('pointerdown',()=>{lastAct=Date.now();if(state==='sleep')setState('idle')});
setInterval(()=>{if(state==='idle'&&Date.now()-lastAct>180e3)setState('sleep')},5000);

// boot: reboot -> idle
facesReady.then(()=>{KarenCommands.ready.then(loadAsr);setState('reboot');setTimeout(()=>state==='reboot'&&setState('idle'),1400)});
if('serviceWorker' in navigator&&location.protocol!=='file:') navigator.serviceWorker.register('sw.js').catch(e=>log('sw:',e.message));
})();
