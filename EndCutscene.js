class EndCutscene {
  constructor({scene,camera,renderer,train,enemies,cinematicAssets=null}={}){
    this.scene=scene;this.camera=camera;this.renderer=renderer;this.train=train;this.enemies=enemies;this.assets=cinematicAssets;
    this.active=false;this.time=0;this.duration=52;this.onComplete=null;this.skipHeld=false;this.skipHold=0;this.skipRequired=.8;this.audio=null;this.root=null;this.gates=[];this.wakeLights=[];this.observers=[];this.savedCamera=null;this.rewardSafe=false;this.flickerAlly=null;
    this._vA=new THREE.Vector3();this._vB=new THREE.Vector3();this._vC=new THREE.Vector3();this._observerTarget=new THREE.Vector3();this._lastSubtitle='';this._titleShown=false;this._lastFade=-1;
    this.overlay=document.getElementById('endCutscene');this.fadeEl=document.getElementById('endFade');this.subtitleEl=document.getElementById('endSubtitle');this.titleEl=document.getElementById('endTitle');this.skipProgress=document.getElementById('endSkipProgress');
    this._down=e=>{if(this.active&&e.code==='Space'){e.preventDefault();this.skipHeld=true;}};
    this._up=e=>{if(this.active&&e.code==='Space'){e.preventDefault();this.skipHeld=false;this.skipHold=0;this.updateSkipUI();}};
    window.addEventListener('keydown',this._down);window.addEventListener('keyup',this._up);
  }
  mat(color,rough=.78,metal=.6,emissive=0,ei=0){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal,emissive,emissiveIntensity:ei});}
  box(parent,mat,x,y,z,sx,sy,sz){const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;}
  cyl(parent,mat,x,y,z,r,h,n=10){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,n),mat);m.position.set(x,y,z);parent.add(m);return m;}
  build(){
    if(this.root)return;
    const z0=this.train?.group?.position?.z||4000,M=this.assets?.materials||{};
    const iron=M.darkIron||this.mat(0x252b2d,.72,.84),rust=M.rust||this.mat(0x654035,.88,.62),brass=M.brass||this.mat(0x9b743b,.45,.88);
    this.root=new THREE.Group();this.root.visible=false;this.scene.add(this.root);
    // Gate frame and two heavy leaves.
    for(const x of [-8.2,8.2]){this.box(this.root,iron,x,6,z0+20,2.2,12,2.0);this.cyl(this.root,rust,x,13,z0+20,.72,8,12);}
    const top=this.box(this.root,iron,0,12.2,z0+20,18.5,1.4,2.2);top.userData.cinematicGateTop=true;
    for(const side of [-1,1]){
      const leaf=new THREE.Group();leaf.position.set(side*4.15,0,z0+19.1);this.root.add(leaf);this.box(leaf,rust,0,5.2,0,7.7,10.4,.58);
      for(let y=1.2;y<10;y+=1.75)this.box(leaf,brass,0,y,side*.33,7.2,.12,.12);
      for(let x=-3;x<=3;x+=1.5)this.cyl(leaf,iron,x,5.2,side*.35,.06,9.6,6);
      leaf.userData.closedX=side*4.15;leaf.userData.openX=side*10.5;this.gates.push(leaf);
    }
    // Corridor, pipes and distant Heart glow only — no full reveal.
    for(const x of [-12,-7,7,12]){this.cyl(this.root,iron,x,10,z0+43,.7,22,12);this.box(this.root,rust,x,5,z0+45,3.8,9,4.5);}
    for(const x of [-10,-5,0,5,10]){const lampMat=this.mat(0x4a3025,.4,.35,0xff4f21,.05);const lamp=new THREE.Mesh(new THREE.SphereGeometry(.18,8,6),lampMat);lamp.position.set(x,5.2,z0+29);this.root.add(lamp);this.wakeLights.push(lampMat);}
    const heartGlowMat=new THREE.MeshBasicMaterial({color:0xff5428,transparent:true,opacity:.0,depthWrite:false,blending:THREE.AdditiveBlending});
    this.heartGlow=new THREE.Mesh(new THREE.SphereGeometry(5.2,16,10),heartGlowMat);this.heartGlow.position.set(0,8,z0+68);this.heartGlow.scale.set(1,1.55,.55);this.root.add(this.heartGlow);
    // Visual-only observers built from the same enemy model builders.
    const obs=[['walker',-7,z0+33,.82],['walker',7,z0+35,.82],['brute',11,z0+42,.70],['gunner',-10,z0+45,.76]];
    for(const [type,x,z,s] of obs){const e=this.assets?.createEnemyVisual(this.root,type,{x,z,scale:s,eye:true});if(e){e.group.userData.baseRotY=e.group.rotation.y;this.observers.push(e);}}
    this.coldFill=new THREE.HemisphereLight(0x6f879b,0x191514,.28);this.root.add(this.coldFill);
    this.gateLight=new THREE.SpotLight(0xa9c8d8,0,70,.45,.7,1.3);this.gateLight.position.set(0,13,z0+12);this.gateTarget=new THREE.Object3D();this.gateTarget.position.set(0,2,z0+38);this.root.add(this.gateLight,this.gateTarget);this.gateLight.target=this.gateTarget;
  }
  play({playerClass=null,onComplete=null}={}){
    if(this.active)return;this.build();this.active=true;this.time=0;this.onComplete=onComplete;this.skipHeld=false;this.skipHold=0;this.playerClass=playerClass;this.root.visible=true;this._lastSubtitle='';this._titleShown=false;this._lastFade=-1;this.savedCamera={fov:this.camera.fov,position:this.camera.position.clone(),quaternion:this.camera.quaternion.clone()};
    this.camera.fov=58;this.camera.updateProjectionMatrix();if(this.overlay){this.overlay.classList.remove('hidden');this.overlay.classList.remove('handoff');}if(this.fadeEl){this.fadeEl.style.opacity='0';this.fadeEl.style.background='#000';}if(this.titleEl)this.titleEl.classList.remove('visible');document.body.classList.add('end-playing');this.updateSkipUI();this.startAudio();
    for(const g of this.gates)g.position.x=g.userData.closedX;for(const m of this.wakeLights)m.emissiveIntensity=.03;this.heartGlow.material.opacity=0;this.gateLight.intensity=0;
  }
  updateSkipUI(){if(this.skipProgress)this.skipProgress.style.setProperty('--skip-progress',`${THREE.MathUtils.clamp(this.skipHold/this.skipRequired,0,1)*100}%`);}
  subtitle(){const t=this.time;if(t<5)return '';if(t<11)return 'СЕРДЦЕ РАБОТАЕТ.';if(t<17)return 'СЕРДЦЕ РАБОТАЕТ.';if(t<34)return '';if(t<42)return 'ОЖИДАЕТСЯ МАШИНИСТ.';if(t<47)return 'КАНАЛ ОТКРЫТ.';return '';}
  startAudio(){
    try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;const ctx=new Ctx(),master=ctx.createGain();master.gain.value=.12;master.connect(ctx.destination);const drone=ctx.createOscillator(),g=ctx.createGain();drone.type='sine';drone.frequency.value=42;g.gain.value=.022;drone.connect(g).connect(master);drone.start();this.audio={ctx,master,drone,lastThump:-1};}catch(_){this.audio=null;}
  }
  cueThump(){if(!this.audio)return;try{const {ctx,master}=this.audio,now=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(52,now);o.frequency.exponentialRampToValueAtTime(31,now+.34);g.gain.setValueAtTime(.055,now);g.gain.exponentialRampToValueAtTime(.001,now+.42);o.connect(g).connect(master);o.start();o.stop(now+.45);}catch(_){}}
  stopAudio(){if(!this.audio)return;try{this.audio.master.gain.setTargetAtTime(.0001,this.audio.ctx.currentTime,.12);setTimeout(()=>{try{this.audio.ctx.close();}catch(_){ }},300);}catch(_){ }this.audio=null;}
  update(dt){
    if(!this.active)return;dt=Math.min(.05,Math.max(0,dt||0));this.time+=dt;
    if(this.skipHeld){this.skipHold+=dt;this.updateSkipUI();if(this.skipHold>=this.skipRequired){this.finish(true);return;}}
    const z0=this.train.group.position.z;
    // Cab approach: player train remains physically present in the world.
    if(this.time<10){const p=this.time/10;const pos=this.train.group.localToWorld(this._vA.set(0,3.82,-3.4));this.camera.position.copy(pos);const look=this.train.group.localToWorld(this._vB.set(0,3.0,25+8*p));this.camera.lookAt(look);}
    else if(this.time<24){const p=(this.time-10)/14,e=p*p*(3-2*p);const a=this.train.group.localToWorld(this._vA.set(-9,3.0,4)),b=this.train.group.localToWorld(this._vB.set(11,8,20));this.camera.position.lerpVectors(a,b,e*.42);this.camera.lookAt(this.train.group.localToWorld(this._vC.set(0,6,25)));}
    else if(this.time<38){const p=(this.time-24)/14,e=p*p*(3-2*p);const a=this._vA.set(-25,8,z0+5),b=this._vB.set(27,16,z0+20);this.camera.position.lerpVectors(a,b,e);this.camera.lookAt(this._vC.set(0,6,z0+31));}
    else {const p=THREE.MathUtils.clamp((this.time-38)/14,0,1),e=p*p*(3-2*p);const a=this._vA.set(18,9,z0+2),b=this._vB.set(0,27,z0-22);this.camera.position.lerpVectors(a,b,e);this.camera.lookAt(this._vC.set(0,6,z0+35));}
    const wake=THREE.MathUtils.smoothstep(this.time,8,24);this.gateLight.intensity=16*wake;
    for(let i=0;i<this.wakeLights.length;i++){const local=THREE.MathUtils.smoothstep(this.time,10+i*1.25,12+i*1.25);this.wakeLights[i].emissiveIntensity=.03+2.2*local;}
    const gateP=THREE.MathUtils.smoothstep(this.time,16,28);for(const g of this.gates)g.position.x=THREE.MathUtils.lerp(g.userData.closedX,g.userData.openX,gateP);
    const heart=THREE.MathUtils.smoothstep(this.time,18,28);this.heartGlow.material.opacity=(.03+.22*Math.sin(this.time*1.55)**2)*heart;
    const thumpIndex=Math.floor((this.time-20)/2.55);if(this.time>20&&this.time<45&&thumpIndex>=0&&thumpIndex!==this.audio?.lastThump){if(this.audio)this.audio.lastThump=thumpIndex;this.cueThump();}
    if(this.time>29){const target=this._observerTarget.set(0,2.5,z0+4);for(const e of this.observers)e.group.lookAt(target.x,e.group.position.y+1.2,target.z);}
    if(this.playerClass?.specialAbility==='robototechnician'&&this.time>35&&this.time<37){const ally=this.enemies?.allyEnemies?.()[0];if(ally?.allyIndicator?.material){this.flickerAlly=ally;ally.allyIndicator.material.color.setHex(Math.sin(this.time*24)>0?0xff342a:0x63c7c1);}}else if(this.flickerAlly?.allyIndicator?.material){this.flickerAlly.allyIndicator.material.color.setHex(0x63c7c1);}
    if(this.time>44&&this.time<49)this.train.group.position.z+=dt*.23;
    const subtitle=this.subtitle();if(this.subtitleEl&&subtitle!==this._lastSubtitle){this.subtitleEl.textContent=subtitle;this._lastSubtitle=subtitle;}
    const fade=this.time>47?THREE.MathUtils.smoothstep(this.time,47,50):0;if(this.fadeEl&&Math.abs(fade-this._lastFade)>.004){this.fadeEl.style.opacity=String(fade);this._lastFade=fade;}
    const showTitle=this.time>49.1;if(this.titleEl&&showTitle!==this._titleShown){this._titleShown=showTitle;this.titleEl.classList.toggle('visible',showTitle);this.titleEl.innerHTML=showTitle?'IRON WASTES<small>ГЛАВА I · ДОРОГА НА ВОСТО</small><em>ЭКСПЕДИЦИЯ ПРОДОЛЖИТСЯ.</em>':'';}
    this.assets?.animate?.(this.root,dt,this.time);
    if(this.time>=this.duration)this.finish(false);
  }
  finish(skipped=false){
    if(!this.active)return;this.active=false;this.skipHeld=false;this.skipHold=0;this.updateSkipUI();this.stopAudio();document.body.classList.remove('end-playing');if(this.flickerAlly?.allyIndicator?.material)this.flickerAlly.allyIndicator.material.color.setHex(0x63c7c1);this.flickerAlly=null;
    if(this.root)this.root.visible=false;if(this.subtitleEl)this.subtitleEl.textContent='';if(this.overlay)this.overlay.classList.add('handoff');
    const cb=this.onComplete;this.onComplete=null;if(cb)cb({skipped});
    setTimeout(()=>{if(this.overlay){this.overlay.classList.add('hidden');this.overlay.classList.remove('handoff');}},500);
  }
}
window.EndCutscene=EndCutscene;
