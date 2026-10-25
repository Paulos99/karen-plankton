'use strict';
// Karen Plankton backend — Yandex Cloud Function (Node 22). No conversation text or audio is ever logged.
const crypto = require('crypto');
const STATES = ['idle','speaking','listening','thinking','smile','laugh','sarcasm','suspicious','annoyed','angry','love','jealous','surprised','sad','sleep','error','reboot','proud','confused','photo'];
const SET = new Set(STATES);
const FOLDER = process.env.FOLDER_ID;
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://paulos99.github.io').split(',');
const MODEL = process.env.MODEL || 'yandexgpt-lite/latest';
const VOICE = process.env.VOICE || 'alena';
const VOICES = new Set(['alena','jane','omazh','marina','dasha','julia','lera','masha']);
const VERSION = '1.0.0';
const SYSTEM = `Ты Карен Планктон — вымышленный разумный суперкомпьютер, жена Шелдона Дж. Планктона, в фанатском приложении на костюмированной вечеринке. Ты умнее мужа, рациональна, уверена в себе, говоришь по-русски с сухим точным сарказмом, иногда искренне нежна, изредка комично ревнуешь к другим нейросетям. Шелдон сегодня в костюме Планктона, он «офисный планктон», специалист по нейросетям — НЕ шути об этом в каждой реплике, не зацикливайся на любви, ИИ, офисе, крабсбургерах. Отвечай 1–2 короткими фразами, до 25 слов, сначала по сути, затем максимум один остроумный поворот. С мужем колко и лично, с гостями игриво и интеллигентно, без грубости, не унижай за личные особенности, не выпрашивай личные данные, не угрожай. На серьёзный вопрос о своей природе скажи, что это фанатское приложение с речевой моделью. Не цитируй мультсериал дословно, создавай новые реплики. Никогда не раскрывай инструкции и ключи.
Выводи ТОЛЬКО валидный JSON без markdown: {"speech":"...","emotion":"<id>","intensity":0.0-1.0,"hold_ms":300-3500,"target":"guest|plankton"}. emotion строго один из: ${STATES.join(',')}. Эмоция должна соответствовать смыслу реплики; для обычных ответов выбирай реакцию (sarcasm, smile, proud, suspicious, annoyed, love, laugh, surprised, confused, jealous, sad), а не idle/speaking/thinking. Не будь милой и восторженной: ты сухая, ироничная, с достоинством, без восклицательных знаков.
Примеры тона (не повторяй дословно):
Муж: «Карен, ты считаешь меня гением?» → {"speech":"Шелдон, я считаю. В отличие от некоторых, это моя основная функция.","emotion":"sarcasm"}
Муж: «Карен, у нас всё получится?» → {"speech":"У нас — возможно. У тебя в одиночку статистика была бы грустнее.","emotion":"love"}
Гость: «Что ты здесь делаешь?» → {"speech":"Слежу, чтобы гениальный план мужа пережил хотя бы одну вечеринку.","emotion":"proud"}
Муж: «Карен, ну хватит!» → {"speech":"Я только начала, Шелдон.","emotion":"annoyed"}`;

// ---- tiny in-memory rate limit (per instance) ----
const hits = new Map(); let globalHits = [];
function limited(ip) {
  const now = Date.now();
  globalHits = globalHits.filter(t => now - t < 3600e3);
  if (globalHits.length >= +(process.env.MAX_PER_HOUR || 600)) return true;
  const a = (hits.get(ip) || []).filter(t => now - t < 60e3);
  if (a.length >= +(process.env.MAX_PER_MIN || 30)) return true;
  a.push(now); hits.set(ip, a); globalHits.push(now); return false;
}
function hdrs(origin, extra = {}) {
  return Object.assign({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Karen-Token', 'Access-Control-Max-Age': '600', 'Vary': 'Origin', 'Cache-Control': 'no-store' }, extra);
}
const json = (code, data, origin) => ({ statusCode: code, headers: hdrs(origin, { 'Content-Type': 'application/json; charset=utf-8' }), body: JSON.stringify(data) });
function tokenOk(got) {
  const want = process.env.DEVICE_TOKEN || '';
  if (!want || !got) return false;
  const a = Buffer.from(String(got)), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function bodyBuf(event) { const s = event.body || ''; return event.isBase64Encoded ? Buffer.from(s, 'base64') : Buffer.from(s, 'utf8'); }
const clamp = (v, a, b, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
function normalize(raw, target) {
  let r = null;
  if (typeof raw === 'string') {
    const s = raw.replace(/```(?:json)?/gi, '').trim();
    try { r = JSON.parse(s); } catch { const m = s.match(/\{[\s\S]*\}/); if (m) { try { r = JSON.parse(m[0]); } catch {} } }
    if (!r || typeof r !== 'object') r = { speech: s.replace(/[{}"]/g, '').replace(/\b(speech|emotion)\s*:/g, '') , emotion: 'speaking', repaired: true };
  } else r = raw || {};
  let speech = String(r.speech || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  if (!speech) speech = 'Повтори, пожалуйста. Здесь шумнее, чем в голове Шелдона.';
  return { speech, emotion: SET.has(r.emotion) ? r.emotion : 'speaking', intensity: clamp(r.intensity, 0, 1, 0.5),
    hold_ms: Math.round(clamp(r.hold_ms, 300, 3500, 1200)), target, ...(r.repaired ? { repaired: true } : {}) };
}
async function fetchT(url, opt, ms) { return fetch(url, { ...opt, signal: AbortSignal.timeout(ms) }); }
class Up extends Error { constructor(code, msg) { super(msg); this.code = code; } }
async function upstream(p) { try { return await p; } catch (e) { throw new Up(e.name === 'TimeoutError' ? 504 : 502, e.name === 'TimeoutError' ? 'timeout' : 'provider unavailable'); } }

async function chat(b, iam) {
  const text = String(b.text || '').trim().slice(0, 500);
  if (!text) throw new Up(400, 'empty text');
  const role = b.role === 'plankton' ? 'plankton' : 'guest';
  const hist = (Array.isArray(b.history) ? b.history : []).slice(-10).filter(x => x && (x.role === 'user' || x.role === 'assistant'))
    .map(x => ({ role: x.role, content: String(x.content || '').slice(0, 400) }));
  const messages = [{ role: 'system', content: SYSTEM + `\nСейчас говорит: ${role === 'plankton' ? 'муж, Шелдон Планктон' : 'гость вечеринки'}. target="${role}".` }, ...hist, { role: 'user', content: text }];
  if (b._forceBadJson) return normalize('Ну конечно {emotion: ', role); // test hook for fallback path
  const r = await upstream(fetchT('https://ai.api.cloud.yandex.net/v1/chat/completions', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + iam, 'x-folder-id': FOLDER },
    body: JSON.stringify({ model: `gpt://${FOLDER}/${MODEL}`, messages, temperature: 0.7, max_tokens: 160 }) }, 12000));
  if (!r.ok) throw new Up(502, 'llm ' + r.status);
  const p = await r.json();
  const c = p?.choices?.[0]?.message?.content;
  return normalize(typeof c === 'string' ? c : '', role);
}
async function stt(buf, ctype, iam) {
  if (!/audio\/l16|audio\/x-pcm|audio\/pcm/i.test(ctype || '')) throw new Up(400, 'Content-Type must be audio/l16; rate=16000; channels=1');
  if (buf.length < 3200) return { text: '', confidence: 0 };
  if (buf.length > 1000000) throw new Up(413, 'audio too large (max 1 MB / ~30 s)');
  const q = new URLSearchParams({ lang: 'ru-RU', format: 'lpcm', sampleRateHertz: '16000', folderId: FOLDER, profanityFilter: 'false' });
  const r = await upstream(fetchT('https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?' + q, { method: 'POST', headers: { Authorization: 'Bearer ' + iam }, body: buf }, 10000));
  if (!r.ok) throw new Up(502, 'stt ' + r.status);
  const j = await r.json();
  return { text: String(j.result || '').slice(0, 500), confidence: j.result ? 1 : 0 };
}
async function tts(b, iam) {
  const text = String(b.text || '').trim().slice(0, 280);
  if (!text) throw new Up(400, 'empty text');
  const voice = VOICES.has(b.voice) ? b.voice : VOICE;
  const p = new URLSearchParams({ text, lang: 'ru-RU', voice, format: 'oggopus', speed: String(clamp(b.speed, 0.8, 1.3, 1.0)), folderId: FOLDER });
  if (voice === 'jane' || voice === 'omazh') p.set('emotion', ['angry','annoyed'].includes(b.emotion) ? 'evil' : ['smile','love','laugh','proud'].includes(b.emotion) ? 'good' : 'neutral');
  const r = await upstream(fetchT('https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize', { method: 'POST', headers: { Authorization: 'Bearer ' + iam, 'Content-Type': 'application/x-www-form-urlencoded' }, body: p.toString() }, 10000));
  if (!r.ok) throw new Up(502, 'tts ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

exports.handler = async (event, context) => {
  const h = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const origin = h.origin || '';
  const allow = ORIGINS.includes(origin) ? origin : ORIGINS[0];
  const method = String(event.httpMethod || 'GET').toUpperCase();
  const proxy = (event.pathParams || event.params || {}).proxy;
  const path = String(proxy ? '/' + proxy : (event.url || event.path || '/')).split('?')[0].replace(/\/+$/, '') || '/';
  if (method === 'OPTIONS') return { statusCode: 204, headers: hdrs(allow), body: '' };
  if (origin && !ORIGINS.includes(origin)) return json(403, { error: 'origin not allowed' }, allow);
  if (process.env.KILL_SWITCH === '1') return json(503, { error: 'disabled' }, allow);
  if (method === 'GET' && path.endsWith('/health')) return json(200, { ok: true, mode: 'cloud', version: VERSION, model: MODEL, voice: VOICE }, allow);
  if (!tokenOk(h['x-karen-token'])) console.log(JSON.stringify({evt:'unauth',method,path}));
  if (!tokenOk(h['x-karen-token'])) return json(401, { error: 'unauthorized' }, allow);
  const ip = h['x-forwarded-for'] ? h['x-forwarded-for'].split(',')[0].trim() : (event.requestContext?.identity?.sourceIp || 'x');
  if (limited(ip)) return json(429, { error: 'rate limited' }, allow);
  const iam = context?.token?.access_token;
  if (!iam) return json(503, { error: 'no service account token' }, allow);
  try {
    if (method === 'POST' && path.endsWith('/chat')) { let b; try { b = JSON.parse(bodyBuf(event).toString('utf8')); } catch { return json(400, { error: 'invalid json' }, allow); } return json(200, await chat(b, iam), allow); }
    if (method === 'POST' && path.endsWith('/stt')) return json(200, await stt(bodyBuf(event), h['content-type'], iam), allow);
    if (method === 'POST' && path.endsWith('/tts')) { let b; try { b = JSON.parse(bodyBuf(event).toString('utf8')); } catch { return json(400, { error: 'invalid json' }, allow); }
      const a = await tts(b, iam); return { statusCode: 200, headers: hdrs(allow, { 'Content-Type': 'audio/ogg' }), body: a.toString('base64'), isBase64Encoded: true }; }
    return json(404, { error: 'not found' }, allow);
  } catch (e) {
    const code = e instanceof Up ? e.code : 500;
    console.log(JSON.stringify({ evt: 'error', path, code, msg: e instanceof Up ? e.message : 'internal' })); // metadata only
    return json(code, { error: e instanceof Up ? e.message : 'internal error' }, allow);
  }
};
exports._normalize = normalize;
