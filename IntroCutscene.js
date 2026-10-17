class IntroCutscene {
  constructor(renderer, cinematicAssets=null) {
    this.renderer = renderer;
    this.cinematicAssets = cinematicAssets || null;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x11171a);
    this.scene.fog = new THREE.FogExp2(0x2b3539, .0105);
    this.camera = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, .05, 420);
    this.clockTime = 0;
    this.duration = 84;
    this.active = false;
    this.onComplete = null;
    this.returnToMenu = false;
    this.groups = new Map();
    this.currentShot = -1;
    this.skipHeld = false;
    this.skipHold = 0;
    this.skipRequired = .8;
    this.audio = null;
    this.anim = [];
    this.smoke = [];
    this.radioNeedle = null;
    this.radioLampMat = null;
    this.heartCoreMat = null;
    this.redEyeMats = [];
    this.redNightMats = [];
    this.portLampMats = [];
    this.finalHeadlight = null;
    this.finalHeadlightMat = null;
    this.finalFireMat = null;
    this._target=new THREE.Vector3();this._lastSubtitle='';this._lastFade=-1;this._titleShown=false;this._subtitleIndex=-1;

    this.overlay = document.getElementById('introCutscene');
    this.subtitleEl = document.getElementById('introSubtitle');
    this.fadeEl = document.getElementById('introFade');
    this.titleEl = document.getElementById('introCinematicTitle');
    this.skipProgress = document.getElementById('introSkipProgress');
    this.metaEl = document.getElementById('introCinematicMeta');

    this.script = [
      {time:1.0,text:'Когда-то эти рельсы соединяли весь край.'},
      {time:8.0,text:'Наши машины строили города, добывали уголь и охраняли дороги.'},
      {time:15.0,text:'Потом мы построили Сердце.'},
      {time:24.0,text:'В ночь первого запуска небо стало красным.'},
      {time:28.0,text:'Связь исчезла.'},
      {time:33.0,text:'А машины получили новый приказ.'},
      {time:38.0,text:'Красная ночь изменила не только машины.'},
      {time:43.0,text:'Те, кто выжил, спрятались у железной дороги.'},
      {time:49.0,text:'Так появились Порты.'},
      {time:53.0,text:'Железная дорога стала морем, а Порты — островами безопасности.'},
      {time:57.0,text:'Мы думали, что самое страшное осталось позади.'},
      {time:63.0,text:'Но несколько недель назад Восток снова заговорил.'},
      {time:66.0,text:'СЕРДЦЕ РАБОТАЕТ.'},
      {time:69.0,text:'После этого автоматы начали просыпаться.'},
      {time:73.0,text:'До источника сигнала — сорок километров.'},
      {time:76.0,text:'Последняя экспедиция ушла туда двенадцать дней назад.'},
      {time:79.0,text:'Она не вернулась.'},
      {time:81.0,text:'Теперь очередь твоя.'}
    ];
    this.cues=[
      {time:4.6,type:'steam'},{time:14.5,type:'metal'},{time:22.6,type:'pressure'},{time:27.3,type:'flash'},
      {time:33.2,type:'metal'},{time:62.8,type:'radio'},{time:72.5,type:'steam'},{time:79.8,type:'headlight'},{time:81.4,type:'motif'}
    ];
    this.cueIndex=0;

    this.shots = [
      {start:0,end:12,key:'before',bg:0x6f634e,fog:0x7b705d,fogD:.0065,cam:[-20,7,24, 12,8,16],target:[2,4,0, 3,4,5]},
      {start:12,end:24,key:'heart',bg:0x252b2d,fog:0x4b5352,fogD:.009,cam:[-18,5,23, 15,10,18],target:[0,10,0, 0,12,0]},
      {start:24,end:33,key:'rednight',bg:0x3b1112,fog:0x52191a,fogD:.015,cam:[-11,4.5,19, 10,7,15],target:[0,9,0, 0,7,1]},
      {start:33,end:43,key:'machines',bg:0x12181a,fog:0x273034,fogD:.020,cam:[-13,2.1,19, 10,3.0,12],target:[0,1.4,0, 0,1.9,2]},
      {start:43,end:53,key:'fall',bg:0x202426,fog:0x3a4142,fogD:.018,cam:[-19,4,17, 13,4,15],target:[0,2,0, 2,2,2]},
      {start:53,end:63,key:'ports',bg:0x10171a,fog:0x273338,fogD:.014,cam:[-16,6,21, 15,5,16],target:[1,3,0, 0,3,2]},
      {start:63,end:72,key:'signal',bg:0x080b0d,fog:0x141b1e,fogD:.025,cam:[-5,2.4,8, 3.5,2.5,6.5],target:[0,1.8,0, 0,2,0]},
      {start:72,end:84,key:'train',bg:0x0d1317,fog:0x1c2930,fogD:.016,cam:[-10,1.55,13, 6.5,4.0,16],target:[0,2.2,0, .5,3.4,1.0]}
    ];

    this._onKeyDown = e => {
      if (!this.active) return;
      if (e.code === 'Space') { e.preventDefault(); this.skipHeld = true; }
    };
    this._onKeyUp = e => {
      if (!this.active) return;
      if (e.code === 'Space') { e.preventDefault(); this.skipHeld = false; this.skipHold = 0; this.updateSkipUI(); }
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    });

    this.buildScene();
  }

  mat(color, roughness=.8, metalness=.15, emissive=0x000000, emissiveIntensity=0) {
    return new THREE.MeshStandardMaterial({color,roughness,metalness,emissive,emissiveIntensity});
  }
  box(parent, mat, x,y,z, sx,sy,sz, ry=0) {
    const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.y=ry;m.castShadow=false;m.receiveShadow=true;parent.add(m);return m;
  }
  cyl(parent, mat, x,y,z, r,h, sides=10, rx=0,rz=0) {
    const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,sides),mat);m.position.set(x,y,z);m.rotation.x=rx;m.rotation.z=rz;m.receiveShadow=true;parent.add(m);return m;
  }
  bulb(parent, color, x,y,z, r=.12, intensity=.8) {
    const mat=this.mat(color,.35,.05,color,intensity);const m=new THREE.Mesh(new THREE.SphereGeometry(r,8,6),mat);m.position.set(x,y,z);parent.add(m);return {mesh:m,mat};
  }
  addSmoke(parent,x,y,z,scale=1,color=0x4a4f50) {
    const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.12,depthWrite:false});
    for(let i=0;i<4;i++){const s=new THREE.Mesh(new THREE.SphereGeometry(.7,8,6),mat.clone());s.position.set(x,y+i*.72,z);s.scale.set(scale*(1+i*.25),scale*.55*(1+i*.2),scale*(1+i*.25));parent.add(s);this.smoke.push({mesh:s,base:s.position.clone(),phase:i*.7});}
  }
  factory(parent,x,z,scale=1,warm=false) {
    if(this.cinematicAssets)return this.cinematicAssets.createFactoryVisual(parent,{x,z,scale,warm,tall:scale>1});
    const iron=this.mat(0x303638,.88,.58),rust=this.mat(0x694132,.92,.48),glass=this.mat(warm?0x6e4a2b:0x26333a,.4,.05,warm?0xff9c4a:0x355b6f,warm?.34:.08);
    this.box(parent,iron,x,2.6*scale,z,7*scale,5.2*scale,6*scale);
    this.box(parent,rust,x+3.2*scale,1.8*scale,z-1.2*scale,2.8*scale,3.6*scale,3.3*scale);
    for(const sx of [-2.2,0,2.2])this.box(parent,glass,x+sx*scale,2.8*scale,z-3.03*scale,.9*scale,.9*scale,.08*scale);
    for(const sx of [-2.2,1.8]){this.cyl(parent,iron,x+sx*scale,8.2*scale,z+1.6*scale,.55*scale,11*scale,10);this.addSmoke(parent,x+sx*scale,14*scale,z+1.6*scale,.8*scale);}
  }
  crane(parent,x,z,s=1) {
    if(this.cinematicAssets)return this.cinematicAssets.createCraneVisual(parent,{x,z,scale:s});
    const metal=this.mat(0x41484a,.86,.74);this.box(parent,metal,x,4*s,z,.45*s,8*s,.45*s);this.box(parent,metal,x+3*s,7.6*s,z,6*s,.35*s,.35*s);this.box(parent,metal,x+5.8*s,5.8*s,z,.08*s,3.5*s,.08*s);
  }
  train(parent,x,z,s=1,lit=true) {
    if(this.cinematicAssets){const t=this.cinematicAssets.createLocomotiveVisual(parent,{x,z,scale:s,lit});t.group.userData.cinematicTrain=t;return t.group;}
    const iron=this.mat(0x24292b,.76,.82),rust=this.mat(0x6a3c2b,.88,.54),brass=this.mat(0x987441,.42,.78),wood=this.mat(0x4b3428,.96,.02);
    const root=new THREE.Group();root.position.set(x,0,z);root.scale.setScalar(s);parent.add(root);
    this.box(root,iron,0,.6,0,4.6,.6,10);
    this.cyl(root,iron,0,2.3,1.1,1.25,5.8,14,Math.PI/2); // horizontal boiler
    this.box(root,rust,0,2.9,-2.8,4.2,3.4,3.8);
    this.box(root,iron,0,4.85,-2.8,4.6,.22,4.2);
    this.cyl(root,iron,0,4.8,3.0,.42,2.2,10);
    this.cyl(root,brass,0,2.6,4.2,.65,.45,12,Math.PI/2);
    for(const zz of [-3.2,-1.1,1.3,3.6])for(const xx of [-1.55,1.55]){const w=new THREE.Mesh(new THREE.TorusGeometry(.74,.14,8,18),iron);w.position.set(xx,.55,zz);w.rotation.y=Math.PI/2;root.add(w);}
    this.box(root,wood,0,2.9,-4.76,2.1,.32,.16);
    if(lit){const head=this.bulb(root,0xffd28a,0,2.7,4.55,.26,1.5);const light=new THREE.SpotLight(0xffc982,3.2,38,.34,.55,1.3);light.position.set(0,2.7,4.7);light.target.position.set(0,1.2,26);root.add(light,light.target);root.userData.headMat=head.mat;}
    this.addSmoke(root,0,6.0,3.0,.7);
    return root;
  }
  automaton(parent,x,z,s=1,eye=true) {
    if(this.cinematicAssets){const e=this.cinematicAssets.createEnemyVisual(parent,'walker',{x,z,scale:s,eye});return e?.group||new THREE.Group();}
    const iron=this.mat(0x343a3c,.84,.74),brass=this.mat(0x9b7440,.48,.7),root=new THREE.Group();root.position.set(x,0,z);root.scale.setScalar(s);parent.add(root);
    this.box(root,iron,0,1.3,0,1.45,1.55,.9);this.cyl(root,brass,0,1.4,.48,.32,.55,10,Math.PI/2);
    for(const xx of [-.55,.55]){this.cyl(root,iron,xx,.55,0,.16,1.05,8);this.cyl(root,iron,xx,1.75,0,.15,.9,8,0,.25*(xx>0?1:-1));}
    this.cyl(root,iron,0,2.25,0,.35,.42,9);if(eye){const e=this.bulb(root,0xa92620,0,2.25,.34,.08,.8);this.redEyeMats.push(e.mat);}return root;
  }
  spider(parent,x,z,s=1) {
    if(this.cinematicAssets){const e=this.cinematicAssets.createEnemyVisual(parent,'stalker',{x,z,scale:s,eye:true});return e?.group||new THREE.Group();}
    const iron=this.mat(0x24282a,.9,.72),root=new THREE.Group();root.position.set(x,0,z);root.scale.setScalar(s);parent.add(root);this.cyl(root,iron,0,.65,0,.7,1.1,12,0,Math.PI/2);
    for(let i=0;i<6;i++){const a=(i/6)*Math.PI*2,leg=new THREE.Group();leg.rotation.y=a;root.add(leg);this.box(leg,iron,.8,.52,0,1.1,.12,.12,.15);this.box(leg,iron,1.48,.25,0,.85,.10,.10,.55);}
    for(const xx of [-.22,0,.22]){const e=this.bulb(root,0xb82d25,xx,.74,.61,.055,.9);this.redEyeMats.push(e.mat);}return root;
  }
  shielder(parent,x,z,s=1) {
    if(this.cinematicAssets){const e=this.cinematicAssets.createEnemyVisual(parent,'brute',{x,z,scale:s,eye:true});return e?.group||new THREE.Group();}
    const iron=this.mat(0x4b4039,.92,.65),root=new THREE.Group();root.position.set(x,0,z);root.scale.setScalar(s);parent.add(root);this.box(root,iron,0,1.1,0,2.2,1.55,1.45);this.box(root,iron,0,1.4,.95,2.8,2.8,.24);for(const xx of [-.75,.75])for(const zz of [-.35,.35])this.cyl(root,iron,xx,.38,zz,.17,.7,8);const core=this.bulb(root,0xff6d2d,0,1.35,-.82,.23,1.2);this.redEyeMats.push(core.mat);return root;
  }
  sniper(parent,x,z,s=1) {
    if(this.cinematicAssets){const e=this.cinematicAssets.createEnemyVisual(parent,'gunner',{x,z,scale:s,eye:true});return e?.group||new THREE.Group();}
    const iron=this.mat(0x293033,.85,.82),brass=this.mat(0x8e703d,.45,.7),root=new THREE.Group();root.position.set(x,0,z);root.scale.setScalar(s);parent.add(root);for(const xx of [-.25,.25])this.cyl(root,iron,xx,1.0,0,.08,2.0,8);this.box(root,iron,0,2.1,0,.8,.65,.55);this.cyl(root,brass,0,2.7,.08,.18,.4,10);this.box(root,iron,.55,2.05,.1,1.5,.12,.12);const e=this.bulb(root,0xd3342a,0,2.7,.27,.06,.8);this.redEyeMats.push(e.mat);return root;
  }

  buildScene() {
    const ambient=new THREE.HemisphereLight(0x8a9aa2,0x241d18,.74);this.scene.add(ambient);
    const key=new THREE.DirectionalLight(0xffdfad,1.2);key.position.set(-10,18,12);this.scene.add(key);this.keyLight=key;
    const groundMat=this.mat(0x2b2c28,1,.02);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(180,180),groundMat);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;this.scene.add(ground);

    const makeGroup=key=>{const g=new THREE.Group();g.visible=false;this.scene.add(g);this.groups.set(key,g);return g;};
    // Before: warm, prosperous industrial rail city.
    {
      const g=makeGroup('before');for(let i=-3;i<=3;i++)this.factory(g,i*14,-11+(i%2)*5,.78+(i%3)*.06,true);this.crane(g,-15,5,1.0);this.crane(g,13,2,.9);this.train(g,0,4,.74,true);this.automaton(g,-9,7,.72,false);this.automaton(g,-5,8,.68,false);this.spider(g,6,6,.62);this.shielder(g,12,1,.58);this.sniper(g,-13,-2,.62);for(const x of [-24,24])this.cyl(g,this.mat(0x32383a,.88,.7),x,12,-18,.72,24,10);
    }
    // Heart: the same steampunk visual language as gameplay, now at city scale.
    {
      const g=makeGroup('heart');
      for(const x of [-15,15])this.factory(g,x,-9,.94,false);
      this.crane(g,-12,8,.85);this.crane(g,12,6,.75);
      const heart=this.cinematicAssets?.createHeartVisual(g,{x:0,z:0,scale:1,redNight:false});
      if(heart)heart.traverse(o=>{if(o.userData?.heartCore)this.heartCoreMat=o.material;});
      else {const core=this.cyl(g,this.mat(0x5c3928,.35,.5,0xff9a48,.42),0,10,0,3.0,10,18);this.heartCoreMat=core.material;}
      for(const x of [-8,8])this.addSmoke(g,x,21,-1,1.15);
      // Foreground pipes create parallax instead of an empty camera move.
      for(const x of [-10,10]){const pipe=this.cyl(g,this.mat(0x342f2c,.9,.7),x,4,10,.55,11,10);pipe.rotation.z=.08*(x>0?1:-1);}
    }
    // Red Night: same machine overpressure, strange red sky.
    {
      const g=makeGroup('rednight');this.factory(g,-12,-8,.9,false);this.factory(g,12,-9,.9,false);const heart=this.cinematicAssets?.createHeartVisual(g,{x:0,z:0,scale:1,redNight:true})||this.cyl(g,this.mat(0x3c2d2d,.55,.72,0xff3c24,.72),0,8,0,4.2,14,18);for(let i=0;i<16;i++){const b=this.bulb(g,0xff3a24,(i%4-1.5)*2.2,2+Math.floor(i/4)*1.5,-4+(i%3),.08,.6);this.redNightMats.push(b.mat);}this.addSmoke(g,0,16,0,2.2,0x5a2020);g.userData.heart=heart;
    }
    // Machines: distinct silhouettes in fog.
    {
      const g=makeGroup('machines');this.box(g,this.mat(0x252a2c,.95,.4),0,.12,-2,26,.24,16);this.automaton(g,-5,1,1.05,true);this.spider(g,2,2,.95);this.shielder(g,7,-1,.9);this.sniper(g,-9,-4,1.0);this.box(g,this.mat(0x342b29,.9,.35),2,.65,7,9,1.3,2.8,.16);
      const beamMat=new THREE.MeshBasicMaterial({color:0xc92c29,transparent:true,opacity:.18,depthWrite:false});const beam=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,15,5),beamMat);beam.position.set(-9,2.6,2.5);beam.rotation.x=Math.PI/2;g.add(beam);g.userData.beam=beam;
      // Brief ambiguous silhouettes: the Red Night changed more than machinery, but the intro does not explain how.
      const silhouette=this.mat(0x090b0c,1,.05);this.cyl(g,silhouette,11,1.45,-6,.26,2.4,8);this.cyl(g,silhouette,11,2.82,-6,.30,.42,8);const ve1=this.bulb(g,0x8e1717,10.90,2.84,-5.72,.035,.55),ve2=this.bulb(g,0x8e1717,11.10,2.84,-5.72,.035,.55);this.redEyeMats.push(ve1.mat,ve2.mat);
      this.box(g,silhouette,-13,1.65,-9,1.6,3.3,.95,.15);this.cyl(g,silhouette,-13,3.45,-9,.48,.55,8);this.box(g,silhouette,-13.45,3.7,-9,.28,.8,.22,.35);this.box(g,silhouette,-12.55,3.7,-9,.28,.8,.22,-.35);
    }
    // Fall: abandoned domestic/rail scene.
    {
      const g=makeGroup('fall'),wood=this.mat(0x4b382d,.98,.02),rust=this.mat(0x704333,.92,.5),iron=this.mat(0x303638,.9,.65);this.box(g,wood,-8,1.7,-1,7,3.4,6);this.box(g,rust,-8,3.55,-1,7.4,.22,6.4,.08);this.box(g,wood,-4.3,1.15,2,.18,2.3,1.2);this.box(g,wood,2,.65,2,3,.4,1.4,.18);for(const x of [4,6,8])this.box(g,wood,x,.35,1+(x%2),1.2,.7,1.0,(x-6)*.2);const wreck=this.train(g,7,-5,.52,false);wreck.rotation.z=.16;wreck.rotation.y=-.24;this.automaton(g,2,-1,.7,false).rotation.z=1.4;
    }
    // Ports: safe rail island at night.
    {
      const g=makeGroup('ports'),iron=this.mat(0x353c3f,.86,.65),wood=this.mat(0x4d392d,.96,.02),windowMat=this.mat(0x65472c,.35,.03,0xffa24e,.58);this.cinematicAssets?.createPortVisual(g,{x:0,z:-4,scale:.78,warm:true});this.box(g,iron,0,.22,0,30,.44,7);for(const x of [-10,-3,4,11]){this.box(g,wood,x,1.8,-5,6,3.6,5);for(const wx of [-1.6,1.6])this.box(g,windowMat,x+wx,2,-7.52,.9,.85,.06);this.cyl(g,iron,x+1.8,4.7,-4,.20,3.0,8);this.addSmoke(g,x+1.8,6.3,-4,.45);}for(const x of [-13,-7,0,7,13]){this.cyl(g,iron,x,2.6,3,.07,5.2,8);const b=this.bulb(g,0xffa75b,x,5.1,3,.12,.72);this.portLampMats.push(b.mat);}this.crane(g,12,0,.7);
    }
    // Signal radio.
    {
      const g=makeGroup('signal'),iron=this.mat(0x2b3032,.85,.72),brass=this.mat(0x8e6e3f,.46,.7),glass=this.mat(0x4e3b28,.3,.05,0xff7038,.1);this.box(g,iron,0,1.3,0,4.8,2.6,2.6);this.box(g,brass,0,2.15,-1.34,2.8,.75,.1);this.box(g,glass,0,1.2,-1.34,3.0,1.1,.08);const needle=new THREE.Mesh(new THREE.BoxGeometry(.05,.72,.05),brass);needle.position.set(0,1.2,-1.42);needle.rotation.z=-.55;g.add(needle);this.radioNeedle=needle;const lamp=this.bulb(g,0xff522f,1.55,2.12,-1.45,.11,.08);this.radioLampMat=lamp.mat;this.cyl(g,iron,0,5.0,.5,.08,6.5,8);this.box(g,iron,0,8.2,.5,4.2,.06,.06,.2);
    }
    // Player train / current day.
    {
      const g=makeGroup('train');const t=this.train(g,0,0,.92,true);g.userData.train=t;const portIron=this.mat(0x353b3d,.88,.62),windowMat=this.mat(0x5f442d,.33,.03,0xffa357,.45);this.box(g,portIron,-10,2,-7,7,4,6);this.box(g,windowMat,-10,2.2,-10.03,2.8,1.0,.06);this.crane(g,11,-4,.8);for(const x of [-8,-3,4,9]){this.cyl(g,portIron,x,2.8,7,.07,5.6,8);this.bulb(g,0xffaa62,x,5.5,7,.12,.5);}this.finalTrainController=t.userData.cinematicTrain||null;this.finalHeadlight=t.userData.headMat||null;this.finalFireMat=this.mat(0xff7d32,.35,.05,0xff5d20,.75);this.box(g,this.finalFireMat,0,2.7,-4.78,1.25,.72,.08);
    }
  }

  startAudio() {
    try {
      const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
      const ctx=new Ctx(),master=ctx.createGain();master.gain.value=.14;master.connect(ctx.destination);
      const drone=ctx.createOscillator(),droneGain=ctx.createGain();drone.type='sine';drone.frequency.value=48;droneGain.gain.value=.028;drone.connect(droneGain).connect(master);drone.start();
      const hum=ctx.createOscillator(),humGain=ctx.createGain();hum.type='triangle';hum.frequency.value=73;humGain.gain.value=.011;hum.connect(humGain).connect(master);hum.start();
      const len=ctx.sampleRate*2,buf=ctx.createBuffer(1,len,ctx.sampleRate),data=buf.getChannelData(0);for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*(.4+Math.sin(i*.013)*.08);
      const noise=ctx.createBufferSource(),noiseGain=ctx.createGain(),filter=ctx.createBiquadFilter();noise.buffer=buf;noise.loop=true;filter.type='bandpass';filter.frequency.value=1300;filter.Q.value=.7;noiseGain.gain.value=.004;noise.connect(filter).connect(noiseGain).connect(master);noise.start();
      this.audio={ctx,master,drone,hum,noise,noiseGain};
    } catch(_) { this.audio=null; }
  }
  audioCue(type) {
    if(!this.audio?.ctx)return;
    try{
      const ctx=this.audio.ctx,master=this.audio.master,now=ctx.currentTime;
      const ping=(freq,dur=.12,vol=.025,wave='triangle')=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=wave;o.frequency.setValueAtTime(freq,now);o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.55),now+dur);g.gain.setValueAtTime(vol,now);g.gain.exponentialRampToValueAtTime(.0001,now+dur);o.connect(g).connect(master);o.start(now);o.stop(now+dur+.02);};
      const hiss=(dur=.35,vol=.018,cut=1800)=>{const len=Math.max(1,Math.floor(ctx.sampleRate*dur)),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();src.buffer=buf;f.type='lowpass';f.frequency.value=cut;g.gain.value=vol;src.connect(f).connect(g).connect(master);src.start(now);};
      if(type==='steam')hiss(.65,.025,2300);
      else if(type==='metal'){ping(180,.10,.022,'square');ping(92,.18,.012,'triangle');}
      else if(type==='pressure'){ping(68,.55,.018,'sawtooth');hiss(.45,.018,1100);}
      else if(type==='flash'){ping(54,.62,.025,'sine');hiss(.22,.020,2600);}
      else if(type==='radio'){ping(920,.055,.008,'square');ping(760,.075,.006,'square');}
      else if(type==='headlight'){ping(125,.07,.018,'square');}
      else if(type==='motif'){
        const notes=[110,131,147,123,98];notes.forEach((f,i)=>{const o=ctx.createOscillator(),g=ctx.createGain(),t=now+i*.34;o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.018,t+.06);g.gain.exponentialRampToValueAtTime(.0001,t+.48);o.connect(g).connect(master);o.start(t);o.stop(t+.52);});
      }
    }catch(_){}
  }

  stopAudio() {
    if(!this.audio)return;try{this.audio.master.gain.setTargetAtTime(.0001,this.audio.ctx.currentTime,.08);setTimeout(()=>{try{this.audio.ctx.close()}catch(_){}},250)}catch(_){}this.audio=null;
  }

  play({playerClass=null,difficulty=null,onComplete=null,returnToMenu=false}={}) {
    if(this.active)return;
    this.active=true;this.clockTime=0;this.currentShot=-1;this.skipHeld=false;this.skipHold=0;this.cueIndex=0;this.onComplete=onComplete;this.returnToMenu=!!returnToMenu;this._lastSubtitle='';this._lastFade=-1;this._titleShown=false;this._subtitleIndex=-1;
    if(this.overlay){this.overlay.classList.remove('hidden');this.overlay.classList.remove('handoff');}document.body.classList.add('intro-playing');
    if(this.fadeEl){this.fadeEl.style.background='#000';this.fadeEl.style.opacity='1';}
    for(const puff of this.smoke){puff.mesh.position.copy(puff.base);puff.mesh.material.opacity=.08;}
    if(this.metaEl)this.metaEl.textContent=`${playerClass?.label||'МАШИНИСТ'} · ${difficulty?.label||'НОРМАЛЬНАЯ'}`;
    if(this.titleEl){this.titleEl.textContent='';this.titleEl.classList.remove('visible');}
    this.updateSkipUI();this.startAudio();
  }
  updateSkipUI() {
    if(this.skipProgress)this.skipProgress.style.setProperty('--skip-progress',`${THREE.MathUtils.clamp(this.skipHold/this.skipRequired,0,1)*100}%`);
  }
  setShot(index) {
    if(this.currentShot===index)return;this.currentShot=index;const shot=this.shots[index];for(const [key,g] of this.groups)g.visible=key===shot.key;
    this.scene.background.setHex(shot.bg);this.scene.fog.color.setHex(shot.fog);this.scene.fog.density=shot.fogD;
    this.keyLight.color.setHex(index===0?0xffd8a5:index===2?0xff7654:(index>=5?0x9bb7c6:0xb7c2c2));this.keyLight.intensity=index===2?1.35:(index>=5?.72:1.0);
  }
  currentSubtitle() {
    while(this._subtitleIndex+1<this.script.length&&this.clockTime>=this.script[this._subtitleIndex+1].time)this._subtitleIndex++;
    return this._subtitleIndex>=0?this.script[this._subtitleIndex].text:'';
  }
  update(dt) {
    if(!this.active)return;
    dt=Math.min(.05,Math.max(0,dt||0));this.clockTime+=dt;
    while(this.cueIndex<this.cues.length&&this.clockTime>=this.cues[this.cueIndex].time){this.audioCue(this.cues[this.cueIndex].type);this.cueIndex++;}
    if(this.skipHeld){this.skipHold+=dt;this.updateSkipUI();if(this.skipHold>=this.skipRequired){this.finish(true);return;}}
    let idx=this.currentShot>=0?this.currentShot:0;while(idx<this.shots.length-1&&this.clockTime>=this.shots[idx].end)idx++;while(idx>0&&this.clockTime<this.shots[idx].start)idx--;
    this.setShot(idx);const shot=this.shots[idx],span=Math.max(.01,shot.end-shot.start),p=THREE.MathUtils.clamp((this.clockTime-shot.start)/span,0,1),smooth=p*p*(3-2*p);
    let target;
    if(idx===4){
      const poses=[
        {c:[-15,3.2,10],t:[-8,1.8,-1]},
        {c:[-4,2.4,9],t:[2,.8,2]},
        {c:[12,3.1,9],t:[7,1.8,-5]}
      ];
      const seg=Math.min(2,Math.floor(p*3)),lp=THREE.MathUtils.clamp(p*3-seg,0,1),next=Math.min(2,seg+1),sp=lp*lp*(3-2*lp),a=poses[seg],b=poses[next];
      this.camera.position.set(THREE.MathUtils.lerp(a.c[0],b.c[0],sp*.20),THREE.MathUtils.lerp(a.c[1],b.c[1],sp*.20),THREE.MathUtils.lerp(a.c[2],b.c[2],sp*.20));
      target=this._target.set(THREE.MathUtils.lerp(a.t[0],b.t[0],sp*.16),THREE.MathUtils.lerp(a.t[1],b.t[1],sp*.16),THREE.MathUtils.lerp(a.t[2],b.t[2],sp*.16));
    } else {
      this.camera.position.set(THREE.MathUtils.lerp(shot.cam[0],shot.cam[3],smooth),THREE.MathUtils.lerp(shot.cam[1],shot.cam[4],smooth),THREE.MathUtils.lerp(shot.cam[2],shot.cam[5],smooth));
      target=this._target.set(THREE.MathUtils.lerp(shot.target[0],shot.target[3],smooth),THREE.MathUtils.lerp(shot.target[1],shot.target[4],smooth),THREE.MathUtils.lerp(shot.target[2],shot.target[5],smooth));
    }
    this.camera.lookAt(target);
    const edge=Math.min(p,1-p);let fade=THREE.MathUtils.clamp((.16-edge)/.14,0,1);
    if(idx===4){const d1=Math.abs(p-1/3),d2=Math.abs(p-2/3);fade=Math.max(fade,THREE.MathUtils.clamp((.035-Math.min(d1,d2))/.035,0,.92));}
    let flash=0;if(this.clockTime>=21.72&&this.clockTime<=22.12){const fp=(this.clockTime-21.72)/.40;flash=fp<.34?THREE.MathUtils.lerp(0,.98,fp/.34):THREE.MathUtils.lerp(.98,0,(fp-.34)/.66);}
    const fadeValue=Math.max(fade,flash);if(this.fadeEl&&Math.abs(fadeValue-this._lastFade)>.004){this.fadeEl.style.background=flash>.01?'#f3eadb':'#000';this.fadeEl.style.opacity=String(fadeValue);this._lastFade=fadeValue;}
    const subtitle=this.currentSubtitle();if(this.subtitleEl&&subtitle!==this._lastSubtitle){this.subtitleEl.textContent=subtitle;this._lastSubtitle=subtitle;}
    if(this.audio?.noiseGain){const signal=idx===6?(.026+.018*Math.sin(this.clockTime*8.2)**2):.004;this.audio.noiseGain.gain.setTargetAtTime(signal,this.audio.ctx.currentTime,.08);}
    for(const a of this.anim)if(a.type==='spin')a.obj.rotation.z+=dt*a.speed;
    this.cinematicAssets?.animate?.(this.groups.get(this.shots[idx]?.key),dt,this.clockTime);
    for(const s of this.smoke){const tt=this.clockTime*.24+s.phase;s.mesh.position.x=s.base.x+Math.sin(tt*1.7+s.phase)*.55;s.mesh.position.y=s.base.y+(tt%3.4)*.65;s.mesh.position.z=s.base.z+Math.cos(tt*1.1+s.phase)*.22;s.mesh.material.opacity=.11*(1-((tt%3.4)/3.4));}
    if(this.heartCoreMat)this.heartCoreMat.emissiveIntensity=.32+.18*Math.sin(this.clockTime*2.1)**2+(idx===2?.35*Math.sin(this.clockTime*12.5)**2:0);
    if(this.radioNeedle&&idx===6)this.radioNeedle.rotation.z=-.6+Math.sin(this.clockTime*7.2)*.46;
    if(this.radioLampMat)this.radioLampMat.emissiveIntensity=idx===6?(.08+.92*(Math.sin(this.clockTime*5.6)>0?.8:.05)):.04;
    if(this.finalHeadlight)this.finalHeadlight.emissiveIntensity=idx===7?THREE.MathUtils.smoothstep(p,.35,.6)*1.6:.2;
    if(this.finalTrainController?.headlight)this.finalTrainController.headlight.intensity=idx===7?THREE.MathUtils.lerp(.5,14,THREE.MathUtils.smoothstep(p,.28,.62)):.1;
    if(this.finalTrainController?.headBeamMat)this.finalTrainController.headBeamMat.opacity=idx===7?.025:0;
    if(this.finalFireMat)this.finalFireMat.emissiveIntensity=idx===7?.55+.25*Math.sin(this.clockTime*9.2)**2:.1;
    for(const m of this.redEyeMats)m.emissiveIntensity=idx===3?(.72+.18*Math.sin(this.clockTime*3.3)**2):.055;
    for(const m of this.redNightMats)m.emissiveIntensity=idx===2?(.55+.35*Math.sin(this.clockTime*8.8)**2):.04;
    for(const m of this.portLampMats)m.emissiveIntensity=idx===5?(.48+.08*Math.sin(this.clockTime*2.1)**2):.04;
    const showTitle=this.clockTime>81.0;if(this.titleEl&&showTitle!==this._titleShown){this._titleShown=showTitle;this.titleEl.classList.toggle('visible',showTitle);this.titleEl.textContent=showTitle?'IRON WASTES':'';}
    if(this.clockTime>=this.duration)this.finish(false);
  }
  render() { if(this.active)this.renderer.render(this.scene,this.camera); }
  finish(skipped=false) {
    if(!this.active)return;this.active=false;this.skipHeld=false;this.skipHold=0;this.updateSkipUI();this.stopAudio();
    try{localStorage.setItem('ironWastesIntroSeen','true')}catch(_){}
    if(this.subtitleEl)this.subtitleEl.textContent='';if(this.titleEl)this.titleEl.classList.remove('visible');
    if(this.overlay)this.overlay.classList.add('handoff');document.body.classList.remove('intro-playing');
    const cb=this.onComplete;this.onComplete=null;if(cb)cb({skipped,returnToMenu:this.returnToMenu});
    setTimeout(()=>{if(this.overlay){this.overlay.classList.add('hidden');this.overlay.classList.remove('handoff');}},650);
  }
}
window.IntroCutscene=IntroCutscene;
window.IRON_WASTES_INTRO_SCRIPT = [
  {time:1.0,text:'Когда-то эти рельсы соединяли весь край.',audio:null},
  {time:8.0,text:'Наши машины строили города, добывали уголь и охраняли дороги.',audio:null},
  {time:15.0,text:'Потом мы построили Сердце.',audio:null},
  {time:24.0,text:'В ночь первого запуска небо стало красным.',audio:null},
  {time:28.0,text:'Связь исчезла.',audio:null},
  {time:33.0,text:'А машины получили новый приказ.',audio:null},
  {time:38.0,text:'Красная ночь изменила не только машины.',audio:null},
  {time:43.0,text:'Те, кто выжил, спрятались у железной дороги.',audio:null},
  {time:49.0,text:'Так появились Порты.',audio:null},
  {time:53.0,text:'Железная дорога стала морем, а Порты — островами безопасности.',audio:null},
  {time:57.0,text:'Мы думали, что самое страшное осталось позади.',audio:null},
  {time:63.0,text:'Но несколько недель назад Восток снова заговорил.',audio:null},
  {time:66.0,text:'Сердце работает.',audio:null},
  {time:69.0,text:'После этого автоматы начали просыпаться.',audio:null},
  {time:73.0,text:'До источника сигнала — сорок километров.',audio:null},
  {time:76.0,text:'Последняя экспедиция ушла туда двенадцать дней назад.',audio:null},
  {time:79.0,text:'Она не вернулась.',audio:null},
  {time:81.0,text:'Теперь очередь твоя.',audio:null},
];
