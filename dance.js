// v2.1 Karen dance & pose renderer: Canvas 2D, no shadowBlur/filters (Android 60 fps), 120 BPM.
// 6 dance styles × 4 figures each, cross-fades; 10 photogenic poses for «режим позирования».
(()=>{'use strict';
const BPM=120,BT=60/BPM,TAU=Math.PI*2;
const STYLES=['bounce','robot','disco','moonwalk','arms','spin'],STYLE_SEC=16;
const POSES=['wink','kiss','cool','hearts','surprised','crown','villain','peace','sparkle','flash'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),ease=x=>x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2,fr=x=>x-Math.floor(x);
function make(cv,{level=()=>0,mic=()=>0,reduce=()=>false}={}){
  const g=cv.getContext('2d');let W=0,H=0,S=1,raf=0,mode=null,t0=0,pos0=0,poseName='wink',poseT=0,parts=[],lastBeat=-1,col='#BEFF31',hist=[];
  function fit(){const r=Math.min(devicePixelRatio||1,1.5);W=cv.width=Math.round(cv.clientWidth*r)||960;H=cv.height=Math.round(cv.clientHeight*r)||540;S=Math.min(W/960,H/540)}
  // ---- primitives (960×540 space, origin = centre) ----
  function glow(path,w=14,c=col,a=1){g.globalAlpha=a*.22;g.strokeStyle=c;g.lineWidth=w*2.6;g.beginPath();path();g.stroke();g.globalAlpha=a;g.lineWidth=w;g.beginPath();path();g.stroke();g.globalAlpha=1}
  function fillGlow(path,c,a=1){g.globalAlpha=a*.25;g.fillStyle=c;g.beginPath();path(1.25);g.fill();g.globalAlpha=a;g.beginPath();path(1);g.fill();g.globalAlpha=1}
  const heart=(x,y,s)=>k=>{s*=k;g.moveTo(x,y+30*s);g.bezierCurveTo(x-60*s,y-10*s,x-40*s,y-60*s,x,y-25*s);g.bezierCurveTo(x+40*s,y-60*s,x+60*s,y-10*s,x,y+30*s)};
  const star=(x,y,r)=>k=>{r*=k;for(let i=0;i<8;i++){const a=i*TAU/8,rr=i%2?r*.3:r;g[i?'lineTo':'moveTo'](x+Math.cos(a)*rr,y+Math.sin(a)*rr)}g.closePath()};
  // face: eyes L/R types, look (-1..1), blink 0..1, mouth type, open 0..1
  function face(o){const {eyeL='open',eyeR=eyeL,look=0,lookY=0,mouth='smile',open=0,c=col}=o,ex=150,ey=-50;
    for(const [s,t] of [[-1,eyeL],[1,eyeR]]){const x=s*ex+look*18,y=ey+lookY*12;
      if(t==='open')glow(()=>{g.moveTo(x,y-38);g.lineTo(x,y+38)},16,c);
      else if(t==='happy')glow(()=>{g.moveTo(x-50,y+10);g.quadraticCurveTo(x,y-55,x+50,y+10)},14,c);
      else if(t==='closed'||t==='wink')glow(()=>{g.moveTo(x-48,y);g.quadraticCurveTo(x,y+30,x+48,y)},14,c);
      else if(t==='square')glow(()=>{g.rect(x-30,y-30,60,60)},12,c);
      else if(t==='sly')glow(()=>{g.moveTo(x-50,y+5);g.lineTo(x+50,y-12)},14,c);
      else if(t==='round')glow(()=>{g.arc(x,y,34,0,TAU)},12,c);
      else if(t==='heart')fillGlow(heart(x,y+5,1.1),'#FE5362');
      else if(t==='star')fillGlow(star(x,y,48),'#FFE14D');
      else if(t==='x')glow(()=>{g.moveTo(x-30,y-30);g.lineTo(x+30,y+30);g.moveTo(x+30,y-30);g.lineTo(x-30,y+30)},12,c)}
    const my=95;
    if(mouth==='smile')glow(()=>{g.moveTo(-150,my-10);g.quadraticCurveTo(0,my+90+open*40,150,my-10)},14,c);
    else if(mouth==='open'){const h=20+open*90;glow(()=>{g.ellipse(0,my+15,95,h*.6+10,0,0,TAU)},13,c)}
    else if(mouth==='o')glow(()=>{g.arc(0,my+15,26+open*20,0,TAU)},12,c);
    else if(mouth==='flat')glow(()=>{g.moveTo(-110,my+15);g.lineTo(110,my+15)},14,c);
    else if(mouth==='smirk')glow(()=>{g.moveTo(-120,my+20);g.quadraticCurveTo(40,my+40,140,my-25)},14,c);
    else if(mouth==='kiss')fillGlow(heart(0,my+20,.9),'#FE5362');
    else if(mouth==='grin')glow(()=>{g.moveTo(-160,my-5);g.quadraticCurveTo(0,my+120,160,my-5);g.closePath()},13,c);
    else if(mouth==='robot')glow(()=>{g.moveTo(-110,my+15);for(let i=0;i<=8;i++)g.lineTo(-110+i*27.5,my+15+(i%2?-14:14)*(.3+open))},10,c)}
  function at(x,y,rot=0,sx=1,sy=1,fn){g.save();g.translate(x,y);g.rotate(rot);g.scale(sx,sy);fn();g.restore()}
  function bg(a=1){g.fillStyle='#08141D';g.globalAlpha=a;g.fillRect(-W/S,-H/S,2*W/S,2*H/S);g.globalAlpha=1}
  function floorWave(t,amp,c=col){glow(()=>{for(let i=0;i<=48;i++){const x=-430+i*18,y=225+Math.sin(i*.55+t*7)*amp*Math.sin(Math.PI*i/48);i?g.lineTo(x,y):g.moveTo(x,y)}},5,c,.55)}
  function eq(t,b,lv){for(let i=0;i<16;i++){const h=20+Math.abs(Math.sin(i*1.7+Math.floor(t/BT*2)*2.3))*110*(1-b*.6)+lv*120;g.fillStyle=col;g.globalAlpha=.35;g.fillRect(-460+i*58,260-h,40,h)}g.globalAlpha=1}
  function burst(x,y,n,kind='confetti'){for(let i=0;i<n;i++){const a=Math.random()*TAU,v=150+Math.random()*350;parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-200,l:1,kind,c:['#BEFF31','#FE5362','#5FD7FF','#FFE14D','#ffffff'][i%5],r:Math.random()*TAU})}}
  function stepParts(dt){parts=parts.filter(p=>(p.l-=dt*.8)>0);for(const p of parts){p.vy+=600*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.r+=dt*8;g.globalAlpha=Math.min(1,p.l*1.5);g.fillStyle=p.c;
    if(p.kind==='star'){g.beginPath();star(p.x,p.y,10)(1);g.fill()}else{g.save();g.translate(p.x,p.y);g.rotate(p.r);g.fillRect(-7,-4,14,8);g.restore()}}g.globalAlpha=1}
  // ---- dance styles: s(t, beat index n, beat phase b, figure f 0..3, local time lt) ----
  const D={
    bounce(t,n,b,f,lv,talk){ // squash & stretch jumps
      const land=Math.max(0,1-b*5),air=Math.sin(Math.PI*b);let x=0,y=0,rot=0,sx=1,sy=1;
      if(f===0){y=-air*110;sy=1-.22*land+.12*air;sx=1+.22*land-.06*air}
      else if(f===1){x=(n%2?1:-1)*120*ease(b)-(n%2?1:-1)*60;y=-air*70;sy=1-.18*land;sx=1+.18*land;rot=(n%2?1:-1)*.12*air}
      else if(f===2){const b2=fr(b*2);y=-Math.sin(Math.PI*b2)*45;sy=1-.15*Math.max(0,1-b2*5);sx=2-sy}
      else{const big=n%2===0;y=-Math.sin(Math.PI*((n%2+b)/2))*170;rot=big?0:TAU*ease(b);sy=1-.25*land*(big?0:1);sx=2-sy}
      floorWave(t,30*land+10+lv*40);at(x,y,rot,sx,sy,()=>face({eyeL:air>.5?'happy':'open',look:Math.sin(t*2),mouth:talk>.05?'open':'grin',open:talk||air*.5}))},
    robot(t,n,b,f,lv,talk){ // jerky snaps + glitch
      const q=Math.floor(t/BT*2),snap=[[-90,0,-.12],[0,-30,0],[90,0,.12],[0,30,0]][q%4];let [x,y,rot]=snap;if(f===1){x=0;rot=[-.25,0,.25,0][q%4]}if(f===2){x=snap[0]*1.6;y=0}
      const armA=(f===3?[0,1.57,3.14,1.57][q%4]:[0.6,-0.6][q%2]);
      at(x,y,rot,1,1,()=>{glow(()=>{g.moveTo(-260,40);g.lineTo(-360,40);g.lineTo(-360+Math.cos(armA)*-0,40-Math.sin(armA)*110);g.moveTo(260,40);g.lineTo(360,40);g.lineTo(360,40+Math.sin(armA)*110)},10);
        face({eyeL:'square',look:[-1,0,1,0][q%4],mouth:'robot',open:talk||(q%2)*.5})});
      if(b<.12||(f===2&&fr(b*4)<.15)){ // glitch slices (cheap: offset bands)
        g.globalAlpha=.6;for(let i=0;i<4;i++){const yy=-200+Math.random()*400,h=10+Math.random()*30;g.fillStyle=i%2?'#FE5362':'#5FD7FF';g.fillRect(-480+Math.random()*80,yy,960*Math.random(),h*.3)}g.globalAlpha=1}
      eq(t,b,lv)},
    disco(t,n,b,f,lv,talk){ // hue per beat, mirror ball, soft flash (≤2 Hz, not strobe)
      const hue=(n*47)%360;col=`hsl(${hue},100%,62%)`;
      const bx=0,by=-215,rot=t*1.4;for(let i=0;i<26;i++){const a=i*TAU/26+rot,rr=48;const xx=bx+Math.cos(a)*rr*Math.abs(Math.cos(i)),yy=by+Math.sin(a)*rr*.9;g.fillStyle=i%3?'#cfefff':'#ffffff';g.globalAlpha=.5+.5*Math.sin(t*6+i);g.fillRect(xx-5,yy-5,10,10)}
      for(let i=0;i<14;i++){const a=i*TAU/14+rot*.6;g.fillStyle=`hsl(${(hue+i*25)%360},100%,70%)`;g.globalAlpha=.35;g.beginPath();g.arc(Math.cos(a)*(380+60*Math.sin(t+i)),Math.sin(a)*230,9,0,TAU);g.fill()}g.globalAlpha=1;
      if(b<.25&&n%2===0){g.fillStyle='#fff';g.globalAlpha=.10*(1-b*4);g.fillRect(-480,-270,960,540);g.globalAlpha=1}
      const up=Math.floor(n/2)%2,sway=Math.sin(t/BT*Math.PI)*(f===2?50:25);
      at(sway,Math.abs(Math.sin(t/BT*Math.PI))*-20,f===1?Math.sin(t/BT*Math.PI)*.1:0,1,1,()=>{
        glow(()=>{if(up){g.moveTo(230,10);g.lineTo(330,-170);g.moveTo(-230,10);g.lineTo(-330,90)}else{g.moveTo(-230,10);g.lineTo(-330,-170);g.moveTo(230,10);g.lineTo(330,90)}},11);
        face({eyeL:f===3?'star':'happy',look:up?1:-1,mouth:'open',open:talk||(.3+.5*(1-b))})});
      floorWave(t,20+lv*60)},
    moonwalk(t,n,b,f,lv,talk){ // glide across screen with echo trail
      const bar=t/BT/8,dir=Math.floor(bar)%2?1:-1,p=fr(bar),x=dir*(-300+600*p),step=Math.abs(Math.sin(t/BT*Math.PI)),lean=-dir*.15;
      hist.push(x);if(hist.length>14)hist.shift();
      for(let i=0;i<hist.length;i+=3){g.globalAlpha=.09*(i/hist.length);at(hist[i],0,lean,.85,.85,()=>face({eyeL:'sly',mouth:'smirk',c:'#5FD7FF'}))}g.globalAlpha=1;
      at(x,-step*14,lean+(f===3&&p>.85?Math.sin((p-.85)/.15*Math.PI)*-.4:0),.85,.85+step*.04,()=>face({eyeL:f===1?'sly':'open',look:-dir,mouth:talk>.05?'open':'smirk',open:talk}));
      glow(()=>{g.moveTo(-460,215);g.lineTo(460,215)},4,col,.5);for(let k=0;k<2;k++){const fx=x+(k?50:-50),lift=k===(n%2)?step*20:0;glow(()=>{g.moveTo(fx-30,215-lift);g.lineTo(fx+30,215-lift)},10)}},
    arms(t,n,b,f,lv,talk){ // oscilloscope waves as arms
      const amp=50+lv*60;const arm=(s,ph,up)=>glow(()=>{for(let i=0;i<=30;i++){const k=i/30,x=s*(250+k*200),y=20-up*k*170+Math.sin(k*9-t*TAU*2+ph)*amp*k;i?g.lineTo(x,y):g.moveTo(x,y)}},10);
      let up=0,ph2=0;if(f===1)ph2=Math.PI;if(f===2)up=Math.abs(Math.sin(t/BT*Math.PI));if(f===3){up=.5+.5*Math.sin(t/BT*Math.PI/2);ph2=Math.PI/2}
      const bob=Math.sin(t/BT*TAU)*15;at(0,bob,Math.sin(t/BT*Math.PI)*.06,1,1,()=>{arm(-1,0,f===3?1-up:up);arm(1,ph2,up);face({eyeL:'happy',look:Math.sin(t*3),mouth:talk>.05?'open':'smile',open:talk||.3})});eq(t,b,lv)},
    spin(t,n,b,f,lv,talk){ // claps + confetti, spins and flips
      const clapPhase=fr(t/BT),hx=40+Math.abs(Math.cos(clapPhase*Math.PI))*230;
      let rot=0,sy=1;if(f===1)rot=TAU*ease(fr(t/BT/2));if(f===2)sy=Math.cos(TAU*ease(fr(t/BT/4)));if(f===3){rot=Math.sin(t/BT*Math.PI)*.35}
      at(0,0,rot,1,sy||.02,()=>face({eyeL:f===3?'star':'happy',mouth:talk>.05?'open':'grin',open:talk}));
      for(const s of [-1,1])fillGlow(k=>g.arc(s*hx,-190,32*k,0,TAU),col);
      if(n!==lastBeat){burst(0,-190,f===0?18:28)}}
  };
  // ---- poses: big, bright, contrasty (photogenic) ----
  function drawPose(name,t){const pulse=1+.03*Math.sin(t*4),c='#BEFF31';
    const P={
      wink:()=>{at(0,0,-.05,pulse,pulse,()=>face({eyeL:'open',eyeR:'wink',mouth:'smirk'}));fillGlow(star(240,-130,30*(1+.3*Math.sin(t*8))),'#FFE14D')},
      kiss:()=>{at(0,0,0,pulse,pulse,()=>face({eyeL:'closed',mouth:'kiss'}));for(let i=0;i<3;i++){const k=fr(t*.5+i/3);fillGlow(heart(140+k*200,40-k*260,.5+k*.4),'#FE5362',1-k)}},
      cool:()=>{at(0,0,.06,pulse,pulse,()=>{face({eyeL:'sly',mouth:'smirk'});g.fillStyle='#000';const px=24;for(const s of[-1,1])for(let i=0;i<5;i++)for(let j=0;j<3;j++){if(j===2&&(i===0||i===4))continue;g.fillStyle=(i+j)%3===0?'#ffffff':'#111';g.fillRect(s*150-60+i*px,-80+j*px,px,px)}g.fillStyle='#111';g.fillRect(-90,-80,180,14)})},
      hearts:()=>at(0,0,0,pulse,pulse,()=>face({eyeL:'heart',mouth:'smile',open:.4})),
      surprised:()=>at(0,0,0,1,1+.05*Math.sin(t*6),()=>face({eyeL:'round',mouth:'o',open:.6})),
      crown:()=>{at(0,0,0,pulse,pulse,()=>{face({eyeL:'sly',eyeR:'happy',mouth:'smirk'});fillGlow(k=>{g.moveTo(-120*k,-150);g.lineTo(-140*k,-260);g.lineTo(-60*k,-200);g.lineTo(0,-280);g.lineTo(60*k,-200);g.lineTo(140*k,-260);g.lineTo(120*k,-150);g.closePath()},'#FFE14D')})},
      villain:()=>at(0,0,0,pulse,pulse,()=>{glow(()=>{g.moveTo(-210,-120);g.lineTo(-90,-80);g.moveTo(210,-120);g.lineTo(90,-80)},14,'#FE5362');face({eyeL:'sly',eyeR:'sly',mouth:'smirk',c:'#BEFF31'})}),
      peace:()=>{at(-60,0,0,pulse,pulse,()=>face({eyeL:'happy',eyeR:'wink',mouth:'grin'}));const w=Math.sin(t*3)*.08;at(330,60,w,1,1,()=>glow(()=>{g.moveTo(0,140);g.lineTo(0,40);g.lineTo(-50,-150);g.moveTo(0,40);g.lineTo(50,-150);for(let i=0;i<=20;i++){const k=i/20;g[i?'lineTo':'moveTo'](-60+120*k,150+Math.sin(k*10+t*6)*10)}},14))},
      sparkle:()=>{at(0,0,0,pulse,pulse,()=>face({eyeL:'star',mouth:'grin'}));for(let i=0;i<10;i++){const a=i*TAU/10+t*.4,r=330+20*Math.sin(t*3+i);fillGlow(star(Math.cos(a)*r*1.2,Math.sin(a)*r*.7,14+10*Math.abs(Math.sin(t*4+i))),i%2?'#FFE14D':'#ffffff')}},
      flash:()=>{const k=fr(t/3.5);if(k<.12){g.fillStyle='#fff';g.globalAlpha=.5*(1-k/.12);g.fillRect(-480,-270,960,540);g.globalAlpha=1}
        glow(()=>{for(const [sx,sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]){g.moveTo(sx*420,sy*170);g.lineTo(sx*420,sy*240);g.lineTo(sx*340,sy*240)}},10,'#ffffff');at(0,0,0,pulse*.9,pulse*.9,()=>face({eyeL:'happy',mouth:'smile',open:.5}))}};
    (P[name]||P.wink)()}
  let last=0;
  function frame(now){raf=requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000||0);last=now;
    if(Math.round(cv.clientWidth*Math.min(devicePixelRatio||1,1.5))!==W)fit();
    g.setTransform(S,0,0,S,W/2,H/2);g.lineCap='round';g.lineJoin='round';bg();const talk=clamp(level(),0,1),lv=clamp(mic(),0,1);
    if(mode==='pose'){drawPose(poseName,(now-poseT)/1000);stepParts(dt);return}
    const t=reduce()?pos0:pos0+(now-t0)/1000,n=Math.floor(t/BT),b=fr(t/BT),si=Math.floor(t/STYLE_SEC)%STYLES.length,lt=t%STYLE_SEC,f=Math.floor(lt/(STYLE_SEC/4));
    col='#BEFF31';
    const xf=Math.min(1,lt/.6);
    if(xf<1){const pi=(si+STYLES.length-1)%STYLES.length;g.save();D[STYLES[pi]](t,n,b,3,lv,talk);g.restore();bg(xf);col='#BEFF31'} // cross-fade: previous style fades to dark under the new one
    g.save();D[STYLES[si]](t,n,b,f,lv,talk);g.restore();g.globalAlpha=1;
    stepParts(dt);lastBeat=n;api.style=STYLES[si];api.figure=f}
  const api={style:null,figure:0,
    dance(pos){mode='dance';pos0=Math.max(0,+pos||0);t0=performance.now();parts=[];hist=[];fit();if(!raf){last=performance.now();raf=requestAnimationFrame(frame)}},
    pose(name){mode='pose';poseName=name;poseT=performance.now();parts=[];if(name==='sparkle'||name==='flash')burst(0,-100,24,'star');fit();if(!raf){last=performance.now();raf=requestAnimationFrame(frame)}api.style='pose:'+name},
    stop(){cancelAnimationFrame(raf);raf=0;mode=null;parts=[]}};
  return api}
window.KarenDance={make,STYLES,POSES,STYLE_SEC,BPM};
})();
