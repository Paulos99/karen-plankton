# synth items from /tmp/need_v2.json via our karen-api /tts (jane). Token read from file, never printed.
import json,os,urllib.request,base64,time
TOK=open('/home/box/.karen/device_token').read().strip()
GW='https://d5dtcref7c17ac6u1m8s.d8epmcec.apigw.yandexcloud.net/tts'
chars=0;fail=[]
for it in json.load(open('/tmp/need_v2.json')):
  p='app/'+it['file']
  if os.path.exists(p): continue
  req=urllib.request.Request(GW,data=json.dumps({'text':it['text'],'emotion':it['emotion'],'voice':'jane','speed':1.0}).encode(),headers={'Content-Type':'application/json','X-Karen-Token':TOK,'Origin':'https://paulos99.github.io'})
  b=None
  for a in range(3):
    try: b=urllib.request.urlopen(req,timeout=25).read();break
    except Exception as e: print('retry',it['file'],getattr(e,'code',type(e).__name__));time.sleep(4)
  if b is None: fail.append(it['file']);continue
  if b[:4]!=b'OggS':
    try: b=base64.b64decode(json.loads(b)['audio_base64'])
    except Exception: pass
  if b[:4]!=b'OggS': fail.append(it['file']);continue
  open(p,'wb').write(b);chars+=len(it['text']);time.sleep(2.1)
print('chars',chars,'fail',fail)
