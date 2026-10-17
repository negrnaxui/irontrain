class WorldPOISystem {
  constructor(scene, collisions, materials, items, dayNight, safeZones = []) {
    this.scene = scene;
    this.collisions = collisions;
    this.M = materials;
    this.items = items;
    this.dayNight = dayNight;
    this.safeZones = safeZones;
    this.spawnAnchors = [];
    this.lootQueue = [];
    this.classConfig = { poiLootMultiplier:1 };
    this.classBonusLootSeeded = false;
    this.roots = [];
    this.visibilityTimer = 0;
    this.seed = 0x1a2b3c4d;
    this.shared = this.createSharedAssets();
  }

  random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  createSharedAssets() {
    const M=this.M;
    return {
      box:new THREE.BoxGeometry(1,1,1),
      plane:new THREE.PlaneGeometry(1,1),
      circle:new THREE.CircleGeometry(1,24),
      cylinder:new THREE.CylinderGeometry(.5,.5,1,8),
      cone:new THREE.ConeGeometry(.5,1,4),
      stone:new THREE.DodecahedronGeometry(.14,0),
      wheel:new THREE.TorusGeometry(.46,.09,7,14),
      pipe:new THREE.CylinderGeometry(.06,.08,1,7),
      barrel:new THREE.CylinderGeometry(.42,.45,.9,9),
      pathMat:new THREE.MeshStandardMaterial({color:0x514a3d,roughness:1,metalness:0}),
      rutMat:new THREE.MeshStandardMaterial({color:0x2d2a25,roughness:1,metalness:0}),
      warmGlassMat:new THREE.MeshStandardMaterial({color:0x6a4a31,emissive:0xff9a4a,emissiveIntensity:.32,roughness:.28,metalness:.04,side:THREE.DoubleSide}),
      glassMat:(()=>{const m=M.glassDark || new THREE.MeshStandardMaterial({color:0x243038,roughness:.2,transparent:true,opacity:.55});m.side=THREE.DoubleSide;return m;})(),
      lampMat:new THREE.MeshStandardMaterial({color:0xffad58,emissive:0xff7b24,emissiveIntensity:2.2,roughness:.35}),
      clothMat:new THREE.MeshStandardMaterial({color:0x51483d,roughness:1,metalness:0}),
      collisionMat:new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0,depthWrite:false,colorWrite:false}),
      contactMat:new THREE.MeshBasicMaterial({color:0x080a0b,transparent:true,opacity:.075,depthWrite:false,depthTest:true})
    };
  }

  isNearSafeZone(z, margin=90) {
    return this.safeZones.some(s=>Math.abs(z-s.z)<s.halfZ+margin) || Math.abs(z-430)<85;
  }

  addBox(parent, material, x,y,z, sx,sy,sz, {rotationY=0, collide=false, raycast=true, walkableTop=false, tag='poi'}={}) {
    const m=new THREE.Mesh(this.shared.box,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.y=rotationY;parent.add(m);
    m.castShadow=sy>1.2;m.receiveShadow=true;
    if(collide)this.collisions.addSolid(m,{collide:true,raycast,walkableTop,tag});
    else if(raycast)this.collisions.addSolid(m,{collide:false,raycast:true,tag});
    return m;
  }

  addCylinder(parent, material, x,y,z, radius,height,{rotation=null,collide=false,tag='poi-cylinder'}={}){
    const m=new THREE.Mesh(this.shared.cylinder,material);m.position.set(x,y,z);m.scale.set(radius*2,height,radius*2);if(rotation)m.rotation.set(...rotation);parent.add(m);m.castShadow=height>2;m.receiveShadow=true;
    if(collide)this.collisions.addSolid(m,{tag});
    return m;
  }


  addCollisionBox(parent,x,y,z,sx,sy,sz,{rotationY=0,tag='poi-collider',walkableTop=false}={}){
    const m=new THREE.Mesh(this.shared.box,this.shared.collisionMat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.y=rotationY;parent.add(m);m.visible=false;
    this.collisions.addSolid(m,{collide:true,raycast:false,walkableTop,tag});
    return m;
  }

  addContactShadow(parent,x,z,w,d,opacity=.075){
    const m=new THREE.Mesh(this.shared.circle,this.shared.contactMat);
    m.rotation.x=-Math.PI/2;m.position.set(x,.017,z);m.scale.set(w*.58,d*.58,1);m.userData.ignoreRaycast=true;parent.add(m);
    return m;
  }

  addPath(x,z,width=2.3){
    const len=Math.max(4,Math.abs(x)-4.2),mid=x>0?(4.2+len/2):(-4.2-len/2);
    const group=new THREE.Group();group.userData.poiZ=z;this.scene.add(group);this.roots.push(group);
    const path=new THREE.Mesh(this.shared.plane,this.shared.pathMat);path.rotation.x=-Math.PI/2;path.position.set(mid,.035,z);path.scale.set(len,width,1);group.add(path);path.receiveShadow=true;
    for(const dz of [-width*.22,width*.22]){
      const rut=new THREE.Mesh(this.shared.plane,this.shared.rutMat);rut.rotation.x=-Math.PI/2;rut.position.set(mid,.040,z+dz);rut.scale.set(len*.90,Math.max(.07,width*.055),1);group.add(rut);
    }
    // Small stones visually connect the track and each property without adding collision.
    for(let i=0;i<4;i++){
      const stone=new THREE.Mesh(this.shared.stone,this.M.debris||this.M.rust);stone.scale.setScalar?.(.75+this.random()*.55);
      stone.position.set(mid+(this.random()-.5)*len*.75,.09,z+(this.random()-.5)*width*.82);stone.scale.y=.55;group.add(stone);
    }
    return group;
  }

  addHouseWindow(root,x,y,z,w=.9,h=.85,warm=false){
    const mat=warm?this.shared.warmGlassMat:this.shared.glassMat;
    const glass=new THREE.Mesh(this.shared.plane,mat);glass.position.set(x,y,z);glass.scale.set(w,h,1);root.add(glass);
    this.addBox(root,this.M.darkIron,x,y,z-.025,.055,h+.16,.06,{collide:false,raycast:false});
    this.addBox(root,this.M.darkIron,x,y,z-.03,w+.15,.055,.06,{collide:false,raycast:false});
    return glass;
  }

  addHouseDoor(root,x,y,z,w=1.05,h=2.1){
    const door=this.addBox(root,this.M.wood,x,y,z,w,h,.10,{collide:false,tag:'poi-door'});
    for(const dy of [-.62,.60])this.addBox(root,this.M.darkIron,x+w*.39,y+dy,z-.07,.08,.22,.04,{collide:false,raycast:false});
    const knob=new THREE.Mesh(new THREE.SphereGeometry(.055,6,5),this.M.brass);knob.position.set(x-w*.33,y,z-.09);root.add(knob);
    return door;
  }

  addGableHouseRoof(root,x,y,z,w,d,{damaged=false}={}){
    const angle=.34,half=w*.54,rise=Math.tan(angle)*half;
    const l=this.addBox(root,this.M.rust,x-half*.48,y+rise*.50,z,half,.18,d+.45,{collide:false,tag:'poi-roof'});l.rotation.z=angle;
    const r=this.addBox(root,this.M.rust,x+half*.48,y+rise*.50,z,half,.18,d+.45,{collide:false,tag:'poi-roof'});r.rotation.z=-angle;
    if(damaged){r.scale.z*=.55;r.position.z+=d*.20;r.rotation.x=.08;}
    return [l,r];
  }


  addClosedHouse(root,x,z,w=5.4,h=3.1,d=6.0,variant=0,ruined=false){
    const style=variant%6,twoStory=style===5;
    const actualH=twoStory?Math.max(5.0,h*1.65):h;
    const wallMat=style%3===0?this.M.wood:(style%3===1?this.M.rust:this.M.soot);
    this.addContactShadow(root,x,z,w,d);
    this.addBox(root,this.M.concrete,x,.14,z,w+.5,.28,d+.5,{collide:true,walkableTop:true,tag:'poi-foundation'});
    const body=this.addBox(root,wallMat,x,.28+actualH/2,z,w,actualH,d,{collide:true,tag:'poi-house'});
    // Strong corner framing and facade posts make the house read as construction, not a single box.
    for(const sx of [-1,1])for(const sz of [-1,1])this.addBox(root,this.M.darkIron,x+sx*(w/2+.04),.35+actualH*.52,z+sz*(d/2+.04),.12,actualH+.28,.12,{collide:false,raycast:false});
    for(let i=-2;i<=2;i++)this.addBox(root,style%2?this.M.darkIron:this.M.wood,x+i*w/5.2,.38+actualH*.5,z-d/2-.055,.05,actualH-.16,.08,{collide:false,raycast:false});
    const roofY=.28+actualH+.06;
    if(style===1||style===3){const roof=this.addBox(root,this.M.darkIron,x,roofY+.28,z,w+.55,.18,d+.55,{collide:false,tag:'poi-roof'});roof.rotation.z=style===1?.16:-.16;}
    else this.addGableHouseRoof(root,x,roofY,z,w,d,{damaged:ruined||style===4});
    const doorX=x+(style%3-1)*w*.18;this.addHouseDoor(root,doorX,1.36,z-d/2-.07,1.08,2.15);
    this.addBox(root,this.M.concrete,doorX,.20,z-d/2-.58,1.45,.22,.82,{collide:true,walkableTop:true,tag:'poi-step'});
    if(style===2||style===5){
      this.addBox(root,this.M.wood,doorX,.34,z-d/2-1.12,2.9,.18,1.8,{collide:true,walkableTop:true,tag:'poi-porch'});
      for(const sx of [-1.18,1.18])this.addBox(root,this.M.darkIron,doorX+sx,1.35,z-d/2-1.55,.09,2.05,.09,{collide:false,raycast:false});
      const awn=this.addBox(root,this.M.rust,doorX,2.48,z-d/2-1.25,3.1,.14,2.0,{collide:false,raycast:true});awn.rotation.z=.10;
    }
    const ys=twoStory?[1.95,4.05]:[2.02];
    for(const yy of ys)for(const ox of [-w*.27,w*.27])this.addHouseWindow(root,x+ox,yy,z-d/2-.085,.92,.84,style===3||twoStory&&ox>0);
    const chimney=this.addCylinder(root,this.M.soot,x+w*.29,roofY+1.15,z+d*.18,.20,2.25,{collide:false});
    if(style===3){
      this.addBox(root,this.M.rust,x+w*.65,1.15,z+.55,w*.34,2.3,d*.58,{collide:true,tag:'poi-annex'});
      const roof=this.addBox(root,this.M.darkIron,x+w*.65,2.48,z+.55,w*.39,.16,d*.64,{collide:false});roof.rotation.z=-.15;
    }
    if(ruined||style===4){
      body.scale.x*=.78;body.position.x-=w*.11;
      this.collisions.refreshSolid?.(body);
      const beam=this.addBox(root,this.M.rust,x+w*.42,2.15,z+d*.10,.16,4.1,.16,{collide:false,raycast:false});beam.rotation.z=.40;
      for(let i=0;i<5;i++)this.addBox(root,i%2?this.M.wood:this.M.rust,x-w*.60+(i%3)*.58,.13,z+d*.55+(i%2)*.42,.62,.18,.15,{rotationY:(i-.5)*.38,collide:false,raycast:false});
    }
    return {body,chimney};
  }


  addEnterableHouse(root,x,z,w=5.8,h=3.0,d=6.2,variant=0){
    const mat=variant%2?this.M.wood:this.M.rust, t=.22, doorW=1.25;
    this.addContactShadow(root,x,z,w,d);
    this.addBox(root,this.M.concrete,x,.14,z,w+.45,.28,d+.45,{collide:true,walkableTop:true,tag:'poi-foundation'});
    this.addBox(root,mat,x,h/2+.28,z+d/2-t/2,w,h,t,{collide:true,tag:'poi-house-wall'});
    this.addBox(root,mat,x-w/2+t/2,h/2+.28,z,t,h,d,{collide:true,tag:'poi-house-wall'});
    this.addBox(root,mat,x+w/2-t/2,h/2+.28,z,t,h,d,{collide:true,tag:'poi-house-wall'});
    const sideW=(w-doorW)/2;
    this.addBox(root,mat,x-(doorW/2+sideW/2),h/2+.28,z-d/2+t/2,sideW,h,t,{collide:true,tag:'poi-house-wall'});
    this.addBox(root,mat,x+(doorW/2+sideW/2),h/2+.28,z-d/2+t/2,sideW,h,t,{collide:true,tag:'poi-house-wall'});
    this.addBox(root,mat,x,h-.28+.28,z-d/2+t/2,doorW,.56,t,{collide:true,tag:'poi-house-wall'});
    const floor=this.addBox(root,this.M.wood,x,.30,z,w,.16,d,{collide:false,raycast:true,walkableTop:true,tag:'poi-floor'});this.collisions.addFloorRect(x-w/2,x+w/2,z-d/2,z+d/2,.38,'poi-interior');
    // Architectural framing around the open doorway.
    for(const sx of [-w/2+.10,w/2-.10])this.addBox(root,this.M.darkIron,x+sx,1.78,z-d/2-.03,.11,3.25,.11,{collide:false,raycast:false});
    this.addBox(root,this.M.darkIron,x,h+.17,z-d/2-.04,w,.11,.11,{collide:false,raycast:false});
    this.addGableHouseRoof(root,x,h+.38,z,w,d,{damaged:variant%5===4});
    this.addBox(root,this.M.concrete,x,.20,z-d/2-.55,1.55,.24,.88,{collide:true,walkableTop:true,tag:'poi-step'});
    // Side windows retain solid walls but visually read as framed openings.
    for(const ox of [-w*.27,w*.27])this.addHouseWindow(root,x+ox,2.08,z+d/2+.012,.82,.76,variant%3===2&&ox>0);
    // One-room interior. Only large pieces receive collisions.
    this.addBox(root,this.M.wood,x-w*.24,.62,z+d*.18,1.55,.80,.72,{collide:true,walkableTop:true,tag:'poi-bed'});
    this.addBox(root,this.M.wood,x+w*.18,.62,z+d*.12,1.15,.82,.74,{collide:true,walkableTop:true,tag:'poi-table'});
    this.addBox(root,this.M.soot,x+w*.34,.86,z-d*.20,.70,1.40,.65,{collide:true,tag:'poi-stove'});
    this.addBox(root,this.shared.clothMat,x-w*.23,1.06,z+d*.18,1.25,.08,.62,{collide:false,raycast:false});
    // Cheap lived-in details: cabinet, books, bottle silhouettes and an empty photo frame. No extra collision.
    this.addBox(root,this.M.wood,x-w*.37,1.05,z-d*.24,.82,1.85,.38,{collide:false,raycast:false});
    for(let i=0;i<4;i++)this.addBox(root,i%2?this.M.rust:this.M.wood,x-w*.38+i*.11,.80,z-d*.46,.07,.32,.20,{rotationY:(i-1.5)*.06,collide:false,raycast:false});
    for(let i=0;i<3;i++)this.addCylinder(root,this.M.wood,x+w*.12+i*.12,1.14,z+d*.06,.035,.28,{collide:false});
    const frame=this.addBox(root,this.M.darkIron,x-w*.10,2.02,z+d/2-.04,.72,.52,.035,{collide:false,raycast:false});
    this.addBox(root,this.M.concrete,x-w*.10,2.02,z+d/2-.065,.55,.35,.018,{collide:false,raycast:false});
    const chimney=this.addCylinder(root,this.M.soot,x+w*.30,h+1.45,z+d*.20,.18,2.2,{collide:false});
    return {chimney};
  }


  addLamp(root,x,z,y=2.2,active=true){
    const pole=this.addCylinder(root,this.M.darkIron,x,y*.5,z,.055,y,{collide:false});
    const bulb=new THREE.Mesh(new THREE.SphereGeometry(.09,7,5),this.shared.lampMat);bulb.position.set(x,y,z);root.add(bulb);
    if(active){const light=new THREE.PointLight(0xff9f4c,.03,8,2);light.position.set(x,y,z);this.scene.add(light);this.dayNight?.registerLamp(light,null,{day:.015,night:1.35,flicker:.055});}
    return pole;
  }

  addHumanDetails(root,x,z,variant=0){
    this.addBox(root,this.M.wood,x+1.4,.35,z+2.0,.8,.7,.8,{collide:true,walkableTop:true,tag:'poi-crate'});
    this.addContactShadow(root,x+1.4,z+2.0,.86,.86,.055);
    const barrel=new THREE.Mesh(this.shared.barrel,this.M.rust);barrel.position.set(x-1.6,.45,z+1.8);root.add(barrel);this.collisions.addSolid(barrel,{tag:'poi-barrel'});
    this.addContactShadow(root,x-1.6,z+1.8,.82,.82,.05);
    const chair=this.addBox(root,this.M.wood,x+.45,.42,z-2.3,.50,.08,.50,{collide:false,raycast:false});
    this.addBox(root,this.M.wood,x+.45,.83,z-2.52,.50,.82,.08,{collide:false,raycast:false});
    if(variant%2===0){
      for(let i=0;i<4;i++)this.addBox(root,this.M.rust,x-2.0+i*.34,.15,z-2.1,.08,.30,.85,{rotationY:.22*i,collide:false,raycast:false});
    }
  }

  addFenceScene(root,x,z,length=7,broken=false){
    const sign=Math.sign(x)||1;
    for(let i=0;i<4;i++){
      if(broken&&i===2)continue;
      const px=x+sign*(i-1.5)*1.8;
      const isFallen=broken&&i===3;
      const post=this.addBox(root,this.M.wood,px,isFallen?.26:.72,z,.12,1.44,.12,{collide:!isFallen,tag:'poi-fence'});
      if(isFallen)post.rotation.z=.38;
    }
    if(!broken){
      for(const y of [.55,1.05])this.addBox(root,this.M.wood,x,y,z,length,.10,.10,{rotationY:0,collide:false,tag:'poi-fence-rail'});
      // One lightweight panel matches the intact visual fence without adding a collider per rail.
      this.addCollisionBox(root,x,.67,z,length,1.22,.16,{tag:'poi-fence-panel'});
    }else{
      // A broken fence has a real visual gap and the collision is split into the same two sections.
      const gap=Math.min(2.15,length*.34),segment=(length-gap)/2;
      if(segment>.35){
        const offset=gap/2+segment/2;
        for(const y of [.55,1.05]){
          const left=this.addBox(root,this.M.wood,x-offset,y,z,segment,.10,.10,{collide:false,tag:'poi-fence-rail'});
          const right=this.addBox(root,this.M.wood,x+offset,y,z,segment,.10,.10,{collide:false,tag:'poi-fence-rail'});
          if(y>1){left.rotation.z=-.025;right.rotation.z=.065;}
        }
        this.addCollisionBox(root,x-offset,.67,z,segment,1.22,.16,{tag:'poi-fence-panel'});
        this.addCollisionBox(root,x+offset,.67,z,segment,1.22,.16,{tag:'poi-fence-panel'});
      }
    }
  }

  addLoot(type,x,z,options={}){this.lootQueue.push({type,position:new THREE.Vector3(x,0,z),options});}
  addSpawn(x,z,preferredTypes,tag='poi'){this.spawnAnchors.push({position:new THREE.Vector3(x,0,z),preferredTypes,tag});}

  buildRailHouse(x,z,variant=0,enterable=false,ruined=false){
    const root=new THREE.Group();root.userData.poiZ=z;this.scene.add(root);this.roots.push(root);this.addPath(x,z);
    if(enterable)this.addEnterableHouse(root,x,z,5.6,3.1,6.2,variant);else this.addClosedHouse(root,x,z,5.6,3.1,6.2,variant,ruined);
    this.addHumanDetails(root,x,z,variant);this.addFenceScene(root,x+(x>0?3.9:-3.9),z+1.2,6.5,ruined);
    if(variant===3)this.addLamp(root,x-(x>0?2.0:-2.0),z-2.1,2.25,true);
    this.addSpawn(x+(x>0?-5.0:5.0),z+3.8,['walker','stalker'],'rail-house');
    if(enterable){if(variant%2===0)this.addLoot('Medkit',x+.4,z+1.6);else this.addLoot('Ammo',x-.6,z+1.2,{weaponType:'auto',ammoAmount:9});}
  }

  buildWatchHut(x,z,variant=0){
    const root=new THREE.Group();root.userData.poiZ=z;this.scene.add(root);this.roots.push(root);this.addPath(x,z,1.8);
    this.addClosedHouse(root,x,z,3.1,2.6,3.3,variant,false);
    const signal=this.addCylinder(root,this.M.darkIron,x-(x>0?2.2:-2.2),2.1,z-1.0,.08,4.2,{collide:true,tag:'poi-signal'});
    this.addBox(root,this.M.rust,x-(x>0?2.2:-2.2),3.85,z-1.0,.52,.72,.28,{collide:false});
    const lever=this.addBox(root,this.M.brass,x+(x>0?1.8:-1.8),.65,z+1.3,.18,1.1,.18,{rotationY:.2,collide:false});lever.rotation.z=.52;
    this.addLoot('Scrap Metal',x+.4,z+2.0);this.addSpawn(x+(x>0?4.4:-4.4),z-2.5,['walker','gunner'],'watch-hut');
  }

  buildFarm(x,z,variant=0){
    const root=new THREE.Group();root.userData.poiZ=z;this.scene.add(root);this.roots.push(root);this.addPath(x,z,2.8);
    this.addClosedHouse(root,x,z,5.8,3.0,6.4,variant,variant%3===2);
    this.addClosedHouse(root,x+(x>0?7:-7),z+4.5,6.2,2.6,4.8,variant+1,false);
    const towerX=x+(x>0?10:-10);for(const sx of [-.85,.85])for(const sz of [-.85,.85])this.addBox(root,this.M.darkIron,towerX+sx,2.2,z-3+sz,.12,4.4,.12,{collide:true,tag:'farm-tower'});
    const tank=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.35,2.1,10),this.M.rust);tank.position.set(towerX,5.0,z-3);root.add(tank);
    this.addFenceScene(root,x,z+6.2,8,true);
    // Broken steam agricultural machine.
    const engine=this.addBox(root,this.M.soot,x-(x>0?4.5:-4.5),.75,z-4.4,2.2,1.35,1.4,{rotationY:.15,collide:true,tag:'farm-engine'});
    const wheel1=new THREE.Mesh(this.shared.wheel,this.M.rust);wheel1.position.set(engine.position.x-1.0,.58,engine.position.z+.75);wheel1.rotation.y=Math.PI/2;root.add(wheel1);
    const wheel2=wheel1.clone();wheel2.position.z-=1.5;root.add(wheel2);
    this.addSpawn(x+(x>0?-5:5),z+5,['stalker','walker'],'farm');
    if(variant%2===0)this.addLoot('Medkit',x,z+1.7);
  }

  buildWorkshop(x,z,variant=0){
    const root=new THREE.Group();root.userData.poiZ=z;this.scene.add(root);this.roots.push(root);this.addPath(x,z,3.0);
    const w=8.0,h=4.1,d=8.0;
    this.addBox(root,this.M.rust,x,h/2,z,w,h,d,{collide:true,tag:'poi-workshop'});
    this.addBox(root,this.M.darkIron,x,h+.45,z,w+.7,.20,d+.7,{collide:false,tag:'poi-roof'});
    const door=this.addBox(root,this.M.soot,x,1.5,z-d/2-.05,3.4,3.0,.10,{collide:false});
    for(const dx of [-2.9,2.9])this.addCylinder(root,this.M.copper,x+dx,2.7,z+d*.22,.13,5.4,{collide:true,tag:'workshop-pipe'});
    const cranePost=this.addBox(root,this.M.darkIron,x+(x>0?-5.2:5.2),2.6,z-1.5,.22,5.2,.22,{collide:true,tag:'workshop-crane'});
    this.addBox(root,this.M.rust,cranePost.position.x+(x>0?-1.6:1.6),5.0,z-1.5,3.4,.18,.20,{collide:false});
    const motor=this.addCylinder(root,this.M.soot,x+(x>0?-4:4),.72,z+3.8,.70,1.45,{rotation:[Math.PI/2,0,0],collide:true,tag:'workshop-engine'});
    this.addLoot('Scrap Metal',x+(x>0?-2.5:2.5),z-5.4);this.addLoot('Ammo',x+(x>0?-1.2:1.2),z-5.2,{weaponType:'auto',ammoAmount:10});
    this.addSpawn(x+(x>0?-6:6),z+4,['brute','walker'],'workshop');
    this.addSpawn(x,z-7,['gunner','walker'],'workshop-yard');
    // Roof is a valid sniper perch but is too high for player auto-step.
    this.collisions.addFloorRect(x-w/2+.35,x+w/2-.35,z-d/2+.35,z+d/2-.35,h+.55,'workshop-roof');
    this.spawnAnchors.push({position:new THREE.Vector3(x,h+.55,z+1.2),preferredTypes:['gunner'],tag:'sniper-perch'});
  }

  buildWaterStop(x,z,variant=0){
    const root=new THREE.Group();root.userData.poiZ=z;this.scene.add(root);this.roots.push(root);this.addPath(x,z,2.5);
    const bunker=this.addBox(root,this.M.soot,x,.95,z,4.8,1.9,3.6,{collide:true,tag:'coal-bunker'});
    for(const sx of [-1.6,1.6])for(const sz of [-1.6,1.6])this.addBox(root,this.M.darkIron,x+sx,2.7,z+sz,.12,5.4,.12,{collide:true,tag:'water-tower-leg'});
    const tank=new THREE.Mesh(new THREE.CylinderGeometry(1.65,1.9,2.6,11),this.M.rust);tank.position.set(x,6.0,z);root.add(tank);
    const arm=this.addBox(root,this.M.darkIron,x-(x>0?4.5:-4.5),3.0,z,.18,6.0,.18,{collide:true,tag:'water-column'});
    this.addBox(root,this.M.copper,arm.position.x-(x>0?1.1:-1.1),5.2,z,2.3,.14,.14,{collide:false});
    this.addLoot('Coal',x+(x>0?-2.4:2.4),z+2.2);this.addLoot('Coal',x+(x>0?-1.6:1.6),z+2.6);
    this.addSpawn(x+(x>0?-6:6),z-3,['walker','stalker'],'water-stop');
  }

  buildWreck(x,z,variant=0){
    const root=new THREE.Group();root.userData.poiZ=z;this.scene.add(root);this.roots.push(root);
    if(variant%2===0){
      const wagon=this.addBox(root,this.M.rust,x,1.25,z,3.1,2.5,8.4,{rotationY:.42,collide:false,raycast:true,tag:'wreck-wagon'});
      for(const t of [-2.65,0,2.65]){const dx=Math.sin(.42)*t,dz=Math.cos(.42)*t;this.addCollisionBox(root,x+dx,1.25,z+dz,3.0,2.5,2.95,{rotationY:.42,tag:'wreck-wagon-segment'});}
      for(const dz of [-2.4,2.4]){const wheel=new THREE.Mesh(this.shared.wheel,this.M.darkIron);wheel.position.set(x+(x>0?-1.25:1.25),.55,z+dz);wheel.rotation.y=Math.PI/2;wheel.rotation.z=.30;root.add(wheel);}
      const bogieX=x+(x>0?3.0:-3.0),bogieZ=z+2.8;this.addBox(root,this.M.darkIron,bogieX,.55,bogieZ,1.9,1.1,3.0,{rotationY:-.65,collide:false,raycast:true,tag:'wreck-bogie'});
      for(const t of [-.72,.72]){this.addCollisionBox(root,bogieX+Math.sin(-.65)*t,.55,bogieZ+Math.cos(-.65)*t,1.8,1.1,1.65,{rotationY:-.65,tag:'wreck-bogie-segment'});}
    }else{
      const boiler=new THREE.Mesh(new THREE.CylinderGeometry(1.0,1.2,5.5,10),this.M.soot);boiler.rotation.z=Math.PI/2;boiler.position.set(x,1.15,z);root.add(boiler);this.collisions.addSolid(boiler,{tag:'wreck-boiler'});
      const cabX=x+(x>0?-2.7:2.7),cabZ=z+1.4;this.addBox(root,this.M.rust,cabX,.55,cabZ,2.4,1.1,3.2,{rotationY:.30,collide:false,raycast:true,tag:'wreck-cab'});
      for(const t of [-.75,.75])this.addCollisionBox(root,cabX+Math.sin(.30)*t,.55,cabZ+Math.cos(.30)*t,2.25,1.1,1.75,{rotationY:.30,tag:'wreck-cab-segment'});
      const stack=this.addCylinder(root,this.M.soot,x+(x>0?1.2:-1.2),2.2,z-.3,.25,2.8,{rotation:[0,0,.8],collide:true,tag:'wreck-stack'});
    }
    for(let i=0;i<6;i++)this.addBox(root,i%2?this.M.rust:this.M.darkIron,x+(this.random()-.5)*7,.15,z+(this.random()-.5)*8,.25+this.random(),.20,.25+this.random()*1.4,{rotationY:this.random()*Math.PI,collide:false,raycast:false});
    this.addLoot('Scrap Metal',x+(x>0?-2:2),z+4.2);this.addSpawn(x+(x>0?-4.5:4.5),z-3,['stalker','walker'],'wreck');
  }

  buildScrapYard(x,z,variant=0){
    const root=new THREE.Group();root.userData.poiZ=z;this.scene.add(root);this.roots.push(root);this.addPath(x,z,3.4);
    for(let i=0;i<8;i++){
      const px=x+(this.random()-.5)*10,pz=z+(this.random()-.5)*9;
      const sx=1.0+this.random()*2.4,sy=.6+this.random(),sz=.7+this.random()*2.0,ry=this.random()*Math.PI;const junk=this.addBox(root,i%3===0?this.M.darkIron:this.M.rust,px,.35+this.random()*.5,pz,sx,sy,sz,{rotationY:ry,collide:false,raycast:true,tag:'scrap-pile'});junk.rotation.z=(this.random()-.5)*.28;if(i<4)this.addCollisionBox(root,px,junk.position.y,pz,Math.max(.7,sx*.72),sy,Math.max(.6,sz*.72),{tag:'scrap-pile-collider'});
    }
    const frameX=x+(x>0?5:-5);for(const sx of [-1.2,1.2])this.addBox(root,this.M.darkIron,frameX+sx,2.8,z,.18,5.6,.18,{collide:true,tag:'scrap-crane'});this.addBox(root,this.M.rust,frameX,5.3,z,2.8,.18,.18,{collide:false});
    this.addLoot('Scrap Metal',x,z+4);this.addLoot('Ammo',x+1.2,z-3,{weaponType:'auto',ammoAmount:8});
    this.addSpawn(x+(x>0?-5:5),z+4,['stalker','brute'],'scrap-yard');
  }

  buildSettlement(x,z,variant=0){
    const root=new THREE.Group();root.userData.poiZ=z;this.scene.add(root);this.roots.push(root);this.addPath(x,z,3.0);
    const sign=x>0?1:-1;
    this.addEnterableHouse(root,x,z,5.4,3.0,5.8,variant);
    this.addClosedHouse(root,x+sign*7.0,z+2.6,4.8,2.7,5.0,variant+1,variant%2===0);
    this.addClosedHouse(root,x-sign*5.5,z-5.0,4.5,2.5,4.5,variant+2,true);
    this.addLamp(root,x+sign*2.7,z-2.4,2.4,variant%2===1);
    this.addFenceScene(root,x,z+6.0,9,true);
    this.addLoot('Medkit',x+.6,z+1.4);if(variant>1)this.addLoot('Ammo',x-sign*2.1,z-2.0,{weaponType:'auto',ammoAmount:10});
    this.addSpawn(x+sign*6,z+5,['walker','stalker'],'settlement');this.addSpawn(x-sign*6,z-5,['walker','gunner'],'settlement');
  }

  build() {
    // Hand-authored deterministic POI spacing: enough landmarks to make the route feel inhabited,
    // while retaining long empty stretches of wasteland between them.
    const defs=[
      ['RAIL_HOUSE', 250, 18, 0, true],
      ['WATCH_HUT', 560,-10,1],
      ['WRECK', 790, 18,0],
      ['RAIL_HOUSE',1160,-20,2,false,true],
      ['WORKSHOP',1390,22,0],
      ['FARM',1680,-27,1],
      ['WATCH_HUT',1880,10,2],
      ['SMALL_SETTLEMENT',2220,-25,1],
      ['SCRAP_YARD',2480,24,0],
      ['WRECK',2740,-19,1],
      ['WATER_STOP',3180,15,0],
      ['WORKSHOP',3440,-24,2],
      ['RAIL_HOUSE',3650,19,3,true],
      ['SMALL_SETTLEMENT',3820,-27,3]
    ];
    for(const def of defs){
      const [type,z,x,variant=0,enterable=false,ruined=false]=def;
      if(this.isNearSafeZone(z,42))continue;
      if(type==='RAIL_HOUSE')this.buildRailHouse(x,z,variant,enterable,ruined);
      else if(type==='WATCH_HUT')this.buildWatchHut(x,z,variant);
      else if(type==='FARM')this.buildFarm(x,z,variant);
      else if(type==='WORKSHOP')this.buildWorkshop(x,z,variant);
      else if(type==='WATER_STOP')this.buildWaterStop(x,z,variant);
      else if(type==='WRECK')this.buildWreck(x,z,variant);
      else if(type==='SCRAP_YARD')this.buildScrapYard(x,z,variant);
      else if(type==='SMALL_SETTLEMENT')this.buildSettlement(x,z,variant);
    }
    return this;
  }

  applyClass(config={}){this.classConfig={poiLootMultiplier:Number.isFinite(config.poiLootMultiplier)?config.poiLootMultiplier:1};}

  seedLoot(){
    for(const l of this.lootQueue)this.items.spawn(l.type,l.position,l.options||{});
  }

  seedClassBonusLoot(config=this.classConfig){
    if(this.classBonusLootSeeded)return 0;
    this.classBonusLootSeeded=true;
    const mul=Number(config?.poiLootMultiplier)||1;if(mul<=1)return 0;
    const chance=Math.min(.24,(mul-1)*.75);let spawned=0;
    for(let i=0;i<this.lootQueue.length;i++){
      const l=this.lootQueue[i];if(Math.random()>=chance)continue;
      const pos=l.position.clone().add(new THREE.Vector3((i%2?1:-1)*.55,0,.35));
      const type=i%5===0?'Medkit':i%3===0?'Ammo':'Scrap Metal';
      const options=type==='Ammo'?{weaponType:'auto',ammoAmount:8}:{};
      if(this.items.spawn(type,pos,options))spawned++;
    }
    return spawned;
  }

  updateVisuals(nightFactor=0,focusPosition=null,detailDistance=190){
    const n=THREE.MathUtils.clamp(nightFactor,0,1);
    if(this.shared.warmGlassMat)this.shared.warmGlassMat.emissiveIntensity=THREE.MathUtils.lerp(.035,1.35,n);
    if(this.shared.lampMat)this.shared.lampMat.emissiveIntensity=THREE.MathUtils.lerp(.18,2.3,n);
    // Detailed POIs are invisible long before the fog would make their small props useful.
    // Hiding whole roots saves many draw calls while landmarks remain visible separately.
    if(focusPosition){
      const z=focusPosition.z||0,show=Math.max(125,detailDistance),hide=show+25;
      for(const root of this.roots){
        const dz=Math.abs((root.userData.poiZ||0)-z);
        if(root.visible&&dz>hide)root.visible=false;
        else if(!root.visible&&dz<show)root.visible=true;
      }
    }
  }

  enemySpawnPoints(){return this.spawnAnchors;}
}

window.WorldPOISystem=WorldPOISystem;
