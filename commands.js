// Local intent matching (no network) → prerecorded Yandex SpeechKit lines. Data: commands.json.
(function(){
let DATA={name:['карен'],commands:[],system:{}};
const norm=s=>' '+String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-z\u0430-\u044f0-9\s]/g,' ').replace(/\s+/g,' ').trim()+' ';
// stem 'люб' = prefix of a word; stem ending with '.' = whole word only ('пока.' ≠ 'покажи')
function phraseHit(t,ph){return String(ph).toLowerCase().replace(/ё/g,'е').trim().split(/\s+/).every(st=>st.endsWith('.')?t.includes(' '+st.slice(0,-1)+' '):t.includes(' '+st))}
const last={};
function pick(lines,key){if(!lines||!lines.length)return null;let i=Math.floor(Math.random()*lines.length);if(lines.length>1&&i===last[key])i=(i+1)%lines.length;last[key]=i;return lines[i]}
const K={
  ready:fetch('commands.json').then(r=>r.json()).then(d=>{DATA=d}).catch(()=>{}),
  norm,
  intent(text){const t=norm(text);for(const c of DATA.commands) if(c.phrases.some(p=>phraseHit(t,p))) return c;return null},
  match(text){const c=K.intent(text);return c?c.emotion:null},
  hasName(text){const t=norm(text);return DATA.name.some(n=>phraseHit(t,n))},
  stripName(text){let t=norm(text);for(const n of DATA.name){t=t.replace(new RegExp(' '+n.replace(/\s+/g,' ')+'[а-я]*','g'),' ')}return t.replace(/\s+/g,' ').trim()},
  line(c){const l=pick(c.lines,c.id);return l&&{...l,emotion:c.emotion,id:c.id}},
  sys(id){const s=DATA.system[id];if(!s)return null;const l=pick(s.lines,'sys:'+id);return l&&{...l,emotion:s.emotion,id}},
  allFiles(){return DATA.commands.flatMap(c=>c.lines.map(l=>l.file)).concat(Object.values(DATA.system).flatMap(s=>s.lines.map(l=>l.file)))},
  get data(){return DATA}
};
window.KarenCommands=K;
})();
