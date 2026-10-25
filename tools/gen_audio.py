# Generates prerecorded Karen lines via our own karen-api /tts (voice jane). Token read from file, never printed.
import json,os,urllib.request,base64,sys,time
TOK=open('/home/box/.karen/device_token').read().strip()
GW='https://d5dtcref7c17ac6u1m8s.d8epmcec.apigw.yandexcloud.net/tts'
d=json.load(open('app/commands.json'))
import re
def walk(lines,emo):
  for l in lines:
    yield l,emo
    for b in (l.get('follow') or {}).values(): yield from walk(b['lines'],b['emotion'])
items=[x for c in d['commands'] for x in list(walk(c['lines'],c['emotion']))+[y for b in (c.get('follow') or {}).values() for y in walk(b['lines'],b['emotion'])]]+[x for v in d['system'].values() for x in walk(v['lines'],v['emotion'])]
clean=lambda t:re.sub(r'\{\w+\}\s*','',t).strip()
chars=0
for l,emo in items:
  p='app/'+l['file']
  if os.path.exists(p) and '--force' not in sys.argv: continue
  req=urllib.request.Request(GW,data=json.dumps({'text':clean(l['text']),'emotion':emo,'voice':'jane','speed':1.0}).encode(),headers={'Content-Type':'application/json','X-Karen-Token':TOK,'Origin':'https://paulos99.github.io'})
  for a in range(3):
    try: b=urllib.request.urlopen(req,timeout=20).read();break
    except Exception as e: print('retry',l['file'],getattr(e,'code',e));time.sleep(3)
  else: continue
  if b[:4]!=b'OggS':
    try: b=base64.b64decode(json.loads(b)['audio_base64'])
    except Exception: pass
  open(p,'wb').write(b);chars+=len(clean(l['text']));time.sleep(2.1)  # stay under 30/min rate limit
print('generated chars',chars,'files',len(items))
