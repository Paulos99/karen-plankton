// Local intent matching (no network) → prerecorded Yandex SpeechKit lines. Data: commands.json.
(function(){
let DATA={name:['карен'],commands:[],system:{}};
const norm=s=>' '+String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-z\u0430-\u044f0-9\s]/g,' ').replace(/\s+/g,' ').trim()+' ';
// stem 'люб' = prefix of a word; stem ending with '.' = whole word only ('пока.' ≠ 'покажи')
function phraseHit(t,ph){return String(ph).toLowerCase().replace(/ё/g,'е').trim().split(/\s+/).every(st=>st.endsWith('.')?t.includes(' '+st.slice(0,-1)+' '):t.includes(' '+st))}
const last={};
// «text {emo} more» → clean text + steps [{at:0..1 fraction of audio, emotion}]
function parse(l,emotion,id,follow){const steps=[];let out='';String(l.text).split(/(\{\w+\})/).forEach(p=>{const m=p.match(/^\{(\w+)\}$/);if(m)steps.push({pos:out.length,emotion:m[1]});else out+=p});
  out=out.replace(/\s+/g,' ').trim();const n=Math.max(1,out.length);
  return {...l,text:out,steps:steps.map(s=>({at:Math.min(.97,s.pos/n),emotion:s.emotion})),emotion,id,follow:(l.follow||follow)?{...(follow||{}),...(l.follow||{})}:null}}
const lineFiles=ls=>(ls||[]).flatMap(l=>[l.file,...Object.values(l.follow||{}).flatMap(b=>lineFiles(b.lines))]);
function pick(lines,key){if(!lines||!lines.length)return null;let i=Math.floor(Math.random()*lines.length);if(lines.length>1&&i===last[key])i=(i+1)%lines.length;last[key]=i;return lines[i]}
const K={
  ready:fetch('commands.json').then(r=>r.json()).then(d=>{DATA=d}).catch(()=>{}),
  norm,
  intent(text){const t=norm(text);for(const c of DATA.commands) if(c.phrases.some(p=>phraseHit(t,p))) return c;return null},
  match(text){const c=K.intent(text);return c?c.emotion:null},
  hasName(text){const t=norm(text);return DATA.name.some(n=>phraseHit(t,n))},
  stripName(text){let t=norm(text);for(const n of DATA.name){t=t.replace(new RegExp(' '+n.replace(/\s+/g,' ')+'[а-я]*','g'),' ')}return t.replace(/\s+/g,' ').trim()},
  line(c){const l=pick(c.lines,c.id);return l&&parse(l,c.emotion,c.id,c.follow)},
  branch(f,k){const b=f&&f[k];if(!b)return null;const l=pick(b.lines,'b:'+k+b.lines[0].file);return l&&parse(l,b.emotion,k,b.follow)},
  yesno(text){const t=norm(text);if((DATA.no||[]).some(p=>phraseHit(t,p)))return 'no';if((DATA.yes||[]).some(p=>phraseHit(t,p)))return 'yes';return null},
  sys(id){const s=DATA.system[id];if(!s)return null;const l=pick(s.lines,'sys:'+id);return l&&parse(l,s.emotion,id)},
  allFiles(){return DATA.commands.flatMap(c=>lineFiles(c.lines).concat(Object.values(c.follow||{}).flatMap(b=>lineFiles(b.lines)))).concat(Object.values(DATA.system).flatMap(s=>lineFiles(s.lines)))},
  get data(){return DATA}
};
window.KarenCommands=K;
})();
