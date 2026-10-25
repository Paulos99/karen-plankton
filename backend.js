// Backend abstraction. Cloud = public HTTPS endpoint (no secrets here!). Demo = scripted, offline.
(function(){
const IDS = KAREN_EMOTIONS.map(e=>e.id);
const clamp=(v,a,b,d)=>{v=Number(v);return Number.isFinite(v)?Math.min(b,Math.max(a,v)):d};
function validate(r){
  if(!r||typeof r!=='object') r={speech:String(r||'')};
  let speech=String(r.speech||'').replace(/\s+/g,' ').trim().slice(0,280)||'Повтори, пожалуйста.';
  let emotion=IDS.includes(r.emotion)?r.emotion:'speaking';
  return {speech,emotion,intensity:clamp(r.intensity,0,1,.5),hold_ms:Math.round(clamp(r.hold_ms,300,3500,1200)),
    target:r.target==='plankton'?'plankton':'guest',source:r.source||'cloud'};
}
const SCRIPT={
 plankton:[
  ['гени', {speech:'Шелдон, я считаю. В отличие от некоторых, это моя основная функция.',emotion:'sarcasm'}],
  ['получится',{speech:'У нас — возможно. У тебя в одиночку статистика была бы грустнее.',emotion:'love'}],
  ['хватит',{speech:'Я только начала, Шелдон.',emotion:'annoyed'}],
  ['план',{speech:'Опять план? Я уже посчитала вероятность. Не спрашивай.',emotion:'suspicious'}],
  ['нейросет',{speech:'Другая нейросеть? Интересно. Расскажи подробнее, пока я обновляю твой пароль.',emotion:'jealous'}],
 ],
 guest:[
  ['делаешь',{speech:'Слежу за тем, чтобы гениальный план мужа пережил хотя бы одну вечеринку.',emotion:'proud'}],
  ['настоящ',{speech:'Я — Карен в фанатском приложении. Но сарказм работает совершенно по-настоящему.',emotion:'smile'}],
  ['фото',{speech:'Снимай. С этого ракурса я особенно вычислительна.',emotion:'photo'}],
  ['привет',{speech:'Здравствуй, гость. Мой муж уже рассказал тебе про захват мира? Делай вид, что впечатлён.',emotion:'smile'}],
 ]};
const FALLBACK=[
 {speech:'Любопытно. Я запишу это в раздел «гипотезы без доказательств».',emotion:'sarcasm'},
 {speech:'Не расслышала. На вечеринке даже у суперкомпьютера бывает шум в каналах.',emotion:'confused'},
 {speech:'Ха. Это было почти смешно. Почти.',emotion:'laugh'},
 {speech:'Неожиданно. Обычно сюрпризы здесь устраиваю я.',emotion:'surprised'},
 {speech:'Ответ очевиден, но я дам тебе ещё секунду почувствовать себя умным.',emotion:'proud'},
];
let fbi=0;
const Demo={
  name:'demo',
  async health(){return {ok:true,mode:'demo',version:'offline'}},
  async chat({text,role}){
    await new Promise(r=>setTimeout(r,500+Math.random()*400));
    const t=(text||'').toLowerCase();
    for(const [k,v] of (SCRIPT[role]||[]).concat(SCRIPT.guest,SCRIPT.plankton)) if(t.includes(k)) return validate({...v,target:role,source:'demo'});
    return validate({...FALLBACK[fbi++%FALLBACK.length],target:role,source:'demo'});
  },
  randomLine(role){const l=SCRIPT[role]||SCRIPT.guest;return l[Math.floor(Math.random()*l.length)][0]},
  async stt(){return {text:'',confidence:0,demo:true}},
  async tts(){return null}, // demo: browser speechSynthesis (if any) + simulated envelope
};
function Cloud(base,token){
  base=base.replace(/\/+$/,'');
  async function req(path,opt={},ms=12000){
    const ac=new AbortController(),t=setTimeout(()=>ac.abort(),ms);
    if(opt.signal) opt.signal.addEventListener('abort',()=>ac.abort());
    try{const r=await fetch(base+path,{...opt,headers:{...(opt.headers||{}),'X-Karen-Token':token},signal:ac.signal});
      if(!r.ok){const e=new Error('http '+r.status);e.status=r.status;throw e}return r;}
    finally{clearTimeout(t)}
  }
  return {name:'cloud',
    async health(){return (await req('/health',{},5000)).json()},
    async chat(body,signal){const r=await req('/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
      let j;try{j=await r.json()}catch{j={speech:await r.text()}}return validate(j)},
    // audio: Blob of 16kHz mono LPCM (audio/l16) — see app.js encoder
    async stt(blob,signal){return (await req('/stt',{method:'POST',headers:{'Content-Type':'audio/l16; rate=16000; channels=1'},body:blob,signal},15000)).json()},
    async tts(body,signal){const r=await req('/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal},15000);
      const ct=r.headers.get('content-type')||'';if(ct.includes('json')){const j=await r.json();return new Blob([Uint8Array.from(atob(j.audio_base64),c=>c.charCodeAt(0))],{type:j.mime})}
      return r.blob()}};
}
window.KarenBackend={Demo,Cloud,validate,IDS};
})();
