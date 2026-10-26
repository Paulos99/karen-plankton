# v2.3: (re)synthesize ALL clips referenced in app/commands.json via karen-api /tts.
# Voice jane, role evil forced (gateway maps emotion 'angry' -> evil), Karen pronounced «К+арэн» (TTS input only).
# Usage: python3 tools/gen_audio_v3.py [--all] [--only PREFIX]. Token read from file, never printed.
import json,os,re,sys,time,subprocess,urllib.request,base64,threading,queue
TOK=open('/home/box/.karen/device_token').read().strip()
GW='https://d5dtcref7c17ac6u1m8s.d8epmcec.apigw.yandexcloud.net/tts'
A='app/'
def tts_text(t):
  t=re.sub(r'\{\w+\}\s*','',t).strip()
  return re.sub(r'(?<![А-Яа-яЁё])([Кк])ар[еэ]н(а|у|ом|е|ой)?(?![А-Яа-яЁё])',lambda m:m.group(1)+'+арэн'+(m.group(2) or ''),t)
def speed(t): return 1.0 if len(t)<20 else 1.1
def items(d):
  out={}
  def w(o):
    if isinstance(o,dict):
      if 'file' in o and 'text' in o and 'segments' not in o and str(o['file']).endswith('.ogg'): out[o['file']]=o['text']
      for v in o.values(): w(v)
    elif isinstance(o,list):
      for v in o: w(v)
  w(d);return out
TRIM='silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,areverse'
def synth(f,text):
  t=tts_text(text)
  req=urllib.request.Request(GW,data=json.dumps({'text':t,'emotion':'angry','voice':'jane','speed':speed(t)}).encode(),headers={'Content-Type':'application/json','X-Karen-Token':TOK,'Origin':'https://paulos99.github.io'})
  for a in range(4):
    try:
      b=urllib.request.urlopen(req,timeout=30).read()
      if b[:4]!=b'OggS': b=base64.b64decode(json.loads(b)['audio_base64'])
      if b[:4]!=b'OggS': raise ValueError('not ogg')
      tmp='/tmp/_raw_'+os.path.basename(f);open(tmp,'wb').write(b)
      subprocess.run(['ffmpeg','-y','-loglevel','error','-i',tmp,'-af',TRIM,'-c:a','libopus','-b:a','48k',A+f],check=True);return len(t)
    except Exception as e: print('retry',f,getattr(e,'code',type(e).__name__),flush=True);time.sleep(4+a*4)
  return None
if __name__=='__main__':
  d=json.load(open(A+'commands.json'));its=items(d)
  only=sys.argv[sys.argv.index('--only')+1] if '--only' in sys.argv else ''
  todo=[(f,t) for f,t in its.items() if f.startswith(only) and ('--all' in sys.argv or not os.path.exists(A+f))]
  if '--dry' in sys.argv: print(len(todo),'clips',sum(len(tts_text(t)) for _,t in todo),'chars');sys.exit()
  q=queue.Queue();[q.put(x) for x in todo];res={'chars':0,'n':0,'fail':[]};lk=threading.Lock()
  def worker():
    while True:
      try:f,t=q.get_nowait()
      except queue.Empty:return
      c=synth(f,t)
      with lk:
        if c is None:res['fail'].append(f)
        else:res['chars']+=c;res['n']+=1
        if res['n']%20==0:print('done',res['n'],flush=True)
      time.sleep(1.2)
  th=[threading.Thread(target=worker) for _ in range(2)];[x.start() for x in th];[x.join() for x in th]
  print('clips',res['n'],'chars',res['chars'],'fail',res['fail'])
