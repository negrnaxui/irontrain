class WeatherSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.state = 'NORMAL';
    this.targetState = 'NORMAL';
    this.stateTimer = 180 + Math.random() * 100;
    this.transitionDuration = 45;
    this.transitionT = 1;
    this.flash = 0;
    this.lightningTimer = 85 + Math.random() * 70;
    this.windAngle = 0.18;
    this.windDirection = new THREE.Vector2(Math.cos(this.windAngle), Math.sin(this.windAngle));
    this.windSpeed = .36;
    this.nightFactor = 0;
    this.visualTime = 0;
    this.lightningAge = 999;
    this.lightningStrength = 0;
    this.lightningSecondary = false;
    this.presets = {
      NORMAL: { cloudCoverage:.40, fogMultiplier:1.00, directMultiplier:1.00, exposureMultiplier:1.00, ash:.10, windSpeed:.34 },
      OVERCAST:{ cloudCoverage:.82, fogMultiplier:1.12, directMultiplier:.83, exposureMultiplier:.97, ash:.24, windSpeed:.52 },
      ASH_WIND:{ cloudCoverage:.70, fogMultiplier:1.18, directMultiplier:.78, exposureMultiplier:.94, ash:1.00, windSpeed:.92 }
    };
    this.current = {...this.presets.NORMAL};
    this.cloudCoverage=this.current.cloudCoverage;
    this.from = {...this.current};
    this.to = {...this.current};
    this.regionProfiles={SETTLEMENT:{fogMultiplier:.90,ashMultiplier:.62,label:'SETTLEMENT'},INDUSTRIAL:{fogMultiplier:1.11,ashMultiplier:1.35,label:'INDUSTRIAL'},RAIL_GRAVEYARD:{fogMultiplier:1.06,ashMultiplier:1.18,label:'RAIL_GRAVEYARD'},WASTELAND_NORTH:{fogMultiplier:1.03,ashMultiplier:.82,label:'WASTELAND_NORTH'},WASTELAND:{fogMultiplier:1,ashMultiplier:.78,label:'WASTELAND'}};
    this.region = this.regionProfiles.WASTELAND;
    this.seed = 0x95a11f;
    this.buildParticles();
    this.buildLightning();
  }

  rand(){ this.seed=(this.seed*1664525+1013904223)>>>0; return this.seed/4294967296; }

  chooseNext(){
    const r=this.rand();
    let next='NORMAL';
    if(this.state==='NORMAL') next = r<.48?'OVERCAST':(r<.64?'ASH_WIND':'NORMAL');
    else if(this.state==='OVERCAST') next = r<.66?'NORMAL':(r<.78?'ASH_WIND':'OVERCAST');
    else next = r<.76?'NORMAL':'OVERCAST';
    this.targetState=next;
    this.from={...this.current};
    this.to={...this.presets[next]};
    this.transitionT=0;
    this.transitionDuration=30+this.rand()*30;
    this.stateTimer=120+this.rand()*180;
  }

  buildParticles(){
    const count=190;
    this.particlePositions=new Float32Array(count*3);
    this.particleVelocity=new Float32Array(count*3);
    for(let i=0;i<count;i++) this.resetParticle(i,true);
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(this.particlePositions,3));
    this.particleMaterial=new THREE.PointsMaterial({
      color:0xa59a83,size:.075,sizeAttenuation:true,transparent:true,opacity:.06,
      depthWrite:false,depthTest:true,fog:true
    });
    this.particles=new THREE.Points(geo,this.particleMaterial);
    this.particles.frustumCulled=false;
    this.scene.add(this.particles);
  }

  resetParticle(i,initial=false){
    const k=i*3;
    this.particlePositions[k]=(this.rand()-.5)*58;
    this.particlePositions[k+1]=-5+this.rand()*28;
    this.particlePositions[k+2]=(this.rand()-.5)*72;
    this.particleVelocity[k]=-.04+this.rand()*.08;
    this.particleVelocity[k+1]=-(.025+this.rand()*.075);
    this.particleVelocity[k+2]=-.03+this.rand()*.06;
    if(initial && i%5===0) this.particlePositions[k+1]=this.rand()*8;
  }

  buildLightning(){
    this.lightningLight=new THREE.DirectionalLight(0xbfd5ff,0);
    this.lightningLight.position.set(-60,55,120);
    this.lightningTarget=new THREE.Object3D();
    this.scene.add(this.lightningLight,this.lightningTarget);
    this.lightningLight.target=this.lightningTarget;
    const pos=new Float32Array(9*3);
    this.lightningGeometry=new THREE.BufferGeometry();
    this.lightningGeometry.setAttribute('position',new THREE.BufferAttribute(pos,3));
    this.lightningMaterial=new THREE.LineBasicMaterial({color:0xc8dcff,transparent:true,opacity:0,depthWrite:false,depthTest:true,fog:true});
    this.lightningBolt=new THREE.Line(this.lightningGeometry,this.lightningMaterial);
    this.lightningBolt.visible=false;this.lightningBolt.renderOrder=-11;this.scene.add(this.lightningBolt);
  }

  rebuildLightningBolt(focus,side){
    const attr=this.lightningGeometry.attributes.position,arr=attr.array;
    const baseX=focus.x+side*(82+this.rand()*55),baseZ=focus.z+145+this.rand()*110;
    let x=baseX,y=74+this.rand()*22,z=baseZ;
    for(let i=0;i<9;i++){
      const k=i*3;arr[k]=x;arr[k+1]=y;arr[k+2]=z;
      x+=(this.rand()-.5)*(i<5?7:4);y-=7.5+this.rand()*4.5;z+=(this.rand()-.5)*3.5;
    }
    attr.needsUpdate=true;this.lightningBolt.visible=true;
  }

  setNightFactor(v){this.nightFactor=THREE.MathUtils.clamp(v||0,0,1);}

  regionProfile(z){
    if(z>2860 && z<3140) return this.regionProfiles.SETTLEMENT;
    if(z>=3150) return this.regionProfiles.INDUSTRIAL;
    if(z>=2000) return this.regionProfiles.RAIL_GRAVEYARD;
    if(z>=1000) return this.regionProfiles.WASTELAND_NORTH;
    return this.regionProfiles.WASTELAND;
  }

  update(dt,focusPosition){
    const d=Math.max(0,dt||0);
    const focus=focusPosition || this.camera.position;
    this.region=this.regionProfile(focus.z||0);

    if(d>0){
      this.visualTime += d;
      this.stateTimer-=d;
      if(this.stateTimer<=0 && this.transitionT>=1) this.chooseNext();
      if(this.transitionT<1){
        this.transitionT=Math.min(1,this.transitionT+d/Math.max(1,this.transitionDuration));
        const t=this.transitionT*this.transitionT*(3-2*this.transitionT);
        for(const key of Object.keys(this.current)) this.current[key]=THREE.MathUtils.lerp(this.from[key],this.to[key],t);
        if(this.transitionT>=1) this.state=this.targetState;
      }

      this.windAngle += Math.sin(this.visualTime*.021)*d*.0022;
      this.windDirection.set(Math.cos(this.windAngle),Math.sin(this.windAngle)).normalize();
      this.windSpeed=THREE.MathUtils.lerp(this.windSpeed,this.current.windSpeed,1-Math.exp(-d*.18));
      const cloudDrift=Math.sin(this.visualTime*.020)*.065+Math.sin(this.visualTime*.0087+1.7)*.035;
      this.cloudCoverage=THREE.MathUtils.clamp(this.current.cloudCoverage+cloudDrift,.25,.85);

      const storminess=Math.max(0,(this.current.cloudCoverage-.67)/.22);
      this.lightningTimer-=d*storminess;
      if(storminess>.35 && this.lightningTimer<=0){
        this.lightningStrength=.52+this.rand()*.25; // distant lightning must never nuke the whole scene
        this.lightningAge=0;
        this.lightningSecondary=this.rand()<.46;
        this.lightningTimer=60+this.rand()*90;
        const side=this.rand()>.5?1:-1;
        this.lightningLight.position.set(focus.x+side*(90+this.rand()*90),58+this.rand()*30,focus.z+155+this.rand()*130);
        this.rebuildLightningBolt(focus,side);
      }
      if(this.lightningAge<.34){
        this.lightningAge+=d;
        const a=this.lightningAge;
        const first=Math.exp(-a*35);
        const second=this.lightningSecondary?Math.exp(-Math.pow((a-.155)/.035,2))*.42:0;
        this.flash=this.lightningStrength*Math.min(1,first+second);
      }else this.flash=0;
      if(this.flash<=.018)this.lightningBolt.visible=false;
    }

    this.lightningTarget.position.copy(focus);
    this.lightningLight.intensity=this.flash*1.15;
    if(this.lightningMaterial)this.lightningMaterial.opacity=this.flash*.82;

    const ash=this.current.ash*this.region.ashMultiplier;
    const nightBoost=THREE.MathUtils.lerp(.82,1.22,this.nightFactor);
    this.particleMaterial.opacity=THREE.MathUtils.clamp((.025+ash*.17)*nightBoost,0,.24);
    this.particleMaterial.size=.06+ash*.055;
    this.particles.position.copy(this.camera.position);
    if(d>0){
      const pos=this.particlePositions;
      for(let i=0;i<pos.length/3;i++){
        const k=i*3;
        pos[k]+=d*(this.particleVelocity[k]+this.windDirection.x*this.windSpeed*(.45+ash*.65));
        pos[k+1]+=d*this.particleVelocity[k+1]*(1+ash*.8);
        pos[k+2]+=d*(this.particleVelocity[k+2]+this.windDirection.y*this.windSpeed*(.45+ash*.65));
        if(pos[k]>30||pos[k]<-30||pos[k+1]<-6||pos[k+1]>23||pos[k+2]>38||pos[k+2]<-38) this.resetParticle(i,false);
      }
      this.particles.geometry.attributes.position.needsUpdate=true;
    }
  }

  fogMultiplier(){ return this.current.fogMultiplier*this.region.fogMultiplier; }
  ashFactor(){ return this.current.ash*this.region.ashMultiplier; }
  label(){ return this.state; }
}

window.WeatherSystem=WeatherSystem;
