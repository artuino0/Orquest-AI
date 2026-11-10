/*
 * Oficina 3D de Orquest: planta abierta en el último piso de una torre, con un robot de color por
 * puesto, sus departamentos, la oficina del jefe, juntas, cocina, estar y el elevador por donde
 * llegan y se van. Cada animación es un estado real: solo dibuja lo que le manda el panel
 * (estado y eventos, el mismo contrato que oficina/puente.js); suelta en el navegador corre una
 * jornada de ejemplo. Diseñada aparte (artifact) y traída tal cual; Three.js r128 desde npm.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
/* ---------- textos (tabla única; ?lang=en los da en inglés, como la app) ---------- */
const params0=new URLSearchParams(location.search);
const ES={
  title:'Orquest · Oficina 3D', noWebgl:'No se pudo iniciar la vista 3D en este dispositivo (WebGL no está disponible).',
  demo:'Jornada demo', fast:'Rápido', hour:'Hora', emp:'Empleados', real:'Real', close:'Cerrar', scene:'Oficina 3D con un robot por agente',
  rotL:'Girar a la izquierda', rotR:'Girar a la derecha', zIn:'Acercar', zOut:'Alejar',
  phase:{night:'Noche',dawn:'Amanecer',day:'Día',dusk:'Atardecer'},
  dept:{desarrollo:'Desarrollo',frontend:'Frontend',backend:'Backend',dba:'DBA',infra:'Infra',qa:'QA',diseno:'Diseño',arquitecto:'Arquitectura',seguridad:'Seguridad'},
  status:{idle:'Libre',wait:'En espera',working:'Trabajando',blocked:'Bloqueado: te necesita',done:'Entregó'},
  ev:{asignada:'tarea asignada',reporte:'entregó su reporte',aprobada:'revisión aprobada',rechazada:'revisión rechazada'}
};
const EN={
  title:'Orquest · 3D Office', noWebgl:'The 3D view could not start on this device (WebGL is not available).',
  demo:'Demo day', fast:'Fast', hour:'Time', emp:'Employees', real:'Now', close:'Close', scene:'3D office with one robot per agent',
  rotL:'Rotate left', rotR:'Rotate right', zIn:'Zoom in', zOut:'Zoom out',
  phase:{night:'Night',dawn:'Dawn',day:'Day',dusk:'Dusk'},
  dept:{desarrollo:'Development',frontend:'Frontend',backend:'Backend',dba:'DBA',infra:'Infra',qa:'QA',diseno:'Design',arquitecto:'Architecture',seguridad:'Security'},
  status:{idle:'Free',wait:'Waiting',working:'Working',blocked:'Blocked: needs you',done:'Delivered'},
  ev:{asignada:'task assigned',reporte:'delivered a report',aprobada:'review approved',rechazada:'review rejected'}
};
const T=params0.get('lang')==='en'?EN:ES;
$('tTitle').textContent=T.title;$('tDemo').textContent=T.demo;$('fast').textContent=T.fast;$('tHour').textContent=T.hour;$('tEmp').textContent=T.emp;
$('c').setAttribute('aria-label',T.scene);$('cClose').setAttribute('aria-label',T.close);
['rotL','rotR','zIn','zOut'].forEach(k=>$(k).setAttribute('aria-label',T[k]));
if(!window.THREE){$('err').textContent=T.noWebgl;$('err').hidden=false;return;}
const THREE_=THREE,canvas=$('c');let renderer;
try{renderer=new THREE_.WebGLRenderer({canvas,antialias:true,alpha:true});}catch(e){$('err').textContent=T.noWebgl;$('err').hidden=false;return;}
const X=THREE_;
/* r128 trata los hex como lineales: se convierten aquí para que el color mostrado sea el del hex */
(function(){const sh=X.Color.prototype.setHex;X.Color.prototype.setHex=function(h){sh.call(this,h);return this.convertSRGBToLinear();};})();
const cssHex=n=>'#'+n.toString(16).padStart(6,'0');
const params=new URLSearchParams(location.search);

/* =====================================================================
   PLANO (puro): departamentos → zonas → escritorios, asientos estables, rutas
   ===================================================================== */
const W=32,D=25,DOOR=[19,24],BOSS_SEAT={seat:[14,2],desk:[14,3],face:0,stand:[14,4],lift:.25,off:[.6,0]};
const DEPTS=['desarrollo','frontend','backend','dba','infra','qa','diseno','arquitecto','seguridad'];
const ROLE_COLORS={jefe:0xE8B730,desarrollo:0x3B82F6,frontend:0xA855F7,backend:0x22C55E,dba:0x06B6D4,infra:0xF97316,qa:0xEF4444,diseno:0xEC4899,arquitecto:0x6366F1,seguridad:0x475569};
function departmentFor(role){
  const r=String(role||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  if(DEPTS.includes(r))return r;
  const m=[['front','frontend'],['back','backend'],['dba','dba'],['dato','dba'],['infra','infra'],['devops','infra'],['qa','qa'],['test','qa'],['dise','diseno'],['arquitect','arquitecto'],['segur','seguridad']];
  for(const [k,d] of m)if(r.includes(k))return d;
  return 'desarrollo';
}
const POD_X=[1,7,13],POD_Z=[8,13,18];
function zoneOf(i){return {x0:POD_X[i%3],z0:POD_Z[i/3|0]};}
function slotInfo(dept,k){const {x0,z0}=zoneOf(DEPTS.indexOf(dept)),row=k>>1,side=k&1,z=z0+2*row;
  return {seat:[side?x0+3:x0,z],desk:[side?x0+2:x0+1,z],face:side?-Math.PI/2:Math.PI/2,stand:side?[x0+4,row<2?z:z-1]:[x0,row<2?z+1:z-1],lift:0,off:[0,row<2?.6:-.15],noCell:row>1};}
const MAX_SLOTS=6,seats=new Map(),used={};DEPTS.forEach(d=>used[d]=new Set());
function assignSeat(id,dept){ /* estable: el puesto libre más bajo; nadie se mueve */
  if(seats.has(id))return seats.get(id);
  for(const d of [dept,...DEPTS]){for(let k=0;k<MAX_SLOTS;k++)if(!used[d].has(k)){used[d].add(k);const s={dept:d,k};seats.set(id,s);return s;}}
  return null;}
function freeSeat(id){const s=seats.get(id);if(s){used[s.dept].delete(s.k);seats.delete(id);}}
function colsOf(dept){let m=1;used[dept].forEach(k=>{m=Math.max(m,k>>1);});return Math.max(2,m+1);}
const STATIC_BLOCK=[];(function(){const b=(x,z)=>STATIC_BLOCK.push([x,z]),r=(x1,x2,z1,z2)=>{for(let x=x1;x<=x2;x++)for(let z=z1;z<=z2;z++)b(x,z);};
  r(0,3,0,0);r(0,0,2,3);r(5,6,3,3);b(2,5);b(9,0);                 /* sala de juegos */
  b(14,3);r(11,12,0,0);r(16,17,0,0);b(11,5);b(17,5);              /* jefe */
  r(25,28,2,5);b(31,6);b(21,0);                                   /* juntas */
  r(22,30,9,9);r(24,28,12,13);b(31,14);                           /* cocina */
  r(25,27,16,16);b(26,18);b(23,18);b(29,18);b(30,21);b(31,16); /* estar */
  r(22,22,21,23);r(24,24,20,23);b(25,24);b(17,24);b(21,24);                               /* recepción */
  b(0,7);b(0,12);b(0,17);b(0,24);b(31,24);b(31,8);b(12,4);r(29,30,20,22);r(1,2,3,3);b(24,16);
  for(let i=0;i<9;i++){const z=zoneOf(i);b(z.x0+4,z.z0+4);}})();
/* vidrios: aristas entre casillas que no se pueden cruzar ('v' entre x-1 y x, 'h' entre z-1 y z) */
const EDGE=new Set();
for(let z=0;z<=5;z++){EDGE.add('11,'+z+',v');EDGE.add('18,'+z+',v');}
for(let x=11;x<=17;x++)if(x!==14)EDGE.add(x+',6,h');
for(let z=0;z<=6;z++)EDGE.add('21,'+z+',v');
for(let x=21;x<=31;x++)if(x!==22)EDGE.add(x+',7,h');
for(let i=0;i<9;i++){const {x0,z0}=zoneOf(i);for(let z=z0;z<=z0+4;z++){EDGE.add(x0+','+z+',v');if(z!==z0+1)EDGE.add((x0+5)+','+z+',v');}for(let x=x0;x<=x0+4;x++){EDGE.add(x+','+z0+',h');EDGE.add(x+','+(z0+5)+',h');}}
const grid=new Uint8Array(W*D);
function rebuildGrid(){grid.fill(0);STATIC_BLOCK.forEach(c=>grid[c[1]*W+c[0]]=1);
  DEPTS.forEach(d=>{for(let k=0;k<colsOf(d)*2;k++){const q=slotInfo(d,k);grid[q.desk[1]*W+q.desk[0]]=1;grid[q.seat[1]*W+q.seat[0]]=1;}});grid[BOSS_SEAT.seat[1]*W+BOSS_SEAT.seat[0]]=1;}
function astar(a,b,avoid){ /* A* por casillas, 4 vecinos, heurística Manhattan */
  if(a[0]===b[0]&&a[1]===b[1])return [];
  const N=W*D,g=new Float32Array(N).fill(1e9),from=new Int32Array(N).fill(-1),open=[],s=a[1]*W+a[0],e=b[1]*W+b[0];
  g[s]=0;open.push(s);const h=i=>Math.abs(i%W-b[0])+Math.abs((i/W|0)-b[1]);
  while(open.length){let bi=0;for(let i=1;i<open.length;i++)if(g[open[i]]+h(open[i])<g[open[bi]]+h(open[bi]))bi=i;
    const cur=open.splice(bi,1)[0];if(cur===e)break;const cx=cur%W,cz=cur/W|0;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=cx+dx,nz=cz+dz;if(nx<0||nz<0||nx>=W||nz>=D)continue;const n=nz*W+nx;if((grid[n]||(avoid&&avoid.has(n)))&&n!==e)continue;if(EDGE.has(dx?Math.max(cx,nx)+','+cz+',v':cx+','+Math.max(cz,nz)+',h'))continue;
      if(g[cur]+1<g[n]){g[n]=g[cur]+1;from[n]=cur;if(!open.includes(n))open.push(n);}}}
  if(from[e]<0)return [b];const out=[];for(let c=e;c!==s&&c>=0;c=from[c])out.push([c%W,c/W|0]);return out.reverse();}
function stateAnim(p){return p.status==='working'?'type':p.status==='blocked'?'blocked':p.status==='done'?'doneSeat':p.busy?'waitSeat':'calm';}
function pushCapped(q,ev){q.push(ev);if(q.length>3)q.splice(0,q.length-1);}
const wx=c=>c-W/2+.5,wz=c=>c-D/2+.5;
function liftAt(x,z){const xc=x+W/2,zc=z+D/2;return (xc>11&&xc<18)?.25*Math.max(0,Math.min(1,(6.45-zc)/.9)):0;}

/* =====================================================================
   ESCENA
   ===================================================================== */
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.outputEncoding=X.sRGBEncoding;renderer.setClearColor(0x000000,0);
renderer.toneMapping=X.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=X.PCFSoftShadowMap;
const scene=new X.Scene(),sky=new X.Color(0x9fd3ff);
const camera=new X.OrthographicCamera(-1,1,1,-1,.1,520);
scene.fog=new X.Fog(0xbfdcf5,80,250);
const mats=new Map();
function mat(c,rough){const k=c+'|'+(rough||0);if(!mats.has(k))mats.set(k,new X.MeshStandardMaterial({color:c,roughness:rough||.7,metalness:0}));return mats.get(k);}
function matFlat(c){const k=c+'|f';if(!mats.has(k))mats.set(k,new X.MeshStandardMaterial({color:c,roughness:.8,flatShading:true}));return mats.get(k);}
function add(p,geo,m,x,y,z){const me=new X.Mesh(geo,typeof m==='number'?mat(m):m);me.position.set(x||0,y||0,z||0);me.castShadow=true;me.receiveShadow=true;p.add(me);return me;}
const box=(p,w,h,d,c,x,y,z)=>add(p,new X.BoxGeometry(w,h,d),c,x,y,z);
const cyl=(p,rt,rb,h,c,x,y,z,s)=>add(p,new X.CylinderGeometry(rt,rb,h,s||16),c,x,y,z);
const sph=(p,r,c,x,y,z)=>add(p,new X.SphereGeometry(r,16,12),c,x,y,z);
function rbox(w,h,d,r){ /* caja redondeada: caras planas y solo el canto curvo (3 cortes por canto) */
  r=Math.min(r,w/2,h/2,d/2);const b=3,n=2*b+1,g=new X.BoxGeometry(w,h,d,n,n,n),p=g.attributes.position,nr=g.attributes.normal,H=[w/2,h/2,d/2],v=[0,0,0],c=[0,0,0];
  const remap=(val,hf)=>{const i=Math.round((val+hf)/(2*hf)*n);return i<=b?-hf+(i/b)*r:hf-((n-i)/b)*r;};
  for(let k=0;k<p.count;k++){v[0]=remap(p.getX(k),H[0]);v[1]=remap(p.getY(k),H[1]);v[2]=remap(p.getZ(k),H[2]);let L=0;
    for(let a=0;a<3;a++){const m=H[a]-r;c[a]=Math.max(-m,Math.min(m,v[a]));v[a]-=c[a];L+=v[a]*v[a];}
    L=Math.sqrt(L)||1;nr.setXYZ(k,v[0]/L,v[1]/L,v[2]/L);p.setXYZ(k,c[0]+v[0]/L*r,c[1]+v[1]/L*r,c[2]+v[2]/L*r);}
  return g;}
const rb=(p,w,h,d,r,c,x,y,z)=>add(p,rbox(w,h,d,r),c,x,y,z);
function merge(parts){const pos=[],nor=[];parts.forEach(a=>{const m=new X.Matrix4().makeRotationFromEuler(new X.Euler(a[4]||0,a[5]||0,a[6]||0)).setPosition(a[1],a[2],a[3]);
  const q=a[0].clone().applyMatrix4(m).toNonIndexed(),P=q.attributes.position.array,N=q.attributes.normal.array;for(let i=0;i<P.length;i++){pos.push(P[i]);nor.push(N[i]);}});
  const o=new X.BufferGeometry();o.setAttribute('position',new X.Float32BufferAttribute(pos,3));o.setAttribute('normal',new X.Float32BufferAttribute(nor,3));return o;}
function canvasTex(w,h,draw){const cv=document.createElement('canvas');cv.width=w;cv.height=h;draw(cv.getContext('2d'),w,h);const t=new X.CanvasTexture(cv);t.encoding=X.sRGBEncoding;t.anisotropy=4;return t;}
const rnd=(a,b)=>a+Math.random()*(b-a),pick=a=>a[Math.floor(Math.random()*a.length)];
function lerpAngle(a,b,k){const P=Math.PI*2;const d=((b-a+Math.PI)%P+P)%P-Math.PI;return a+d*k;}
const noShadow=m=>{m.castShadow=false;return m;};
const C=(rt,rb_,h,s)=>new X.CylinderGeometry(rt,rb_,h,s||14),B=(w,h,d)=>new X.BoxGeometry(w,h,d);

/* luz: entorno (IBL) + sol con sombras + relleno */
const pmrem=new X.PMREMGenerator(renderer),envCache={};
function envFor(name,top,bottom,k){if(envCache[name])return envCache[name];const s=new X.Scene(),g=new X.SphereGeometry(40,24,14),col=[],p=g.attributes.position,a=new X.Color(top),b=new X.Color(bottom),c=new X.Color();
  for(let i=0;i<p.count;i++){const t=Math.pow((p.getY(i)/40+1)/2,.8);c.copy(b).lerp(a,t);col.push(c.r*k,c.g*k,c.b*k);}
  g.setAttribute('color',new X.Float32BufferAttribute(col,3));s.add(new X.Mesh(g,new X.MeshBasicMaterial({vertexColors:true,side:X.BackSide})));
  return envCache[name]=pmrem.fromScene(s,.04).texture;}
const hemi=new X.HemisphereLight(0xffffff,0x8d95a8,.3);scene.add(hemi);
const sun=new X.DirectionalLight(0xfff1dc,1.5);sun.position.set(-12,19,8);sun.castShadow=true;
const small=Math.min(innerWidth,innerHeight)<600;sun.shadow.mapSize.set(small?2048:4096,small?2048:4096);
Object.assign(sun.shadow.camera,{left:-24,right:24,top:22,bottom:-22,near:1,far:70});sun.shadow.bias=-.0004;sun.shadow.normalBias=.03;sun.shadow.radius=2.5;scene.add(sun);
const warm=[[-8,2.6,3],[3,2.6,4],[10,2.6,-1],[10,2.6,7]].map(p=>{const l=new X.PointLight(0xffc27a,0,15,1.6);l.position.set(p[0],p[1],p[2]);scene.add(l);return l;});
const radial=canvasTex(128,128,(c)=>{const g=c.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.55,'rgba(255,255,255,.35)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,128,128);});
const blobMat=new X.MeshBasicMaterial({map:radial,color:0x0b1020,transparent:true,opacity:.42,depthWrite:false});
const blobGeo=new X.PlaneGeometry(1,1);blobGeo.rotateX(-Math.PI/2);
function decal(w,d,m,x,y,z){const me=new X.Mesh(blobGeo,m);me.scale.set(w,1,d);me.position.set(x,y,z);me.renderOrder=2;scene.add(me);return me;}


/* la oficina es el último piso de un rascacielos; alrededor, la ciudad vista desde arriba */
const winTex=canvasTex(64,64,(c)=>{c.fillStyle='#ffffff';c.fillRect(0,0,64,64);c.fillStyle='#dfe5ea';c.fillRect(0,22,64,26);c.fillStyle='#eef1f4';c.fillRect(30,22,4,26);});
const litTex=canvasTex(128,128,(c)=>{c.fillStyle='#000';c.fillRect(0,0,128,128);for(let y=0;y<4;y++)for(let x=0;x<4;x++){if((x*5+y*11+x*y)%4===0){c.fillStyle='#ffd9a0';c.fillRect(x*32+6,y*32+12,20,12);}}});
[winTex,litTex].forEach(t=>{t.wrapS=t.wrapT=X.RepeatWrapping;});
const cityMats=[0x9fb0c2,0xa9b6c4,0x93a6b8,0xb3bcc8,0x51626e].map(c=>new X.MeshStandardMaterial({color:c,map:winTex,emissive:0xffffff,emissiveMap:litTex,emissiveIntensity:0,roughness:.85}));
function tower(w,h,d,x,top,z,mi){const g=new X.BoxGeometry(w,h,d),uv=g.attributes.uv,nr=g.attributes.normal;
  for(let i=0;i<uv.count;i++){const horiz=Math.abs(nr.getX(i))>.5?d:w;if(Math.abs(nr.getY(i))>.5)uv.setXY(i,.03,.03);else uv.setXY(i,Math.round(uv.getX(i)*horiz/4),uv.getY(i)*Math.round(h/3));}
  const m=new X.Mesh(g,cityMats[mi]);m.position.set(x,top-h/2,z);scene.add(m);return m;}
(function(){const caps=[];let seed=11;const R=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  tower(W+1.2,100,D+1.2,0,-.82,0,4);tower(3.5,100,3.1,wx(DOOR[0]),-.82,D/2+1.95,4);
  for(let gx=-4;gx<=4;gx++)for(let gz=-4;gz<=4;gz++){if(Math.abs(gx)<=1&&Math.abs(gz)<=1)continue;if(R()<.3)continue;
    const w=12+R()*8,d=12+R()*8,x=gx*30+(R()-.5)*8,z=gz*30+(R()-.5)*8,top=-(26+R()*38),mi=Math.floor(R()*4);
    tower(w,100,d,x,top,z,mi);caps.push([B(w*.5,1.4,d*.5),x,top+.7,z]);}
  scene.add(new X.Mesh(merge(caps),mat(0x9aa7b5,.9)));
  const gr=new X.Mesh(new X.PlaneGeometry(900,900),mat(0x7d8b99,1));gr.rotation.x=-Math.PI/2;gr.position.y=-80;scene.add(gr);})();
/* edificio */
noShadow(rb(scene,W+1.6,.5,D+1.6,.1,0x3a2c22,0,-.57,0));noShadow(rb(scene,W+1.2,.3,D+1.2,.05,0x4a3528,0,-.25,0));
const floorTex=canvasTex(512,512,(c)=>{const cols=['#c48a58','#cf9763','#bd8351','#c99060','#d29c69'];c.fillStyle='#c48a58';c.fillRect(0,0,512,512);const ph=64;
  for(let r=0;r<8;r++){let x=-((r*137)%200),i=r;while(x<512){const pw=150+((r*53+i*31)%110);c.fillStyle=cols[(r*3+i*7)%5];c.fillRect(x+1,r*ph+1,pw-2,ph-2);c.fillStyle='rgba(90,50,20,.10)';for(let k=0;k<3;k++)c.fillRect(x+8,r*ph+12+k*17+((i*13)%7),pw-16,2);x+=pw;i++;}}
  c.strokeStyle='rgba(70,40,15,.35)';c.lineWidth=2;for(let r=0;r<=8;r++){c.beginPath();c.moveTo(0,r*ph);c.lineTo(512,r*ph);c.stroke();}});
floorTex.wrapS=floorTex.wrapT=X.RepeatWrapping;floorTex.repeat.set(W/4,D/4);
noShadow(add(scene,new X.BoxGeometry(W,.2,D),new X.MeshStandardMaterial({map:floorTex,color:0xd2a57e,roughness:.8}),0,-.1,0));
const tileTex=canvasTex(128,128,(c)=>{c.fillStyle='#e9dfcc';c.fillRect(0,0,128,128);c.fillStyle='#f1e9d9';c.fillRect(3,3,58,58);c.fillRect(67,67,58,58);c.fillStyle='#e3d6bf';c.fillRect(67,3,58,58);c.fillRect(3,67,58,58);});tileTex.wrapS=tileTex.wrapT=X.RepeatWrapping;
function tiles(x1,z1,x2,z2){const t=tileTex.clone();t.needsUpdate=true;t.repeat.set((x2-x1)/2,(z2-z1)/2);noShadow(add(scene,new X.BoxGeometry(x2-x1,.02,z2-z1),new X.MeshStandardMaterial({map:t,roughness:.6}),(x1+x2)/2-W/2,.011,(z1+z2)/2-D/2));}
tiles(21,9,32,15);tiles(17.5,20.4,24.2,25);
function rug(x1,z1,x2,z2,c,c2){noShadow(rb(scene,x2-x1,.02,z2-z1,.008,c,(x1+x2)/2-W/2,.012,(z1+z2)/2-D/2));if(c2)noShadow(rb(scene,x2-x1-.5,.022,z2-z1-.5,.008,c2,(x1+x2)/2-W/2,.013,(z1+z2)/2-D/2));}
const winMat=new X.MeshBasicMaterial({color:0xbfe4ff});
const bulbAll=new X.MeshStandardMaterial({color:0xfff0cf,emissive:0xffb85c,emissiveIntensity:.3,roughness:.4});
const walls={};
function buildWall(key,len,x,z,ry,gap,gc){const g=new X.Group();g.position.set(x,0,z);g.rotation.y=ry;scene.add(g);const tall=new X.Group();g.add(tall);gc=gc||0;
  const segs=gap?[[-len/2,gc-gap/2],[gc+gap/2,len/2]]:[[-len/2,len/2]];
  segs.forEach(([a,b])=>{const L=b-a,c=(a+b)/2,n=Math.max(1,Math.round(L/3.3));box(g,L,.3,.22,0x5a3d28,c,.15,0);box(tall,L,2.45,.2,0xefe6d6,c,1.52,0);noShadow(box(tall,L,.1,.3,0x8a5a36,c,2.8,0));noShadow(box(tall,L,.62,.02,0xb07a4c,c,.62,.106));
    for(let i=1;i<n;i++){const px=a+L*i/n;noShadow(rb(tall,.1,.34,.05,.02,0xb8893a,px,1.75,.125));noShadow(sph(tall,.075,bulbAll,px,1.86,.2));noShadow(cyl(tall,.012,.012,.1,0xb8893a,px,1.86,.15,6)).rotation.x=Math.PI/2;}
    for(let i=0;i<n;i++){const px=a+L*(i+.5)/n,ww=Math.min(2.3,L/n-.7);
      noShadow(box(tall,ww+.14,1.34,.05,0xffffff,px,1.75,.11));const w=add(tall,new X.PlaneGeometry(ww,1.2),winMat,px,1.75,.137);w.castShadow=false;w.receiveShadow=false;
      noShadow(box(tall,.045,1.2,.03,0xffffff,px,1.75,.14));noShadow(box(tall,ww,.045,.03,0xffffff,px,1.75,.14));noShadow(box(tall,ww+.3,.05,.16,0xffffff,px,1.07,.16));}});
  walls[key]=tall;return tall;}
const DX=wx(DOOR[0]);
const glass=new X.MeshStandardMaterial({color:0x8fc7bd,transparent:true,opacity:.3,roughness:.08,metalness:.1,depthWrite:false});
function leaf(hx,hz,y0,w,ang){const h=new X.Group();h.position.set(hx,y0,hz);h.rotation.y=ang;scene.add(h);noShadow(add(h,new X.BoxGeometry(w,1.6,.04),glass,w/2,.95,0));[.13,1.77].forEach(y=>noShadow(box(h,w,.07,.06,0x263a38,w/2,y,0)));[0,w].forEach(x=>noShadow(box(h,.06,1.7,.06,0x263a38,x,.95,0)));noShadow(rb(h,.04,.4,.1,.015,0xb8893a,w-.14,.95,0));}
buildWall('N',W+.4,0,-D/2-.1,0);walls.S=new X.Group();scene.add(walls.S);
(function(){const z=D/2+.1;[[-W/2-.2,DX-1.5],[DX+1.5,W/2+.2]].forEach(([a,b])=>{const L=b-a,c=(a+b)/2;box(scene,L,.3,.22,0x5a3d28,c,.15,z);noShadow(box(scene,L,.5,.1,0x7a5234,c,.55,z));noShadow(add(scene,new X.BoxGeometry(L,1.5,.04),glass,c,1.55,z));noShadow(box(scene,L,.1,.16,0x263a38,c,2.34,z));
  const n=Math.max(1,Math.round(L/2.2));for(let i=0;i<=n;i++)noShadow(box(scene,.09,1.6,.12,0x263a38,a+L*i/n,1.55,z));});})();buildWall('W',D+.4,-W/2-.1,0,Math.PI/2);buildWall('E',D+.4,W/2+.1,0,-Math.PI/2);
/* la llegada es por elevador panorámico: caja de cristal adosada a la torre, con cabina que sube y baja */
const LZ=D/2+.1,liftDoors=[],liftLamp=new X.MeshBasicMaterial({color:0x334155,toneMapped:false}),liftCab=new X.Group();scene.add(liftCab);
(function(){const dk=0x263a38,cz=LZ+1.5;
  [-1.56,1.56].forEach(o=>box(scene,.2,3,.26,dk,DX+o,1.5,LZ));box(scene,3.32,.3,.26,dk,DX,2.85,LZ);
  noShadow(rb(scene,.5,.14,.04,.03,liftLamp,DX,2.85,LZ-.15));
  [-1,1].forEach(s=>{const d=new X.Group();d.position.set(DX+s*.73,0,LZ);scene.add(d);noShadow(add(d,new X.BoxGeometry(1.4,2.5,.04),glass,0,1.38,0));
    [[0,.14,1.46,.08],[0,2.62,1.46,.08]].forEach(a=>noShadow(box(d,a[2],a[3],.07,dk,a[0],a[1],0)));[-.7,.7].forEach(x=>noShadow(box(d,.07,2.56,.07,dk,x,1.38,0)));liftDoors.push({m:d,x:DX+s*.73,s});});
  /* caja de cristal */
  [[-1.56,0,.04,2.9],[1.56,0,.04,2.9],[0,1.5,3.1,.04]].forEach(a=>noShadow(add(scene,new X.BoxGeometry(a[2],3,a[3]),glass,DX+a[0],1.5,cz+a[1])));
  [[-1.56,1.5],[1.56,1.5]].forEach(a=>noShadow(box(scene,.12,3,.12,dk,DX+a[0],1.5,cz+a[1])));
  [[-1.56,0,.12,3.02],[1.56,0,.12,3.02],[0,1.5,3.24,.12]].forEach(a=>{noShadow(box(scene,a[2],.12,a[3],dk,DX+a[0],3.0,cz+a[1]));noShadow(box(scene,a[2],.12,a[3],dk,DX+a[0],.0,cz+a[1]));});
  /* cabina */
  rb(liftCab,2.9,.1,2.7,.03,0x3d4650,DX,-.02,cz-.05);noShadow(rb(liftCab,2.3,.02,2.1,.01,0x566270,DX,.04,cz-.05));
  rb(liftCab,2.9,.1,2.7,.03,0x263a38,DX,2.72,cz-.05);noShadow(rb(liftCab,1.8,.04,.16,.02,bulbAll,DX,2.66,cz-.05));
  noShadow(rb(liftCab,2.5,.05,.05,.02,0xb8893a,DX,1.0,cz+1.3));})();
noShadow(rb(scene,3,.03,1.3,.01,0x263a38,DX,.02,D/2-.9));
/* helpers de mobiliario */
function shelf(x,z,ry,w,y){const g=new X.Group();g.position.set(x,y||0,z);g.rotation.y=ry;scene.add(g);box(g,w,1.7,.36,0x7a4f2e,0,.85,0);
  for(let r=0;r<3;r++){noShadow(box(g,w-.1,.44,.03,0x3a2a1c,0,.34+r*.52,.17));let px=-w/2+.1;while(px<w/2-.2){const bw=rnd(.06,.12),bh=rnd(.24,.38);noShadow(box(g,bw,bh,.2,pick([0x2f6b63,0xb7502e,0xd9a441,0x3a8f62,0x6b5a48,0xefe6d6,0x1f3f3b]),px+bw/2,.12+r*.52+bh/2,.09));px+=bw+.012;}}}
function plant(x,z,s,y){const g=new X.Group();g.position.set(wx(x),y||0,wz(z));g.scale.setScalar(s||1);scene.add(g);
  cyl(g,.25,.17,.4,0xefe6d6,0,.2,0,20);cyl(g,.275,.275,.06,0xd9cdb6,0,.4,0,20);noShadow(cyl(g,.24,.24,.02,0x4a3628,0,.435,0,20));
  const lg=new X.SphereGeometry(.2,12,8);
  for(let i=0;i<12;i++){const a=new X.Group();a.rotation.y=i*2.4;g.add(a);const p=new X.Group();p.position.y=.42;p.rotation.x=.15+((i*37)%10)/10*.85;a.add(p);const L=.45+((i*53)%10)/10*.75;
    cyl(p,.014,.02,L,0x2f6a48,0,L/2,0,6);const lf=add(p,lg,i%2?0x2c7550:0x3a8f62,0,L+.16,0);lf.scale.set(.75,.12,1.5);lf.rotation.x=.55;}}
function sofa(x,z,ry,len,c1,c2,p1,p2){const g=new X.Group();g.position.set(x,0,z);g.rotation.y=ry;scene.add(g);
  rb(g,len,.22,.9,.06,0x4a3628,0,.14,0);rb(g,len-.4,.2,.7,.08,c2,0,.33,.07);rb(g,len,.62,.26,.1,c1,0,.5,-.32);[-1,1].forEach(s=>rb(g,.22,.42,.9,.09,c1,s*(len/2-.11),.34,0));
  rb(g,.4,.34,.18,.08,p1,-len/2+.5,.6,-.1).rotation.x=-.2;rb(g,.4,.34,.18,.08,p2,len/2-.5,.6,-.1).rotation.x=-.2;}
function armchair(x,z,ry,c){const g=new X.Group();g.position.set(x,0,z);g.rotation.y=ry;scene.add(g);rb(g,.8,.2,.8,.06,0x4a3628,0,.14,0);rb(g,.5,.18,.56,.07,c,0,.32,.06);rb(g,.8,.56,.22,.1,c,0,.48,-.3);[-1,1].forEach(s=>rb(g,.18,.4,.8,.08,c,s*.31,.34,0));return g;}
function floorLamp(x,z){const g=new X.Group();g.position.set(x,0,z);scene.add(g);cyl(g,.2,.22,.04,0x263a38,0,.02,0,18);cyl(g,.022,.022,1.5,0xb8893a,0,.77,0,8);noShadow(cyl(g,.16,.26,.32,0xf3e6c8,0,1.62,0,20));noShadow(sph(g,.09,bulbAll,0,1.56,0));}
function roundTable(x,z,r,h,c){cyl(scene,r,r,.05,c,x,h,z,28);cyl(scene,.05,.05,h,0x263a38,x,h/2,z,10);cyl(scene,r*.5,r*.55,.03,0x263a38,x,.015,z,20);}
function potSmall(p,x,y,z){cyl(p,.06,.045,.09,0xefe6d6,x,y+.045,z,12);[[0,.14,0],[-.05,.1,.03],[.05,.11,-.02]].forEach(a=>{const l=sph(p,.07,0x2c7550,x+a[0],y+a[1],z+a[2]);l.scale.set(1,.6,1);});}
function pane(w,d,x,z,y0){noShadow(add(scene,new X.BoxGeometry(w,1.55,d),glass,x,(y0||0)+1.03,z));noShadow(box(scene,w+.03,.07,d+.03,0x263a38,x,(y0||0)+1.83,z));noShadow(box(scene,w+.03,.3,d+.03,0x7a5234,x,(y0||0)+.15,z));}
const BX=c=>c-W/2,BZ=c=>c-D/2; /* coordenadas de borde de casilla */

/* sala de juegos y lectura (esquina del fondo) */
shelf(wx(2),BZ(0)+.25,0,3);noShadow(rb(scene,1.4,.9,.04,.01,0x7a4f2e,wx(6),1.8,BZ(0)+.13));noShadow(rb(scene,1.2,.7,.02,.01,0x2f6b63,wx(6),1.8,BZ(0)+.15));
sofa(wx(0),wz(2.5),Math.PI/2,1.95,0xe6d9c2,0xefe4d0,0x2f6b63,0xc98f5e);rug(0.4,1,4,5,0x245c55,0x2f7a70);
(function(){const g=new X.Group();g.position.set(wx(2),0,wz(5));scene.add(g);const b=sph(g,.55,0x3a7a52,0,.3,0);b.scale.set(1,.55,1);const t=sph(g,.4,0x3a7a52,0,.5,-.15);t.scale.set(.9,.6,.7);})();
(function(){const g=new X.Group();g.position.set(wx(5.5),0,wz(3));scene.add(g);[[-.75,-.4],[.75,-.4],[-.75,.4],[.75,.4]].forEach(a=>rb(g,.1,.7,.1,.03,0x5a3d28,a[0],.35,a[1]));
  rb(g,1.8,.3,1.06,.05,0x7a4f2e,0,.78,0);noShadow(rb(g,1.6,.02,.86,.008,0x2f8a5c,0,.935,0));noShadow(box(g,.02,.022,.86,0xffffff,0,.937,0));
  [-.6,-.2,.2,.6].forEach((x,i)=>{noShadow(cyl(g,.015,.015,1.45,0xcfd6dd,x,1.0,0,6)).rotation.x=Math.PI/2;[-1,1].forEach(s=>noShadow(cyl(g,.04,.04,.14,0x1f1f1f,x,1.0,s*.76,8)).rotation.x=Math.PI/2);
    [-.25,0,.25].forEach(z=>noShadow(rb(g,.06,.14,.05,.015,i%2?0xd9682f:0x2f6b63,x,.97,z)));});})();
floorLamp(wx(9),wz(0));plant(0,0,1.15);roundTable(wx(1.6),wz(3),.3,.42,0x9a6a42);cyl(scene,.055,.045,.09,0xffffff,wx(1.6),.49,wz(3),12);

/* oficina del jefe: un escalón arriba, de vidrio, mirando a la planta */
rb(scene,7,.25,6,.03,0xa06c40,BX(14.5),.125,BZ(3));rb(scene,1.1,.13,.5,.02,0x8a5a36,wx(14),.065,BZ(6)+.22);
pane(.06,6,BX(11),BZ(3),.25);pane(.06,6,BX(18),BZ(3),.25);pane(3,.06,BX(12.5),BZ(6),.25);pane(3,.06,BX(16.5),BZ(6),.25);
[[11,6],[14,6],[15,6],[18,6]].forEach(a=>noShadow(box(scene,.1,1.9,.1,0x263a38,BX(a[0]),1.2,BZ(a[1]))));
noShadow(cyl(scene,1.7,1.7,.02,0x245c55,wx(14),.262,wz(2.6),40));noShadow(cyl(scene,1.4,1.4,.022,0x2f7a70,wx(14),.263,wz(2.6),40));
shelf(wx(11.5),BZ(0)+.25,0,1.9,.25);shelf(wx(16.5),BZ(0)+.25,0,1.9,.25);
[[13.6,.9,.6,0x2f6b63],[14.5,.6,.8,0xc98f5e],[15.3,.7,.5,0xefe6d6]].forEach(a=>noShadow(rb(scene,a[1],a[2],.04,.01,a[3],BX(a[0]),2.0,BZ(0)+.13)));
leaf(BX(14)+.05,BZ(6),.2,.9,-1.5);leaf(BX(22)+.05,BZ(7),0,.9,-1.5);
plant(11,5,.8,.25);plant(17,5,.8,.25);armchair(wx(12.4),wz(4.3),2.4,0x3a7a52).position.y=.25;

/* sala de juntas */
pane(.06,7,BX(21),BZ(3.5));pane(1,.06,BX(21.5),BZ(7));pane(9,.06,BX(27.5),BZ(7));[[21,7],[22,7],[23,7]].forEach(a=>noShadow(box(scene,.1,1.9,.1,0x263a38,BX(a[0]),.95,BZ(a[1]))));
rug(23.6,.8,30.4,6.2,0x6f8a82,0x86a39a);
rb(scene,3.9,.08,1.9,.05,0x8a5a36,BX(27),.68,BZ(4));[-1.2,1.2].forEach(o=>rb(scene,.5,.62,1.1,.06,0x263a38,BX(27)+o,.32,BZ(4)));
[[-1.1,-.4],[.2,.45],[1.2,-.3]].forEach((a,i)=>{noShadow(rb(scene,.34,.02,.24,.006,i?0xefe6d6:0x263a38,BX(27)+a[0],.73,BZ(4)+a[1]));});cyl(scene,.055,.045,.1,0xffffff,BX(27)-.4,.77,BZ(4)+.3,12);potSmall(scene,BX(27),.72,BZ(4));
const chartTex=canvasTex(320,190,(c,w,h)=>{c.fillStyle='#f4efe4';c.fillRect(0,0,w,h);c.strokeStyle='#d9cdb6';c.lineWidth=2;for(let i=0;i<4;i++){c.beginPath();c.moveTo(20,40+i*38);c.lineTo(190,40+i*38);c.stroke();}
  [60,95,70,120,105].forEach((v,i)=>{c.fillStyle=['#2f6b63','#c98f5e','#3a8f62','#d9a441','#6b5a48'][i];c.fillRect(30+i*32,170-v,22,v);});c.fillStyle='#2f6b63';c.beginPath();c.moveTo(255,95);c.arc(255,95,45,0,4.2);c.fill();c.fillStyle='#d9a441';c.beginPath();c.moveTo(255,95);c.arc(255,95,45,4.2,6.283);c.fill();});
noShadow(rb(scene,3.3,1.5,.08,.03,0x263a38,BX(27),1.75,BZ(0)+.14));(function(){const t=add(scene,new X.PlaneGeometry(3.1,1.3),new X.MeshBasicMaterial({map:chartTex,toneMapped:false}),BX(27),1.75,BZ(0)+.185);t.castShadow=false;t.receiveShadow=false;})();
plant(31,6,1);plant(21,0,1);

/* cocina */
(function(){const L=7,g=new X.Group();g.position.set(BX(26.5),0,wz(9));scene.add(g);
  box(scene,9,1.9,.14,0xb07a4c,BX(27.5),.95,BZ(9)-.02);noShadow(rb(scene,6.6,.06,.3,.02,0x7a4f2e,BX(26.5),1.55,BZ(9)+.2));
  [-2.6,-1.4,-.2,1,2.2].forEach((x,i)=>{if(i%2)potSmall(scene,BX(26.5)+x,1.58,BZ(9)+.2);else [0,1,2].forEach(k=>noShadow(cyl(scene,.07,.07,.2,[0x2f6b63,0xd9a441,0xefe6d6][k],BX(26.5)+x-.2+k*.2,1.68,BZ(9)+.2,12)));});
  rb(g,L,.8,.78,.03,0x7a4f2e,0,.4,0);noShadow(box(g,L,.1,.02,0x263a38,0,.06,.39));rb(g,L+.1,.07,.88,.025,0xefe6d6,0,.845,0);
  for(let i=0;i<7;i++){noShadow(box(g,.9,.6,.02,i===3||i===4?0x2f6b63:0x8a5a36,-3+i,.45,.392));noShadow(box(g,.03,.16,.03,0xb8893a,-3+i+.36,.5,.41));}
  rb(g,.56,.5,.44,.05,0x263a38,-2.6,1.14,-.06);rb(g,.6,.08,.48,.03,0xb8893a,-2.6,1.42,-.06);rb(g,.52,.05,.3,.02,0x1b2230,-2.6,.9,.12);cyl(g,.05,.04,.1,0xaab4c4,-2.6,1.12,.2,12);cyl(g,.055,.045,.09,0xffffff,-2.6,.97,.2,14);
  [0,1].forEach(i=>noShadow(sph(g,.022,new X.MeshBasicMaterial({color:i?0x4ade80:0xfacc15}),-2.68+i*.16,1.28,.17)));
  rb(g,.4,.5,.36,.04,0xcfd6dd,-1.8,1.13,-.08);noShadow(cyl(g,.1,.1,.3,glass,-1.8,1.1,.14,14));
  noShadow(rb(g,.8,.02,.5,.01,0x9aa3b2,-.3,.89,.02));cyl(g,.02,.02,.3,0x9aa3b2,-.3,1.03,-.25,8);noShadow(cyl(g,.02,.02,.2,0x9aa3b2,-.3,1.17,-.16,8)).rotation.x=Math.PI/2;
  rb(g,.6,.36,.42,.03,0xdfe6ee,1.1,1.06,-.08);noShadow(rb(g,.36,.24,.02,.01,0x1b2230,1.04,1.06,.135));
  [0,1,2,3].forEach(i=>cyl(g,.055,.045,.1,[0x2f6b63,0xd9a441,0xefe6d6,0xc98f5e][i],1.8+i*.17,.93,.18,14));
  cyl(g,.16,.1,.07,0xefe6d6,2.9,.915,-.1,18);[[0xd9682f,-.05,0],[0xd9a441,.05,.03],[0x8fb33a,0,-.06]].forEach(a=>sph(g,.055,a[0],2.9+a[1],.97,-.1+a[2]));
  /* refri y garrafón */
  rb(g,.84,1.95,.76,.06,0xcfd6dd,4.05,.975,0);noShadow(box(g,.8,.015,.02,0x8792a6,4.05,1.25,.385));[.7,1.6].forEach(y=>noShadow(rb(g,.04,.4,.05,.015,0x6b7689,4.33,y,.41)));
  rb(g,.44,.95,.44,.05,0xefe6d6,-4.1,.475,0);noShadow(cyl(g,.17,.17,.4,new X.MeshPhysicalMaterial({color:0x8fd0ff,transparent:true,opacity:.55,roughness:.05,clearcoat:1}),-4.1,1.17,0,20));})();
/* barra con bancos */
rb(scene,5,.9,.9,.04,0x7a4f2e,wx(26),.45,wz(12));rb(scene,5.2,.07,1.1,.03,0xefe6d6,wx(26),.935,wz(12));noShadow(box(scene,4.6,.5,.02,0x8a5a36,wx(26),.5,wz(12)+.46));
potSmall(scene,wx(24.6),.97,wz(12));cyl(scene,.2,.12,.08,0x9a6a42,wx(26.4),1.01,wz(12),18);[[0xd9a441,-.06,0],[0xd9682f,.06,.04],[0xd9a441,0,-.07]].forEach(a=>sph(scene,.06,a[0],wx(26.4)+a[1],1.07,wz(12)+a[2]));cyl(scene,.055,.045,.1,0xffffff,wx(27.6),1.02,wz(12)+.2,12);
[25,26,27].forEach(x=>{cyl(scene,.2,.2,.08,0x2f6b63,wx(x),.62,wz(13)-.1,18);cyl(scene,.03,.03,.58,0x263a38,wx(x),.29,wz(13)-.1,8);noShadow(add(scene,new X.TorusGeometry(.16,.015,6,18),0x263a38,wx(x),.22,wz(13)-.1)).rotation.x=Math.PI/2;cyl(scene,.17,.19,.03,0x263a38,wx(x),.015,wz(13)-.1,16);});
/* impresora */
(function(){const g=new X.Group();g.position.set(wx(31),0,wz(14));g.rotation.y=-Math.PI/2;scene.add(g);rb(g,.8,.6,.68,.03,0xdfe6ee,0,.3,0);noShadow(box(g,.7,.02,.02,0x9aa3b2,0,.3,.345));rb(g,.74,.24,.62,.05,0x263a38,0,.74,0);
  rb(g,.56,.03,.3,.01,0xdfe6ee,0,.87,-.1).rotation.x=-.5;noShadow(box(g,.44,.02,.3,0xffffff,0,.66,.4));})();

/* sala de estar */
rug(22.6,16.4,30.6,20.3,0x245c55,0x2f7a70);
sofa(wx(26),wz(16),0,2.9,0x9a5a2e,0xb06a38,0x2f6b63,0x3a7a52);armchair(wx(23),wz(18),Math.PI/2,0xe6d9c2);armchair(wx(29),wz(18),-Math.PI/2,0xb06a38);
roundTable(wx(26),wz(18),.5,.4,0x9a6a42);potSmall(scene,wx(26)-.15,.43,wz(18));cyl(scene,.055,.045,.09,0xffffff,wx(26)+.2,.47,wz(18)+.15,12);
roundTable(wx(30),wz(21),.48,.66,0x9a6a42);potSmall(scene,wx(30),.69,wz(21));[[-.75,0,Math.PI/2],[.3,.7,Math.PI],[.3,-.7,0]].forEach(a=>{const g=new X.Group();g.position.set(wx(30)+a[0],0,wz(21)+a[1]);g.rotation.y=a[2];scene.add(g);rb(g,.42,.07,.4,.03,0xe6d9c2,0,.4,0);rb(g,.42,.4,.07,.03,0xe6d9c2,0,.62,-.19);[[-.17,-.16],[.17,-.16],[-.17,.16],[.17,.16]].forEach(l=>cyl(g,.022,.022,.38,0x7a4f2e,l[0],.19,l[1],6));});
plant(31,16,1.25);plant(25,24,1.15);floorLamp(wx(24.4),wz(16)-.1);

/* recepción: mostrador de frente al elevador, con el lambrín a espaldas y aire entre ambos */
(function(){const g=new X.Group();g.position.set(BX(22.5),0,BZ(22.2));g.rotation.y=-Math.PI/2;scene.add(g);
  box(g,3.4,2.1,.14,0x5a3d28,0,1.05,-1.72);for(let i=0;i<16;i++){noShadow(box(g,.1,2,.05,i%2?0x7a4f2e:0x8a5a36,-1.55+i*.207,1.05,-1.63));noShadow(box(g,.1,2,.05,i%2?0x8a5a36:0x7a4f2e,-1.55+i*.207,1.05,-1.81));}
  noShadow(rb(g,2.2,.07,.06,.03,bulbAll,-.2,1.45,-1.59));noShadow(rb(g,1.2,.07,.06,.03,bulbAll,.4,1.7,-1.59));noShadow(rb(g,3.4,.06,.2,.02,0x263a38,0,2.12,-1.72));
  rb(g,2.6,1.02,.66,.05,0xefe6d6,0,.51,.1);rb(g,2.74,.06,.82,.025,0xf7f1e4,0,1.05,.1);noShadow(box(g,2.4,.5,.02,0xd9cdb6,0,.55,.435));noShadow(rb(g,2.5,.05,.04,.02,bulbAll,0,.14,.44));
  rb(g,.9,.72,.5,.04,0xefe6d6,-.85,.36,-.5);rb(g,.96,.05,.56,.02,0x9a6a42,-.85,.745,-.5);
  rb(g,.5,.34,.04,.015,0x1b2230,.35,1.02,-.12);box(g,.04,.2,.04,0x1b2230,.35,.85,-.1);noShadow(rb(g,.36,.02,.14,.008,0xf4f1ea,.35,.76,.0));
  potSmall(g,-1,1.08,.12);cyl(g,.07,.08,.02,0x263a38,.95,1.09,.1,14);cyl(g,.015,.015,.26,0xb8893a,.95,1.22,.1,6);noShadow(cyl(g,.05,.11,.11,0x263a38,.95,1.38,.1,14));noShadow(sph(g,.04,bulbAll,.95,1.34,.1));
  cyl(g,.26,.28,.04,0x24292c,.3,.03,-.75,16);cyl(g,.03,.03,.3,0x24292c,.3,.18,-.75,8);rb(g,.48,.09,.46,.04,0x2f6b63,.3,.36,-.75);rb(g,.45,.46,.08,.04,0x2f6b63,.3,.72,-1.0);})();
plant(17,24,1.25);plant(21,24,1.25);plant(0,7,1.1);plant(0,12,1.2);plant(0,17,1.1);plant(0,24,1.25);plant(31,24,1.2);plant(31,8,1.1);

/* zonas de departamento */
const zones={},spinners=[];
function signTex(label,color){return canvasTex(512,112,(c,w,h)=>{c.fillStyle=cssHex(color);c.fillRect(0,0,w,h);c.fillStyle='rgba(255,255,255,.18)';c.fillRect(0,0,w,8);c.fillStyle='#fff';c.font='700 60px "Space Grotesk","Segoe UI",sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(label,w/2,h/2+5);});}
const carpetTex=canvasTex(256,384,(c,w,h)=>{c.fillStyle='#fff';c.fillRect(0,0,w,h);c.fillStyle='rgba(0,0,0,.05)';for(let y=0;y<h;y+=6)c.fillRect(0,y,w,2);c.strokeStyle='rgba(0,0,0,.2)';c.lineWidth=7;c.strokeRect(12,12,w-24,h-24);});
const easelTex=canvasTex(200,150,(c,w,h)=>{c.fillStyle='#fdf6e3';c.fillRect(0,0,w,h);c.fillStyle='#fde047';c.beginPath();c.arc(150,42,22,0,7);c.fill();c.fillStyle='#A855F7';c.beginPath();c.moveTo(0,150);c.lineTo(70,60);c.lineTo(140,150);c.fill();c.fillStyle='#EC4899';c.beginPath();c.moveTo(70,150);c.lineTo(140,85);c.lineTo(200,150);c.fill();c.fillStyle='#22d3ee';c.fillRect(0,132,200,18);});
const FURN={
  desarrollo(g){noShadow(cyl(g,.75,.8,.08,0x263a38,0,.04,0,28));const b=sph(g,.46,0xfacc15,0,.5,-.02);b.scale.set(1.1,.88,1.25);const t=add(g,new X.ConeGeometry(.2,.4,12),0xfacc15,0,.62,-.6);t.rotation.x=-1.1;
    [-1,1].forEach(s=>{const w=sph(g,.26,0xf5b90f,s*.42,.5,-.05);w.scale.set(.35,.7,1.1);});sph(g,.3,0xfacc15,0,1.05,.2);
    const k=rb(g,.26,.07,.24,.03,0xf97316,0,1,.5);k.rotation.x=.1;[-1,1].forEach(s=>{noShadow(sph(g,.05,0x1b2230,s*.13,1.13,.44));noShadow(sph(g,.018,0xffffff,s*.12,1.15,.48));});},
  frontend(g){[[-.4,.12,.1],[.4,.12,-.1]].forEach(a=>{const l=box(g,.06,1.7,.06,0x8a5a32,a[0],.83,a[1]);l.rotation.z=a[2];});const bk=box(g,.06,1.7,.06,0x8a5a32,0,.8,-.3);bk.rotation.x=-.35;
    box(g,1,.06,.12,0x8a5a32,0,.62,.14);rb(g,1.1,.84,.05,.012,0xf8fafc,0,1.08,.13);const c=add(g,new X.PlaneGeometry(1,.75),new X.MeshStandardMaterial({map:easelTex,roughness:.9}),0,1.08,.158);c.castShadow=false;
    const p=cyl(g,.2,.2,.03,0xfef3c7,.75,.02,.3,18);[[0xef4444,-.08,.05],[0x3b82f6,.06,.08],[0xfacc15,.08,-.06],[0x22c55e,-.05,-.08]].forEach(a=>noShadow(sph(g,.04,a[0],.75+a[1],.045,.3+a[2])));},
  backend(g){rb(g,1.1,.56,.6,.05,0x4b5568,0,.28,0);[-.3,0,.3].forEach(x=>noShadow(box(g,.2,.04,.02,0x1b2230,x,.2,.305)));noShadow(sph(g,.04,new X.MeshBasicMaterial({color:0x4ade80}),.42,.42,.3));
    const mk=(r,teeth,col,x,y,k)=>{const s=new X.Group();s.position.set(x,y,.12);g.add(s);cyl(s,r,r,.14,col,0,0,0,28).rotation.x=Math.PI/2;for(let i=0;i<teeth;i++){const a=i*Math.PI*2/teeth,t=rb(s,r*.34,r*.36,.14,.02,col,Math.cos(a)*(r+.06),Math.sin(a)*(r+.06),0);t.rotation.z=a-Math.PI/2;}
      cyl(s,r*.32,r*.32,.17,0xe2e8f0,0,0,0,18).rotation.x=Math.PI/2;for(let i=0;i<3;i++){const a=i*Math.PI*2/3;noShadow(cyl(s,r*.13,r*.13,.15,0x166534,Math.cos(a)*r*.62,Math.sin(a)*r*.62,0,10)).rotation.x=Math.PI/2;}spinners.push({o:s,dept:'backend',k});};
    mk(.4,10,0x22C55E,-.22,1.02,1);mk(.26,7,0x86efac,.47,1.22,-1.43);},
  dba(g){noShadow(cyl(g,.62,.66,.08,0x263a38,0,.04,0,28));[0,1,2].forEach(i=>{cyl(g,.46,.46,.3,0x06B6D4,0,.25+i*.36,0,32);noShadow(cyl(g,.468,.468,.045,0xa5f3fc,0,.36+i*.36,0,32));noShadow(cyl(g,.468,.468,.03,0x0e7490,0,.12+i*.36,0,32));
    [0,1,2].forEach(k=>noShadow(sph(g,.022,new X.MeshBasicMaterial({color:k?0x4ade80:0xfde047}),-.1+k*.1,.24+i*.36,.455)));});cyl(g,.47,.47,.03,0xcffafe,0,1.135,0,32);},
  infra(g){[-.34,.34].forEach(x=>{rb(g,.62,1.8,.62,.03,0x1b2230,x,.9,0);for(let r=0;r<6;r++){noShadow(rb(g,.5,.2,.02,.008,0x263a38,x,.3+r*.26,.312));noShadow(box(g,.3,.02,.02,0x4b5568,x-.06,.3+r*.26,.325));
      for(let k=0;k<2;k++)noShadow(add(g,new X.BoxGeometry(.05,.05,.02),new X.MeshBasicMaterial({color:(r+k)%3?0x4ade80:0xfb923c}),x+.14+k*.07,.3+r*.26,.326));}});
    rb(g,1.4,.06,.3,.02,0xF97316,0,1.86,0);[-.5,0,.5].forEach(x=>noShadow(cyl(g,.03,.03,.34,0x38bdf8,x,1.92,0,8)).rotation.x=Math.PI/2);},
  qa(g){[-.6,.6].forEach(x=>{box(g,.05,1.5,.05,0x4b5568,x,.8,-.05);box(g,.05,.05,.5,0x4b5568,x,.07,-.05);[-.22,.22].forEach(z=>cyl(g,.04,.04,.04,0x1b2230,x,.03,-.05+z,10).rotation.z=Math.PI/2);});
    rb(g,1.3,.95,.05,.012,0xffffff,0,1.2,0);noShadow(box(g,1.3,.04,.1,0xaab4c4,0,.72,.03));[0,1,2,3].forEach(i=>{noShadow(rb(g,.13,.13,.02,.01,i===2?0xEF4444:0x22C55E,-.45,1.5-i*.2,.03));noShadow(box(g,.6-(i%2)*.15,.05,.02,0x94a3b8,-.02-(i%2)*.075,1.5-i*.2,.03));});
    noShadow(cyl(g,.16,.16,.34,glass,.95,.17,.2,18));noShadow(cyl(g,.17,.17,.04,0xb7282a,.95,.36,.2,18));const b=sph(g,.07,0xEF4444,.95,.08,.2);b.scale.set(1,.7,1.3);noShadow(sph(g,.035,0x1b2230,.95,.085,.3));},
  diseno(g){noShadow(rb(g,1.5,.03,1,.01,0x2f855a,0,.015,.05));cyl(g,.3,.24,.62,0xfbcfe8,-.3,.31,0,24);noShadow(cyl(g,.305,.305,.05,0xf472b6,-.3,.56,0,24));
    [[0xEC4899,-.1,.08,-.2],[0xfacc15,.1,-.05,.2],[0x38bdf8,0,-.12,0],[0x22c55e,-.02,.1,.1]].forEach(a=>{const p=new X.Group();p.position.set(-.3+a[1],.35,a[2]);p.rotation.z=a[3];g.add(p);cyl(p,.05,.05,.8,a[0],0,.4,0,8);add(p,new X.ConeGeometry(.05,.14,8),0xfde68a,0,.87,0);noShadow(add(p,new X.ConeGeometry(.02,.05,8),0x1b2230,0,.925,0));});
    [0xEF4444,0xF97316,0xfacc15,0x22C55E,0x3B82F6,0xA855F7].forEach((c,i)=>{const s=rb(g,.14,.012,.5,.005,c,.42,.04+i*.006,.1);s.rotation.y=-.5+i*.2;s.position.x=.42+Math.sin(-.5+i*.2)*.2;s.position.z=.1+Math.cos(-.5+i*.2)*.2;});},
  arquitecto(g){[-.5,.5].forEach(x=>{box(g,.06,.95,.06,0x4b5568,x,.47,-.1);box(g,.06,.05,.6,0x4b5568,x,.03,0);});box(g,1,.05,.05,0x4b5568,0,.4,-.1);
    const t=new X.Group();t.position.set(0,1,.05);t.rotation.x=.5;g.add(t);rb(t,1.4,.05,.9,.015,0xe2e8f0,0,0,0);noShadow(rb(t,1.2,.012,.72,.004,0x3b5bdb,0,.032,0));
    [[1,.02,0,-.25],[1,.02,0,0],[1,.02,0,.25],[.02,.6,-.3,0],[.02,.6,.3,0]].forEach(a=>noShadow(box(t,a[0],.008,a[1],0xffffff,a[2],.042,a[3])));noShadow(box(t,1.2,.03,.04,0xfacc15,0,.06,.38));
    cyl(g,.2,.17,.5,0x64748b,.95,.25,.1,16);[[-.06,0,.1],[.06,.05,-.1],[0,-.06,0]].forEach((a,i)=>{const r=cyl(g,.05,.05,.8,i?0xffffff:0xbfdbfe,.95+a[0],.6,.1+a[1],10);r.rotation.z=a[2];});},
  seguridad(g){rb(g,1.1,1.1,.85,.06,0x5b6577,0,.55,0);noShadow(rb(g,.9,.9,.03,.03,0x4b5568,0,.55,.43));const d=cyl(g,.34,.34,.08,0xaab4c4,-.08,.55,.47,28);d.rotation.x=Math.PI/2;
    noShadow(add(g,new X.TorusGeometry(.2,.03,8,24),0x1b2230,-.08,.55,.53));[0,1,2].forEach(i=>{const s=box(g,.4,.03,.03,0x1b2230,-.08,.55,.53);s.rotation.z=i*Math.PI/3;s.castShadow=false;});
    [[-.38,.9],[.38,.9],[-.38,.2],[.38,.2]].forEach(a=>noShadow(cyl(g,.035,.035,.04,0xaab4c4,a[0],a[1],.45,10)).rotation.x=Math.PI/2);noShadow(rb(g,.14,.2,.03,.01,0x1b2230,.36,.55,.455));
    box(g,.05,1.9,.05,0x4b5568,.85,.95,-.25);const cam=rb(g,.16,.14,.32,.04,0xf4f1ea,.85,1.86,-.08);cam.rotation.x=.35;noShadow(cyl(g,.05,.05,.04,0x1b2230,.85,1.8,.08,12)).rotation.x=Math.PI/2+.35;noShadow(sph(g,.018,new X.MeshBasicMaterial({color:0xEF4444}),.92,1.9,.03));}
};
DEPTS.forEach((d,i)=>{const {x0,z0}=zoneOf(i),col=new X.Color(ROLE_COLORS[d]),cx=wx(x0)+1.5,cz=wz(z0)+2;
  const carpetM=new X.MeshStandardMaterial({color:0xffffff,map:carpetTex,roughness:1});noShadow(add(scene,new X.BoxGeometry(4.9,.02,4.9),carpetM,cx+.5,.012,cz));
  const bulbM=new X.MeshStandardMaterial({color:0xfff3d0,emissive:0xffc766,emissiveIntensity:.2});
  const glowM=new X.MeshBasicMaterial({map:radial,color:0xffb866,transparent:true,opacity:0,depthWrite:false,blending:X.AdditiveBlending});decal(6.4,6.2,glowM,cx+.5,.03,cz);
  const sg=new X.Group();sg.position.set(cx,2.5,wz(z0)+1);scene.add(sg);const signM=new X.MeshBasicMaterial({map:signTex(T.dept[d],ROLE_COLORS[d])});
  noShadow(rb(sg,1.9,.46,.06,.02,0x1b2230,0,0,-.03));const sp=add(sg,new X.PlaneGeometry(1.82,.4),signM,0,0,.004);sp.castShadow=false;sp.receiveShadow=false;
  [-1,1].forEach(s=>noShadow(cyl(sg,.008,.008,1.6,0x263a38,s*.85,1.03,0,5)));
  const fg=new X.Group();fg.position.set(wx(x0+4),0,wz(z0+4));fg.scale.setScalar(.56);scene.add(fg);FURN[d](fg);
  zones[d]={carpetM,bulbM,signM,glowM,sign:sg,col,on:-1,bulbOn:0};});
/* oficinas por departamento: paredes de cristal y puerta corrediza al pasillo */
(function(){const base=[],gl=[],rails={},P=(k,a)=>(rails[k]=rails[k]||[]).push(a);
  const seg=(x1,z1,x2,z2)=>{const len=Math.hypot(x2-x1,z2-z1),cx=(x1+x2)/2-W/2,cz=(z1+z2)/2-D/2,ry=x1===x2?Math.PI/2:0;
    base.push([B(len,.4,.1),cx,.2,cz,0,ry,0]);gl.push([B(len-.06,1.0,.035),cx,.9,cz,0,ry,0]);P('n',[B(len,.06,.11),cx,1.43,cz,0,ry,0]);};
  const post=(x,z,h,key)=>P(key,[B(.11,h,.11),x-W/2,h/2,z-D/2]);
  DEPTS.forEach((d,i)=>{const {x0,z0}=zoneOf(i);seg(x0,z0,x0+5,z0);if(i>=6)seg(x0,z0+5,x0+5,z0+5);seg(x0,z0,x0,z0+5);seg(x0+5,z0,x0+5,z0+1);seg(x0+5,z0+2,x0+5,z0+5);
    [[x0,z0],[x0+5,z0],[x0,z0+5],[x0+5,z0+5]].forEach(c=>post(c[0],c[1],1.46,'n'));
    post(x0+5,z0+1,2.05,d);post(x0+5,z0+2,2.05,d);P(d,[B(.13,.16,1.11),x0+5-W/2,2.05,z0+1.5-D/2]);
    leaf(BX(x0+5)+.09,BZ(z0+2)+.06,0,.9,-Math.PI/2);});
  add(scene,merge(base),mat(0x7a5234,.7));
  const gm=new X.Mesh(merge(gl),new X.MeshPhysicalMaterial({color:0x9fd0c6,transparent:true,opacity:.24,roughness:.05,metalness:0,clearcoat:1,depthWrite:false}));gm.renderOrder=3;scene.add(gm);
  Object.keys(rails).forEach(k=>{add(scene,merge(rails[k]),mat(k==='n'?0x263a38:ROLE_COLORS[k],.5));});})();
function refreshZones(){const occ={};robots.forEach(r=>{if(!r.leaving&&r.seatRef)occ[r.seatRef.dept]=1;});
  DEPTS.forEach(d=>{const z=zones[d],on=occ[d]?1:0;if(z.on===on)return;z.on=on;
    if(on)z.carpetM.color.copy(z.col).lerp(new X.Color(0xa8957c),.62);else z.carpetM.color.copy(z.col).lerp(new X.Color(0x5a4a3c),.88).multiplyScalar(.8);
    z.signM.color.setScalar(on?1:.3);z.bulbOn=on;});}

/* escritorios y sillas (geometrías fusionadas + InstancedMesh) */
const MEET_CHAIRS=[[25.6,2.35,0],[27.4,2.35,0],[25.6,4.65,Math.PI],[27.4,4.65,Math.PI]];
const CAP=DEPTS.length*MAX_SLOTS+1+MEET_CHAIRS.length;
function inst(geo,m){const o=new X.InstancedMesh(geo,m,CAP);o.castShadow=true;o.receiveShadow=true;o.count=0;o.frustumCulled=false;scene.add(o);return o;}
const iWood=inst(merge([[rbox(1.04,.06,.86,.03),0,.61,.9]]),mat(0x9a6a42,.55));
const iMetal=inst(merge([[B(.05,.58,.05),-.47,.29,.52],[B(.05,.58,.05),.47,.29,.52],[B(.05,.58,.05),-.47,.29,1.28],[B(.05,.58,.05),.47,.29,1.28],[B(.05,.04,.8),-.47,.56,.9],[B(.05,.04,.8),.47,.56,.9],[B(.05,.04,.8),-.47,.05,.9],[B(.05,.04,.8),.47,.05,.9],[B(.94,.04,.04),0,.56,1.28],
  [rbox(.26,.022,.19,.01),0,.651,1.16],[B(.045,.24,.04),0,.77,1.21],[rbox(.7,.43,.045,.02),0,1.0,1.185],[B(.16,.016,.02),.3,.42,.648],[B(.16,.016,.02),.3,.27,.648],[C(.075,.085,.02),-.42,.65,1.22],[B(.022,.3,.022),-.42,.8,1.22],[B(.022,.2,.022),-.42,.98,1.15,.9,0,0],[C(.035,.1,.1,14),-.42,1.0,1.06,.5,0,0]]),mat(0x24292c,.45));
const iWhite=inst(merge([[B(.88,.34,.03),0,.37,1.285],[rbox(.4,.022,.15,.01),0,.651,.68],[rbox(.062,.03,.095,.014),.3,.655,.7],[C(.048,.042,.095),-.38,.688,.78],[B(.21,.018,.29),-.33,.649,1.05,0,.2,0],[B(.21,.012,.29),-.33,.664,1.05,0,-.1,0],[C(.06,.045,.09),.43,.685,1.22]]),mat(0xf4f1ea,.6));
const iGray=inst(merge([[rbox(.32,.5,.62,.025),.3,.28,.95],[B(.35,.006,.105),0,.664,.68]]),mat(0x2f4a46,.6));
const starParts=[];for(let i=0;i<5;i++){const a=i*Math.PI*2/5;starParts.push([B(.05,.035,.27),Math.sin(a)*.135,.06,Math.cos(a)*.135-.06,0,a,0],[new X.SphereGeometry(.035,8,6),Math.sin(a)*.27,.035,Math.cos(a)*.27-.06]);}
const iChairD=inst(merge(starParts.concat([[C(.03,.035,.2),0,.17,-.06],[B(.22,.03,.24),0,.27,-.06],[B(.03,.17,.03),-.27,.38,-.06],[B(.03,.17,.03),.27,.38,-.06],[rbox(.065,.03,.24,.014),-.27,.475,-.04],[rbox(.065,.03,.24,.014),.27,.475,-.04],[B(.06,.3,.03),0,.44,-.33,-.12,0,0]])),mat(0x24292c,.45));
const iChair=inst(merge([[rbox(.48,.09,.46,.04),0,.32,-.06],[rbox(.45,.46,.08,.04),0,.72,-.38,-.12,0,0]]),mat(0x2f6b63,.85));
const LF=()=>new X.SphereGeometry(.07,8,6).scale(1,.55,1);
const iLeaf=inst(merge([[LF(),.43,.8,1.22],[LF(),.38,.77,1.25],[LF(),.48,.77,1.19],[LF(),.44,.86,1.21],[LF(),.4,.83,1.17]]),mat(0x2c7550,.8));
const iBulb=inst(merge([[new X.SphereGeometry(.04,10,8),-.42,.97,1.07]]),bulbAll);iBulb.castShadow=false;
const DESK_INST=[iWood,iMetal,iWhite,iGray,iLeaf,iBulb],CHAIR_INST=[iChairD,iChair];
const scrCv=document.createElement('canvas');scrCv.width=160;scrCv.height=96;const scrCtx=scrCv.getContext('2d'),scrTex=new X.CanvasTexture(scrCv);scrTex.encoding=X.sRGBEncoding;
const scrOn=new X.MeshBasicMaterial({map:scrTex,toneMapped:false}),scrOff=new X.MeshBasicMaterial({color:0x0c1220}),scrGeo=new X.PlaneGeometry(.64,.37);let scrOffN=0;
function drawScr(){scrOffN++;const c=scrCtx;c.fillStyle='#131c38';c.fillRect(0,0,160,96);c.fillStyle='#1f2a4d';c.fillRect(0,0,160,10);const cols=['#a5b4fc','#67e8f9','#86efac','#fde68a','#f9a8d4'];
  for(let r=0;r<8;r++){const n=r+scrOffN;let x=8+(n*5%3)*10;for(let p=0;p<1+(n*7%3);p++){const w=16+((n*13+p*29)%40);c.fillStyle=cols[(n+p*2)%5];c.fillRect(x,16+r*10,w,5);x+=w+6;}}scrTex.needsUpdate=true;}
drawScr();
let deskList=[];const screens=[],dummy=new X.Object3D();
function rebuildDesks(){deskList=[Object.assign({key:'jefe'},BOSS_SEAT)];
  DEPTS.forEach(d=>{for(let k=0;k<colsOf(d)*2;k++)deskList.push(Object.assign({key:d+':'+k},slotInfo(d,k)));});
  deskList.forEach((s,i)=>{const f=Math.sin(s.face),fz=Math.cos(s.face),x=wx(s.seat[0]),z=wz(s.seat[1]),y=s.lift||0;
    dummy.position.set(x,y,z);dummy.rotation.set(0,s.face,0);dummy.updateMatrix();DESK_INST.forEach(m=>m.setMatrixAt(i,dummy.matrix));CHAIR_INST.forEach(m=>m.setMatrixAt(i,dummy.matrix));
    if(!screens[i]){const m=new X.Mesh(scrGeo,scrOff);scene.add(m);screens[i]=m;}
    const sc=screens[i];sc.visible=true;sc.position.set(x+f*1.16,y+1.0,z+fz*1.16);sc.rotation.y=s.face+Math.PI;});
  for(let i=deskList.length;i<screens.length;i++)screens[i].visible=false;
  MEET_CHAIRS.forEach((c,j)=>{dummy.position.set(wx(c[0]),c[3]||0,wz(c[1]));dummy.rotation.set(0,c[2],0);dummy.updateMatrix();CHAIR_INST.forEach(m=>m.setMatrixAt(deskList.length+j,dummy.matrix));});
  DESK_INST.forEach(m=>{m.count=deskList.length;m.instanceMatrix.needsUpdate=true;});CHAIR_INST.forEach(m=>{m.count=deskList.length+MEET_CHAIRS.length;m.instanceMatrix.needsUpdate=true;});rebuildGrid();}

/* =====================================================================
   ROBOTS
   ===================================================================== */
const RS=1.22;
const G={torso:rbox(.44,.38,.32,.1,4),head:rbox(.62,.46,.5,.13,5),bezel:rbox(.5,.32,.06,.04),face:new X.PlaneGeometry(.43,.25),leg:rbox(.13,.2,.14,.04),foot:rbox(.16,.09,.24,.04),
  upper:rbox(.1,.19,.1,.04),fore:rbox(.105,.2,.105,.04),hand:new X.SphereGeometry(.072,14,10),joint:new X.SphereGeometry(.07,14,10),neck:new X.CylinderGeometry(.075,.085,.08,14),
  ear:new X.CylinderGeometry(.075,.075,.06,16),belt:rbox(.455,.07,.335,.03),ant:new X.CylinderGeometry(.012,.012,.2,6),ball:new X.SphereGeometry(.052,14,10),
  hit:new X.BoxGeometry(.8,1.5,.7),paper:new X.BoxGeometry(.16,.02,.2),folder:new X.BoxGeometry(.2,.03,.26)};
const hitMat=new X.MeshBasicMaterial({visible:false});
function faceTex(kind){return canvasTex(256,152,c=>{c.scale(2,1.9);c.fillStyle='#0a1020';c.fillRect(0,0,128,80);
  const col=kind==='amber'?'#fbbf24':kind==='amberDim'?'#6b4e0e':kind==='angry'?'#f87171':'#7df3ff';c.fillStyle=col;c.strokeStyle=col;c.lineWidth=7;c.lineCap='round';c.shadowColor=col;c.shadowBlur=8;const ex=[38,90];
  if(kind==='calm'){ex.forEach(x=>{c.beginPath();c.arc(x,34,11,0,7);c.fill();});c.beginPath();c.arc(64,50,10,.15*Math.PI,.85*Math.PI);c.stroke();}
  else if(kind==='amber'||kind==='amberDim'){ex.forEach(x=>{c.beginPath();c.arc(x,32,11,0,7);c.fill();});c.fillRect(54,60,20,5);}
  else if(kind==='focus'){ex.forEach(x=>c.fillRect(x-12,29,24,9));c.fillRect(54,58,20,5);}
  else if(kind==='happy'){ex.forEach(x=>{c.beginPath();c.arc(x,40,11,Math.PI,2*Math.PI);c.stroke();});c.beginPath();c.arc(64,50,13,.1*Math.PI,.9*Math.PI);c.stroke();}
  else if(kind==='angry'){ex.forEach((x,i)=>{c.beginPath();c.arc(x,42,9,0,7);c.fill();c.beginPath();c.moveTo(x-14,i?30:20);c.lineTo(x+14,i?20:30);c.stroke();});c.beginPath();c.arc(64,74,10,1.15*Math.PI,1.85*Math.PI);c.stroke();}
  else if(kind==='blink'){ex.forEach(x=>c.fillRect(x-11,33,22,5));c.fillRect(56,58,16,4);}
  else {ex.forEach(x=>{c.beginPath();c.arc(x,30,11,0,Math.PI);c.fill();});c.fillRect(56,58,16,4);}});}
const FACE={};['calm','focus','happy','angry','amber','amberDim','blink','wait'].forEach(k=>FACE[k]=new X.MeshBasicMaterial({map:faceTex(k),toneMapped:false}));
const bodyMat={},outMat={},glowMat={};Object.keys(ROLE_COLORS).forEach(k=>{bodyMat[k]=new X.MeshStandardMaterial({color:ROLE_COLORS[k],roughness:.6,metalness:0});
  outMat[k]=new X.MeshBasicMaterial({color:new X.Color(ROLE_COLORS[k]).lerp(new X.Color(0xffffff),.5),side:X.BackSide,toneMapped:false});
  glowMat[k]=new X.MeshStandardMaterial({color:ROLE_COLORS[k],emissive:ROLE_COLORS[k],emissiveIntensity:1.1,roughness:.4});});
const WHITE=new X.MeshStandardMaterial({color:0xeae1cf,roughness:.65}),DARKM=new X.MeshStandardMaterial({color:0x242c3b,roughness:.55,metalness:.2});
const ACC={
  jefe(r){rb(r.g,.08,.2,.025,.01,0x8c2f39,0,.5,.172);rb(r.g,.11,.07,.035,.012,0x8c2f39,0,.615,.172);add(r.headG,G.ant,DARKM,0,.62,0);add(r.headG,new X.OctahedronGeometry(.1,0),new X.MeshStandardMaterial({color:0xfde047,emissive:0xfbbf24,emissiveIntensity:.8,flatShading:true}),0,.77,0);},
  desarrollo(r){add(r.headG,new X.TorusGeometry(.385,.038,10,26,Math.PI),DARKM,0,.27,0);[-1,1].forEach(s=>{add(r.headG,new X.CylinderGeometry(.155,.155,.1,20),DARKM,s*.4,.26,0).rotation.z=Math.PI/2;});},
  frontend(r){const p=cyl(r.g,.14,.14,.025,0xfef3c7,.33,.78,0,18);p.rotation.z=-.25;[[0xef4444,.27,.04],[0x3b82f6,.37,.05],[0xfacc15,.33,-.06]].forEach(a=>sph(r.g,.032,a[0],a[1],.805,a[2]));},
  backend(r){const s=new X.Group();s.position.set(0,.53,-.19);r.g.add(s);add(s,new X.CylinderGeometry(.14,.14,.05,18),0xaab4c4,0,0,0).rotation.x=Math.PI/2;for(let i=0;i<8;i++){const a=i*Math.PI/4;box(s,.06,.07,.05,0xaab4c4,Math.cos(a)*.16,Math.sin(a)*.16,0).rotation.z=a-Math.PI/2;}add(s,new X.CylinderGeometry(.05,.05,.06,12),DARKM,0,0,0).rotation.x=Math.PI/2;r.gear=s;},
  dba(r){[0,1,2].forEach(i=>{cyl(r.g,.12,.12,.09,0xa5f3fc,0,.4+i*.11,-.24,18);cyl(r.g,.123,.123,.02,0x0e7490,0,.445+i*.11,-.24,18);});},
  infra(r){const h=add(r.headG,new X.SphereGeometry(.41,22,10,0,Math.PI*2,0,Math.PI/2),0xfacc15,0,.42,0);h.scale.set(1,.68,1.02);cyl(r.headG,.47,.47,.03,0xfacc15,0,.43,.06,24);rb(r.headG,.09,.2,.5,.03,0xfde68a,0,.66,0);},
  qa(r){noShadow(rb(r.g,.2,.16,.02,.02,0xf8fafc,0,.53,.158));const a=noShadow(box(r.g,.035,.07,.02,0x16a34a,-.035,.515,.17));a.rotation.z=.75;const b=noShadow(box(r.g,.035,.12,.02,0x16a34a,.03,.54,.17));b.rotation.z=-.6;},
  diseno(r){const b=sph(r.headG,.37,0x9d174d,.07,.56,0);b.scale.set(1.05,.3,1.05);b.rotation.z=-.2;cyl(r.headG,.016,.016,.08,0x9d174d,.07,.67,0,6);},
  arquitecto(r){const p=cyl(r.g,.047,.047,.54,0xffffff,-.39,.44,.03,12);p.rotation.x=Math.PI/2;[-1,1].forEach(s=>cyl(r.g,.049,.049,.04,0x3b5bdb,-.39,.44,.03+s*.21,12).rotation.x=Math.PI/2);},
  seguridad(r){const s=add(r.g,new X.CylinderGeometry(.11,.11,.04,6),0xd5dbe6,0,.52,.165);s.rotation.x=Math.PI/2;noShadow(add(r.headG,rbox(.72,.1,.14,.03),new X.MeshStandardMaterial({color:0x0b1020,transparent:true,opacity:.85,roughness:.1}),0,.45,.25));}
};
/* modelo de ejemplo: robot de juguete brillante (solo para un rol) */
const TOY_ROLE='qa';
const gloss=(c,o)=>new X.MeshPhysicalMaterial(Object.assign({color:c,roughness:.22,metalness:0,clearcoat:1,clearcoatRoughness:.1,envMapIntensity:.45},o||{}));
const TOY={white:WHITE,black:DARKM,grey:mat(0x9aa3b2,.5),visor:gloss(0x0a0d14,{roughness:.05})};
const TG={head:rbox(.7,.54,.58,.22,6),visor:rbox(.56,.36,.1,.07,4),face:new X.PlaneGeometry(.5,.3),ear:new X.CylinderGeometry(.125,.125,.08,24),earIn:new X.CylinderGeometry(.07,.07,.1,20),
  chest:rbox(.42,.3,.3,.12,5),yoke:rbox(.5,.13,.33,.06,4),pelvis:rbox(.34,.14,.26,.06,4),waist:new X.CylinderGeometry(.11,.12,.08,18),neck:new X.CylinderGeometry(.1,.12,.07,18),
  shoulder:new X.SphereGeometry(.095,18,14),upper:rbox(.09,.17,.09,.035),elbow:new X.SphereGeometry(.062,14,10),fore:rbox(.125,.19,.125,.05,4),cuff:new X.CylinderGeometry(.075,.075,.045,18),
  palm:new X.SphereGeometry(.07,14,10),finger:rbox(.035,.1,.045,.015),thigh:rbox(.15,.17,.16,.055,4),knee:new X.CylinderGeometry(.075,.075,.05,18),foot:rbox(.21,.13,.32,.06,4),toe:rbox(.215,.07,.14,.03,4),
  brow:rbox(.17,.05,.06,.022),badge:new X.CylinderGeometry(.055,.055,.03,20)};
function faceToy(kind){return canvasTex(256,152,c=>{c.scale(2,1.9);c.fillStyle='#0a0d14';c.fillRect(0,0,128,80);c.lineCap='round';
  const amber=kind==='amber'||kind==='amberDim',iris=kind==='angry'?'#c81e1e':kind==='amber'?'#f59e0b':kind==='amberDim'?'#7a5208':'#4a5568',ring=kind==='amberDim'?'#8b8f99':'#eef2f8';
  const eye=(x)=>{c.fillStyle=ring;c.beginPath();c.arc(x,36,19,0,7);c.fill();c.fillStyle=iris;c.beginPath();c.arc(x,36,14.5,0,7);c.fill();c.fillStyle='#07090d';c.beginPath();c.arc(x,36,9,0,7);c.fill();
    c.fillStyle='#fff';c.beginPath();c.arc(x-5,30,4.2,0,7);c.fill();c.beginPath();c.arc(x+5,41,2,0,7);c.fill();};
  const lid=(x,y0,y1)=>{c.fillStyle='#0a0d14';c.beginPath();c.moveTo(x-22,14);c.lineTo(x+22,14);c.lineTo(x+22,y1);c.lineTo(x-22,y0);c.closePath();c.fill();};
  c.strokeStyle='#eef2f8';c.lineWidth=5;
  if(kind==='happy'){[34,94].forEach(x=>{c.lineWidth=7;c.beginPath();c.arc(x,42,15,1.1*Math.PI,1.9*Math.PI);c.stroke();});c.lineWidth=5;c.beginPath();c.arc(64,58,12,.1*Math.PI,.9*Math.PI);c.stroke();}
  else if(kind==='blink'){[34,94].forEach(x=>{c.lineWidth=6;c.beginPath();c.moveTo(x-15,38);c.lineTo(x+15,38);c.stroke();});c.lineWidth=5;c.beginPath();c.arc(64,62,7,.15*Math.PI,.85*Math.PI);c.stroke();}
  else{eye(34);eye(94);
    if(kind==='focus'){lid(34,30,30);lid(94,30,30);c.beginPath();c.moveTo(57,69);c.lineTo(71,69);c.stroke();}
    else if(kind==='wait'){lid(34,36,36);lid(94,36,36);c.beginPath();c.moveTo(58,69);c.lineTo(70,69);c.stroke();}
    else if(kind==='angry'){lid(34,22,36);lid(94,36,22);c.beginPath();c.arc(64,76,9,1.2*Math.PI,1.8*Math.PI);c.stroke();}
    else if(amber){c.beginPath();c.arc(64,68,4,0,7);c.stroke();}
    else{c.beginPath();c.arc(64,62,8,.12*Math.PI,.88*Math.PI);c.stroke();}}});}
const FACE_TOY={};Object.keys(FACE).forEach(k=>FACE_TOY[k]=new X.MeshBasicMaterial({map:faceToy(k),toneMapped:false}));
function buildToy(r,g,role,bm){
  r.faces=FACE_TOY;
  r.legs=[-1,1].map(s=>{const l=new X.Group();l.position.set(s*.12,.29,0);g.add(l);add(l,TG.thigh,bm,0,-.08,0);add(l,TG.knee,TOY.white,0,-.17,0);add(l,TG.foot,bm,0,-.225,.05);add(l,TG.toe,TOY.white,0,-.25,.16);return l;});
  add(g,TG.pelvis,TOY.white,0,.31,0);add(g,TG.waist,TOY.black,0,.4,0);add(g,TG.chest,TOY.white,0,.53,0);add(g,TG.yoke,bm,0,.655,0);add(g,TG.neck,TOY.black,0,.73,0);
  if(role!=='jefe'&&role!=='qa'&&role!=='seguridad'){const bd=add(g,TG.badge,bm,0,.52,.15);bd.rotation.x=Math.PI/2;}noShadow(rb(g,.16,.03,.02,.008,TOY.black,0,.43,.15));
  const o1=add(g,TG.chest,outMat[role],0,.53,0);o1.scale.setScalar(1.28);o1.castShadow=false;o1.receiveShadow=false;
  r.headG=new X.Group();r.headG.position.y=.76;g.add(r.headG);add(r.headG,TG.head,bm,0,.27,0);add(r.headG,TG.visor,TOY.visor,0,.24,.245);
  [-1,1].forEach(s=>{add(r.headG,TG.ear,TOY.white,s*.36,.26,0).rotation.z=Math.PI/2;add(r.headG,TG.earIn,TOY.grey,s*.37,.26,0).rotation.z=Math.PI/2;
    const b=add(r.headG,TG.brow,bm,s*.15,.455,.275);b.rotation.z=-s*.16;});
  const o2=add(r.headG,TG.head,outMat[role],0,.27,0);o2.scale.setScalar(1.11);o2.castShadow=false;o2.receiveShadow=false;r.outline=[o1,o2];o1.visible=o2.visible=false;
  r.face=add(r.headG,TG.face,FACE_TOY.calm,0,.24,.2995);r.face.castShadow=false;r.face.receiveShadow=false;
  r.sh=[];r.el=[];[-1,1].forEach(s=>{const a=new X.Group();a.position.set(s*.3,.63,0);g.add(a);add(a,TG.shoulder,bm,0,0,0);add(a,TG.upper,TOY.black,0,-.11,0);
    const e=new X.Group();e.position.y=-.2;a.add(e);add(e,TG.elbow,TOY.black,0,0,0);add(e,TG.fore,TOY.white,0,-.11,0);add(e,TG.cuff,bm,0,-.2,0);add(e,TG.palm,TOY.black,0,-.25,0);
    [-1,1].forEach(k=>{const f=add(e,TG.finger,TOY.black,k*.045,-.33,0);f.rotation.z=k*.25;});r.sh.push(a);r.el.push(e);});
  r.foreL=r.el[0];r.paper=add(r.el[1],G.paper,0xffffff,0,-.3,.09);r.folder=add(r.el[1],G.folder,0xfacc15,0,-.3,.09);r.paper.visible=r.folder.visible=false;
  r.ball={visible:true};
}
const robots=new Map(),hits=[],platesEl=$('plates');
function badgeOf(p){return String(p.provider||'').slice(0,2).toUpperCase();}
function makeRobot(p){
  const role=p.isBoss?'jefe':departmentFor(p.role),bm=bodyMat[role],g=new X.Group();g.scale.setScalar(RS);
  const r={id:p.id,p,role,g,script:[],queue:[],jobs:[],anim:'calm',faceT:0,ph:rnd(0,10),pop:1,walkT:0,blink:rnd(1,5),amb:rnd(6,18),carry:null,thumb:0,angry:0,jump:0,sayT:0,sayText:'',cell:DOOR.slice(),leaving:false,got:false,spot:null,hover:false};
  const sh=new X.Mesh(blobGeo,blobMat);sh.scale.set(1,1,1);sh.position.y=.018;sh.renderOrder=2;g.add(sh);
  buildToy(r,g,role,bm);
  ACC[role](r);
  const h=new X.Mesh(G.hit,hitMat);h.position.y=.7;h.userData.robot=r;g.add(h);hits.push(h);r.hit=h;
  const el=document.createElement('div');el.className='plate';el.innerHTML='<div class="bub" hidden></div><div class="tag"><span class="badge"></span><span><b></b><small></small></span></div>';
  platesEl.appendChild(el);r.el_=el;r.bubEl=el.firstChild;r.badgeEl=el.querySelector('.badge');r.nameEl=el.querySelector('b');r.roleEl=el.querySelector('small');r.bubTxt=null;r.pw=60;r.phh=30;
  r.badgeEl.style.background=cssHex(ROLE_COLORS[role]);
  scene.add(g);robots.set(p.id,r);return r;}
function syncPlate(r){r.badgeEl.textContent=badgeOf(r.p);r.nameEl.textContent=r.p.name;r.roleEl.textContent=r.p.role||'';r.dirty=true;}
function removeRobot(r){scene.remove(r.g);r.el_.remove();hits.splice(hits.indexOf(r.hit),1);robots.delete(r.id);if(selected===r)select(null);if(hovered===r)hovered=null;}
function setPos(r,c){r.cell=c.slice();r.g.position.set(wx(c[0]),liftAt(wx(c[0]),wz(c[1])),wz(c[1]));}
function say(r,text,dur){r.sayText=text;r.sayT=dur||3.5;}
const bossRobot=()=>{for(const r of robots.values())if(r.role==='jefe'&&!r.leaving)return r;return null;};
const SPOTS=[{cell:[26,11],face:Math.PI,anim:'sip'},{cell:[4,3],face:Math.PI/2,anim:'meet'},{cell:[7,3],face:-Math.PI/2,anim:'meet'},{cell:[24,3],face:Math.PI/2,anim:'meet'},{cell:[29,4],face:-Math.PI/2,anim:'meet'},{cell:[26,19],face:Math.PI,anim:'look'},{cell:[31,18],face:Math.PI/2,anim:'look'},{cell:[23,10],face:Math.PI,anim:'sip'}];
function releaseSpot(r){if(r.spot){r.spot.by=null;r.spot=null;}}
const atSeat=r=>r.cell[0]===r.seat.seat[0]&&r.cell[1]===r.seat.seat[1];

/* chispas */
const SN=48,sPos=new Float32Array(SN*3),sVel=new Float32Array(SN*3),sGeo=new X.BufferGeometry();sGeo.setAttribute('position',new X.BufferAttribute(sPos,3));
const sparks=new X.Points(sGeo,new X.PointsMaterial({size:5,sizeAttenuation:false,transparent:true,depthWrite:false}));sparks.visible=false;sparks.frustumCulled=false;scene.add(sparks);let sparkT=0;
function burst(r){sparks.material.color.setHex(ROLE_COLORS[r.role]);const p=r.g.position;for(let i=0;i<SN;i++){sPos[i*3]=p.x;sPos[i*3+1]=p.y+1;sPos[i*3+2]=p.z;sVel[i*3]=rnd(-1.6,1.6);sVel[i*3+1]=rnd(1.5,4);sVel[i*3+2]=rnd(-1.6,1.6);}sparkT=1.2;sparks.visible=true;}

function startEvent(r,ev){const b=bossRobot();
  if(ev.type==='asignada'){
    if(b&&b!==r){r.got=false;pushCapped(b.jobs,{to:r,text:ev.text});r.script=[{t:'until',fn:()=>r.got,max:22},{t:'call',fn:()=>{if(!r.got)say(r,ev.text,4);}}];}
    else say(r,ev.text,4);
  }else if(ev.type==='reporte'){
    bossVisit=r;r.script=[{t:'call',fn:()=>{r.carry='folder';}},{t:'walk',cell:BOSS_SEAT.stand},{t:'wait',s:1.5,anim:'give',face:Math.PI},{t:'call',fn:()=>{r.carry=null;say(r,ev.text,3.5);}},{t:'walk',cell:[14,6],must:true},{t:'call',fn:()=>{if(bossVisit===r)bossVisit=null;}},{t:'walk',cell:r.seat.seat,must:true}];
  }else if(ev.type==='revision'){
    if(ev.verdict==='rechazada')r.script=[{t:'call',fn:()=>{r.carry='paper';r.angry=2.8;say(r,'😠 '+(ev.text||''),2.8);}},{t:'wait',s:2.8},{t:'call',fn:()=>{r.carry=null;}}];
    else{if(b){b.thumb=2.4;say(b,'👍',2.4);}r.script=[{t:'call',fn:()=>{r.jump=1.3;burst(r);say(r,(ev.emoji||'✅')+' '+(ev.text||''),3);}},{t:'wait',s:1.5}];}
  }}
function startJob(b,job){const to=job.to;if(!robots.has(to.id)||to.leaving){return;}
  const f=Math.atan2(to.seat.seat[0]-to.seat.stand[0],to.seat.seat[1]-to.seat.stand[1]);
  b.script=[{t:'call',fn:()=>{b.carry='paper';}},{t:'walk',cell:to.seat.stand},{t:'wait',s:1,anim:'give',face:f},{t:'call',fn:()=>{b.carry=null;to.got=true;say(to,job.text,4.5);}},{t:'walk',cell:b.seat.seat}];}
function seated(r){r.anim=stateAnim(r.p);let bl=r.anim==='blocked';const o=r.seat.off,k=.2;
  if(bl&&!r.seat.noCell){const q=occ.get((r.seat.seat[1]+Math.round(o[1]/.6))*W+r.seat.seat[0]+Math.round(o[0]/.6));if(q&&q!==r){bl=false;r.anim='waitSeat';}} /* aún hay alguien en su lugar de pie: espera sentado */
  r.faceT=bl?Math.atan2(o[0],o[1]):r.seat.face;const tx=wx(r.seat.seat[0])+(bl?o[0]:Math.sin(r.seat.face)*.12),tz=wz(r.seat.seat[1])+(bl?o[1]:Math.cos(r.seat.face)*.12);
  r.g.position.x+=(tx-r.g.position.x)*k;r.g.position.z+=(tz-r.g.position.z)*k;}
let liftY=0;const SPEED=2.4,ENTRY=[DOOR[0]-1,DOOR[1]],EXIT=[DOOR[0]+1,DOOR[1]];let bossVisit=null;
/* ceder el paso: ruta corta a una casilla libre que no esté en el camino del otro */
let yields=0;
function pocket(r,other){const os=other.script[0],ban=new Set([other.cell[1]*W+other.cell[0]]);if(os&&os.path)for(let i=os.i;i<os.path.length;i++)ban.add(os.path[i][1]*W+os.path[i][0]);
  const st=r.cell[1]*W+r.cell[0],from=new Map([[st,-1]]),q=[st];
  while(q.length){const cur=q.shift(),cx=cur%W,cz=cur/W|0;
    if(cur!==st&&!ban.has(cur)){const out=[];for(let c=cur;c!==st;c=from.get(c))out.push([c%W,c/W|0]);return out.reverse();}
    if(from.size>70)break;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=cx+dx,nz=cz+dz;if(nx<0||nz<0||nx>=W||nz>=D)continue;const n=nz*W+nx;if(from.has(n)||grid[n])continue;const oc=occ.get(n);if(oc&&oc!==r)continue;
      if(EDGE.has(dx?Math.max(cx,nx)+','+cz+',v':cx+','+Math.max(cz,nz)+',h'))continue;from.set(n,cur);q.push(n);}}
  return null;}
/* casillas ocupadas por robots que no están sentados en su puesto (su puesto ya es casilla bloqueada) */
const occ=new Map();
function rebuildOcc(){occ.clear();const put=(c,r)=>{const k=c[1]*W+c[0];if(!occ.has(k))occ.set(k,r);};
  robots.forEach(r=>{const w=r.script[0];if(w&&w.t==='walk'&&w.go&&r.next)put(r.next,r);else r.next=null;if(r.seat&&r.g.position.z<=D/2+.2&&!atSeat(r))put(r.cell,r);});
  /* después, los que están de pie junto a su puesto: solo si la casilla sigue libre */
  robots.forEach(r=>{const w=r.script[0];if(r.seat&&atSeat(r)&&r.anim==='blocked'&&!r.seat.noCell&&(!w||w.t!=='walk')){const o=r.seat.off;put([r.seat.seat[0]+Math.round(o[0]/.6),r.seat.seat[1]+Math.round(o[1]/.6)],r);}});}
function updRobot(r,dt,t){
  const s=r.script[0];
  if(s){
    if(s.t==='walk'){if(!s.path){s.path=astar(r.cell,s.cell);if(!s.path.length)s.path=[s.cell.slice()];s.i=0;s.go=false;s.blk=0;s.re=false;s.side=false;s.yieldFor=null;s.hold=0;}
      if(s.waitFor){const o=s.waitFor,ow=o.script[0],d=Math.hypot(o.g.position.x-r.g.position.x,o.g.position.z-r.g.position.z);s.wT+=dt;s.wMin=Math.min(s.wMin,d);
        r.anim='stand';r.faceT=Math.atan2(o.g.position.x-r.g.position.x,o.g.position.z-r.g.position.z);
        if(!robots.has(o.id)||!ow||ow.t!=='walk'||(s.wMin<1.7&&d>s.wMin+.7)||s.wT>6){s.waitFor=null;s.path=null;}
      }else{
      const c=s.path[s.i],ck=c[1]*W+c[0];
      if(!s.go){const o=occ.get(ck);
        if(o&&o!==r){s.blk+=dt;r.anim='stand';
          if(!s.must&&s.blk>1&&c[0]===s.cell[0]&&c[1]===s.cell[1])r.script.shift(); /* destino ocupado: se queda a un paso */
          const os=o.script[0];
          if(!s.yieldFor&&!s.hold&&s.blk>.12&&os&&os.t==='walk'&&os.path&&!os.go&&!os.waitFor&&os.path[os.i]&&os.path[os.i][0]===r.cell[0]&&os.path[os.i][1]===r.cell[1]){
            /* de frente en un paso angosto: cede quien tiene más cerca dónde orillarse */
            const mine=pocket(r,o),theirs=pocket(o,r),lm=mine?mine.length:99,lt=theirs?theirs.length:99;
            if(mine&&(lm<lt||(lm===lt&&r.id<o.id))){s.path=mine;s.i=0;s.blk=0;s.yieldFor=o;yields++;}else if(theirs){s.hold=3;}}
          if(s.hold){s.hold-=dt;if(s.hold<=0)s.hold=0;}
          if(s.blk>.7&&!s.re&&!s.hold&&!s.yieldFor){s.re=true;const av=new Set();occ.forEach((q,k)=>{if(q!==r)av.add(k);});const np=astar(r.cell,s.cell,av);
            if(np.length&&(np.length>1||Math.abs(np[0][0]-r.cell[0])+Math.abs(np[0][1]-r.cell[1])===1)){s.path=np;s.i=0;s.blk=0;}}
          if(s.blk>1.6&&!s.side&&!s.hold&&!s.yieldFor){s.side=true; /* de frente con otro: hacerse a un lado y recalcular */
            s.sideN=(s.sideN||0)+1;for(const [ax,az] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=r.cell[0]+ax,nz=r.cell[1]+az,k=nz*W+nx;if(nx<0||nz<0||nx>=W||nz>=D||grid[k]||occ.has(k))continue;
              if(EDGE.has(ax?Math.max(r.cell[0],nx)+','+nz+',v':nx+','+Math.max(r.cell[1],nz)+',h'))continue;s.path=[[nx,nz]];s.i=0;s.blk=0;break;}}
          if(s.blk>9)s.go=true; /* último recurso para no quedar trabados */
        }else{s.go=true;r.next=c;occ.set(ck,r);}}
      if(s.go){const tx=wx(c[0]),tz=wz(c[1]),dx=tx-r.g.position.x,dz=tz-r.g.position.z,d=Math.hypot(dx,dz),st=SPEED*dt;
        r.anim='walk';r.walkT+=dt;
        if(d<=st){r.g.position.x=tx;r.g.position.z=tz;r.cell=c.slice();r.next=null;s.go=false;s.blk=0;s.re=false;if(++s.i>=s.path.length){if(r.cell[0]===s.cell[0]&&r.cell[1]===s.cell[1])r.script.shift();else if(s.yieldFor){s.waitFor=s.yieldFor;s.yieldFor=null;s.wT=0;s.wMin=9;}else s.path=null;}}
        else{r.g.position.x+=dx/d*st;r.g.position.z+=dz/d*st;r.faceT=Math.atan2(dx,dz);}}
      }
    }else if(s.t==='wait'){s.s-=dt;if(s.anim){r.anim=s.anim;if(s.face!==undefined)r.faceT=s.face;}else if(atSeat(r))seated(r);else r.anim='stand';if(s.s<=0)r.script.shift();}
    else if(s.t==='call'){r.script.shift();s.fn();}
    else if(s.t==='until'){s.max-=dt;if(atSeat(r))seated(r);if(s.fn()||s.max<=0)r.script.shift();}
    else if(s.t==='out'){r.faceT=0;if(s.slot===undefined){const used=[];robots.forEach(q=>{const k=q.script[0];if(q!==r&&k&&k.t==='out'&&k.slot!==undefined)used.push(k.slot);});if(liftY>-.05&&used.length<2)s.slot=used.includes(0)?1:0;}
      if(s.slot===undefined){r.anim='stand';}else if(r.g.position.z<D/2+2.45-s.slot*1.15){r.anim='walk';r.walkT+=dt;r.g.position.z+=SPEED*dt;}else{r.anim='stand';r.faceT=Math.PI;s.w=(s.w||0)+dt;if(s.w>.5&&liftY<=-3.25){removeRobot(r);return;}}}
  }else if(!atSeat(r)){r.script.push({t:'walk',cell:r.seat.seat,must:true});}
  else if(r.jobs.length){startJob(r,r.jobs.shift());}
  else if(r.queue.length&&!(r.queue[0].type==='reporte'&&bossVisit&&bossVisit!==r&&robots.has(bossVisit.id)&&!bossVisit.leaving)){startEvent(r,r.queue.shift());}
  else{seated(r);
    if(r.anim==='calm'&&r.role!=='jefe'){r.amb-=dt;if(r.amb<0){r.amb=rnd(12,30);const sp=SPOTS.filter(x=>!x.by);if(sp.length){const x=pick(sp);x.by=r;r.spot=x;
      r.script=[{t:'walk',cell:x.cell},{t:'wait',s:rnd(5,9),anim:x.anim,face:x.face},{t:'call',fn:()=>releaseSpot(r)},{t:'walk',cell:r.seat.seat}];}}}}
  {const hid=r.g.position.z>D/2+.35;if(hid!==r.hid){r.hid=hid;r.el_.style.visibility=hid?'hidden':'';}}
  /* pose */
  const p=t+r.ph,k=Math.min(1,dt*12);let sL=0,sR=0,eL=-.15,eR=-.15,l0=0,l1=0,hx=0,hz=0,y=0,sit=false,face='calm';
  switch(r.anim){
    case 'walk':{const w=Math.sin(r.walkT*10);l0=w*.7;l1=-w*.7;sL=-w*.6;sR=w*.6;y=Math.abs(Math.cos(r.walkT*10))*.04;if(r.carry){sR=-1.1;eR=-.5;}break;}
    case 'type':sit=true;face='focus';sL=sR=-1;eL=-.7+Math.sin(p*14)*.15;eR=-.7+Math.cos(p*14)*.15;hx=.1;if(r.gear)r.gear.rotation.z+=dt*3;break;
    case 'waitSeat':sit=true;face='wait';y=Math.sin(p*1.2)*.012;if(p%7<1.7){sL=-.9;eL=-1.3;hx=.3;}break;
    case 'calm':sit=true;hz=Math.sin(p*.6)*.06;break;
    case 'doneSeat':sit=true;face='happy';sR=-1;eR=-.9;hz=Math.sin(p*1.5)*.05;break;
    case 'blocked':face=Math.sin(t*2.2)>0?'amber':'amberDim';sL=sR=-.2;eL=eR=-.45;hz=Math.sin(p*1.1)*.12;break;
    case 'look':hx=-.12;hz=Math.sin(p*.5)*.05;break;
    case 'sip':{const u=Math.max(0,Math.sin(p*1.3));sR=-.9-u*.9;eR=-.9;hx=-u*.15;break;}
    case 'meet':sL=-.4+Math.sin(p*2)*.25;eL=-.8;hz=Math.sin(p*.8)*.08;break;
    case 'give':sR=-1.3;eR=-.2;break;
  }
  if(r.thumb>0){r.thumb-=dt;sR=-2.7;eR=-.1;face='happy';}
  if(r.angry>0){r.angry-=dt;face='angry';}
  if(r.jump>0){r.jump-=dt;y+=Math.abs(Math.sin(r.jump*9))*.3;sL=sR=-2.6;face='happy';}
  if(sit){l0=l1=-1.45;}
  r.blink-=dt;if(r.blink<0)r.blink=rnd(2,6);if(r.blink<.13&&(face==='calm'||face==='focus'||face==='wait'))face='blink';
  const fm=(r.faces||FACE)[face];if(r.face.material!==fm)r.face.material=fm;
  r.sh[0].rotation.x+=(sL-r.sh[0].rotation.x)*k;r.sh[1].rotation.x+=(sR-r.sh[1].rotation.x)*k;r.el[0].rotation.x+=(eL-r.el[0].rotation.x)*k;r.el[1].rotation.x+=(eR-r.el[1].rotation.x)*k;
  r.legs[0].rotation.x+=(l0-r.legs[0].rotation.x)*k;r.legs[1].rotation.x+=(l1-r.legs[1].rotation.x)*k;
  r.headG.rotation.x+=(hx-r.headG.rotation.x)*k;r.headG.rotation.z+=(hz-r.headG.rotation.z)*k;
  r.g.rotation.y=lerpAngle(r.g.rotation.y,r.faceT,Math.min(1,dt*10));
  r.g.position.y=liftAt(r.g.position.x,r.g.position.z)+y+(r.g.position.z>D/2+.35?liftY:0);
  r.paper.visible=r.carry==='paper';r.folder.visible=r.carry==='folder'||r.anim==='doneSeat';
  /* globo */
  if(r.sayT>0)r.sayT-=dt;const a=activities[r.id];
  const txt=r.sayT>0?r.sayText:r.anim==='blocked'?'?':(r.anim==='type'&&a)?((a.emoji||'')+' '+(a.text||'')).trim():'';
  if(txt!==r.bubTxt){r.bubTxt=txt;r.bubEl.hidden=!txt;r.bubEl.textContent=txt;r.bubEl.className='bub'+(txt==='?'?' q':'');r.dirty=true;}
}

/* =====================================================================
   PUENTE: mismo contrato que la oficina de píxel
   ===================================================================== */
let activities={},firstEstado=true,selected=null,hovered=null,external=false;
const embedded=params.has('panel')||params.has('fuente');
function enviar(type,extra){if(!embedded)return;const m=Object.assign({orquest:'oficina',type},extra||{});
  if(params.get('fuente')==='movil'&&window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(m));else if(parent!==window)parent.postMessage(m,'*');}
function applyEstado(msg){activities=msg.activities||{};const seen=new Set();let changed=false;
  (msg.people||[]).forEach(p=>{seen.add(p.id);let r=robots.get(p.id);
    if(r&&r.leaving)return;
    if(!r){const role=p.isBoss?'jefe':departmentFor(p.role);r=makeRobot(p);
      if(role==='jefe'){r.seat=BOSS_SEAT;r.seatRef=null;}else{const s=assignSeat(p.id,role);if(!s){removeRobot(r);return;}r.seatRef=s;r.seat=slotInfo(s.dept,s.k);}
      changed=true;r.fresh=true;}
    r.p=p;syncPlate(r);
    if(r.spot&&(p.status!=='idle'||p.busy)){releaseSpot(r);r.script=[{t:'walk',cell:r.seat.seat}];}});
  robots.forEach(r=>{if(!seen.has(r.id)&&!r.leaving){r.leaving=true;releaseSpot(r);freeSeat(r.id);r.carry=null;r.queue.length=0;r.jobs.length=0;r.script=[{t:'walk',cell:EXIT,must:true},{t:'out'}];changed=true;}});
  if(changed)rebuildDesks();
  robots.forEach(r=>{if(r.fresh){r.fresh=false;if(firstEstado){setPos(r,r.seat.seat);r.g.rotation.y=r.faceT=r.seat.face;}
    else{let out=0;robots.forEach(q=>{if(q!==r&&!q.leaving&&q.g.position.z>D/2+.3)out++;});r.cell=ENTRY.slice();r.g.position.set(wx(ENTRY[0]),0,D/2+1.15+(out%2)*1.2);r.g.rotation.y=r.faceT=Math.PI;liftY=-3.3;r.script=[{t:'wait',s:1.35},{t:'walk',cell:ENTRY,must:true},{t:'walk',cell:r.seat.seat,must:true}];}}});
  firstEstado=false;refreshZones();
  const occ={};robots.forEach(r=>{if(!r.leaving)occ[r.seatRef?r.seatRef.dept+':'+r.seatRef.k:'jefe']=r;});
  deskList.forEach((d,i)=>{const r=occ[d.key];screens[i].material=(r&&r.p.status==='working')?scrOn:scrOff;});
  if(selected)fillCard();}
function applyEvento(ev){const r=robots.get(ev.agent);if(!r||r.leaving)return;pushCapped(r.queue,ev);
  const k=ev.type==='revision'?(ev.verdict==='rechazada'?'rechazada':'aprobada'):ev.type;
  const tk=$('ticker');tk.hidden=false;tk.textContent=(ev.emoji?ev.emoji+' ':'')+r.p.name+': '+T.ev[k]+(ev.text?' — '+ev.text:'');}
function recibir(m){if(!m||m.orquest!=='oficina')return;
  if(m.type==='estado')applyEstado(m);else if(m.type==='evento')applyEvento(m.evento||(m.ev?Object.assign({},m,{type:m.ev}):m));else if(m.type==='zoom')zoomAt(m.delta>0?1.25:.8,canvas.clientWidth/2,canvas.clientHeight/2);else if(m.type==='enfocada')focused=!!m.valor;}
addEventListener('message',e=>{let d=e.data;if(typeof d==='string'){try{d=JSON.parse(d);}catch(_){return;}}
  if(d&&d.orquest==='oficina'&&d.type==='estado'&&!external){external=true;stopDemo();robots.forEach(r=>{freeSeat(r.id);removeRobot(r);});firstEstado=true;}
  recibir(d);});

/* =====================================================================
   CÁMARA: ortográfica 3/4, giro en saltos de 90°, zoom 1×–4× al cursor
   ===================================================================== */
let az=Math.PI/4,azT=az,zoom=1,focused=true;const EL=40*Math.PI/180,target=new X.Vector3(0,0,0),tmp=new X.Vector3(),tmp2=new X.Vector3();
const corners=[];[-1,1].forEach(a=>[-1,1].forEach(b=>[0,3].forEach(y=>corners.push(new X.Vector3(a*W/2,y,b*D/2)))));
function setCam(){const w=canvas.clientWidth||1,h=canvas.clientHeight||1,asp=w/h;
  camera.position.set(Math.sin(az)*Math.cos(EL),Math.sin(EL),Math.cos(az)*Math.cos(EL)).multiplyScalar(70).add(target);camera.lookAt(target);camera.updateMatrixWorld();
  const right=tmp.setFromMatrixColumn(camera.matrixWorld,0),up=tmp2.setFromMatrixColumn(camera.matrixWorld,1);let mr=0,mu=0;
  corners.forEach(c=>{mr=Math.max(mr,Math.abs(c.dot(right)));mu=Math.max(mu,Math.abs(c.dot(up)));});
  const half=Math.max(mu,mr/asp)*1.05/zoom;camera.left=-half*asp;camera.right=half*asp;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
  walls.N.visible=Math.cos(az)>-.02;walls.S.visible=Math.cos(az)<.02;walls.E.visible=Math.sin(az)<.02;walls.W.visible=Math.sin(az)>-.02;}
function ground(cx,cy,out){const r=canvas.getBoundingClientRect();out.set((cx-r.left)/r.width*2-1,-(cy-r.top)/r.height*2+1,-1).unproject(camera);
  const dir=camera.getWorldDirection(new X.Vector3()),t=-out.y/dir.y;return out.addScaledVector(dir,t);}
function clampTarget(){const k=(1-1/zoom)*1.1;target.x=Math.max(-W/2*k,Math.min(W/2*k,target.x));target.z=Math.max(-D/2*k,Math.min(D/2*k,target.z));target.y=0;}
function zoomAt(f,cx,cy){setCam();const p0=ground(cx,cy,new X.Vector3());zoom=Math.max(1,Math.min(4,zoom*f));setCam();const p1=ground(cx,cy,new X.Vector3());
  target.add(p0.sub(p1));clampTarget();platesEl.classList.toggle('far',zoom<1.5);robots.forEach(r=>{r.dirty=true;});enviar('escala',{escala:zoom});}
function fit(){const w=canvas.clientWidth,h=canvas.clientHeight;if(w&&h)renderer.setSize(w,h,false);}
addEventListener('resize',fit);fit();if(canvas.clientWidth/Math.max(1,canvas.clientHeight)<.8)zoom=2.3;platesEl.classList.toggle('far',zoom<1.5);
$('rotL').onclick=()=>{azT-=Math.PI/2;};$('rotR').onclick=()=>{azT+=Math.PI/2;};
$('zIn').onclick=()=>zoomAt(1.3,canvas.clientWidth/2,canvas.clientHeight/2);$('zOut').onclick=()=>zoomAt(1/1.3,canvas.clientWidth/2,canvas.clientHeight/2);
canvas.addEventListener('wheel',e=>{e.preventDefault();if(!focused){enviar('rueda',{deltaX:e.deltaX,deltaY:e.deltaY,deltaMode:e.deltaMode,ctrlKey:e.ctrlKey,metaKey:e.metaKey,shiftKey:e.shiftKey,x:e.clientX,y:e.clientY});return;}zoomAt(e.deltaY<0?1.15:1/1.15,e.clientX,e.clientY);},{passive:false});
canvas.addEventListener('keydown',e=>{if(e.key==='q'||e.key==='ArrowLeft')azT-=Math.PI/2;else if(e.key==='e'||e.key==='ArrowRight')azT+=Math.PI/2;else if(e.key==='+')$('zIn').onclick();else if(e.key==='-')$('zOut').onclick();});
const ptrs=new Map();let moved=0,pinch=0;const ray=new X.Raycaster(),ndc=new X.Vector2();
function hitRobot(e){const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);const h=ray.intersectObjects(hits,false);return h.length?h[0].object.userData.robot:null;}
canvas.addEventListener('pointerdown',e=>{try{canvas.setPointerCapture(e.pointerId);}catch(_){}ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=ptrs.size>1?99:0;
  if(ptrs.size===2){const [a,b]=[...ptrs.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y);}});
canvas.addEventListener('pointermove',e=>{const p=ptrs.get(e.pointerId);
  if(!p){if(e.pointerType==='mouse'){const r=hitRobot(e);if(r!==hovered){if(hovered)hovered.outline.forEach(o=>o.visible=false);hovered=r;if(r)r.outline.forEach(o=>o.visible=true);canvas.style.cursor=r?'pointer':'grab';}}return;}
  if(ptrs.size===1){moved+=Math.abs(e.clientX-p.x)+Math.abs(e.clientY-p.y);
    if(moved>6&&zoom>1.001){setCam();const a=ground(p.x,p.y,new X.Vector3()),b=ground(e.clientX,e.clientY,new X.Vector3());target.add(a.sub(b));clampTarget();}
    p.x=e.clientX;p.y=e.clientY;}
  else if(ptrs.size===2){p.x=e.clientX;p.y=e.clientY;const [a,b]=[...ptrs.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch>0)zoomAt(d/pinch,(a.x+b.x)/2,(a.y+b.y)/2);pinch=d;}});
function up(e){if(!ptrs.has(e.pointerId))return;ptrs.delete(e.pointerId);if(e.type==='pointerup'&&moved<7&&ptrs.size===0){enviar('toque');const r=hitRobot(e);if(r&&!r.leaving){select(r);enviar('elegir',{agent:r.id});}else select(null);}}
canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
function select(r){selected=r;$('card').hidden=!r;if(r)fillCard();}
function fillCard(){const r=selected,p=r.p,a=activities[r.id];$('cBadge').textContent=badgeOf(p);$('cBadge').style.background=cssHex(ROLE_COLORS[r.role]);
  $('cName').textContent=p.name;$('cRole').textContent=(p.role||'')+(p.model?' · '+p.model:'');$('cStatus').textContent=T.status[p.status==='idle'&&p.busy?'wait':p.status]||p.status;$('cTask').textContent=a&&a.task?a.task:'';}
$('cClose').onclick=()=>select(null);

/* =====================================================================
   CIELO según la hora
   ===================================================================== */
let hourOverride=null;(function(){const h=params.get('hora');if(h&&/^\d{1,2}:\d{2}$/.test(h)){const [a,b]=h.split(':').map(Number);hourOverride=a+b/60;}})();
const sel=$('hour');[['',T.real],['7','07:00'],['13','13:00'],['18.5','18:30'],['22.17','22:10']].forEach(o=>{const e=document.createElement('option');e.value=o[0];e.textContent=o[1];sel.appendChild(e);});
sel.onchange=()=>{hourOverride=sel.value===''?null:parseFloat(sel.value);};
const KEY=[[0,'night'],[5.5,'night'],[7,'dawn'],[9,'day'],[17,'day'],[18.7,'dusk'],[20,'night'],[24,'night']];
const PH={night:{sky:0x0b1026,sun:0x8ea0ff,si:.55,hi:.3,lamp:1,exp:1.25,env:[0x3a4a8c,0x2a2a3a,1.3]},
  dawn:{sky:0xf7b9a4,sun:0xffb98a,si:1.7,hi:.2,lamp:.3,exp:.95,env:[0xffd2bd,0x8a8590,.7]},
  day:{sky:0x9fd3ff,sun:0xffe2bd,si:1.75,hi:.2,lamp:.12,exp:.95,env:[0xf2e3cc,0x9a8a78,.75]},
  dusk:{sky:0xf08a5d,sun:0xff8f5a,si:1.65,hi:.18,lamp:.55,exp:.95,env:[0xffb994,0x7d7480,.65]}};
const cA=new X.Color(),cB=new X.Color();let lampK=0,bgStr='';
function applySky(){let h;if(hourOverride!==null)h=hourOverride;else{const d=new Date();h=d.getHours()+d.getMinutes()/60;}
  let i=0;while(i<KEY.length-2&&h>=KEY[i+1][0])i++;const a=KEY[i],b=KEY[i+1],k=(h-a[0])/(b[0]-a[0]),A=PH[a[1]],B=PH[b[1]],L=(x,y)=>x+(y-x)*k,near=k<.5?a[1]:b[1];
  sky.copy(cA.setHex(A.sky)).lerp(cB.setHex(B.sky),k);winMat.color.copy(sky).lerp(cB.setHex(0xffffff),.3);
  const top='#'+cA.copy(sky).convertLinearToSRGB().getHexString(),bot='#'+cA.copy(sky).lerp(cB.setHex(0xffffff),.16).convertLinearToSRGB().getHexString(),s='linear-gradient('+top+','+bot+')';if(s!==bgStr){bgStr=s;$('app').style.background=s;}
  scene.fog.color.copy(sky).lerp(cB.setHex(0xffffff),lampK>.6?.04:.22);cityMats.forEach(m=>{m.emissiveIntensity=Math.max(0,L(A.lamp,B.lamp)-.25)*1.1;});
  sun.color.copy(cA.setHex(A.sun)).lerp(cB.setHex(B.sun),k);sun.intensity=L(A.si,B.si);hemi.intensity=L(A.hi,B.hi);lampK=L(A.lamp,B.lamp);renderer.toneMappingExposure=L(A.exp,B.exp);
  const e=PH[near].env;scene.environment=envFor(near,e[0],e[1],e[2]);
  warm.forEach(l=>l.intensity=lampK*3.2);bulbAll.emissiveIntensity=.35+lampK*2.6;DEPTS.forEach(d=>{const z=zones[d];z.bulbM.emissiveIntensity=z.bulbOn?.3+lampK*2.2:.03;z.glowM.opacity=z.bulbOn?lampK*.75:0;});
  const hh=Math.floor(h),mm=Math.floor((h-hh)*60);$('clock').textContent=String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')+' · '+T.phase[near];}

/* =====================================================================
   DEMO: jornada de mentira que habla el mismo protocolo
   ===================================================================== */
const POOL=[['Ada','Jefa de proyecto',1],['Bit','Desarrollo'],['Pixel','Frontend'],['Tuerca','Backend'],['Query','DBA'],['Nube','Infra'],['Lupa','QA'],['Trazo','Diseño'],['Plano','Arquitecto'],['Candado','Seguridad'],
  ['Byte','Desarrollo'],['Vista','Frontend'],['Nodo','Backend'],['Chip','Desarrollo'],['Macro','Desarrollo'],['Rayo','Infra'],['Vector','Diseño'],['Test','QA']];
const PROV=['cc','cx','ag','oc','cm','km','gk'];
const TASKS=[['🛠️','Refactor del módulo de pagos','Separar el servicio de cobros en casos de uso'],['🧪','Pruebas del login','Cubrir el flujo de inicio de sesión con pruebas'],['🎨','Pantalla de ajustes','Maquetar la pantalla de ajustes con el nuevo tema'],
  ['🗄️','Índices de la tabla de pedidos','Revisar consultas lentas y proponer índices'],['🚀','Pipeline de despliegue','Agregar el paso de migraciones al pipeline'],['🔐','Revisión de permisos','Auditar los roles del panel de administración'],
  ['📐','Diseño del módulo de reportes','Definir capas y contratos del módulo de reportes'],['🐛','Bug del carrito','Corregir el total cuando hay cupones'],['📝','Documentar la API','Describir los endpoints de clientes']];
let demoPeople=[],demoTarget=Math.max(2,Math.min(POOL.length,parseInt(params.get('empleados'),10)||11)),demoT=1.5,fast=params.get('rapido')==='1',demoOn=true;
function mk(i){const o=POOL[i];return {id:'a'+i,name:o[0],role:o[1],provider:PROV[i%PROV.length],isBoss:!!o[2],status:'idle',busy:false};}
function emit(){recibir({orquest:'oficina',type:'estado',people:demoPeople.map(p=>Object.assign({},p)),activities:Object.assign({},demoActs),sprites:{}});}
const demoActs={};
function demoTick(){
  if(demoPeople.length<demoTarget){for(let i=0;i<POOL.length;i++)if(!demoPeople.some(p=>p.id==='a'+i)){demoPeople.push(mk(i));break;}emit();return;}
  const agents=demoPeople.filter(p=>!p.isBoss);
  if(demoPeople.length>demoTarget||(Math.random()<.05&&agents.length>4)){const p=agents[agents.length-1-Math.floor(Math.random()*Math.min(3,agents.length))];demoPeople=demoPeople.filter(x=>x!==p);delete demoActs[p.id];emit();return;}
  if(!agents.length)return;const p=pick(agents),r=Math.random();
  if(p.status==='idle'){const t=pick(TASKS);p.status='working';p.busy=true;demoActs[p.id]={emoji:t[0],text:t[1],task:t[2]};emit();sendEv(p,{type:'asignada',text:t[1],emoji:t[0]});}
  else if(p.status==='working'){if(r<.16){p.status='blocked';emit();}else if(r<.7){p.status='done';emit();sendEv(p,{type:'reporte',text:(demoActs[p.id]||{}).text||'',emoji:'📦'});}}
  else if(p.status==='blocked'){p.status='working';emit();}
  else if(p.status==='done'){const ok=r<.75,tx=(demoActs[p.id]||{}).text||'';if(ok){p.status='idle';p.busy=Math.random()<.3;delete demoActs[p.id];}else p.status='working';emit();sendEv(p,{type:'revision',text:tx,verdict:ok?'aprobada':'rechazada',emoji:ok?'✅':'😠'});}
}
function sendEv(p,o){recibir(Object.assign({orquest:'oficina',at:Date.now(),agent:p.id},o,{type:'evento',ev:o.type}));}
function stopDemo(){demoOn=false;$('demoBar').hidden=true;}
$('fast').setAttribute('aria-pressed',String(fast));$('fast').onclick=()=>{fast=!fast;$('fast').setAttribute('aria-pressed',String(fast));};
$('empN').textContent=demoTarget;$('empLess').onclick=()=>{demoTarget=Math.max(2,demoTarget-1);$('empN').textContent=demoTarget;};$('empMore').onclick=()=>{demoTarget=Math.min(POOL.length,demoTarget+1);$('empN').textContent=demoTarget;};
/* arranque: oficina ya en marcha */
for(let i=0;i<demoTarget;i++)demoPeople.push(mk(i));
demoPeople.forEach((p,i)=>{if(p.isBoss)return;const m=i%5,t=TASKS[i%TASKS.length];if(m<3){p.status='working';p.busy=true;demoActs[p.id]={emoji:t[0],text:t[1],task:t[2]};}else if(m===3){p.status='done';p.busy=true;demoActs[p.id]={emoji:t[0],text:t[1],task:t[2]};}});
if(demoPeople[6]){demoPeople[6].status='blocked';demoPeople[6].busy=true;demoActs[demoPeople[6].id]={emoji:'🧪',text:TASKS[1][1],task:TASKS[1][2]};}
rebuildDesks();emit();applySky();setCam();enviar('listo');

/* =====================================================================
   BUCLE
   ===================================================================== */
let liftK=0;const v=new X.Vector3();let last=performance.now(),tt=0,scrT=0,skyT=0,visible=true;
if('IntersectionObserver' in window)new IntersectionObserver(e=>{visible=e[0].isIntersecting;}).observe(canvas);
function liftStep(dt){let op=0,down=false,hold=false;robots.forEach(r=>{if(r.g.position.z>D/2-2.2&&Math.abs(r.g.position.x-DX)<1.9)op=1;const q=r.script[0];if(r.leaving&&q&&q.t==='out'&&q.w>.5)down=true;if(r.leaving&&q&&q.t==='out'&&q.slot!==undefined&&!(q.w>.5))hold=true;});
    const tg=down&&!hold?-3.3:0;liftY+=Math.max(-3*dt,Math.min(3*dt,tg-liftY));liftCab.position.y=liftY;if(liftY<-.05)op=0;
    liftK+=(op-liftK)*Math.min(1,dt*5);liftDoors.forEach(d=>{d.m.position.x=d.x+d.s*liftK*1.42;});liftLamp.color.setHex(op?0x4ade80:0x334155);}
function layoutPlates(){const w=canvas.clientWidth,h=canvas.clientHeight,list=[];
  robots.forEach(r=>{v.copy(r.g.position);v.y+=1.95;v.project(camera);r.sx=(v.x+1)/2*w;r.sy=(1-v.y)/2*h;if(r.dirty){r.dirty=false;r.pw=r.el_.offsetWidth;r.phh=r.el_.offsetHeight;}list.push(r);});
  list.sort((a,b)=>b.sy-a.sy);const placed=[];
  list.forEach(r=>{let y=r.sy;for(let n=0;n<6;n++){let hit=false;for(const q of placed){if(Math.abs(q.x-r.sx)<(q.w+r.pw)/2+2&&y>q.y-q.h-2&&y-r.phh<q.y+2){y=q.y-q.h-3;hit=true;}}if(!hit)break;}
    placed.push({x:r.sx,y,w:r.pw,h:r.phh});r.el_.style.transform='translate('+Math.round(r.sx)+'px,'+Math.round(y)+'px) translate(-50%,-100%)';r.el_.style.zIndex=String(Math.round(r.sy));});}
function frame(now){requestAnimationFrame(frame);if(document.hidden||!visible){last=now;return;}
  const raw=Math.min(.05,(now-last)/1000);last=now;const dt=raw*(fast?3:1);tt+=dt;
  if(demoOn){demoT-=dt;if(demoT<0){demoT=rnd(1.6,2.8);demoTick();}}
  if(Math.abs(azT-az)>.0005)az+=(azT-az)*Math.min(1,raw*7);else az=azT;
  setCam();
  rebuildOcc();robots.forEach(r=>updRobot(r,dt,tt));
  liftStep(dt);
  spinners.forEach(s=>{if(zones[s.dept].on)s.o.rotation.z+=dt*.8*(s.k||1);});
  DEPTS.forEach(d=>{zones[d].sign.rotation.y=az;});
  scrT-=dt;if(scrT<0){scrT=.3;drawScr();}
  skyT-=raw;if(skyT<0){skyT=1;applySky();}
  if(sparkT>0){sparkT-=dt;for(let i=0;i<SN;i++){sVel[i*3+1]-=7*dt;sPos[i*3]+=sVel[i*3]*dt;sPos[i*3+1]+=sVel[i*3+1]*dt;sPos[i*3+2]+=sVel[i*3+2]*dt;}sGeo.attributes.position.needsUpdate=true;sparks.material.opacity=Math.min(1,sparkT*2);if(sparkT<=0)sparks.visible=false;}
  renderer.render(scene,camera);layoutPlates();}
if(params.has('debug'))window.__dbg={robots,sim(n){let close=0,min=9;const pairs={};for(let i=0;i<n;i++){tt+=.05;if(demoOn){demoT-=.05;if(demoT<0){demoT=rnd(1.6,2.8);demoTick();}}rebuildOcc();robots.forEach(r=>updRobot(r,.05,tt));liftStep(.05);const a=[...robots.values()];for(let x=0;x<a.length;x++)for(let y=x+1;y<a.length;y++){const d=Math.hypot(a[x].g.position.x-a[y].g.position.x,a[x].g.position.z-a[y].g.position.z);if(d<min)min=d;if(d<.55){close++;const k=a[x].p.name+'-'+a[y].p.name;if(!pairs[k])pairs[k+'@']=[a[x],a[y]].map(q=>[q.g.position.x+W/2,q.g.position.z+D/2,q.anim,q.p.status,q.leaving,(q.script[0]||{}).t,q.seat.seat,(q.script[0]||{}).must,(q.script[0]||{}).blk].join('|'));pairs[k]=(pairs[k]||0)+1;}}}return {close,min,pairs,robots:robots.size,yields};},view(z,x,zz,n){zoom=z;target.set(x,0,zz);azT+=(n||0)*Math.PI/2;az=azT;platesEl.classList.toggle('far',zoom<1.5);}};
requestAnimationFrame(frame);
addEventListener('pagehide',()=>{renderer.dispose();});
})();
