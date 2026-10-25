// Deterministic command phrases → emotion (checked BEFORE the LLM). Data: commands.json.
(function(){
let DATA={name:['карен'],commands:[]};
const norm=s=>' '+String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9\s]/g,' ').replace(/\s+/g,' ').trim()+' ';
function phraseHit(t,ph){return norm(ph).trim().split(' ').every(st=>t.includes(' '+st))}
const K={
  ready:fetch('commands.json').then(r=>r.json()).then(d=>{DATA=d}).catch(()=>{}),
  norm,
  match(text){const t=norm(text);for(const c of DATA.commands) if(c.phrases.some(p=>phraseHit(t,p))) return c.emotion;return null},
  hasName(text){const t=norm(text);return DATA.name.some(n=>phraseHit(t,n))},
  // text after the wake name, if any (for webkitSpeechRecognition transcripts)
  afterName(text){const t=norm(text).trim();for(const n of DATA.name){const i=t.indexOf(norm(n).trim());if(i>=0)return t.slice(i+norm(n).trim().length).trim()}return null},
  get data(){return DATA}
};
window.KarenCommands=K;
})();
