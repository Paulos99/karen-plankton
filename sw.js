const V='karen-v2';
const FILES=['./','index.html','styles.css','app.js','backend.js','emotions.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','assets/emotions.json',
...['idle','speaking','listening','thinking','smile','laugh','sarcasm','suspicious','annoyed','angry','love','jealous','surprised','sad','sleep','error','reboot','proud','confused','photo'].map(i=>`assets/svg/${i}.svg`)];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin) return; // never cache backend/API
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(r=>r||fetch(e.request)));});
