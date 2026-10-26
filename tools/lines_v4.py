# Karen v2.0: content from Павел's archive (incoming_v2, package v4) -> app/commands.json
# Scenes = sequences of segments (own clip + emotion + pause). Шелдон -> Планктон (Павел's earlier request).
import json,re,os,shutil,hashlib
IN='incoming_v2/';A='app/'
J=lambda p:json.load(open(IN+p))
scenes={s['id']:s for s in J('logic/scenes.json')['scenes']};routing=J('logic/routing.json');dance=J('logic/dance.json');photo=J('logic/photo.json');lovej=J('logic/love_declaration.json')
fix=lambda t:t.replace('Шелдон','Планктон').replace('шелдон','планктон')
clean=lambda t:re.sub(r'\{\w+\}\s*','',t).strip()
old=json.load(open('tools/commands_v19.json'))
def walk(ls):
    for l in ls:
        yield l
        for b in (l.get('follow') or {}).values(): yield from walk(b['lines'])
oldmap={}
for c in old['commands']:
    for l in walk(c['lines']): oldmap.setdefault(clean(l['text']),l['file'])
for s in old['system'].values():
    for l in s['lines']: oldmap.setdefault(clean(l['text']),l['file'])
def seg_file(prefix,i): return f'audio/v2_{prefix}-{i}.ogg'
def segs(prefix,ss):
    out=[]
    for i,g in enumerate(ss):
        out.append(dict(file=seg_file(prefix,i),text=fix(g['text']),emotion=g['emotion'],pause_after_ms=g.get('pause_after_ms',0),hold_after_ms=g.get('hold_after_ms',0)))
    return out
def line_from(prefix,ss):
    S=segs(prefix,ss);return dict(file=S[0]['file'],text=' '.join('{%s}%s'%(g['emotion'],g['text']) for g in S),segments=S)
PH={'photo':['сделай фото','сфотографируй','сфоткай','селфи','фотография'],
    'dance_stop':routing['ordered_matching'][0]['patterns']+['стоп.'],
    'love_declaration':sorted(set(lovej['trigger']+scenes['love_declaration']['triggers'])),
    'love':scenes['love']['triggers'],'dance':scenes['dance']['triggers']}
C=[]
# extra patterns: words the offline model can actually output (OOV forms in the archive)
EXTRA={'plankton':['о планктон'],'reboot':['перезагрузи','перезапуск'],'jealous':['чат.']}
C.append(dict(id='dance_stop',emotion='smile',mode='dance_stop',phrases=PH['dance_stop'],lines=[]))
C.append(dict(id='photo',emotion='photo',mode='photo',phrases=PH['photo'],lines=[line_from('photo',scenes['photo']['segments'])]))
C.append(dict(id='love_declaration',emotion='surprised',mode='love_declaration',visual='assets/anim/love_reaction.svg',phrases=PH['love_declaration'],lines=[line_from('love_declaration',lovej['segments'])]))
for sid in ['love','dance']:
    s=scenes[sid];C.append(dict(id=sid,emotion=s['opening_emotion'],mode='dance' if sid=='dance' else 'scene',phrases=PH[sid],lines=[line_from(sid,s['segments'])]))
for sid in routing['ordered_matching'][-1]['scene_ids']:
    s=scenes[sid];C.append(dict(id=sid,emotion=s['opening_emotion'],mode='scene',group='scenes',phrases=s['triggers']+EXTRA.get(sid,[]),lines=[line_from(sid,s['segments'])]))
SYSIN={'name':('suspicious','{suspicious}Да, Шелдон?'),'fallback':('suspicious','{suspicious}Ещё раз, пожалуйста. Я расслышала слова, но хочу убедиться, что ты действительно это сказал.'),
 'asr_loading':('thinking','{thinking}Секунду.'),'photo_fail':('error','{error}'+photo['photo_fail']['text']),'photo_done':('proud','{proud}'+photo['photo_done']['text'])}
SYS={k:{'emotion':e,'lines':[{'file':f'audio/v2_{k}-0.ogg','text':fix(t)}]} for k,(e,t) in SYSIN.items()}
SV={'bounce':'assets/anim/dance_01_bounce.svg','side_sway':'assets/anim/dance_02_sway.svg','pixel_dance':'assets/anim/dance_03_wave.svg','confident_groove':'assets/anim/dance_04_groove.svg'}
D=dict(cycle=dance['cycle_duration_seconds'],intro_hold=dance['intro_hold_seconds'],min_gap=dance['speech_rules']['speech_min_gap_seconds'],
 beats=[dict(id=b['id'],at=b['at_seconds'],dur=b['duration_seconds'],visual=b['visual'],svg=SV[b['visual']],emotion=b['emotion'],speech_at=b['speech_at_seconds'],
   line=dict(file=f"audio/v2_dance_{b['id']}.ogg",text=fix(b['speech']))) for b in dance['beats']],
 schedule={'1':['beat_01','beat_02','beat_03','beat_04'],'2':['beat_01','beat_03'],'3':['beat_03'],'every3':['beat_03']})
P=dict(countdown=[dict(file=f'audio/v2_count-{i}.ogg',text=t) for i,t in enumerate(photo['sequence'][3]['speech'])],seconds=5,overlay='assets/anim/photo_countdown_overlay.svg')
# grammar: whole words only (vosk); stems expanded by hand
EXP={'здравств':['здравствуй','здравствуйте'],'перезагруз':['перезагрузись','перезагрузка','перезагрузи'],'стоп.':['стоп']}
W=set()
for c in C:
    for p in c['phrases']:
        for w in p.lower().replace('ё','е').split(): W.update(EXP.get(w,[w]))
W|={'карен','карин','да','нет','ага','угу','конечно','давай','неа','фото','сделай','ты','меня','я','тебя','потанцевать','танец','танцевать','хватит','стоп','перезагрузить','перезапуск','перезапустить','планктона','чат','танцуем','танцуйте','ревнуешь','сфотографируйте','маркетологи','маркетологов','маркетинга','сфоткать'}
vocab=set(open('/tmp/vm/model/graph/words.txt').read().split()[0::2])
oov=sorted(w for w in W if w not in vocab);W=sorted(w for w in W if w in vocab)
d=dict(old);d['commands']=C;d['system']=SYS;d['dance']=D;d['photo']=P;d['grammar']=W;d['version']='2.0'
d['_doc']=("v2.0 (контент v4). Порядок: команды до group=scenes — первое совпадение; среди group=scenes — самый длинный совпавший триггер. "
 "lines[].segments: клипы по очереди, emotion сегмента, pause_after_ms/hold_after_ms. text с {emotion} — сводка/субтитры. follow {yes,no,any,none} поддерживается.")
json.dump(d,open(A+'commands.json','w'),ensure_ascii=False,indent=1)
# reuse audio for identical texts
items=[g for c in C for l in c['lines'] for g in l['segments']]+[l for s in SYS.values() for l in s['lines']]+[b['line'] for b in D['beats']]+P['countdown']
reused=0;need=[]
for it in items:
    t=clean(it['text']);dst=A+it['file']
    if os.path.exists(dst): continue
    if t in oldmap and os.path.exists(A+oldmap[t]): shutil.copy(A+oldmap[t],dst);reused+=1
    else: need.append(it)
print('items',len(items),'reused',reused,'to synth',len(need),'chars',sum(len(clean(x['text'])) for x in need));print('OOV grammar:',oov)
json.dump([dict(file=x['file'],text=clean(x['text']),emotion=x.get('emotion') or re.match(r'\{(\w+)\}',x['text']+'{x}').group(1) if '{' in x['text'] else x.get('emotion','neutral')) for x in need],open('/tmp/need_v2.json','w'),ensure_ascii=False)
