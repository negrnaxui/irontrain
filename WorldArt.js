class WorldArtSystem {
  constructor(scene, collisions, materials, dayNight, effects=null, weather=null) {
    this.scene = scene;
    this.collisions = collisions;
    this.M = materials;
    this.dayNight = dayNight;
    this.effects = effects;
    this.weather = weather;
    this.animated = [];
    this.windowCounter = 0;
    this.lightSpills = [];
    this.spillMaterialCache = new Map();
    this.distantLights = [];
    this.distanceGroups = [];
    this.visibilityTimer = 0;
    this.smoke = [];
    this.seed = 0x77a911;
    this.visualTime = 0;
    this.shared = this.createShared();
  }

  rand(){ this.seed=(this.seed*1664525+1013904223)>>>0; return this.seed/4294967296; }

  createShared(){
    const roadCanvas=document.createElement('canvas'); roadCanvas.width=roadCanvas.height=128;
    const rc=roadCanvas.getContext('2d'); rc.fillStyle='#443f36'; rc.fillRect(0,0,128,128);
    let s=991; const rnd=()=>((s=(s*1664525+1013904223)>>>0)/4294967296);
    for(let i=0;i<1150;i++){
      const v=35+Math.floor(rnd()*42); rc.fillStyle=`rgba(${v+18},${v+13},${v+6},${.10+rnd()*.18})`; rc.fillRect(rnd()*128,rnd()*128,1+rnd()*3,1+rnd()*2);
    }
    for(let i=0;i<8;i++){rc.strokeStyle='rgba(24,23,20,.28)';rc.lineWidth=2+rnd()*3;rc.beginPath();rc.moveTo(0,14+i*15+rnd()*5);rc.lineTo(128,14+i*15+(rnd()-.5)*7);rc.stroke();}
    const roadTex=new THREE.CanvasTexture(roadCanvas); roadTex.wrapS=roadTex.wrapT=THREE.RepeatWrapping;roadTex.repeat.set(5,2);roadTex.encoding=THREE.sRGBEncoding;
    const roadMat=new THREE.MeshStandardMaterial({map:roadTex,color:0x7b7465,roughness:1,metalness:0});
    const rutMat=new THREE.MeshStandardMaterial({color:0x302d28,roughness:1,metalness:0});
    const warmWindowDim=new THREE.MeshStandardMaterial({color:0x4d3929,emissive:0xb85d28,emissiveIntensity:.05,roughness:.34,metalness:.03});
    const warmWindow=new THREE.MeshStandardMaterial({color:0x6f4d2d,emissive:0xff9a45,emissiveIntensity:.15,roughness:.28,metalness:.04});
    const warmWindowBright=new THREE.MeshStandardMaterial({color:0x8b5b31,emissive:0xffb35c,emissiveIntensity:.24,roughness:.25,metalness:.03});
    const coldWindow=new THREE.MeshStandardMaterial({color:0x26343b,emissive:0x47777f,emissiveIntensity:.035,roughness:.22,metalness:.08});
    const contactShadow=new THREE.MeshBasicMaterial({color:0x090b0c,transparent:true,opacity:.12,depthWrite:false,depthTest:true});
    const railTop=new THREE.MeshStandardMaterial({color:0x9b9f9d,roughness:.31,metalness:.97});
    const water=new THREE.MeshStandardMaterial({color:0x1b2527,roughness:.18,metalness:.18,transparent:true,opacity:.76});
    const redBulb=new THREE.MeshStandardMaterial({color:0x7a251d,emissive:0xe0472e,emissiveIntensity:.25,roughness:.35});
    const greenBulb=new THREE.MeshStandardMaterial({color:0x35594d,emissive:0x55a382,emissiveIntensity:.22,roughness:.35});
    const rustAlt=this.M.rust.clone();rustAlt.color.setHex(0x7d5542);rustAlt.roughness=Math.min(1,(rustAlt.roughness||.8)+.08);
    const oilyIron=this.M.darkIron.clone();oilyIron.color.setHex(0x434b4d);oilyIron.roughness=.42;oilyIron.metalness=.92;
    const wetWood=this.M.wood.clone();wetWood.color.setHex(0x5f4836);wetWood.roughness=.78;
    const sootDecal=new THREE.MeshBasicMaterial({color:0x171a1b,transparent:true,opacity:.24,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    const oilDecal=new THREE.MeshBasicMaterial({color:0x0e1010,transparent:true,opacity:.31,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    const clothA=new THREE.MeshStandardMaterial({color:0x716454,roughness:1,metalness:0});
    const clothB=new THREE.MeshStandardMaterial({color:0x4f5c59,roughness:1,metalness:0});
    const weldMat=new THREE.MeshStandardMaterial({color:0xb8d9ff,emissive:0x8cc7ff,emissiveIntensity:.1,roughness:.18,metalness:.15});
    return {
      box:new THREE.BoxGeometry(1,1,1), cyl:new THREE.CylinderGeometry(.5,.5,1,10), plane:new THREE.PlaneGeometry(1,1), circle:new THREE.CircleGeometry(1,24),
      torus:new THREE.TorusGeometry(.5,.08,7,16), wheel:new THREE.TorusGeometry(.55,.10,8,16), cone:new THREE.ConeGeometry(.5,1,4),
      roadMat,rutMat,warmWindowDim,warmWindow,warmWindowBright,coldWindow,contactShadow,railTop,water,redBulb,greenBulb,rustAlt,oilyIron,wetWood,sootDecal,oilDecal,clothA,clothB,weldMat
    };
  }

  trackDistanceGroup(group,z,show=260,hide=310){
    if(!group)return group;
    group.userData.detailZ=z;this.distanceGroups.push({group,z,show,hide});
    return group;
  }

  updateDistanceVisibility(focusPosition,scale=1){
    if(!focusPosition)return;
    const z=focusPosition.z||0;
    for(const e of this.distanceGroups){
      const show=Math.max(120,e.show*scale),hide=Math.max(show+20,e.hide*scale),dz=Math.abs(e.z-z);
      if(e.group.visible&&dz>hide)e.group.visible=false;
      else if(!e.group.visible&&dz<show)e.group.visible=true;
    }
  }

  addBox(parent,mat,x,y,z,sx,sy,sz,{ry=0,rx=0,rz=0,collide=false,raycast=true,walkable=false,tag='art'}={}){
    const m=new THREE.Mesh(this.shared.box,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.set(rx,ry,rz);m.castShadow=sy>2.4;m.receiveShadow=true;parent.add(m);
    if(collide)this.collisions.addSolid(m,{collide:true,raycast,walkableTop:walkable,tag});
    else if(raycast)this.collisions.addSolid(m,{collide:false,raycast:true,tag});
    return m;
  }

  addCylinder(parent,mat,x,y,z,r,h,{collide=false,tag='art-cylinder',rx=0,ry=0,rz=0}={}){
    const m=new THREE.Mesh(this.shared.cyl,mat);m.position.set(x,y,z);m.scale.set(r*2,h,r*2);m.rotation.set(rx,ry,rz);m.castShadow=h>4;m.receiveShadow=true;parent.add(m);if(collide)this.collisions.addSolid(m,{tag});return m;
  }

  addRoad(x,z,w,d,ry=0){
    const g=new THREE.Group();g.position.set(x,.042,z);g.rotation.y=ry;
    const road=new THREE.Mesh(this.shared.plane,this.shared.roadMat);road.rotation.x=-Math.PI/2;road.scale.set(w,d,1);road.receiveShadow=true;g.add(road);
    for(const xo of [-w*.23,w*.23]){const rut=new THREE.Mesh(this.shared.plane,this.shared.rutMat);rut.rotation.x=-Math.PI/2;rut.position.set(xo,.006,0);rut.scale.set(Math.max(.16,w*.07),d*.94,1);g.add(rut);}
    this.scene.add(g);return g;
  }

  addContactShadow(x,z,w,d,opacity=.12){
    const m=new THREE.Mesh(this.shared.circle,this.shared.contactShadow);m.rotation.x=-Math.PI/2;m.position.set(x,.016,z);m.scale.set(w*.62,d*.62,1);m.renderOrder=2;m.userData.ignoreRaycast=true;this.scene.add(m);return m;
  }

  addWeldingArc(parent,x,y,z,phase=0){
    const mat=this.shared.weldMat.clone();const core=new THREE.Mesh(new THREE.SphereGeometry(.055,6,4),mat);core.position.set(x,y,z);core.userData.ignoreRaycast=true;core.userData.noShadow=true;parent.add(core);
    this.animated.push({type:'weldPulse',material:mat,base:.02,amp:2.6,speed:13.5,phase});return core;
  }

  addLightSpill(kind,x,z,radius=3.4,y=.022){
    const colors={start:0xff9f4b,weapon:0xc74532,trade:0xb9cbb6,settlement:0xffb85f,industrial:0xff7e34};
    let mat=this.spillMaterialCache.get(kind);
    if(!mat){mat=new THREE.MeshBasicMaterial({color:colors[kind]||0xffa24e,transparent:true,opacity:0,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending});this.spillMaterialCache.set(kind,mat);}
    const m=new THREE.Mesh(this.shared.circle,mat);m.rotation.x=-Math.PI/2;m.position.set(x,y,z);m.scale.set(radius,radius*.72,1);m.userData.ignoreRaycast=true;this.scene.add(m);this.lightSpills.push({mesh:m,material:mat,base:.055+(kind==='settlement'?.018:0)});return m;
  }

  addWindow(parent,x,y,z,w=.9,h=1.1,{side='front',warm=false}={}){
    let mat=this.shared.coldWindow;
    if(warm){ const mode=(this.windowCounter++)%7; mat=mode===0?this.shared.warmWindowBright:(mode<4?this.shared.warmWindow:this.shared.warmWindowDim); }
    const frameMat=this.M.darkIron; let glass, f1, f2;
    if(side==='front'){
      glass=this.addBox(parent,mat,x,y,z,w,h,.045,{raycast:false});
      f1=this.addBox(parent,frameMat,x,y,z-.035,.06,h+.16,.075,{raycast:false});
      f2=this.addBox(parent,frameMat,x,y,z-.04,w+.14,.06,.075,{raycast:false});
    } else {
      glass=this.addBox(parent,mat,x,y,z,.045,h,w,{raycast:false});
      f1=this.addBox(parent,frameMat,x-.035,y,z,.075,h+.16,.06,{raycast:false});
      f2=this.addBox(parent,frameMat,x-.04,y,z,.075,.06,w+.14,{raycast:false});
    }
    return glass;
  }

  addDoor(parent,x,y,z,w=1.15,h=2.25,side='front',mat=this.M.wood){
    const door=side==='front'?this.addBox(parent,mat,x,y,z,w,h,.11,{raycast:true}):this.addBox(parent,mat,x,y,z,.11,h,w,{raycast:true});
    const hingeMat=this.M.darkIron;
    for(const dy of [-.65,.62]){
      if(side==='front')this.addBox(parent,hingeMat,x+w*.40,y+dy,z-.075,.08,.24,.05,{raycast:false});
      else this.addBox(parent,hingeMat,x-.075,y+dy,z+w*.40,.05,.24,.08,{raycast:false});
    }
    return door;
  }

  addGableRoof(parent,x,y,z,w,d,{damaged=false,mat=this.M.rust,slope=.34}={}){
    const halfW=w*.53, rise=Math.tan(slope)*halfW;
    const left=this.addBox(parent,mat,x-halfW*.48,y+rise*.50,z,halfW,.18,d+.45,{rz:slope,raycast:true});
    const right=this.addBox(parent,mat,x+halfW*.48,y+rise*.50,z,halfW,.18,d+.45,{rz:-slope,raycast:true});
    if(damaged){right.scale.z*=.55;right.position.z+=d*.21;right.rotation.x=.06;}
    return [left,right];
  }

  addLeanRoof(parent,x,y,z,w,d,{dir=1,mat=this.M.darkIron}={}){
    return this.addBox(parent,mat,x,y,z,w,.18,d+.35,{rz:.18*dir,raycast:true});
  }

  buildHouse(parent,x,z,variant=0,{twoStory=false,warm=false,ruined=false,label=null}={}){
    const M=this.M; const w=[5.2,6.4,5.8,7.0,5.6,6.6][variant%6], d=[5.6,6.0,6.8,5.4,6.2,6.4][variant%6];
    const h=twoStory||variant%6===5?5.4:3.25;
    const wall=[this.shared.wetWood,this.shared.rustAlt,M.soot,M.wood,this.shared.oilyIron,this.shared.rustAlt][variant%6];
    this.addContactShadow(x,z,w,d,.12);
    this.addBox(parent,M.concrete,x,.14,z,w+.5,.28,d+.5,{collide:true,walkable:true,tag:'house-foundation'});
    const body=this.addBox(parent,wall,x,.28+h/2,z,w,h,d,{collide:true,tag:'house-body'});
    // Vertical structure breaks the primitive box silhouette.
    for(const sx of [-1,1])for(const sz of [-1,1])this.addBox(parent,M.darkIron,x+sx*(w/2+.04),.35+h*.52,z+sz*(d/2+.04),.13,h+.28,.13,{raycast:false});
    for(let i=-2;i<=2;i++){
      const px=x+i*w/5.2;this.addBox(parent,variant%2?M.darkIron:M.wood,px,.45+h*.52,z-d/2-.07,.055,h-.12,.09,{raycast:false});
    }
    // Distinct roofs by template.
    const roofY=.28+h+.05;
    if(variant%6===0||variant%6===2||variant%6===5)this.addGableRoof(parent,x,roofY,z,w+.35,d+.35,{damaged:ruined||variant%6===4});
    else if(variant%6===1||variant%6===3)this.addLeanRoof(parent,x,roofY+.32,z,w+.55,d+.45,{dir:variant%2?1:-1});
    else this.addGableRoof(parent,x,roofY,z,w+.25,d+.25,{damaged:true,slope:.30});
    // Door + threshold + steps/porch.
    const doorX=x+(variant%3-1)*w*.17;this.addDoor(parent,doorX,1.40,z-d/2-.07,1.08,2.22,'front',M.wood);
    this.addBox(parent,M.concrete,doorX,.22,z-d/2-.62,1.5,.25,.85,{collide:true,walkable:true,tag:'house-step'});
    if(variant%6===2||variant%6===5){
      this.addBox(parent,M.wood,doorX,.38,z-d/2-1.15,3.0,.18,1.9,{collide:true,walkable:true,tag:'house-porch'});
      for(const sx of [-1.25,1.25])this.addBox(parent,M.darkIron,doorX+sx,1.45,z-d/2-1.62,.10,2.1,.10,{raycast:false});
      this.addLeanRoof(parent,doorX,2.55,z-d/2-1.25,3.2,2.0,{dir:1,mat:M.rust});
    }
    const windowY=twoStory||variant%6===5?[1.95,4.15]:[2.05];
    for(const yy of windowY){for(const ox of [-w*.27,w*.27])this.addWindow(parent,x+ox,yy,z-d/2-.09,.95,.92,{warm:warm&&((ox>0)||(yy>3))});}
    // Chimney and service pipe.
    const chimney=this.addCylinder(parent,M.soot,x+w*.30,roofY+1.25,z+d*.16,.20,2.4,{collide:false});
    this.addBox(parent,M.copper,x-w*.38,1.45,z+d/2+.07,.09,2.2,.09,{raycast:false});
    if(ruined){
      body.scale.x*=.78;body.position.x-=w*.11;
      this.collisions.refreshSolid?.(body);
      for(let i=0;i<5;i++)this.addBox(parent,i%2?M.wood:M.rust,x-w*.58+(i%3)*.62,.16,z+d*.54+(i%2)*.48,.8,.16,.16,{ry:(i-.5)*.34,raycast:false});
      const beam=this.addBox(parent,M.darkIron,x+w*.42,2.0,z-d*.12,.18,4.3,.18,{rz:.45,raycast:false});
    }
    if(variant%6===3){ // metal annex
      this.addBox(parent,M.rust,x+w*.66,1.15,z+.7,w*.35,2.3,d*.58,{collide:true,tag:'house-annex'});
      this.addLeanRoof(parent,x+w*.66,2.48,z+.7,w*.39,d*.64,{dir:-1,mat:M.darkIron});
    }
    return {w,d,h,chimney};
  }

  addPortLamp(kind,x,z,y=5.0,type='post'){
    const colors={start:0xffa74f,weapon:0xd4492f,trade:0xe3d4aa,settlement:0xffb95f,industrial:0xff8538};
    const accent=kind==='trade'?0x71a892:(colors[kind]||0xffa74f);
    let bulb;
    if(type==='wall'){
      this.addBox(this.scene,this.M.darkIron,x,y-.15,z,.55,.12,.55,{rx:.2,raycast:false});
      bulb=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshStandardMaterial({color:accent,emissive:accent,emissiveIntensity:.25,roughness:.3}));bulb.position.set(x,y,z);this.scene.add(bulb);
    }else{
      const pole=this.addCylinder(this.scene,this.M.darkIron,x,y*.5,z,.08,y,{collide:true,tag:'port-lamp'});
      const hood=new THREE.Mesh(new THREE.ConeGeometry(.42,.30,10),this.M.rust);hood.position.set(x,y+.12,z);hood.rotation.x=Math.PI;this.scene.add(hood);
      bulb=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshStandardMaterial({color:accent,emissive:accent,emissiveIntensity:.25,roughness:.3}));bulb.position.set(x,y-.08,z);this.scene.add(bulb);
    }
    const light=new THREE.PointLight(accent,.04,kind==='industrial'?15:11,2);light.position.copy(bulb.position);this.scene.add(light);this.dayNight?.registerLamp(light,bulb.material,{day:.018,night:kind==='weapon'?2.4:2.0,flicker:kind==='industrial'?.09:.045,fadeStart:76,maxDistance:116});
    this.addLightSpill(kind,x,z,kind==='industrial'?4.6:3.6);
    return light;
  }

  addSpot(kind,x,y,z,targetX,targetY,targetZ){
    const colors={weapon:0xe35c40,industrial:0xdfe7e2,trade:0xbad8ca,start:0xffbd6c,settlement:0xffc875};
    const c=colors[kind]||0xffbd6c;
    const root=new THREE.Group();root.position.set(x,y,z);this.scene.add(root);
    const casing=new THREE.Mesh(new THREE.CylinderGeometry(.26,.36,.62,12),this.M.darkIron);casing.rotation.x=Math.PI/2;root.add(casing);
    const lensMat=new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.25,roughness:.22,metalness:.18});
    const lens=new THREE.Mesh(new THREE.CircleGeometry(.24,14),lensMat);lens.position.z=.325;root.add(lens);
    const light=new THREE.SpotLight(c,.03,42,Math.PI/8,.58,1.45);root.add(light);
    const target=new THREE.Object3D();target.position.set(targetX,targetY,targetZ);this.scene.add(target);light.target=target;light.castShadow=false;
    this.dayNight?.registerLamp(light,lensMat,{day:.005,night:kind==='weapon'?4.2:3.0,flicker:.01,fadeStart:88,maxDistance:128});
    const beamMat=new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:0,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.10,2.45,20,12,1,true),beamMat);beam.rotation.x=Math.PI/2;beam.position.z=10;beam.userData.ignoreRaycast=true;root.add(beam);
    root.lookAt(target.position);
    const animated={type:'spotSweep',object:target,root,beamMat,kind,baseX:targetX,baseZ:targetZ,amp:kind==='weapon'?5.5:7.5,speed:kind==='weapon'?.095:.070,phase:this.rand()*6.2};
    this.animated.push(animated);
    return light;
  }

  addSideTrack(x,z,length=100){
    for(const dx of [-1.43,1.43]){const rail=this.addBox(this.scene,this.M.darkIron,x+dx,.24,z,.13,.22,length,{raycast:true});const top=this.addBox(this.scene,this.shared.railTop,x+dx,.36,z,.10,.025,length,{raycast:false});}
    const count=Math.max(8,Math.floor(length/2.7));const sleepers=new THREE.InstancedMesh(new THREE.BoxGeometry(4.6,.14,.34),this.M.wood,count);const d=new THREE.Object3D();for(let i=0;i<count;i++){d.position.set(x,.09,z-length/2+i*(length/(count-1)));d.rotation.y=((i%5)-2)*.006;d.updateMatrix();sleepers.setMatrixAt(i,d.matrix);}sleepers.receiveShadow=true;this.scene.add(sleepers);return sleepers;
  }

  addSwitch(fromX,toX,z,len=18){
    const mid=(fromX+toX)/2, angle=Math.atan2(toX-fromX,len);for(const s of [-1.42,1.42]){const rail=this.addBox(this.scene,this.M.darkIron,mid+s*Math.cos(angle),.24,z,.12,.20,Math.hypot(toX-fromX,len),{ry:angle,raycast:false});}
    const lever=this.addBox(this.scene,this.M.rust,toX+(toX>0?2:-2),.45,z+len*.15,.22,.9,.22,{rz:.45,raycast:false});
    const wheel=new THREE.Mesh(this.shared.torus,this.M.brass);wheel.scale.set(.55,.55,.55);wheel.position.set(lever.position.x,.82,lever.position.z);wheel.rotation.y=Math.PI/2;this.scene.add(wheel);
  }

  buildPortApproach(kind,z){
    // Signals and sidings begin well before the platform so ports announce themselves from the cab.
    const signZ=z-125;for(const side of [-1,1]){
      const x=side*5.2;this.addCylinder(this.scene,this.M.darkIron,x,2.6,signZ,.10,5.2,{collide:true,tag:'approach-signal'});
      const head=this.addBox(this.scene,this.M.rust,x,4.8,signZ,.62,1.0,.32,{raycast:true});
      const mat=kind==='weapon'?this.shared.redBulb:this.shared.greenBulb;const lens=new THREE.Mesh(new THREE.CircleGeometry(.16,12),mat);lens.position.set(x,4.9,signZ-.17);this.scene.add(lens);
    }
    const sideX=kind==='trade'?-9.5:-11.5;this.addSideTrack(sideX,z-10,150);this.addSwitch(0,sideX,z-82,22);
    if(kind==='trade'||kind==='industrial'){this.addSideTrack(-19,z+3,110);this.addSwitch(sideX,-19,z-56,18);}
  }

  buildDepot(z,top){
    const M=this.M,g=new THREE.Group();this.scene.add(g);this.trackDistanceGroup(g,z,280,330);
    this.addRoad(31,z+6,16,58,0);
    // Large locomotive shed around the pre-existing parked engines on the west side.
    const x=-26,w=23,d=43,h=9.2;
    this.addBox(g,M.concrete,x,.20,z+2,w+.8,.4,d+.8,{collide:true,walkable:true,tag:'depot-foundation'});
    this.addBox(g,M.soot,x-w/2+.25,h/2,z+2,.5,h,d,{collide:true,tag:'depot-wall'});
    this.addBox(g,M.soot,x+w/2-.25,h/2,z+2,.5,h,d,{collide:true,tag:'depot-wall'});
    this.addBox(g,M.soot,x,h/2,z+2+d/2-.25,w,h,.5,{collide:true,tag:'depot-wall'});
    this.addGableRoof(g,x,h+.25,z+2,w,d,{mat:M.darkIron,slope:.26});
    for(let zz=z-16;zz<=z+18;zz+=8){this.addBox(g,M.rust,x,7.2,zz,w-.8,.20,.22,{raycast:false});for(const xx of [x-w/2+2,x,x+w/2-2])this.addBox(g,M.darkIron,xx,4.0,zz,.18,7.6,.18,{raycast:false});}
    // Open inspection pit between the parked service rails: visual dark recess + edge plates.
    const pitMat=new THREE.MeshStandardMaterial({color:0x101315,roughness:.86,metalness:.45});this.addBox(g,pitMat,-22,.06,z+10,2.0,.12,17,{raycast:false});for(const xx of [-23.1,-20.9])this.addBox(g,M.brass,xx,.18,z+10,.10,.10,17,{raycast:false});
    // Overhead repair crane and chain.
    const craneBeam=this.addBox(g,M.rust,x,8.1,z+2,w-2,.36,.45,{raycast:false});
    const trolley=this.addBox(g,M.darkIron,-24,7.6,z+2,1.5,.65,.75,{raycast:false});this.animated.push({type:'slide',object:trolley,base:-24,axis:'x',amp:3.4,speed:.16,phase:.5});
    for(let i=0;i<7;i++){const link=new THREE.Mesh(new THREE.TorusGeometry(.15,.035,6,10),M.darkIron);link.position.set(-24,7.2-i*.24,z+2);link.rotation.y=(i%2)*Math.PI/2;g.add(link);}
    // Coal yard on east side.
    for(let i=0;i<14;i++){const heap=new THREE.Mesh(new THREE.DodecahedronGeometry(.9+(i%3)*.15,0),M.soot);heap.position.set(27+(i%4)*1.35,.48,z-25+Math.floor(i/4)*1.5);heap.scale.set(1.2,.48,1.3);g.add(heap);}
    for(const xx of [25,31])this.addBox(g,M.rust,xx,1.0,z-23,.16,2.0,10,{raycast:false});
    this.addCylinder(g,M.rust,37,6.8,z-20,2.2,4.2,{collide:false});for(const xx of [35.6,38.4])for(const zz of [z-21.4,z-18.6])this.addBox(g,M.darkIron,xx,3.2,zz,.18,6.4,.18,{raycast:false});
    // Dispatch office + signal tower creates a clear port skyline.
    this.buildHouse(g,35,z+18,5,{twoStory:true,warm:true});
    const towerX=43;for(const xx of [towerX-1.1,towerX+1.1])for(const zz of [z+28-1.1,z+28+1.1])this.addBox(g,M.darkIron,xx,4.2,zz,.18,8.4,.18,{collide:true,tag:'signal-tower'});
    this.addBox(g,M.rust,towerX,8.6,z+28,3.5,1.8,3.5,{collide:true,tag:'signal-cabin'});this.addGableRoof(g,towerX,9.7,z+28,3.8,3.8,{slope:.28});
    for(const zz of [z-32,z+30])this.addPortLamp('start',20.5,zz,5.0,'post');this.addPortLamp('start',35,z+14,4.2,'wall');
    this.addWeldingArc(g,-24.5,1.65,z+7.5,.7);
  }

  buildWeaponFort(z,top){
    const M=this.M,g=new THREE.Group();this.scene.add(g);this.trackDistanceGroup(g,z,280,330);const wallX=31;
    this.addRoad(21,z,14,82,0);
    // Fortress wall, deliberately segmented so the port remains walkable.
    for(const dz of [-32,-21,-10,13,24,35])this.addBox(g,M.darkIron,wallX,3.3,z+dz,1.0,6.6,10,{collide:true,tag:'fort-wall'});
    // Gatehouse with two towers.
    for(const dz of [-7,7]){
      this.addBox(g,M.soot,wallX,5.2,z+dz,5.8,10.4,5.6,{collide:true,tag:'fort-tower'});this.addBox(g,M.rust,wallX,10.6,z+dz,6.4,.5,6.2,{raycast:false});
      this.addSpot('weapon',wallX-2.4,9.4,z+dz,2,1.5,z+dz-18);
    }
    const gate=this.addBox(g,M.rust,wallX,3.0,z,1.1,6.0,7.4,{collide:true,tag:'fort-gate'});for(let y=.7;y<5.8;y+=.65)this.addBox(g,M.darkIron,wallX-.58,y,z,.12,.16,7.1,{raycast:false});
    // Armoury hall + angled protective ribs.
    this.addBox(g,M.soot,43,4.0,z-14,17,8,18,{collide:true,tag:'armory-hall'});this.addLeanRoof(g,43,8.4,z-14,18,19,{dir:-1,mat:M.darkIron});
    for(let zz=z-21;zz<=z-7;zz+=4)this.addBox(g,M.rust,33.9,4.0,zz,.35,7.2,.5,{rz:-.18,raycast:false});
    // Shooting range on west side, targets and blast wall.
    this.addBox(g,M.rust,-24,1.45,z+19,1.0,2.9,26,{collide:true,tag:'range-wall'});for(const zz of [z+10,z+17,z+24]){const target=new THREE.Mesh(new THREE.CircleGeometry(.65,16),M.rust);target.position.set(-18,1.5,zz);target.rotation.y=Math.PI/2;g.add(target);this.addBox(g,M.darkIron,-18,.75,zz,.08,1.5,.08,{raycast:false});}
    // Defensive barricades.
    for(const [x,dz] of [[22,-28],[22,28],[16,-35],[16,35]]){const b=this.addBox(g,M.rust,x,.8,z+dz,3.4,1.6,.45,{ry:.18*(dz>0?1:-1),collide:true,tag:'barricade'});for(let i=-1;i<=1;i++)this.addBox(g,M.darkIron,x+i*.9,1.2,z+dz-.28,.08,1.7,.08,{raycast:false});}
    for(const dz of [-31,31])this.addPortLamp('weapon',24,z+dz,5.2,'post');
  }

  buildTradeHub(z,top){
    const M=this.M,g=new THREE.Group();this.scene.add(g);this.trackDistanceGroup(g,z,290,345);
    this.addRoad(33,z,26,96,0);
    // Multiple cargo decks and different warehouse masses.
    for(const [x,dz,w,d,h] of [[27,-26,10,16,5.3],[38,-10,14,20,7.0],[29,24,9,15,4.6],[44,23,12,12,6.1]]){
      this.addBox(g,M.concrete,x,.18,z+dz,w+.6,.36,d+.6,{collide:true,walkable:true,tag:'cargo-pad'});this.addBox(g,(x%2?M.rust:M.soot),x,h/2+.36,z+dz,w,h,d,{collide:true,tag:'trade-warehouse'});this.addLeanRoof(g,x,h+.6,z+dz,w+.5,d+.5,{dir:dz>0?1:-1,mat:M.darkIron});
    }
    // Cranes with offset booms.
    for(const [x,dz,h] of [[-16,-20,12],[-20,19,15],[18,32,10]]){
      this.addBox(g,M.darkIron,x,h/2,z+dz,.46,h,.46,{collide:true,tag:'trade-crane'});const boom=this.addBox(g,M.rust,x+(x<0?4:-4),h-.8,z+dz,8.8,.32,.35,{raycast:false});const hook=this.addBox(g,M.darkIron,x+(x<0?7:-7),h-3.0,z+dz,.06,4.2,.06,{raycast:false});this.animated.push({type:'sway',object:hook,base:hook.rotation.z,axis:'rz',amp:.06,speed:.65,phase:this.rand()*5});
    }
    // Weigh station and huge mechanical scale.
    this.addBox(g,M.concrete,18,.13,z+4,5.8,.26,9,{collide:true,walkable:true,tag:'weigh-pad'});const dial=new THREE.Mesh(new THREE.CircleGeometry(1.15,20),M.brass);dial.position.set(21,3.6,z+2);dial.rotation.y=-Math.PI/2;g.add(dial);this.addBox(g,M.darkIron,21,2.0,z+2,.2,4,.2,{raycast:false});
    // Cargo arranged in imperfect clusters, not a grid.
    for(let i=0;i<26;i++){const x=23+this.rand()*24,dz=-35+this.rand()*70,w=.7+this.rand()*1.5,h=.55+this.rand()*1.0,d=.7+this.rand()*1.4;const mat=i%4===0?M.rust:M.wood;const c=this.addBox(g,mat,x,.3+h/2,z+dz,w,h,d,{ry:(this.rand()-.5)*.18,collide:i<8,walkable:i<8,tag:'trade-cargo'});}
    // Tanks / bales.
    for(const dz of [-31,-25,25])this.addCylinder(g,M.rust,47,1.0,z+dz,.85,2.0,{collide:true,tag:'trade-tank',rz:Math.PI/2});
    for(const dz of [-34,34])this.addPortLamp('trade',20.5,z+dz,5.0,'post');this.addSpot('trade',39,8,z-4,4,1.3,z+2);
  }

  buildSettlementPort(z,top){
    const M=this.M,g=new THREE.Group();this.scene.add(g);this.trackDistanceGroup(g,z,285,340);
    // Coherent street and central square instead of random huts.
    this.addRoad(33,z,12,92,0);this.addRoad(26,z,28,8,0);
    const houses=[
      [25,-31,0,false],[34,-29,2,false],[43,-24,5,true],[25,-10,3,false],[43,-5,1,false],
      [25,15,4,false],[35,19,0,false],[44,18,5,true],[27,34,2,false]
    ];
    houses.forEach(([x,dz,v,two],i)=>{const h=this.buildHouse(g,x,z+dz,v,{twoStory:two,warm:i%3!==1,ruined:i===5});if(i%2===0)this.addPortLamp('settlement',x-3,z+dz-2,3.8,'wall');});
    // Market square with awnings, benches and central lamp.
    this.addBox(g,M.concrete,34,.10,z+3,14,.2,13,{collide:false,raycast:true});this.addPortLamp('settlement',34,z+3,6.2,'post');
    for(const [x,dz] of [[30,0],[38,0],[30,7],[38,7]]){this.addBox(g,M.wood,x,.55,z+dz,2.2,1.1,.85,{collide:true,walkable:true,tag:'market-table'});const awn=this.addBox(g,M.rust,x,2.4,z+dz,2.8,.12,2.0,{rz:(x%2?.04:-.04),raycast:false});}
    // Heating pipes and generator yard.
    for(const zz of [z-38,z+38]){const pipe=this.addCylinder(g,M.copper,19,1.25,zz,.16,13,{collide:false,rz:Math.PI/2});}
    const gen=this.addBox(g,M.soot,49,1.0,z+34,4.2,2.0,3.0,{collide:true,tag:'generator'});const fan=new THREE.Mesh(new THREE.TorusGeometry(.82,.10,7,16),M.brass);fan.position.set(46.85,1.15,z+34);fan.rotation.y=Math.PI/2;g.add(fan);this.animated.push({type:'spin',object:fan,axis:'z',speed:1.7});
    // Benches, washing line, barrels and domestic traces.
    for(const dz of [-6,10]){this.addBox(g,M.wood,34,.42,z+dz,2.1,.16,.55,{raycast:false});this.addBox(g,M.darkIron,34,.18,z+dz,1.8,.38,.12,{raycast:false});}
    for(const x of [27,42]){this.addBox(g,M.darkIron,x,2.2,z+28,.08,3.2,.08,{raycast:false});}this.addBox(g,this.shared.warmWindow,34.5,2.45,z+28,15,.035,.04,{raycast:false});
    // Laundry, mailboxes, a handcart/bicycle silhouette and small street signs make the settlement feel inhabited.
    for(let i=0;i<6;i++)this.addBox(g,i%2?this.shared.clothA:this.shared.clothB,29.2+i*2.05,2.12+(i%2)*.10,z+28,.86,.68,.028,{rz:(i-2.5)*.015,raycast:false});
    for(const [x0,dz] of [[22,-28],[22,-8],[22,16],[42,31]]){this.addBox(g,M.rust,x0,1.08,z+dz,.55,.42,.38,{raycast:false});this.addCylinder(g,M.darkIron,x0,.53,z+dz,.035,1.05,{collide:false});}
    const bikeX=39,bikeZ=z+8;for(const dx of [-.85,.85]){const w=new THREE.Mesh(this.shared.wheel,M.darkIron);w.scale.set(.62,.62,.62);w.position.set(bikeX+dx,.62,bikeZ);w.rotation.y=Math.PI/2;g.add(w);}this.addBox(g,M.rust,bikeX,.78,bikeZ,1.55,.07,.07,{rz:.16,raycast:false});this.addBox(g,M.rust,bikeX-.12,1.13,bikeZ,.07,.78,.07,{rz:-.35,raycast:false});
    for(const [x0,dz] of [[25,-18],[44,4]]){this.addBox(g,M.wood,x0,1.42,z+dz,2.4,.68,.10,{raycast:false});this.addBox(g,M.darkIron,x0,2.25,z+dz,.08,2.2,.08,{raycast:false});}
    this.addSmokeSource(43,7.0,z-24,.30);this.addSmokeSource(44,7.4,z+18,.28);this.addSmokeSource(27,6.2,z+34,.24);
  }

  buildIndustrialPort(z,top){
    const M=this.M,g=new THREE.Group();this.scene.add(g);this.trackDistanceGroup(g,z,320,380);
    this.addRoad(35,z,30,118,0);
    // Main factory mass with vertical hierarchy.
    this.addBox(g,M.soot,34,6.5,z-12,28,13,30,{collide:true,tag:'factory'});this.addBox(g,M.darkIron,34,13.3,z-12,29,.55,31,{raycast:false});
    this.addBox(g,M.rust,48,10.0,z+19,16,20,20,{collide:true,tag:'boiler-house'});this.addBox(g,M.darkIron,48,20.4,z+19,17,.6,21,{raycast:false});
    // Tall stacks 20-30 m.
    const stacks=[[27,z-20,24],[39,z-19,30],[55,z+10,21],[61,z+23,27]];stacks.forEach(([x,zz,h],i)=>{this.addCylinder(g,M.soot,x,h/2,zz,1.1+(i%2)*.25,h,{collide:false});for(const y of [h*.28,h*.58,h*.84]){const ring=new THREE.Mesh(new THREE.TorusGeometry(1.18+(i%2)*.25,.07,7,16),M.rust);ring.position.set(x,y,zz);ring.rotation.x=Math.PI/2;g.add(ring);}this.addSmokeSource(x,h+.3,zz,0.9+i*.12);});
    // Tank farm on west side.
    for(const [x,dz,r,h] of [[-18,-24,3.2,8],[-27,-12,4.2,10],[-18,8,3.5,9],[-30,21,3.0,7]]){this.addCylinder(g,M.rust,x,h/2,z+dz,r,h,{collide:true,tag:'industrial-tank'});this.addCylinder(g,M.darkIron,x,h+.25,z+dz,r*.25,.5,{collide:false});}
    // Overhead pipelines and bridges crossing the route, deliberately above player/train collision height.
    for(const [y,dz] of [[9,z-30],[12,z+2],[15,z+29]]){
      this.addBox(g,M.darkIron,0,y,dz,54,.28,.28,{raycast:true});for(const x of [-22,22])this.addBox(g,M.rust,x,y/2,dz,.36,y,.36,{collide:true,tag:'pipe-support'});
      for(const x of [-19,0,19]){const valve=new THREE.Mesh(new THREE.TorusGeometry(.44,.07,7,14),M.brass);valve.position.set(x,y,dz);valve.rotation.x=Math.PI/2;g.add(valve);}
    }
    // Rail crane and catwalks.
    for(const x of [-12,12])this.addBox(g,M.darkIron,x,6.2,z+38,.55,12.4,.55,{collide:true,tag:'rail-crane'});const bridge=this.addBox(g,M.rust,0,11.8,z+38,25,.55,1.4,{raycast:true});
    const trolley=this.addBox(g,M.darkIron,0,11.1,z+38,2.0,1.0,1.8,{raycast:false});this.animated.push({type:'slide',object:trolley,base:0,axis:'x',amp:7,speed:.13,phase:1.5});
    // Searchlights and orange furnace lamps establish the night palette.
    this.addSpot('industrial',21,12,z-30,0,1.5,z-4);this.addSpot('industrial',21,13,z+34,0,1.5,z+12);for(const dz of [-42,-18,18,42])this.addPortLamp('industrial',20.5,z+dz,5.2,'post');
    this.addWeldingArc(g,39.5,2.2,z+7,2.1);
  }

  buildPort(kind,z,top){
    this.buildPortApproach(kind,z);
    if(kind==='start')this.buildDepot(z,top);
    else if(kind==='weapon')this.buildWeaponFort(z,top);
    else if(kind==='trade')this.buildTradeHub(z,top);
    else if(kind==='settlement')this.buildSettlementPort(z,top);
    else if(kind==='industrial')this.buildIndustrialPort(z,top);
  }

  addRailEnhancements(){
    // Embankment shoulders and polished rail tops. Visual only so existing movement/floor logic stays untouched.
    for(const x of [-4.15,4.15]){const shoulder=this.addBox(this.scene,this.M.ballast,x,-.02,2000,2.0,.22,4500,{rz:x<0?.08:-.08,raycast:false});shoulder.receiveShadow=true;}
    for(const x of [-1.45,1.45])this.addBox(this.scene,this.shared.railTop,x,.365,2000,.10,.026,4500,{raycast:false});
    // Drainage strips and rare water pockets.
    for(let z=70;z<4100;z+=150+Math.floor(this.rand()*110)){const side=this.rand()>.5?1:-1;const puddle=new THREE.Mesh(new THREE.CircleGeometry(1.0+this.rand()*2.2,14),this.shared.water);puddle.rotation.x=-Math.PI/2;puddle.scale.set(1.9,.65,1);puddle.position.set(side*(6.2+this.rand()*2.5),.018,z);this.scene.add(puddle);}
    // Sleeper plates and spikes stay instanced: two extra draw calls total.
    const count=Math.ceil((4220-(-180))/2.5),plateGeo=new THREE.BoxGeometry(.46,.055,.32),plates=new THREE.InstancedMesh(plateGeo,this.M.darkIron,count*2);const spikeGeo=new THREE.CylinderGeometry(.018,.025,.09,5),spikes=new THREE.InstancedMesh(spikeGeo,this.M.rust,count*4);const d=new THREE.Object3D();let pi=0,si=0,idx=0;
    for(let z=-180;z<4220;z+=2.5){for(const x of [-1.45,1.45]){d.position.set(x,.215,z);d.rotation.set(0,0,0);d.updateMatrix();plates.setMatrixAt(pi++,d.matrix);for(const ox of [-.17,.17]){d.position.set(x+ox,.27,z);d.updateMatrix();spikes.setMatrixAt(si++,d.matrix);}}idx++;}
    this.scene.add(plates,spikes);
  }

  addLandmarkLOD(z,side,type){
    const x=side*(58+(type%3)*8),lod=new THREE.LOD();lod.position.set(x,0,z);const near=new THREE.Group(),far=new THREE.Group(),M=this.M;
    if(type===0){ // mine headframe
      for(const sx of [-3,3])this.addBox(near,M.darkIron,sx,7,0,.5,14,.5,{raycast:false});this.addBox(near,M.rust,0,13.2,0,7,.45,.55,{raycast:false});const wheel=new THREE.Mesh(new THREE.TorusGeometry(2.1,.18,8,20),M.brass);wheel.position.set(0,11.5,0);wheel.rotation.y=Math.PI/2;near.add(wheel);this.addBox(far,M.soot,0,7,0,7,14,3,{raycast:false});
    }else if(type===1){ // water/clock tower
      for(const sx of [-1.8,1.8])for(const sz of [-1.8,1.8])this.addBox(near,M.darkIron,sx,5,sz,.22,10,.22,{raycast:false});this.addCylinder(near,M.rust,0,11.2,0,2.6,3.4,{collide:false});this.addBox(far,M.soot,0,6.5,0,5,13,5,{raycast:false});
    }else if(type===2){ // graveyard crane
      this.addBox(near,M.darkIron,0,7,0,.6,14,.6,{raycast:false});this.addBox(near,M.rust,-4,12.8,0,8.5,.5,.5,{raycast:false});for(let i=0;i<5;i++)this.addBox(near,i%2?M.rust:M.darkIron,-6+i*3,.9,3+i%2*2,2.7,1.8,8,{ry:(i-.5)*.08,raycast:false});this.addBox(far,M.soot,0,6,0,15,12,9,{raycast:false});
    }else{ // giant industrial towers
      for(const xx of [-5,0,5])this.addCylinder(near,M.soot,xx,11+xx*.12,0,1.1,22+Math.abs(xx),{collide:false});this.addBox(near,M.rust,0,7,3,15,14,8,{raycast:false});this.addBox(far,M.soot,0,10,0,16,20,9,{raycast:false});
    }
    lod.addLevel(near,0);lod.addLevel(far,220);this.scene.add(lod);return lod;
  }

  buildLandmarks(){
    this.addLandmarkLOD(650,1,0);this.addLandmarkLOD(1450,-1,1);this.addLandmarkLOD(1780,1,1);this.addLandmarkLOD(2480,-1,2);this.addLandmarkLOD(2780,1,2);this.addLandmarkLOD(3440,1,3);this.addLandmarkLOD(3790,-1,3);
  }


  buildTerrainRelief(){
    const moundGeo=new THREE.DodecahedronGeometry(3.5,1), count=44, mounds=new THREE.InstancedMesh(moundGeo,this.M.ground,count),d=new THREE.Object3D();
    for(let i=0;i<count;i++){
      const side=i%2?1:-1,z=55+i*92+this.rand()*62,x=side*(22+this.rand()*34);
      d.position.set(x,-1.05+this.rand()*.25,z);d.rotation.set(this.rand()*.10,this.rand()*Math.PI,(this.rand()-.5)*.08);d.scale.set(1.4+this.rand()*2.1,.28+this.rand()*.38,1.2+this.rand()*2.0);d.updateMatrix();mounds.setMatrixAt(i,d.matrix);
    }
    mounds.castShadow=false;mounds.receiveShadow=true;this.scene.add(mounds);
    // Shallow drainage ditches: visual depression/wet line only, existing collision floor remains untouched.
    const ditchMat=new THREE.MeshStandardMaterial({color:0x313733,roughness:.97,metalness:.02});
    for(const x of [-6.8,6.8]){const ditch=new THREE.Mesh(new THREE.PlaneGeometry(1.2,4300),ditchMat);ditch.rotation.x=-Math.PI/2;ditch.position.set(x,.012,2020);ditch.receiveShadow=true;this.scene.add(ditch);}
  }

  buildStoryScenes(){
    const M=this.M;
    // 1) Abandoned cart and spilled cargo near the coal district.
    {
      const g=new THREE.Group();g.position.set(18,0,705);this.scene.add(g);
      this.addBox(g,M.wood,0,.62,0,2.4,.48,1.35,{ry:.18,collide:true,walkable:true,tag:'story-cart'});
      for(const x of [-.92,.92])for(const z of [-.48,.48]){const w=new THREE.Mesh(this.shared.wheel,M.darkIron);w.scale.set(.48,.48,.48);w.position.set(x,.35,z);w.rotation.y=Math.PI/2;g.add(w);}
      for(const [x,z,r] of [[2.0,.2,.25],[2.8,-.4,-.2],[3.4,.65,.4]])this.addBox(g,M.wood,x,.42,z,1.0,.8,.9,{ry:r,collide:false,raycast:false});
    }
    // 2) Workbench frozen in time beside an old maintenance hut.
    {
      const g=new THREE.Group();g.position.set(-24,0,1515);this.scene.add(g);
      this.addBox(g,M.wood,0,.72,0,2.8,.18,1.0,{collide:true,walkable:true,tag:'story-workbench'});for(const x of [-1.1,1.1])this.addBox(g,M.darkIron,x,.35,0,.12,.7,.12,{raycast:false});
      for(let i=0;i<5;i++)this.addBox(g,i%2?M.rust:M.darkIron,-.9+i*.45,.92,(i%2-.5)*.3,.12,.10,.55,{ry:(i-.5)*.4,raycast:false});
      const inactiveEye=new THREE.Mesh(new THREE.SphereGeometry(.11,7,5),new THREE.MeshStandardMaterial({color:0x2c1b16,emissive:0x3a120c,emissiveIntensity:.08}));inactiveEye.position.set(1.8,1.05,.1);g.add(inactiveEye);
      this.addBox(g,M.rust,1.8,.58,.1,.85,1.1,.65,{ry:.35,raycast:false});
    }
    // 3) A machine has punched into the remains of a roadside wall.
    {
      const g=new THREE.Group();g.position.set(26,0,2625);this.scene.add(g);
      this.addBox(g,M.concrete,0,1.25,0,6.5,2.5,.35,{collide:true,tag:'story-wall'});const engine=this.addCylinder(g,M.soot,-.4,.85,-.7,.75,2.2,{collide:true,tag:'story-engine',rz:Math.PI/2});
      for(let i=0;i<7;i++)this.addBox(g,i%2?M.rust:M.concrete,-2.8+i*.75,.14,.7+(i%3)*.28,.45,.25,.55,{ry:i*.24,raycast:false});
    }
    // 4) Late-route barricade abandoned around a dead boiler.
    {
      const g=new THREE.Group();g.position.set(-21,0,3570);this.scene.add(g);this.addCylinder(g,M.rust,0,1.1,0,1.0,2.2,{collide:true,tag:'story-boiler'});
      for(const z of [-2.2,2.2]){this.addBox(g,M.darkIron,0,.7,z,5.8,1.4,.32,{ry:z>0?.13:-.13,collide:true,tag:'story-barricade'});for(let i=-2;i<=2;i++)this.addBox(g,M.rust,i*1.0,1.0,z-.22,.07,1.2,.07,{raycast:false});}
    }
    // 5) Evacuation scene: a house was left open, luggage and a hand cart were abandoned mid-departure.
    {
      const g=new THREE.Group();g.position.set(23,0,315);this.scene.add(g);
      this.addBox(g,this.shared.wetWood,0,1.75,0,6.2,3.5,5.2,{collide:true,tag:'story-evac-house'});this.addGableRoof(g,0,3.7,0,6.5,5.5,{mat:this.shared.rustAlt,slope:.31});
      const door=this.addBox(g,M.wood,-1.5,1.2,-2.68,1.05,2.35,.10,{ry:-.65,raycast:false});
      this.addBox(g,M.wood,4.0,.55,-1.0,2.4,.45,1.2,{ry:.26,collide:true,walkable:true,tag:'story-evac-cart'});
      for(const [x,z,sx,sy,sz,r] of [[2.2,-2.8,1.1,.65,.75,.12],[3.3,-2.2,.85,.52,.62,-.25],[5.1,-2.0,1.0,.72,.75,.35],[4.7,.2,.7,.55,.65,-.18]])this.addBox(g,M.wood,x,sy/2,z,sx,sy,sz,{ry:r,raycast:false});
      this.addBox(g,M.rust,1.1,.09,-2.1,1.8,.035,.7,{ry:.25,raycast:false});
    }
    // 6) Military cordon: an empty position and a destroyed Shielder show that people once tried to stop the machines.
    {
      const g=new THREE.Group();g.position.set(-25,0,1745);this.scene.add(g);
      for(const z of [-4.2,4.2])this.addBox(g,M.darkIron,0,.78,z,7.4,1.55,.45,{ry:z>0?.12:-.12,collide:true,tag:'story-cordon'});
      this.addCylinder(g,M.darkIron,-4.3,1.1,0,.55,2.2,{collide:true,tag:'story-gunmount'});this.addBox(g,M.rust,-4.3,1.7,-.9,.26,.26,3.8,{rz:-.12,raycast:false});
      // Dead Shielder silhouette: core is dark and shield lies at an angle.
      this.addBox(g,M.rust,3.3,.72,.4,2.5,1.4,1.55,{ry:.42,raycast:false});this.addBox(g,M.darkIron,4.2,1.0,1.3,3.3,2.6,.28,{ry:.58,rz:.18,collide:true,tag:'story-dead-shield'});this.addCylinder(g,M.soot,2.7,.75,-.5,.42,.55,{rx:Math.PI/2,raycast:false});
      const pole=this.addCylinder(g,M.darkIron,-7.0,3.3,-1.5,.10,6.6,{collide:false});const lamp=this.addBox(g,M.rust,-7,6.25,-1.5,1.0,.55,.7,{raycast:false});
    }
    // 7) Previous expedition: a small rail car failed around 34 km. No body, only equipment and a dead worker automaton.
    {
      const g=new THREE.Group();g.position.set(19,0,3385);this.scene.add(g);
      const wagon=this.addBox(g,this.shared.oilyIron,0,1.05,0,8.8,2.1,3.0,{ry:.23,collide:true,tag:'story-expedition-wagon'});this.addBox(g,this.shared.rustAlt,0,2.15,0,9.2,.22,3.3,{ry:.23,raycast:false});
      for(const [x,z] of [[-3.0,-1.7],[-1.2,-2.2],[1.9,-1.5]])this.addBox(g,M.wood,x,.46,z,1.35,.9,1.0,{ry:(x*.19),raycast:false});
      // Broken long gun and scattered metal.
      this.addBox(g,M.darkIron,4.2,.17,-1.2,.14,.12,2.2,{ry:.65,raycast:false});this.addBox(g,M.wood,4.7,.18,-.7,.38,.18,.85,{ry:.65,raycast:false});
      // Destroyed Automaton components.
      this.addBox(g,M.darkIron,-4.5,.48,2.1,1.2,.95,.85,{ry:-.3,raycast:false});for(const x of [-5.1,-3.9])this.addCylinder(g,M.rust,x,.25,2.4,.12,.8,{rz:Math.PI/2});
      const c=document.createElement('canvas');c.width=256;c.height=96;const cx=c.getContext('2d');cx.fillStyle='#2a2b28';cx.fillRect(0,0,256,96);cx.strokeStyle='#9a6c3e';cx.lineWidth=5;cx.strokeRect(5,5,246,86);cx.fillStyle='#c7aa76';cx.font='bold 31px Arial';cx.textAlign='center';cx.fillText('EXP-12',128,58);const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;const signMat=new THREE.MeshBasicMaterial({map:tex});this.addBox(g,signMat,.5,1.05,-1.56,2.2,.8,.035,{ry:.23,raycast:false});
    }
    // 8) The eastern signal becomes visually stronger near the industrial port.
    {
      const redMats=[];
      for(const [x,z,h] of [[-24,3660,5.5],[27,3825,7.0],[-22,3940,8.5]]){
        const g=new THREE.Group();g.position.set(x,0,z);this.scene.add(g);this.addCylinder(g,M.darkIron,0,h/2,0,.10,h,{collide:false});this.addBox(g,M.rust,0,h-.35,0,1.0,.75,.7,{raycast:false});const mat=this.shared.redBulb.clone();mat.emissiveIntensity=.08;const bulb=new THREE.Mesh(new THREE.SphereGeometry(.15,8,6),mat);bulb.position.set(0,h-.25,-.4);g.add(bulb);redMats.push(mat);this.animated.push({type:'pulseEmissive',material:mat,base:.07,amp:.28,speed:2.4+redMats.length*.35,phase:redMats.length});
        this.addBox(g,this.shared.oilyIron,1.4,.65,.2,2.2,1.3,1.6,{raycast:false});
      }
    }
    // Oil and soot marks near the route tell where locomotives and machines have leaked for years.
    for(const [x,z,w,d,kind] of [[-2.1,520,2.4,7,'oil'],[1.8,1380,2.8,5,'soot'],[-2.0,2250,2.5,6,'oil'],[2.2,3220,3.0,7,'soot'],[-1.8,3920,3.4,8,'oil']]){
      const mat=kind==='oil'?this.shared.oilDecal:this.shared.sootDecal;const m=new THREE.Mesh(this.shared.circle,mat);m.rotation.x=-Math.PI/2;m.position.set(x,.038,z);m.scale.set(w,d,1);m.renderOrder=2;m.userData.ignoreRaycast=true;this.scene.add(m);
    }
  }

  buildDistantHorizon(){
    // Mid-distance slag heaps: lit enough to retain material detail through the fog.
    const count=28,geo=new THREE.ConeGeometry(10,10,7),mounds=new THREE.InstancedMesh(geo,this.M.ground,count),d=new THREE.Object3D();
    for(let i=0;i<count;i++){const side=i%2?1:-1,z=120+i*148+(i%4)*29,x=side*(92+(i%5)*11);d.position.set(x,2.5+(i%3),z);d.scale.set(1.2+(i%4)*.35,.65+(i%3)*.22,1.4+(i%5)*.25);d.rotation.y=(i*.63)%Math.PI;d.updateMatrix();mounds.setMatrixAt(i,d.matrix);}
    mounds.castShadow=false;mounds.receiveShadow=false;this.scene.add(mounds);this.distantHorizon=mounds;

    // Far silhouette layer: very cheap, no collision/shadows, gives the frame a second depth plane before the sky.
    const farMat=new THREE.MeshBasicMaterial({color:0x283238,fog:true});
    const farGeo=new THREE.ConeGeometry(14,12,6),farCount=20,far=new THREE.InstancedMesh(farGeo,farMat,farCount);
    for(let i=0;i<farCount;i++){
      const side=i%2?1:-1,z=210+i*205+(i%3)*41,x=side*(142+(i%4)*18);
      d.position.set(x,3.0+(i%4)*.8,z);d.scale.set(1.7+(i%3)*.52,.75+(i%4)*.16,2.0+(i%5)*.33);d.rotation.set(0,(i*.47)%Math.PI,0);d.updateMatrix();far.setMatrixAt(i,d.matrix);
    }
    far.castShadow=false;far.receiveShadow=false;this.scene.add(far);this.farHorizon=far;

    // Sparse industrial silhouettes on the far horizon.  One draw call, intentionally coarse geometry.
    const skylineMat=new THREE.MeshBasicMaterial({color:0x1d272d,fog:true});
    const skylineGeo=new THREE.BoxGeometry(1,1,1),skyCount=24,skyline=new THREE.InstancedMesh(skylineGeo,skylineMat,skyCount);
    for(let i=0;i<skyCount;i++){
      const side=i%2?1:-1,z=330+i*168+(i%5)*22,x=side*(118+(i%4)*14),h=8+(i%6)*3.2,w=3+(i%3)*2.3;
      d.position.set(x,h*.5-1.2,z);d.scale.set(w,h,4+(i%4)*1.8);d.rotation.set(0,(i%3-1)*.06,0);d.updateMatrix();skyline.setMatrixAt(i,d.matrix);
    }
    skyline.castShadow=false;skyline.receiveShadow=false;this.scene.add(skyline);this.farSkyline=skyline;
  }

  buildDistantLights(){
    const mat=new THREE.MeshBasicMaterial({color:0xffa04e,transparent:true,opacity:0,depthWrite:false,depthTest:true});
    const geo=new THREE.SphereGeometry(.24,6,4);const spots=[[-78,11,760],[82,15,1490],[-96,9,2320],[88,16,3320],[-105,21,3660],[97,24,3940]];
    for(const [x,y,z] of spots){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);this.scene.add(m);this.distantLights.push(m);}
    this.distantLightMaterial=mat;
  }

  addSmokeSource(x,y,z,scale=1){
    const texture=this.effects?.textures?.smoke;if(!texture)return;
    const root={x,y,z,scale,particles:[]};for(let i=0;i<4;i++){const mat=new THREE.SpriteMaterial({map:texture,color:0x666764,transparent:true,opacity:.12,depthWrite:false});const s=new THREE.Sprite(mat);s.position.set(x,y+i*1.8,z);s.scale.set(2.0*scale,2.0*scale,1);this.scene.add(s);root.particles.push({sprite:s,phase:i/4});}this.smoke.push(root);
  }

  buildAmbientSmoke(){
    this.addSmokeSource(62,19,620,.8);this.addSmokeSource(-64,16,1480,.8);this.addSmokeSource(70,20,2780,1.0);this.addSmokeSource(58,25,3500,1.2);
  }

  update(dt,playerPosition,weather=this.weather,detailScale=1){
    this.visualTime += Math.max(0,dt||0);
    this.visibilityTimer-=Math.max(0,dt||0);
    if(this.visibilityTimer<=0){this.visibilityTimer=.28;this.updateDistanceVisibility(playerPosition,detailScale);}
    const t=this.visualTime,wind=weather?.windDirection||this._fallbackWind||(this._fallbackWind=new THREE.Vector2(.18,.04)),windSpeed=weather?.windSpeed||.3,night=this.dayNight?.nightFactor||0;
    for(const a of this.animated){
      if(a.type==='spin')a.object.rotation[a.axis||'y']+=dt*a.speed;
      else if(a.type==='slide')a.object.position[a.axis]=a.base+Math.sin(t*a.speed+a.phase)*a.amp;
      else if(a.type==='sway')a.object.rotation.z=(a.base||0)+Math.sin(t*a.speed+a.phase)*a.amp;
      else if(a.type==='weldPulse'&&a.material){const wave=Math.sin(t*a.speed+(a.phase||0));const burst=wave>.78?1:0;a.material.emissiveIntensity=(a.base||0)+burst*(a.amp||2.2)*(.25+.75*night);}
      else if(a.type==='pulseEmissive'&&a.material)a.material.emissiveIntensity=(a.base||0)+(.5+.5*Math.sin(t*a.speed+(a.phase||0)))*(a.amp||.2)*(.32+.68*night);
      else if(a.type==='spotSweep'){a.object.position.x=a.baseX+Math.sin(t*a.speed+a.phase)*a.amp;a.object.position.z=a.baseZ+Math.cos(t*a.speed*.73+a.phase)*a.amp*.35;a.root?.lookAt(a.object.position);if(a.beamMat){const fog=this.dayNight?.fogDensity||.009;a.beamMat.opacity=THREE.MathUtils.smoothstep(night,.22,.92)*THREE.MathUtils.clamp(.007+(fog-.008)*2.4+(weather?.current?.cloudCoverage||.4)*.010,.006,.040);}}
    }
    const ashFactor=weather?.ashFactor?.()??weather?.current?.ash??.1;
    for(const src of this.smoke){
      const near=!playerPosition||Math.abs(src.z-(playerPosition.z||0))<260*detailScale;
      for(const p of src.particles){p.sprite.visible=near;if(!near)continue;const q=(t*.045+p.phase)%1;p.sprite.position.set(src.x+Math.sin((t+p.phase*9)*.5)*q*.55+wind.x*q*(5.5+ashFactor*2.2)*windSpeed,src.y+q*12*src.scale,src.z+Math.cos((t+p.phase*5)*.4)*q*.4+wind.y*q*(5.5+ashFactor*2.2)*windSpeed);const sc=(1.2+q*3.8)*src.scale;p.sprite.scale.set(sc,sc,1);p.sprite.material.opacity=(1-q)*(.115+.040*night+.018*ashFactor);p.sprite.material.color.setHex(ashFactor>.65?0x756f67:(night>.55?0x70767a:0x666764));}
    }
    if(this.shared.warmWindowDim){const rareFlicker=.96+Math.sin(t*3.7)*.018+Math.sin(t*.71)*.012;this.shared.warmWindowDim.emissiveIntensity=THREE.MathUtils.lerp(.015,.28,night);this.shared.warmWindow.emissiveIntensity=THREE.MathUtils.lerp(.025,1.15,night);this.shared.warmWindowBright.emissiveIntensity=THREE.MathUtils.lerp(.04,2.0,night)*rareFlicker;this.shared.coldWindow.emissiveIntensity=THREE.MathUtils.lerp(.01,.08,night);}
    if(this.farHorizon?.material){this.farHorizon.material.color.setHex(night>.62?0x17222b:0x2b3639);}
    if(this.farSkyline?.material){this.farSkyline.material.color.setHex(night>.62?0x111a21:0x202a2e);}
    const spillN=THREE.MathUtils.smoothstep(night,.18,.88);for(const [kind,mat] of this.spillMaterialCache){mat.opacity=(.055+(kind==='settlement'?.018:0))*spillN;}
    if(this.distantLightMaterial)this.distantLightMaterial.opacity=THREE.MathUtils.smoothstep(night,.40,.92)*.70;
  }

}
window.WorldArtSystem=WorldArtSystem;
