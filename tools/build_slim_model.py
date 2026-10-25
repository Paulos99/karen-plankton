"""Builds app/vosk/vosk-ru-slim-v1.tar.gz from vosk-model-small-ru-0.22.zip (alphacephei.com).
Grammar-only model: the 32 MB n-gram Gr.fst is replaced by an empty FST and its word table is saved as
graph/words.txt (Vosk reads words.txt first). Grammar recognition only uses HCLr.fst + words, so accuracy is the same.
Usage: python3 tools/build_slim_model.py /path/to/vosk-model-small-ru-0.22.zip"""
import struct,sys,zipfile,tarfile,io,os
z=zipfile.ZipFile(sys.argv[1]);root='vosk-model-small-ru-0.22/'
def words(gr):
  p=0
  def i32():
    nonlocal p;v=struct.unpack_from('<i',gr,p)[0];p+=4;return v
  def i64():
    nonlocal p;v=struct.unpack_from('<q',gr,p)[0];p+=8;return v
  def s():
    nonlocal p;n=i32();v=gr[p:p+n];p+=n;return v
  assert i32()==2125659606;s();s();i32();flags=i32();i64();i64();i64();i64()
  for k in (1,2):
    if not flags&k: continue
    i32();s();i64();n=i64();t=[(s().decode(),i64()) for _ in range(n)]
  return ''.join(f'{w} {k}\n' for w,k in t).encode()
st=lambda b:struct.pack('<i',len(b))+b
empty=struct.pack('<i',2125659606)+st(b'vector')+st(b'standard')+struct.pack('<ii',2,0)+struct.pack('<qqqq',3,0,1,0)+struct.pack('<fq',0.0,0)
out='app/vosk/vosk-ru-slim-v1.tar.gz'
with tarfile.open(out,'w:gz',compresslevel=9) as tf:
  made=set()
  def add(name,data):
    parts=('model/'+name).split('/')[:-1]
    for i in range(1,len(parts)+1):
      d='/'.join(parts[:i])
      if d not in made: made.add(d);di=tarfile.TarInfo(d);di.type=tarfile.DIRTYPE;di.mode=0o755;tf.addfile(di)  # vosk-browser untar needs dir entries
    ti=tarfile.TarInfo('model/'+name);ti.size=len(data);ti.mode=0o644;tf.addfile(ti,io.BytesIO(data))
  for n in z.namelist():
    if n.endswith('/') or n.endswith('README'): continue
    rel=n[len(root):];data=z.read(n)
    if rel=='graph/Gr.fst': add('graph/words.txt',words(data));data=empty
    add(rel,data)
print(out,os.path.getsize(out))
