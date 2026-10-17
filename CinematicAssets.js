class CinematicAssets {
  constructor({visuals=null, enemyAssets=null}={}) {
    this.visuals=visuals;
    this.enemyAssets=this.cloneEnemyAssets(enemyAssets);
    this.materials=this.createMaterials();
    this.animationCache=new WeakMap();
  }
  cloneEnemyAssets(src){
    if(!src)return null;
    const out={};
    for(const [k,v] of Object.entries(src)){
      if(v?.isMaterial)out[k]=v.clone();
      else out[k]=v;
    }
    return out;
  }
  createMaterials(){
    const V=this.visuals?.materials||{};
    return {
      darkIron:V.darkIron||new THREE.MeshStandardMaterial({color:0x262d30,roughness:.72,metalness:.82}),
      iron:V.iron||new THREE.MeshStandardMaterial({color:0x3e4546,roughness:.68,metalness:.78}),
      rust:V.rust||new THREE.MeshStandardMaterial({color:0x654133,roughness:.88,metalness:.58}),
      brass:V.brass||new THREE.MeshStandardMaterial({color:0x9b743b,roughness:.44,metalness:.88}),
      copper:V.copper||new THREE.MeshStandardMaterial({color:0x784a33,roughness:.55,metalness:.78}),
      wood:V.wood||new THREE.MeshStandardMaterial({color:0x4c3427,roughness:.92,metalness:.03}),
      concrete:new THREE.MeshStandardMaterial({color:0x474845,roughness:.96,metalness:.02}),
      warmWindow:new THREE.MeshStandardMaterial({color:0x6a4d31,emissive:0xff9a4d,emissiveIntensity:.55,roughness:.4,metalness:.05}),
      redLamp:new THREE.MeshStandardMaterial({color:0x7a231b,emissive:0xff311d,emissiveIntensity:2.4,roughness:.3,metalness:.1}),
      heart:new THREE.MeshStandardMaterial({color:0x5a382b,emissive:0xff5b27,emissiveIntensity:1.8,roughness:.32,metalness:.38})
    };
  }
  box(parent,mat,pos,scale,rot=null){const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),mat);m.position.fromArray(pos);m.scale.fromArray(scale);if(rot)m.rotation.set(...rot);m.receiveShadow=true;parent.add(m);return m;}
  cyl(parent,mat,pos,r,h,sides=10,rot=null){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,sides),mat);m.position.fromArray(pos);if(rot)m.rotation.set(...rot);m.receiveShadow=true;parent.add(m);return m;}
  createLocomotiveVisual(parent,{x=0,z=0,scale=1,lit=true}={}){
    const t=new Train(parent,this.visuals);
    t.group.position.set(x,0,z);t.group.scale.setScalar(scale);t.speed=0;t.targetSpeed=0;t.throttle=0;t.brake=1;t.fireboxOpen=lit;
    if(t.fireboxDoor)t.fireboxDoor.rotation.y=lit?-1.15:0;
    if(t.headlight)t.headlight.intensity=lit?3.6:0;
    if(t.headBeam)t.headBeam.material.opacity=lit?.14:0;
    t.group.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;}});
    return t;
  }
  createEnemyVisual(parent,type,{x=0,z=0,scale=1,eye=true}={}){
    if(!this.enemyAssets||!window.Automaton)return null;
    const localAssets={};for(const [k,v] of Object.entries(this.enemyAssets))localAssets[k]=v?.isMaterial?v.clone():v;
    const e=new Automaton(parent,new THREE.Vector3(x,0,z),()=>{},null,null,localAssets,{awake:false,dynamic:false,type});
    e.group.scale.setScalar(scale);e.group.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;}});
    if(e.healthGroup)e.healthGroup.visible=false;
    if(!eye)e.modelRoot.traverse(o=>{if(o.isMesh&&o.material?.emissiveIntensity!=null&&o.material.emissiveIntensity>1)o.material.emissiveIntensity=.08;});
    return e;
  }
  createFactoryVisual(parent,{x=0,z=0,scale=1,warm=false,tall=false}={}){
    const M=this.materials,g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);parent.add(g);
    this.box(g,M.darkIron,[0,2.8,0],[7.8,5.6,6.4]);
    this.box(g,M.rust,[4.2,2.0,-.5],[3.2,4.0,3.7]);
    this.box(g,M.darkIron,[-4.4,1.6,.8],[1.8,3.2,3.2]);
    for(const sx of [-2.7,-.9,.9,2.7])this.box(g,warm?M.warmWindow:M.iron,[sx,3.0,-3.23],[.78,.78,.07]);
    const stackH=tall?18:12;
    for(const sx of [-2.8,2.4])this.cyl(g,M.darkIron,[sx,stackH*.55,2.0],.55,stackH,10);
    this.box(g,M.brass,[0,5.7,.3],[8.7,.22,.20]);
    for(const sx of [-3.8,0,3.8])this.box(g,M.iron,[sx,7.3,.3],[.18,3.3,.18]);
    return g;
  }
  createCraneVisual(parent,{x=0,z=0,scale=1}={}){
    const M=this.materials,g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);parent.add(g);
    this.box(g,M.darkIron,[0,4,0],[.55,8,.55]);this.box(g,M.darkIron,[3.4,7.7,0],[6.8,.34,.34]);
    this.box(g,M.brass,[6.4,5.6,0],[.10,4.2,.10]);this.box(g,M.rust,[6.4,3.3,0],[.45,.5,.45]);return g;
  }
  createHeartVisual(parent,{x=0,z=0,scale=1,redNight=false}={}){
    const M=this.materials,g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);parent.add(g);
    const shell=this.cyl(g,M.darkIron,[0,11,0],4.3,20,18);
    for(let i=0;i<5;i++){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(5.1+i*.52,.16,8,36),i%2?M.brass:M.iron);ring.position.y=7.5+i*1.75;ring.rotation.x=Math.PI/2+(i-2)*.05;g.add(ring);ring.userData.cinematicSpin=(i%2?-1:1)*(.11+i*.025);
    }
    const core=this.cyl(g,M.heart,[0,10.8,0],2.35,8.6,18);core.userData.heartCore=true;
    for(const side of [-1,1]){
      this.cyl(g,M.rust,[side*6.2,9,0],1.15,14,12);
      for(let j=0;j<3;j++){const piston=this.cyl(g,M.brass,[side*(4.8+j*.45),5.5+j*3,2.2],.16,5.2,8,[0,0,.22*side]);piston.userData.cinematicPiston=j;}
      this.cyl(g,M.copper,[side*5.1,17,-1.8],.38,16,10,[Math.PI/2,0,0]);
    }
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;const wheel=new THREE.Mesh(new THREE.TorusGeometry(1.2,.14,8,20),M.brass);wheel.position.set(Math.cos(a)*5.5,3.2+(i%2)*2.1,Math.sin(a)*3.2);wheel.rotation.y=a;g.add(wheel);wheel.userData.cinematicSpin=.24*(i%2?1:-1);}
    for(let i=0;i<12;i++){const lamp=new THREE.Mesh(new THREE.SphereGeometry(.12,7,5),redNight?M.redLamp:M.warmWindow);lamp.position.set((i%4-1.5)*2.0,3+Math.floor(i/4)*2.0,-4.15);g.add(lamp);}
    shell.userData.heartShell=true;return g;
  }
  createPortVisual(parent,{x=0,z=0,scale=1,warm=true}={}){
    const M=this.materials,g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);parent.add(g);
    this.box(g,M.darkIron,[0,.18,0],[28,.35,8]);
    this.createFactoryVisual(g,{x:-9,z:-5,scale:.75,warm});this.createFactoryVisual(g,{x:9,z:-7,scale:.62,warm});this.createCraneVisual(g,{x:12,z:3,scale:.72});
    for(const x2 of [-10,-5,0,5,10]){this.cyl(g,M.darkIron,[x2,3.3,5],.08,6.3,8);const b=new THREE.Mesh(new THREE.SphereGeometry(.11,7,5),M.warmWindow);b.position.set(x2,6.35,5);g.add(b);}
    return g;
  }
  animate(root,dt,time=0){
    if(!root)return;
    let cache=this.animationCache.get(root);
    if(!cache){
      cache={spins:[],pistons:[],cores:[]};
      root.traverse(o=>{
        if(o.userData?.cinematicSpin)cache.spins.push(o);
        if(Number.isFinite(o.userData?.cinematicPiston)){o.userData.cinematicBaseY=o.position.y;cache.pistons.push(o);}
        if(o.userData?.heartCore&&o.material?.emissiveIntensity!=null)cache.cores.push(o);
      });
      this.animationCache.set(root,cache);
    }
    for(const o of cache.spins)o.rotation.z+=dt*o.userData.cinematicSpin;
    for(const o of cache.pistons)o.position.y=o.userData.cinematicBaseY+Math.sin(time*2.4+o.userData.cinematicPiston)*.018;
    for(const o of cache.cores)o.material.emissiveIntensity=1.55+.45*Math.sin(time*2.2)**2;
  }
}
window.CinematicAssets=CinematicAssets;
