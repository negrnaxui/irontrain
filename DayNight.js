class DayNightCycle {
  constructor(scene, renderer, camera, hemisphereLight, weather=null) {
    this.scene=scene; this.renderer=renderer; this.camera=camera; this.hemi=hemisphereLight; this.weather=weather;
    this.durations={DAY:255,SUNSET:75,NIGHT:300,SUNRISE:75};
    this.totalDuration=705;
    this.time=220;
    this.clockBaseHour=9.845;
    this.phase='DAY'; this.previousPhase='DAY'; this.phaseProgress=0;
    this.nightFactor=0; this.sunsetFactor=0; this.nightWarningTimer=0;
    this.cloudCoverage=.46; this.fogDensity=.0092; this.exposure=.93;
    this.cloudShadow=.02; this.sunOcclusion=0; this.moonOcclusion=0; this.extraExposureInfluence=0;
    this.lamps=[];
    this.tmpFocus=new THREE.Vector3(); this.tmpShadowFocus=new THREE.Vector3(); this.tmpLampPos=new THREE.Vector3();
    this._sunDir=new THREE.Vector3();this._moonDir=new THREE.Vector3();this._lightDir=new THREE.Vector3();this._fillDir=new THREE.Vector3();
    this._keyLift=new THREE.Vector3(0,16,0);this._fillLift=new THREE.Vector3(0,8,0);this._fallbackWind=new THREE.Vector2(1,.2);
    this._nearbyStrengths=[];this._bulbMaterials=new Set();this._lastVignette='';
    this._colorPool=Array.from({length:32},()=>new THREE.Color());this._colorPoolIndex=0;this._colorScratch=new THREE.Color();
    this._debugInfo={phase:'DAY',exposure:this.exposure,fogDensity:this.fogDensity,cloudCoverage:this.cloudCoverage,weather:'NORMAL',shadowMapSize:0,shadowTier:'LOW',visibleLights:0,registeredLights:0};this.lightDistanceScale=1;
    this.buildSky(); this.buildClouds(); this.buildCelestials(); this.buildKeyLight();
  }

  seeded(seed){let s=seed>>>0;return()=>((s=(s*1664525+1013904223)>>>0)/4294967296);}
  smooth(t){return t*t*(3-2*t);}
  nextColor(hex=0){const c=this._colorPool[this._colorPoolIndex++%this._colorPool.length];return c.setHex(hex);}
  blendColors(a,b,t){const c=this.nextColor(a);this._colorScratch.setHex(b);return c.lerp(this._colorScratch,this.smooth(t));}

  buildSky(){
    this.skyUniforms={
      topColor:{value:new THREE.Color(0x5f7180)}, horizonColor:{value:new THREE.Color(0xa6a49b)}, bottomColor:{value:new THREE.Color(0x535550)},
      haze:{value:.58}, skyTime:{value:0}, weatherMix:{value:0}, weatherFlash:{value:0}
    };
    const mat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:this.skyUniforms,
      vertexShader:`varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`
        varying vec3 vPos; uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 bottomColor; uniform float haze; uniform float skyTime; uniform float weatherMix; uniform float weatherFlash;
        float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
        float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
        void main(){
          vec3 dir=normalize(vPos); float h=dir.y;
          float upper=smoothstep(-.05,.76,h), lower=smoothstep(-.66,.02,h);
          vec3 low=mix(bottomColor,horizonColor,lower); vec3 c=mix(low,topColor,upper);
          float band=exp(-abs(h)*4.4)*haze; c=mix(c,horizonColor,band*.33);
          float ang=atan(dir.z,dir.x); float n=noise2(vec2(ang*2.25+h*.7,h*6.2+skyTime*.002));
          float industrial=exp(-abs(h)*8.0)*(noise2(vec2(ang*5.1,skyTime*.0006))-.35);
          c += (n-.5)*(.020+.010*weatherMix); c -= vec3(.018,.014,.010)*max(0.0,industrial)*weatherMix;
          float horizonFlash=exp(-abs(h)*3.4)*weatherFlash; c += vec3(.16,.21,.28)*horizonFlash;
          gl_FragColor=vec4(max(c,vec3(0.0)),1.0);
        }`});
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(480,28,16),mat);this.sky.frustumCulled=false;this.sky.renderOrder=-30;this.scene.add(this.sky);

    const count=520,pos=new Float32Array(count*3),rnd=this.seeded(912345);
    for(let i=0;i<count;i++){const theta=rnd()*Math.PI*2,y=.08+rnd()*.88,r=Math.sqrt(Math.max(0,1-y*y));pos[i*3]=Math.cos(theta)*r*410;pos[i*3+1]=y*410;pos[i*3+2]=Math.sin(theta)*r*410;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    this.starMaterial=new THREE.PointsMaterial({color:0xd9e6ef,size:1.05,sizeAttenuation:true,transparent:true,opacity:0,depthWrite:false,depthTest:true,fog:false});
    this.stars=new THREE.Points(geo,this.starMaterial);this.stars.renderOrder=-15;this.scene.add(this.stars);
  }

  createCloudTexture(seed,density=.7){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=192;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);const rnd=this.seeded(seed);
    const masses=42+Math.floor(density*30);
    for(let i=0;i<masses;i++){
      const x=rnd()*canvas.width,y=18+rnd()*124,rx=22+rnd()*70,ry=8+rnd()*28,a=.025+rnd()*(.08*density+.025);
      const g=ctx.createRadialGradient(x,y,0,x,y,rx);g.addColorStop(0,`rgba(255,255,255,${a})`);g.addColorStop(.48,`rgba(238,240,240,${a*.82})`);g.addColorStop(.78,`rgba(200,206,207,${a*.38})`);g.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=g;ctx.save();ctx.translate(x,y);ctx.scale(1,ry/rx);ctx.beginPath();ctx.arc(0,0,rx,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    ctx.globalCompositeOperation='destination-out';
    for(let i=0;i<16;i++){const x=rnd()*canvas.width,y=20+rnd()*120,r=10+rnd()*24,g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(0,0,0,.20)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
    ctx.globalCompositeOperation='source-over';
    const tex=new THREE.CanvasTexture(canvas);tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;tex.encoding=THREE.sRGBEncoding;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;return tex;
  }

  buildClouds(){
    this.cloudTextures=[this.createCloudTexture(518271,.78),this.createCloudTexture(771023,.63),this.createCloudTexture(331907,.49)];
    this.cloudMaterials=[];this.cloudPatches=[];
    const layers=[
      {name:'LOW',height:55,speed:.72,count:5,size:[360,160],opacity:.34,tint:.78,thickness:1.55},
      {name:'MID',height:78,speed:.43,count:5,size:[455,185],opacity:.27,tint:.93,thickness:1.05},
      {name:'HIGH',height:109,speed:.22,count:4,size:[520,170],opacity:.17,tint:1.08,thickness:.55}
    ];
    const baseGeo=new THREE.PlaneGeometry(1,1),rnd=this.seeded(78041);
    layers.forEach((layer,li)=>{
      const mats=this.cloudTextures.map(tex=>new THREE.MeshBasicMaterial({map:tex,color:0x879099,transparent:true,opacity:layer.opacity,depthWrite:false,depthTest:true,side:THREE.DoubleSide,fog:false}));
      const unders=this.cloudTextures.map(tex=>new THREE.MeshBasicMaterial({map:tex,color:0x4b535b,transparent:true,opacity:layer.opacity*.45,depthWrite:false,depthTest:true,side:THREE.DoubleSide,fog:false}));
      this.cloudMaterials.push({layer,materials:mats,unders});
      for(let i=0;i<layer.count;i++){
        const group=new THREE.Group();group.renderOrder=-10;group.frustumCulled=false;
        const w=layer.size[0]*(.82+rnd()*.38),d=layer.size[1]*(.80+rnd()*.42),idx=(i+li)%mats.length;
        const top=new THREE.Mesh(baseGeo,mats[idx]);top.scale.set(w,d,1);top.rotation.x=-Math.PI/2+(rnd()-.5)*.028;top.rotation.z=(rnd()-.5)*.20;top.renderOrder=-10;top.frustumCulled=false;group.add(top);
        const under=new THREE.Mesh(baseGeo,unders[(idx+1)%unders.length]);under.scale.set(w*.88,d*.84,1);under.rotation.x=-Math.PI/2+(rnd()-.5)*.04;under.rotation.z=top.rotation.z+.08;under.position.set(w*.035,-layer.thickness,0);under.renderOrder=-9.98;under.frustumCulled=false;group.add(under);
        const skirt=new THREE.Mesh(baseGeo,mats[(idx+2)%mats.length]);skirt.scale.set(w*.68,d*.54,1);skirt.rotation.x=-Math.PI/2+.075+(rnd()-.5)*.04;skirt.rotation.z=top.rotation.z-.11;skirt.position.set(-w*.09,-layer.thickness*.42,d*.05);skirt.renderOrder=-9.96;skirt.frustumCulled=false;group.add(skirt);
        group.userData={layer:li,baseX:-330+rnd()*660,baseZ:-285+rnd()*570,height:layer.height,speed:layer.speed,phase:rnd()*100,width:w,depth:d};
        this.scene.add(group);this.cloudPatches.push(group);
      }
    });
  }

  celestialOcclusion(direction,salt=0){
    // Approximate cloud density along the actual visible cloud patches instead of an
    // unrelated sine wave. This keeps Sun/Moon dimming visually tied to the sky.
    if(direction.y<=.025||!this.cloudPatches?.length)return 0;
    let density=0;
    for(const patch of this.cloudPatches){
      const u=patch.userData||{};
      const layerHeight=(this.camera.position.y+(u.height||70));
      const t=(layerHeight-this.camera.position.y)/Math.max(.025,direction.y);
      if(t<=0||t>1000)continue;
      const px=this.camera.position.x+direction.x*t;
      const pz=this.camera.position.z+direction.z*t;
      const dx=(px-patch.position.x)/Math.max(1,(u.width||320)*.48);
      const dz=(pz-patch.position.z)/Math.max(1,(u.depth||160)*.48);
      const r2=dx*dx+dz*dz;
      if(r2>=1.35)continue;
      const layerWeight=u.layer===0?1.0:(u.layer===1?.78:.48);
      const local=Math.pow(Math.max(0,1-r2/1.35),1.55)*layerWeight;
      density=Math.max(density,local);
    }
    // Coverage still controls how opaque a matching patch feels, but cannot dim a
    // celestial body when the visible direction is clear.
    return THREE.MathUtils.clamp(density*THREE.MathUtils.lerp(.42,.96,this.cloudCoverage)+salt*.0,0,.96);
  }

  buildCelestials(){
    this.sun=new THREE.Mesh(new THREE.SphereGeometry(8,18,12),new THREE.MeshBasicMaterial({color:0xffd8a2,transparent:true,opacity:.8,depthTest:true,depthWrite:false,fog:false}));
    this.moon=new THREE.Mesh(new THREE.SphereGeometry(6,18,12),new THREE.MeshBasicMaterial({color:0xcdd9e2,transparent:true,opacity:0,depthTest:true,depthWrite:false,fog:false}));
    this.sun.renderOrder=this.moon.renderOrder=-14;this.scene.add(this.sun,this.moon);
    this.sunGlow=new THREE.Mesh(new THREE.SphereGeometry(11.5,14,10),new THREE.MeshBasicMaterial({color:0xffbd73,transparent:true,opacity:.06,depthTest:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));
    this.moonGlow=new THREE.Mesh(new THREE.SphereGeometry(8.6,14,10),new THREE.MeshBasicMaterial({color:0xa9c4e4,transparent:true,opacity:0,depthTest:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));
    this.sunGlow.renderOrder=this.moonGlow.renderOrder=-9;this.scene.add(this.sunGlow,this.moonGlow);
  }

  buildKeyLight(){
    this.keyLight=new THREE.DirectionalLight(0xffd0a0,2.3);this.keyLight.castShadow=true;
    const maxTex=this.renderer?.capabilities?.maxTextureSize||2048;
    const viewportWidth=(typeof innerWidth==='undefined'?1280:innerWidth);
    const desktop=viewportWidth>=980;
    const memory=(typeof navigator!=='undefined'&&Number.isFinite(navigator.deviceMemory))?navigator.deviceMemory:4;
    const dpr=(typeof devicePixelRatio!=='undefined'?devicePixelRatio:1);
    let tier='LOW',shadowSize=1024,headlightShadow=false;
    if(desktop&&maxTex>=4096){tier='MEDIUM';shadowSize=2048;}
    // AUTO deliberately caps the main shadow atlas at 2048. With the tight moving frustum
    // it looks close to the old 4096 mode but costs a fraction of the GPU time. Ultra can
    // still be explicitly requested for screenshots via ?iwUltra=1.
    const ultraRequested=typeof location!=='undefined'&&/iwUltra=1/.test(location.search||'');
    if(desktop&&viewportWidth>=1500&&maxTex>=8192&&memory>=8&&dpr<=1.75){tier='HIGH';shadowSize=2048;headlightShadow=false;}
    if(ultraRequested&&desktop&&maxTex>=8192){tier='ULTRA';shadowSize=4096;headlightShadow=true;}
    this.lightingQuality={tier,shadowSize,headlightShadow};
    this.shadowMapSize=shadowSize;this.keyLight.shadow.mapSize.set(shadowSize,shadowSize);
    this.shadowRadius=28;this.motionSpeed=0;
    this.keyLight.shadow.camera.left=-this.shadowRadius;this.keyLight.shadow.camera.right=this.shadowRadius;this.keyLight.shadow.camera.top=this.shadowRadius;this.keyLight.shadow.camera.bottom=-this.shadowRadius;
    this.keyLight.shadow.camera.near=1;this.keyLight.shadow.camera.far=118;
    this.keyLight.shadow.bias=-.00012;this.keyLight.shadow.normalBias=.022;
    this.keyTarget=new THREE.Object3D();this.scene.add(this.keyLight,this.keyTarget);this.keyLight.target=this.keyTarget;

    // A very weak no-shadow fill makes metal readable on the side opposite the key light.
    this.fillLight=new THREE.DirectionalLight(0x738ca5,.16);this.fillLight.castShadow=false;
    this.fillTarget=new THREE.Object3D();this.scene.add(this.fillLight,this.fillTarget);this.fillLight.target=this.fillTarget;
  }

  setPerformanceQuality(tier='MEDIUM'){
    this.performanceQuality=tier;this.lightDistanceScale=tier==='LOW'?.76:(tier==='MEDIUM'?.90:1);
    if(this.cloudPatches)for(const p of this.cloudPatches)p.visible=!(tier==='LOW'&&p.userData?.layer===2);
    if(!this.keyLight?.shadow)return;
    const base=this.lightingQuality?.shadowSize||1024;
    const desired=tier==='LOW'?Math.min(1024,base):(tier==='MEDIUM'?Math.min(2048,base):base);
    if(desired===this.shadowMapSize)return;
    this.shadowMapSize=desired;
    this.keyLight.shadow.mapSize.set(desired,desired);
    if(this.keyLight.shadow.map){this.keyLight.shadow.map.dispose?.();this.keyLight.shadow.map=null;}
    if(this.renderer?.shadowMap)this.renderer.shadowMap.needsUpdate=true;
  }

  registerLamp(light,bulbMaterial=null,options={}){
    if(!light)return;
    this.lamps.push({light,bulbMaterial,day:options.day??.08,night:options.night??light.intensity??2,flicker:options.flicker??.07,seed:options.seed??Math.random()*20,fadeStart:options.fadeStart??70,maxDistance:options.maxDistance??110});
  }

  setMotionSpeed(speed=0){this.motionSpeed=Math.max(0,Number(speed)||0);}
  setExposureInfluence(value=0){this.extraExposureInfluence=THREE.MathUtils.clamp(Number(value)||0,0,8);}

  getPhaseAt(t){const x=((t%this.totalDuration)+this.totalDuration)%this.totalDuration;let c=0;for(const phase of ['DAY','SUNSET','NIGHT','SUNRISE']){const d=this.durations[phase];if(x<c+d)return{phase,progress:(x-c)/d,cycleTime:x};c+=d;}return{phase:'DAY',progress:0,cycleTime:0};}

  update(dt,focusPosition){
    this._colorPoolIndex=0;
    this.time=(this.time+dt)%this.totalDuration;const info=this.getPhaseAt(this.time);this.previousPhase=this.phase;this.phase=info.phase;this.phaseProgress=info.progress;
    if(this.phase==='NIGHT'&&this.previousPhase!=='NIGHT')this.nightWarningTimer=5;this.nightWarningTimer=Math.max(0,this.nightWarningTimer-dt);

    let top,horizon,bottom,fogColor,fogDensity,hemiSky,hemiGround,keyColor,keyIntensity,night,sunset,baseExposure,haze;
    if(this.phase==='DAY'){
      top=this.nextColor(0x617789);horizon=this.nextColor(0xaeb0a8);bottom=this.nextColor(0x4b5352);fogColor=this.nextColor(0x637078);fogDensity=.0092;hemiSky=0x879dab;hemiGround=0x2b241f;keyColor=0xffd2aa;keyIntensity=2.30;night=0;sunset=0;baseExposure=.96;haze=.55;
    }else if(this.phase==='SUNSET'){
      const t=this.smooth(this.phaseProgress),warm=Math.sin(t*Math.PI);top=this.blendColors(0x617789,0x07111d,t);horizon=this.blendColors(0xaeb0a8,0x1b2a38,t).lerp(this.nextColor(0xc97849),warm*.78);bottom=this.blendColors(0x4b5352,0x11191d,t);fogColor=this.blendColors(0x637078,0x17232d,t).lerp(this.nextColor(0x725041),warm*.30);fogDensity=THREE.MathUtils.lerp(.0092,.0152,t);hemiSky=this.blendColors(0x879dab,0x1c3349,t);hemiGround=this.blendColors(0x2b241f,0x0a0d0e,t);keyColor=this.blendColors(0xffd2aa,0x8eacd0,t).lerp(this.nextColor(0xf19a5d),warm*.62);keyIntensity=THREE.MathUtils.lerp(2.30,.60,t);night=t;sunset=warm;baseExposure=.95;haze=.62+warm*.12;
    }else if(this.phase==='NIGHT'){
      top=this.nextColor(0x07111d);horizon=this.nextColor(0x1a2938);bottom=this.nextColor(0x10181d);fogColor=this.nextColor(0x17232d);fogDensity=.0152;hemiSky=0x1c3349;hemiGround=0x0a0d0e;keyColor=0x88a8ce;keyIntensity=.60;night=1;sunset=0;baseExposure=.84;haze=.48;
    }else{
      const t=this.smooth(this.phaseProgress);top=this.blendColors(0x07111d,0x617789,t);horizon=this.blendColors(0x1a2938,0xb5aa91,t).lerp(this.nextColor(0xb8955c),Math.sin(t*Math.PI)*.35);bottom=this.blendColors(0x10181d,0x4b5352,t);fogColor=this.blendColors(0x17232d,0x69726f,t);fogDensity=THREE.MathUtils.lerp(.0152,.0092,t);hemiSky=this.blendColors(0x1c3349,0x879dab,t);hemiGround=this.blendColors(0x0a0d0e,0x2b241f,t);keyColor=this.blendColors(0x88a8ce,0xffd2aa,t);keyIntensity=THREE.MathUtils.lerp(.60,2.30,t);night=1-t;sunset=1-t;baseExposure=THREE.MathUtils.lerp(.86,.96,t);haze=THREE.MathUtils.lerp(.50,.60,t);
    }

    const wp=this.weather?.current||{cloudCoverage:.46,fogMultiplier:1,directMultiplier:1,exposureMultiplier:1,ash:.1};
    const region=this.weather?.region||{fogMultiplier:1};
    const coverage=THREE.MathUtils.clamp(this.weather?.cloudCoverage??wp.cloudCoverage??.46,.22,.90);this.cloudCoverage=THREE.MathUtils.lerp(this.cloudCoverage,coverage,1-Math.exp(-dt*.10));
    fogDensity*= (wp.fogMultiplier||1)*(region.fogMultiplier||1);fogDensity=Math.min(.0178,fogDensity);this.fogDensity=fogDensity;
    keyIntensity*= (wp.directMultiplier||1)*(1-this.cloudCoverage*.065);
    const weatherMix=THREE.MathUtils.clamp((this.cloudCoverage-.28)/.58,0,1);
    const ashMix=THREE.MathUtils.clamp((wp.ash||0)*.52,0,.48);
    if(ashMix>0){top.lerp(this.nextColor(0x59605f),ashMix*.34);horizon.lerp(this.nextColor(0x756c60),ashMix*.26);fogColor.lerp(this.nextColor(0x5f5c55),ashMix*.22);}
    haze*=THREE.MathUtils.lerp(1,1.18,weatherMix);

    this.nightFactor=night;this.sunsetFactor=sunset;
    if(typeof document!=='undefined'){const vignette=(0.285+night*.135+weatherMix*.018).toFixed(3);if(vignette!==this._lastVignette){document.documentElement.style.setProperty('--iw-vignette',vignette);this._lastVignette=vignette;}}
    this.skyUniforms.topColor.value.copy(top);this.skyUniforms.horizonColor.value.copy(horizon);this.skyUniforms.bottomColor.value.copy(bottom);this.skyUniforms.haze.value=haze;this.skyUniforms.skyTime.value=this.time;this.skyUniforms.weatherMix.value=weatherMix;this.skyUniforms.weatherFlash.value=this.weather?.flash||0;
    this.scene.fog.color.copy(fogColor);this.scene.fog.density=fogDensity;
    this.hemi.color.set(hemiSky);this.hemi.groundColor.set(hemiGround);this.hemi.intensity=THREE.MathUtils.lerp(1.02,.34,night)*THREE.MathUtils.lerp(1,.92,weatherMix);
    // Actual cloud-shadow feel is updated after celestial directions are known below.
    this.keyLight.color.set(keyColor);

    const cloudOcclusion=THREE.MathUtils.clamp((this.cloudCoverage-.26)/.64,0,1);
    this.starMaterial.opacity=THREE.MathUtils.smoothstep(night,.35,.9)*.92*(1-cloudOcclusion*.88);
    const focus=this.tmpFocus.copy(focusPosition||this.camera.position);this.sky.position.copy(this.camera.position);this.stars.position.copy(this.camera.position);

    const cloudTopBase=this.blendColors(0x8b949c,0x303b48,night).lerp(this.nextColor(0x98634b),sunset*.18);
    const cloudUnderBase=this.blendColors(0x6f7982,0x222d39,night).lerp(this.nextColor(0xb26948),sunset*.62);
    const lightningFlash=this.weather?.flash||0;
    if(lightningFlash>0){cloudTopBase.lerp(this.nextColor(0xb9d0e4),lightningFlash*.22);cloudUnderBase.lerp(this.nextColor(0x9eb8d2),lightningFlash*.30);}
    const wind=this.weather?.windDirection||this._fallbackWind,windSpeed=this.weather?.windSpeed||.35;
    for(const entry of this.cloudMaterials){
      const li=entry.layer.name==='LOW'?0:(entry.layer.name==='MID'?1:2), tint=entry.layer.tint;
      const layerCoverage=THREE.MathUtils.lerp(.46,1.28,this.cloudCoverage);
      for(const mat of entry.materials){mat.color.copy(cloudTopBase).multiplyScalar(tint);mat.opacity=entry.layer.opacity*layerCoverage*(li===0?1.08:(li===2?.72:1));}
      for(const mat of entry.unders){mat.color.copy(cloudUnderBase).multiplyScalar(Math.max(.43,tint*.68));mat.opacity=entry.layer.opacity*layerCoverage*(li===0?.55:.40);}
    }
    for(const c of this.cloudPatches){const u=c.userData,travel=this.time*u.speed*(.72+windSpeed*.62),range=760;const dx=((u.baseX+travel*wind.x+range*.5)%range+range)%range-range*.5;const dz=((u.baseZ+travel*wind.y+range*.5)%range+range)%range-range*.5;c.position.set(this.camera.position.x+dx,this.camera.position.y+u.height,this.camera.position.z+dz);}

    let sunAngle,moonAngle;
    if(this.phase==='DAY'){sunAngle=THREE.MathUtils.lerp(Math.PI*.18,Math.PI*.80,this.smooth(this.phaseProgress));moonAngle=Math.PI*.15;}
    else if(this.phase==='SUNSET'){sunAngle=THREE.MathUtils.lerp(Math.PI*.80,Math.PI*1.02,this.smooth(this.phaseProgress));moonAngle=THREE.MathUtils.lerp(Math.PI*.08,Math.PI*.20,this.smooth(this.phaseProgress));}
    else if(this.phase==='NIGHT'){sunAngle=Math.PI*1.08;moonAngle=THREE.MathUtils.lerp(Math.PI*.16,Math.PI*.84,this.smooth(this.phaseProgress));}
    else{sunAngle=THREE.MathUtils.lerp(-Math.PI*.03,Math.PI*.18,this.smooth(this.phaseProgress));moonAngle=THREE.MathUtils.lerp(Math.PI*.84,Math.PI*1.02,this.smooth(this.phaseProgress));}
    const sunDir=this._sunDir.set(Math.cos(sunAngle)*.68,Math.sin(sunAngle),-.22).normalize();const moonDir=this._moonDir.set(-Math.cos(moonAngle)*.62,Math.max(.04,Math.sin(moonAngle)),-.42).normalize();
    this.sun.position.copy(this.camera.position).addScaledVector(sunDir,330);this.moon.position.copy(this.camera.position).addScaledVector(moonDir,330);this.sunGlow.position.copy(this.sun.position);this.moonGlow.position.copy(this.moon.position);
    const sunBase=Math.max(0,.90-night*1.42),moonBase=THREE.MathUtils.smoothstep(night,.25,.9)*.90;
    this.sunOcclusion=THREE.MathUtils.lerp(this.sunOcclusion,this.celestialOcclusion(sunDir,.7),1-Math.exp(-dt*.22));
    this.moonOcclusion=THREE.MathUtils.lerp(this.moonOcclusion,this.celestialOcclusion(moonDir,2.4),1-Math.exp(-dt*.18));
    const activeOcclusion=this.phase==='DAY'?this.sunOcclusion:(this.phase==='NIGHT'?this.moonOcclusion:THREE.MathUtils.lerp(this.sunOcclusion,this.moonOcclusion,this.smooth(this.phaseProgress)));
    const cloudShadowTarget=THREE.MathUtils.clamp(activeOcclusion*.075,0,.078);
    this.cloudShadow=THREE.MathUtils.lerp(this.cloudShadow,cloudShadowTarget,1-Math.exp(-dt*.18));
    this.keyLight.intensity=keyIntensity*(1-this.cloudShadow)+(this.weather?.flash||0)*.32;
    this.sun.material.opacity=sunBase*(1-this.sunOcclusion*.88);this.sunGlow.material.opacity=sunBase*(.028+.074*this.sunOcclusion);
    this.moon.material.opacity=moonBase*(1-this.moonOcclusion*.82);this.moonGlow.material.opacity=moonBase*(.022+.060*this.moonOcclusion);

    let lightDir;
    if(this.phase==='DAY')lightDir=sunDir;
    else if(this.phase==='SUNSET')lightDir=this._lightDir.copy(sunDir).lerp(moonDir,this.smooth(this.phaseProgress)).normalize();
    else if(this.phase==='NIGHT')lightDir=moonDir;
    else lightDir=this._lightDir.copy(moonDir).lerp(sunDir,this.smooth(this.phaseProgress)).normalize();
    const shadowFocus=this.tmpShadowFocus.copy(focus);shadowFocus.z+=THREE.MathUtils.clamp(this.motionSpeed*.65,0,8);
    this.keyTarget.position.copy(shadowFocus);this.keyLight.position.copy(shadowFocus).addScaledVector(lightDir,68).add(this._keyLift);this.keyTarget.updateMatrixWorld();

    // Tight dynamic frustum: sharper shadows on foot, slightly more coverage at speed.
    const lowPerf=this.performanceQuality==='LOW';const desiredRadius=lowPerf?THREE.MathUtils.clamp(20+this.motionSpeed*.60,20,29):THREE.MathUtils.clamp(24+this.motionSpeed*.72,24,34);
    this.shadowRadius=THREE.MathUtils.lerp(this.shadowRadius,desiredRadius,1-Math.exp(-dt*1.5));
    const sc=this.keyLight.shadow.camera;sc.left=-this.shadowRadius;sc.right=this.shadowRadius;sc.top=this.shadowRadius;sc.bottom=-this.shadowRadius;sc.updateProjectionMatrix?.();

    // Opposite-side fill remains very weak and never casts shadows.
    const fillDir=this._fillDir.copy(lightDir).multiplyScalar(-1);fillDir.y=Math.max(.28,Math.abs(fillDir.y)*.55);fillDir.normalize();
    this.fillTarget.position.copy(focus);this.fillLight.position.copy(focus).addScaledVector(fillDir,46).add(this._fillLift);
    this.fillLight.color.set(this.phase==='NIGHT'?0x607b9b:(this.phase==='SUNSET'?0x6786a5:0x7792aa));
    this.fillLight.intensity=THREE.MathUtils.lerp(.22,.095,night)*THREE.MathUtils.lerp(1,.9,weatherMix);this.fillTarget.updateMatrixWorld();

    const strengths=this._nearbyStrengths;strengths.length=0;const bulbMaterials=this._bulbMaterials;bulbMaterials.clear();
    for(const l of this.lamps){
      l.light.getWorldPosition(this.tmpLampPos);const dist=this.tmpLampPos.distanceTo(this.camera.position),fadeStart=l.fadeStart*this.lightDistanceScale,maxDistance=l.maxDistance*this.lightDistanceScale;
      const cull=dist<=fadeStart?1:(dist>=maxDistance?0:1-THREE.MathUtils.smoothstep(dist,fadeStart,maxDistance));
      const flicker=1+Math.sin(this.time*17+l.seed)*l.flicker*night+Math.sin(this.time*7.3+l.seed*2)*l.flicker*.4*night;
      const level=THREE.MathUtils.lerp(l.day,l.night,THREE.MathUtils.smoothstep(night,.12,.78));
      l.light.intensity=Math.max(0,level*flicker*cull);l.light.visible=cull>.002;
      if(dist<26&&cull>0)strengths.push(cull*level/(1+dist*.10));
      if(l.bulbMaterial)bulbMaterials.add(l.bulbMaterial);
    }
    // Shared bulb materials are controlled once by time of day, never by one lamp's distance.
    for(const mat of bulbMaterials){
      if(mat?.isMeshStandardMaterial)mat.emissiveIntensity=THREE.MathUtils.lerp(.10,2.35,night);
      else if(mat?.isMeshBasicMaterial)mat.opacity=THREE.MathUtils.lerp(.34,1,night);
    }
    strengths.sort((a,b)=>b-a);const nearbyLight=strengths.slice(0,4).reduce((a,b)=>a+b,0)+this.extraExposureInfluence;
    const targetExposure=THREE.MathUtils.clamp(baseExposure*(wp.exposureMultiplier||1)-night*Math.min(.095,nearbyLight*.012),.76,.99);
    // Eye adaptation: dark->bright is faster; bright->dark is deliberately slower.
    const rate=targetExposure<this.exposure?1.05:.20;this.exposure=THREE.MathUtils.lerp(this.exposure,targetExposure,1-Math.exp(-dt*rate));this.renderer.toneMappingExposure=this.exposure;

    const dbg=this._debugInfo;dbg.phase=this.phase;dbg.exposure=this.exposure;dbg.fogDensity=this.fogDensity;dbg.cloudCoverage=this.cloudCoverage;dbg.weather=this.weather?.label?.()||this.weather?.state||'NORMAL';dbg.shadowMapSize=this.shadowMapSize;dbg.shadowTier=this.lightingQuality?.tier;let visibleLights=0;for(const l of this.lamps)if(l.light.visible)visibleLights++;dbg.visibleLights=visibleLights;dbg.registeredLights=this.lamps.length;window.__IRON_WASTES_LIGHT_DEBUG__=dbg;
  }

  getClockString(){const p=this.time/this.totalDuration,hours=(this.clockBaseHour+p*24)%24,totalMinutes=Math.floor(((hours*60)+.0001)/5)*5,h=Math.floor(totalMinutes/60)%24,m=totalMinutes%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;}
  label(){return({DAY:'ДЕНЬ',SUNSET:'СУМЕРКИ',NIGHT:'НОЧЬ',SUNRISE:'РАССВЕТ'})[this.phase]||this.phase;}
}
window.DayNightCycle=DayNightCycle;
