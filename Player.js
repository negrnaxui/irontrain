class Player {
  constructor(camera, domElement, ui) {
    this.camera = camera;
    this.domElement = domElement;
    this.ui = ui;
    this.position = new THREE.Vector3(8.0, 1.95, -10.0);
    this.velocityY = 0;
    this.onGround = true;
    this.baseMaxHp = 100;
    this.maxHp = 100;
    this.hp = 100;
    this.dead = false;
    this.money = 0;
    this.yaw = Math.PI;
    this.pitch = 0;
    this.keys = {};
    this.justPressed = new Set();
    this.pointerLocked = false;
    this.inventory = { coal: 0, scrap: 0, medkit: 0 };
    this.carriedItem = null;
    this.raycaster = new THREE.Raycaster();
    this._moveForward=new THREE.Vector3();this._moveRight=new THREE.Vector3();this._moveVector=new THREE.Vector3();this._upVector=new THREE.Vector3(0,1,0);this._rayNdc=new THREE.Vector2();
    this.collisionWorld = null;
    this.radius = 0.34;
    this.height = 1.72;
    this.flashlightOn = false;
    this.gameplayLocked = false;
    this.rideTime = 0;
    this.combatKick = 0;
    this.difficulty = { incomingDamageMultiplier:1 };
    this.baseWalkSpeed = 3.7;
    this.baseSprintSpeed = 6.4;
    this.baseJumpSpeed = 5.5;
    this.classNightFactor = 0;
    this.classDayFactor = 1;
    this.classStateBand = 'day';
    this.solarDamageAccumulator = 0;
    this.classNotifier = null;
    this.classConfig = { key:'machinist', reloadMultiplier:1, baseMaxHp:100, baseMoveMultiplier:1, baseSprintMultiplier:1, baseJumpMultiplier:1, baseMeleeMultiplier:1, medkitHealMultiplier:1, environmentalDamageMultiplier:1, incomingMeleeMultiplier:1, detectionMultiplier:1, onTrainReloadMultiplier:1, onTrainIncomingMultiplier:1, offTrainMoveMultiplier:1, specialAbility:null };
    this.isOnTrain = false;
    this.classAbilityCooldown = 0;
    this.damageSerial = 0;

    this.weapons = {
      shovel: { owned:true, label:'ЛОПАТА', cooldown:0, fireDelay:.65, damage:26, range:1.9, melee:true },
      vampireKnife: { owned:true, label:'ВАМПИРСКИЙ НОЖ', cooldown:0, fireDelay:.42, damage:23, range:1.55, melee:true },
      claws: { owned:true, label:'КОГТИ', cooldown:0, fireDelay:.42, damage:26, range:1.65, melee:true },
      revolver: { owned:false, label:'РЕВОЛЬВЕР', loaded:0, capacity:6, reserve:0, cooldown:0, fireDelay:.26, damage:30, reloading:false, reloadTimer:0, reloadTime:1.25 },
      shotgun: { owned:false, label:'ДРОБОВИК', loaded:0, capacity:2, reserve:0, cooldown:0, fireDelay:.72, damage:16, pellets:7, reloading:false, reloadTimer:0, reloadTime:1.55 },
      rifle: { owned:false, label:'ВИНТОВКА', loaded:0, capacity:5, reserve:0, cooldown:0, fireDelay:.42, damage:46, reloading:false, reloadTimer:0, reloadTime:1.45 }
    };
    this.activeWeaponType = 'shovel';
    this.primaryWeapon = null;
    this.primaryCycle = ['shotgun','rifle'];
    this.lastFirearmType = null;

    Object.defineProperty(this, 'weapon', {
      configurable:true,
      enumerable:true,
      get: () => this.weapons[this.activeWeaponType] || this.weapons[this.getSlot1WeaponType()] || this.weapons.shovel
    });

    this.buildWeapons();
    this.buildFlashlight();
    this.buildHitEffects();
    this.bindInput();
    this.selectWeapon('shovel', true);
    this.syncCamera();
  }

  setCollisionWorld(world) { this.collisionWorld = world; }

  buildWeapons() {
    this.weaponGroups = {};
    this.viewmodelTime = 0;
    this.switchDuration = .28;
    this.switchTimer = 0;
    this.switchFrom = null;
    this.switchTo = null;
    this.shovelSwingDuration = .52;
    this.shovelSwingTimer = 0;
    this.shovelImpactAt = .50;
    this.pendingShovelImpact = null;
    this.shovelHitStop = 0;

    const iron = new THREE.MeshStandardMaterial({ color:0x303537, roughness:.52, metalness:.88, emissive:0x101315, emissiveIntensity:.20 });
    const brass = new THREE.MeshStandardMaterial({ color:0xa77b38, roughness:.42, metalness:.92, emissive:0x241608, emissiveIntensity:.20 });
    const wood = new THREE.MeshStandardMaterial({ color:0x4a2d1c, roughness:.88, metalness:.02, emissive:0x120c08, emissiveIntensity:.14 });
    const darkWood = new THREE.MeshStandardMaterial({ color:0x2d1d16, roughness:.94, metalness:.01, emissive:0x0b0806, emissiveIntensity:.12 });
    const rust = new THREE.MeshStandardMaterial({ color:0x684634, roughness:.82, metalness:.68, emissive:0x170d08, emissiveIntensity:.12 });
    const soot = new THREE.MeshStandardMaterial({ color:0x202526, roughness:.86, metalness:.75, emissive:0x090b0c, emissiveIntensity:.16 });
    this.viewmodelMaterials = { iron, brass, wood, darkWood, rust, soot };

    // Slot 1: a purpose-built steam-era railway coal shovel. No synthetic hands are rendered.
    // The blade uses a shallow concave custom geometry instead of a flat primitive.
    const makeCoalScoopGeometry = () => {
      const rows = [
        { y:-.32, w:.22 }, { y:-.21, w:.28 }, { y:-.02, w:.315 },
        { y:.18, w:.305 }, { y:.36, w:.27 }, { y:.48, w:.215 }
      ];
      const columns = [-1,-.5,0,.5,1];
      const front=[];
      for(const row of rows){
        for(const c of columns){
          const edge=Math.abs(c);
          const z=.022 - (1-edge)*.078; // shallow bowl: centre sits farther back.
          front.push([c*row.w,row.y,z]);
        }
      }
      const thickness=.045;
      const vertices=[];
      const indices=[];
      for(const v of front) vertices.push(...v);
      for(const v of front) vertices.push(v[0],v[1],v[2]-thickness);
      const cols=columns.length, count=front.length;
      const quad=(a,b,c,d)=>{indices.push(a,b,d,b,c,d);};
      for(let r=0;r<rows.length-1;r++)for(let c=0;c<cols-1;c++){
        const a=r*cols+c,b=a+1,d=(r+1)*cols+c,cc=d+1;
        quad(a,b,cc,d);
        quad(count+d,count+cc,count+b,count+a);
      }
      const boundary=[];
      for(let c=0;c<cols;c++)boundary.push(c);
      for(let r=1;r<rows.length;r++)boundary.push(r*cols+cols-1);
      for(let c=cols-2;c>=0;c--)boundary.push((rows.length-1)*cols+c);
      for(let r=rows.length-2;r>0;r--)boundary.push(r*cols);
      for(let i=0;i<boundary.length;i++){
        const a=boundary[i],b=boundary[(i+1)%boundary.length];
        quad(a,b,count+b,count+a);
      }
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      g.setIndex(indices);g.computeVertexNormals();
      return g;
    };

    const shovel = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.030,.039,1.36,10), wood);
    shaft.position.y=-.03;
    shaft.rotation.z=-.012;
    const shaftWear = new THREE.Mesh(new THREE.CylinderGeometry(.040,.041,.24,10), darkWood);
    shaftWear.position.y=-.50;
    const lowerFerrule = new THREE.Mesh(new THREE.CylinderGeometry(.047,.051,.10,10), brass);
    lowerFerrule.position.y=.58;
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(.061,.090,.24,10), iron);
    socket.position.y=.74;
    const forgedNeck = new THREE.Mesh(new THREE.BoxGeometry(.105,.20,.105), soot);
    forgedNeck.position.set(0,.91,-.005); forgedNeck.rotation.z=.025;

    const scoop = new THREE.Mesh(makeCoalScoopGeometry(), iron);
    scoop.position.set(0,1.21,-.005);
    scoop.rotation.z=Math.PI;
    scoop.rotation.x=-.035;
    const topBrace = new THREE.Mesh(new THREE.BoxGeometry(.38,.065,.070), brass);
    topBrace.position.set(0,.94,.018);
    const centreRib = new THREE.Mesh(new THREE.BoxGeometry(.085,.48,.055), soot);
    centreRib.position.set(0,1.19,.036);
    centreRib.rotation.z=Math.PI;
    const cuttingLip = new THREE.Mesh(new THREE.BoxGeometry(.43,.035,.075), soot);
    cuttingLip.position.set(0,1.53,-.012);
    cuttingLip.rotation.z=.02;
    const sideWingL = new THREE.Mesh(new THREE.BoxGeometry(.055,.42,.072), rust);
    sideWingL.position.set(-.263,1.20,.00);sideWingL.rotation.z=-.12;
    const sideWingR = sideWingL.clone();sideWingR.position.x=.263;sideWingR.rotation.z=.12;
    const sootScuff = new THREE.Mesh(new THREE.BoxGeometry(.22,.16,.018), rust);
    sootScuff.position.set(.09,1.28,.048);sootScuff.rotation.z=-.10;
    for(const x of [-.13,0,.13]){
      const rivet=new THREE.Mesh(new THREE.SphereGeometry(.016,7,5),brass);
      rivet.position.set(x,.96,.055);shovel.add(rivet);
    }

    // Compact D-handle: forged iron loop with a dark wooden cross grip.
    const handleRoot=new THREE.Group();handleRoot.position.set(0,-.77,0);
    const dArc = new THREE.Mesh(new THREE.TorusGeometry(.145,.021,7,20,Math.PI), iron);
    dArc.rotation.z=Math.PI;
    dArc.position.y=-.10;
    const dStemL=new THREE.Mesh(new THREE.CylinderGeometry(.019,.023,.17,7),brass);dStemL.position.set(-.145,-.015,0);
    const dStemR=dStemL.clone();dStemR.position.x=.145;
    const dGrip=new THREE.Mesh(new THREE.CylinderGeometry(.030,.033,.30,9),darkWood);dGrip.rotation.z=Math.PI/2;dGrip.position.y=-.10;
    const dGripBandL=new THREE.Mesh(new THREE.CylinderGeometry(.037,.037,.045,8),brass);dGripBandL.rotation.z=Math.PI/2;dGripBandL.position.set(-.13,-.10,0);
    const dGripBandR=dGripBandL.clone();dGripBandR.position.x=.13;
    handleRoot.add(dArc,dStemL,dStemR,dGrip,dGripBandL,dGripBandR);

    shovel.add(shaft,shaftWear,lowerFerrule,socket,forgedNeck,scoop,topBrace,centreRib,cuttingLip,sideWingL,sideWingR,sootScuff,handleRoot);
    this.setViewModelBase(shovel,new THREE.Vector3(.52,-.68,-1.14),new THREE.Euler(-.20,-.15,.43));
    shovel.userData.isShovel=true;
    this.prepareViewModel(shovel);this.camera.add(shovel);this.weaponGroups.shovel=shovel;

    // Vampire knife: narrow gothic steam-era blade, intentionally without visible hands.
    const knife = new THREE.Group();
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-.075,-.54); bladeShape.lineTo(.075,-.54); bladeShape.lineTo(.115,.18); bladeShape.lineTo(.045,.61); bladeShape.lineTo(0,.72); bladeShape.lineTo(-.045,.61); bladeShape.lineTo(-.115,.18); bladeShape.closePath();
    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape,{depth:.045,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.012,bevelThickness:.010});
    bladeGeo.center();
    const knifeSteel = new THREE.MeshStandardMaterial({color:0x24272a,roughness:.34,metalness:.95,emissive:0x100708,emissiveIntensity:.22});
    const bloodSteel = new THREE.MeshStandardMaterial({color:0x5a2021,roughness:.40,metalness:.88,emissive:0x2b080a,emissiveIntensity:.26});
    const blade = new THREE.Mesh(bladeGeo,knifeSteel); blade.rotation.x=Math.PI/2; blade.scale.set(.9,1.0,1.0); blade.position.set(0,.28,-.26);
    const fuller = new THREE.Mesh(new THREE.BoxGeometry(.028,.64,.018),bloodSteel); fuller.position.set(0,.29,-.255);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(.42,.055,.075),brass); guard.position.set(0,-.13,-.24);
    const guardTipL = new THREE.Mesh(new THREE.ConeGeometry(.045,.13,7),brass); guardTipL.rotation.z=-Math.PI/2; guardTipL.position.set(-.25,-.13,-.24);
    const guardTipR = guardTipL.clone(); guardTipR.rotation.z=Math.PI/2; guardTipR.position.x=.25;
    const knifeGrip = new THREE.Mesh(new THREE.CylinderGeometry(.055,.065,.40,10),darkWood); knifeGrip.position.set(0,-.36,-.24);
    const wrap1 = new THREE.Mesh(new THREE.TorusGeometry(.061,.010,5,10),rust); wrap1.rotation.x=Math.PI/2; wrap1.position.set(0,-.27,-.24);
    const wrap2=wrap1.clone();wrap2.position.y=-.37;const wrap3=wrap1.clone();wrap3.position.y=-.47;
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(.080,8,6),brass); pommel.position.set(0,-.58,-.24);
    const gearDetail = new THREE.Mesh(new THREE.TorusGeometry(.055,.015,6,12),brass); gearDetail.position.set(.09,-.07,-.22); gearDetail.rotation.x=Math.PI/2;
    knife.add(blade,fuller,guard,guardTipL,guardTipR,knifeGrip,wrap1,wrap2,wrap3,pommel,gearDetail);
    this.setViewModelBase(knife,new THREE.Vector3(.53,-.55,-.92),new THREE.Euler(-.22,-.18,.32));
    this.prepareViewModel(knife);this.camera.add(knife);this.weaponGroups.vampireKnife=knife;

    // Werewolf claws: two compact bone/metal claw assemblies, not human hands.
    const claws = new THREE.Group();
    const clawMetal = new THREE.MeshStandardMaterial({color:0x242728,roughness:.48,metalness:.80,emissive:0x0b0c0d,emissiveIntensity:.20});
    const clawBone = new THREE.MeshStandardMaterial({color:0x8d806e,roughness:.72,metalness:.16,emissive:0x18130f,emissiveIntensity:.12});
    const makeClawSide=(side)=>{
      const root=new THREE.Group();root.position.set(side*.32,-.20,-.35);root.rotation.z=side*.14;
      const cuff=new THREE.Mesh(new THREE.BoxGeometry(.24,.16,.28),clawMetal);cuff.position.set(0,-.18,.05);root.add(cuff);
      for(let i=0;i<3;i++){
        const base=new THREE.Mesh(new THREE.CylinderGeometry(.025,.040,.34,7),clawMetal);base.rotation.x=Math.PI/2;base.position.set((i-1)*.075,.02,-.08-i*.015);root.add(base);
        const talon=new THREE.Mesh(new THREE.ConeGeometry(.035,.42,7),clawBone);talon.rotation.x=-Math.PI/2;talon.position.set((i-1)*.075,.02,-.44-i*.03);talon.rotation.z=(i-1)*.06;root.add(talon);
      }
      return root;
    };
    claws.add(makeClawSide(-1),makeClawSide(1));
    this.setViewModelBase(claws,new THREE.Vector3(.00,-.47,-.72),new THREE.Euler(-.08,0,0));
    this.prepareViewModel(claws);this.camera.add(claws);this.weaponGroups.claws=claws;

    // Revolver: clean weapon-only FPS viewmodel.
    const revolver = new THREE.Group();
    const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(.052,.063,.84,10), iron); rBarrel.rotation.x=Math.PI/2; rBarrel.position.set(.30,-.22,-.68);
    const rBody = new THREE.Mesh(new THREE.BoxGeometry(.28,.23,.36), brass); rBody.position.set(.30,-.23,-.27);
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.23,10), iron); cylinder.rotation.z=Math.PI/2; cylinder.position.set(.30,-.22,-.40);
    const rGrip = new THREE.Mesh(new THREE.BoxGeometry(.17,.40,.18), wood); rGrip.position.set(.31,-.43,-.16); rGrip.rotation.z=-.16;
    const triggerGuard = new THREE.Mesh(new THREE.TorusGeometry(.09,.018,6,12,Math.PI*1.55), brass); triggerGuard.position.set(.30,-.36,-.31); triggerGuard.rotation.y=Math.PI/2;
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(.07,.10,.08), iron); hammer.position.set(.30,-.11,-.12); hammer.rotation.x=-.3;
    const rMuzzle = this.makeMuzzle(.30,-.22,-1.10);
    revolver.add(rBarrel,rBody,cylinder,rGrip,triggerGuard,hammer,rMuzzle); this.camera.add(revolver);
    revolver.userData.muzzle=rMuzzle;revolver.userData.cylinder=cylinder;revolver.userData.recoil=0;
    this.setViewModelBase(revolver,new THREE.Vector3(.02,-.04,-.02),new THREE.Euler(0,0,0));
    this.prepareViewModel(revolver);this.weaponGroups.revolver=revolver;

    // Shotgun: no hands, slightly lower/right to keep the crosshair clear.
    const shotgun = new THREE.Group();
    const barrelGroup = new THREE.Group();
    const sBarrel1 = new THREE.Mesh(new THREE.CylinderGeometry(.052,.06,1.20,10), iron); sBarrel1.rotation.x=Math.PI/2; sBarrel1.position.set(.24,-.26,-.76);
    const sBarrel2 = sBarrel1.clone(); sBarrel2.position.x=.36;
    const forend = new THREE.Mesh(new THREE.BoxGeometry(.30,.17,.40), wood); forend.position.set(.30,-.34,-.72);
    barrelGroup.add(sBarrel1,sBarrel2,forend);
    const sStock = new THREE.Mesh(new THREE.BoxGeometry(.23,.28,.72), wood); sStock.position.set(.31,-.41,-.04); sStock.rotation.x=-.17;
    const sReceiver = new THREE.Mesh(new THREE.BoxGeometry(.31,.29,.45), brass); sReceiver.position.set(.30,-.28,-.36);
    const sGuard = new THREE.Mesh(new THREE.TorusGeometry(.085,.017,6,12,Math.PI*1.55), iron); sGuard.position.set(.30,-.41,-.30); sGuard.rotation.y=Math.PI/2;
    const sMuzzle = this.makeMuzzle(.30,-.26,-1.37);
    shotgun.add(barrelGroup,sStock,sReceiver,sGuard,sMuzzle); this.camera.add(shotgun);
    shotgun.userData.muzzle=sMuzzle;shotgun.userData.barrelGroup=barrelGroup;shotgun.userData.recoil=0;
    this.setViewModelBase(shotgun,new THREE.Vector3(.02,-.02,-.02),new THREE.Euler(0,0,0));
    this.prepareViewModel(shotgun);this.weaponGroups.shotgun=shotgun;

    // Rifle: weapon-only viewmodel with visible bolt for reload feedback.
    const rifle = new THREE.Group();
    const rfBarrel = new THREE.Mesh(new THREE.CylinderGeometry(.034,.048,1.34,9), iron); rfBarrel.rotation.x=Math.PI/2; rfBarrel.position.set(.31,-.23,-.84);
    const rfStock = new THREE.Mesh(new THREE.BoxGeometry(.22,.29,.85), wood); rfStock.position.set(.32,-.39,-.07); rfStock.rotation.x=-.11;
    const rfReceiver = new THREE.Mesh(new THREE.BoxGeometry(.28,.24,.46), brass); rfReceiver.position.set(.31,-.24,-.47);
    const rfFore = new THREE.Mesh(new THREE.BoxGeometry(.17,.16,.46), wood); rfFore.position.set(.31,-.31,-.79);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(.055,.095,.22), iron); sight.position.set(.31,-.08,-.51);
    const bolt = new THREE.Mesh(new THREE.BoxGeometry(.13,.05,.18), iron); bolt.position.set(.45,-.18,-.43); bolt.userData.baseZ=bolt.position.z;
    const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(.045,7,5), brass); boltKnob.position.set(.08,0,0); bolt.add(boltKnob);
    const rfMuzzle = this.makeMuzzle(.31,-.23,-1.53);
    rifle.add(rfBarrel,rfStock,rfReceiver,rfFore,sight,bolt,rfMuzzle); this.camera.add(rifle);
    rifle.userData.muzzle=rfMuzzle;rifle.userData.bolt=bolt;rifle.userData.recoil=0;
    this.setViewModelBase(rifle,new THREE.Vector3(.02,-.02,-.02),new THREE.Euler(0,0,0));
    this.prepareViewModel(rifle);this.weaponGroups.rifle=rifle;

    this.setOnlyViewModel('shovel');
  }

  setViewModelBase(root, position, rotation) {
    root.userData.basePosition = position.clone();
    root.userData.baseRotation = rotation.clone();
    root.position.copy(position);
    root.rotation.copy(rotation);
  }

  prepareViewModel(root) {
    root.traverse(o=>{
      if(!o.isMesh)return;
      o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;o.renderOrder=50;
      const materials=Array.isArray(o.material)?o.material:[o.material];
      for(const mat of materials){if(!mat)continue;mat.depthTest=false;mat.depthWrite=false;}
    });
  }

  getViewModel(type) { return this.weaponGroups[type] || null; }

  setOnlyViewModel(type) {
    for(const [name,group] of Object.entries(this.weaponGroups)) group.visible=name===type;
  }

  makeMuzzle(x,y,z) {
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.08,8,6), new THREE.MeshBasicMaterial({color:0xffd27a,transparent:true,opacity:0,depthWrite:false,depthTest:false}));
    muzzle.position.set(x,y,z);
    return muzzle;
  }

  applyDifficulty(config = {}) {
    this.difficulty = {
      incomingDamageMultiplier: Number.isFinite(config.incomingDamageMultiplier) ? config.incomingDamageMultiplier : 1
    };
  }

  setClassNotifier(fn) { this.classNotifier = typeof fn === 'function' ? fn : null; }

  applyClass(config = {}) {
    const prevType=this.activeWeaponType;
    this.classConfig = {
      key:config.key||'machinist',
      reloadMultiplier:Number.isFinite(config.reloadMultiplier)?config.reloadMultiplier:1,
      baseMaxHp:Number.isFinite(config.baseMaxHp)?config.baseMaxHp:100,
      baseMoveMultiplier:Number.isFinite(config.baseMoveMultiplier)?config.baseMoveMultiplier:1,
      baseSprintMultiplier:Number.isFinite(config.baseSprintMultiplier)?config.baseSprintMultiplier:(Number.isFinite(config.baseMoveMultiplier)?config.baseMoveMultiplier:1),
      baseJumpMultiplier:Number.isFinite(config.baseJumpMultiplier)?config.baseJumpMultiplier:1,
      baseMeleeMultiplier:Number.isFinite(config.baseMeleeMultiplier)?config.baseMeleeMultiplier:1,
      medkitHealMultiplier:Number.isFinite(config.medkitHealMultiplier)?config.medkitHealMultiplier:1,
      environmentalDamageMultiplier:Number.isFinite(config.environmentalDamageMultiplier)?config.environmentalDamageMultiplier:1,
      incomingMeleeMultiplier:Number.isFinite(config.incomingMeleeMultiplier)?config.incomingMeleeMultiplier:1,
      detectionMultiplier:Number.isFinite(config.detectionMultiplier)?config.detectionMultiplier:1,
      onTrainReloadMultiplier:Number.isFinite(config.onTrainReloadMultiplier)?config.onTrainReloadMultiplier:1,
      onTrainIncomingMultiplier:Number.isFinite(config.onTrainIncomingMultiplier)?config.onTrainIncomingMultiplier:1,
      offTrainMoveMultiplier:Number.isFinite(config.offTrainMoveMultiplier)?config.offTrainMoveMultiplier:1,
      specialAbility:config.specialAbility||null
    };
    this.solarDamageAccumulator=0;
    this.classAbilityCooldown=0;
    this.classStateBand='day';
    const target=this.classConfig.specialAbility==='werewolf'?90:this.classConfig.baseMaxHp;
    this.setMaxHpPreserveRatio(target);
    const slot=this.getSlot1WeaponType();
    if(this.isMeleeType(prevType))this.selectWeapon(slot,true);
  }

  isMeleeType(type){ return Boolean(this.weapons[type]?.melee); }
  getSlot1WeaponType(){
    if(this.classConfig?.specialAbility==='vampire')return 'vampireKnife';
    if(this.classConfig?.specialAbility==='werewolf'&&this.classNightFactor>=.5)return 'claws';
    return 'shovel';
  }
  setMaxHpPreserveRatio(nextMax){
    nextMax=Math.max(1,Number(nextMax)||100);
    const prev=Math.max(1,this.maxHp||100);
    if(Math.abs(prev-nextMax)<.001)return;
    const ratio=THREE.MathUtils.clamp(this.hp/prev,0,1);
    this.maxHp=nextMax;this.hp=ratio*nextMax;
  }
  getMeleeDamageMultiplier(){
    const n=this.classNightFactor||0,c=this.classConfig||{};
    if(c.specialAbility==='vampire')return (c.baseMeleeMultiplier||1)*THREE.MathUtils.lerp(1,1.25,n);
    if(c.specialAbility==='werewolf')return THREE.MathUtils.lerp(.80,2.20,n);
    if(c.specialAbility==='berserker'){
      const ratio=this.hp/Math.max(1,this.maxHp);
      return (c.baseMeleeMultiplier||1)*(ratio<.25?1.70:(ratio<.50?1.35:1));
    }
    return c.baseMeleeMultiplier||1;
  }
  updateClassEffects(dt,dayNight,train){
    const n=THREE.MathUtils.clamp(Number(dayNight?.nightFactor)||0,0,1);
    this.classNightFactor=n;this.classDayFactor=1-n;
    const c=this.classConfig||{};
    if(c.specialAbility==='werewolf'){
      this.setMaxHpPreserveRatio(THREE.MathUtils.lerp(90,135,n));
      const desired=this.getSlot1WeaponType();
      if(this.isMeleeType(this.activeWeaponType)&&this.activeWeaponType!==desired)this.selectWeapon(desired,true);
    } else this.setMaxHpPreserveRatio(c.baseMaxHp||100);

    if(c.specialAbility==='vampire'&&!this.dead){
      let exposure=1;
      if(train?.playerInCab?.(this.position))exposure=.22;
      const daylight=Math.pow(1-n,1.15);
      this.solarDamageAccumulator+=dt*daylight*exposure;
      while(this.solarDamageAccumulator>=10){this.solarDamageAccumulator-=10;this.applySolarDamage(1);}
    } else this.solarDamageAccumulator=0;

    const band=n>.78?'night':n>.20?'twilight':'day';
    if(band!==this.classStateBand){
      if(c.specialAbility==='vampire'&&band==='night')this.classNotifier?.('НОЧЬ ПИТАЕТ ВАС');
      if(c.specialAbility==='vampire'&&band==='day')this.classNotifier?.('СОЛНЕЧНЫЙ СВЕТ ОБЖИГАЕТ');
      if(c.specialAbility==='werewolf'&&band==='night'){this.classNotifier?.('ЗВЕРЬ ПРОБУЖДАЕТСЯ');this.ui?.flashClassEffect?.('werewolf');this.playTransformationSound();}
      if(c.specialAbility==='werewolf'&&band==='day')this.classNotifier?.('ЗВЕРЬ ЗАТИХАЕТ');
      this.classStateBand=band;
    }
  }
  applySolarDamage(amount){
    if(this.dead)return;
    this.hp=Math.max(0,this.hp-amount);this.ui?.flashClassEffect?.('solar');
    if(this.hp<=0){this.dead=true;this.flashlight.intensity=0;this.ui.showDeath();}
  }

  buildFlashlight() {
    this.flashlight = new THREE.SpotLight(0xffe2ad, 0, 34, Math.PI / 7, .46, 1.4);
    this.flashlight.position.set(.18, -.12, -.08);
    this.flashlight.castShadow = false;
    this.flashlightTarget = new THREE.Object3D();
    this.flashlightTarget.position.set(0, -.08, -8);
    this.camera.add(this.flashlight, this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;
  }

  buildHitEffects() {
    this.hitSparks = [];
    const parent = this.camera.parent;
    if (!parent) return;
    const geo = new THREE.SphereGeometry(.025, 5, 4);
    for (let i=0;i<16;i++) {
      const mat = new THREE.MeshBasicMaterial({ color:0xffb04a, transparent:true, opacity:0, depthWrite:false });
      const spark = new THREE.Mesh(geo, mat);
      spark.visible = false;
      spark.frustumCulled = false;
      spark.userData.life = 0;
      spark.userData.velocity = new THREE.Vector3();
      parent.add(spark);
      this.hitSparks.push(spark);
    }
  }

  emitHitSparks(worldPoint, count=4) {
    if (!worldPoint || !this.hitSparks?.length) return;
    let emitted = 0;
    for (const spark of this.hitSparks) {
      if (spark.visible) continue;
      spark.position.copy(worldPoint);
      spark.position.x += (Math.random()-.5)*.08;
      spark.position.y += (Math.random()-.5)*.08;
      spark.position.z += (Math.random()-.5)*.08;
      spark.userData.velocity.set((Math.random()-.5)*1.5,.45+Math.random()*1.1,(Math.random()-.5)*1.5);
      spark.userData.life = .12 + Math.random()*.14;
      spark.userData.maxLife = spark.userData.life;
      spark.material.color.setHex(0xffb04a);
      spark.material.opacity = .95;
      spark.visible = true;
      if (++emitted >= count) break;
    }
  }

  clearInput() { this.keys = {}; this.justPressed.clear(); this.cancelShovelAttack(); }

  cancelShovelAttack() {
    this.shovelSwingTimer=0;
    this.pendingShovelImpact=null;
    this.shovelHitStop=0;
  }

  bindInput() {
    const gameplayCodes = new Set([
      'KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space',
      'KeyE','KeyQ','KeyF','KeyH','KeyR','KeyG','Digit1','Digit2','Digit3'
    ]);
    window.addEventListener('keydown', e => {
      if (!gameplayCodes.has(e.code)) return;
      if (!this.pointerLocked || this.dead || this.gameplayLocked) return;
      if (['Space','KeyW','KeyA','KeyS','KeyD','Digit1','Digit2','Digit3'].includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.justPressed.add(e.code);
      this.keys[e.code] = true;
      if (e.code === 'KeyR' && !e.repeat) this.beginReload();
      if (e.code === 'KeyH' && !e.repeat) this.useMedkit();
      if (e.code === 'KeyF' && !e.repeat) this.toggleFlashlight();
      if (e.code === 'Digit1' && !e.repeat) this.selectWeapon(this.getSlot1WeaponType());
      if (e.code === 'Digit2' && !e.repeat) this.selectPrimary();
      if (e.code === 'Digit3' && !e.repeat) this.selectWeapon('revolver');
    });
    window.addEventListener('keyup', e => { if (gameplayCodes.has(e.code)) this.keys[e.code] = false; });
    window.addEventListener('blur', () => this.clearInput());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearInput(); });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.domElement;
      if (!this.pointerLocked) this.clearInput();
    });
    document.addEventListener('mousemove', e => {
      if (!this.pointerLocked || this.dead || this.gameplayLocked) return;
      const sens = .0022;
      this.yaw -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.48, 1.48);
    });
  }

  setGameplayLocked(locked) { this.gameplayLocked = Boolean(locked); if (this.gameplayLocked) this.clearInput(); }
  consumePress(code) { const had=this.justPressed.has(code); this.justPressed.delete(code); return had; }

  unlockWeapon(type) {
    const w = this.weapons[type];
    if (!w || this.isMeleeType(type) || w.owned) return false;
    w.owned = true;
    w.loaded = w.capacity; // Purchased firearms include a loaded magazine/cylinder, but no reserve.
    if (type === 'revolver') {
      if (this.isMeleeType(this.activeWeaponType)) this.selectWeapon('revolver');
    } else {
      this.primaryWeapon = type;
      this.selectWeapon(type);
    }
    return true;
  }

  selectPrimary() {
    const owned = this.primaryCycle.filter(t => this.weapons[t].owned);
    if (!owned.length) { this.ui?.prompt?.('Основное оружие ещё не куплено'); return false; }
    if (owned.length === 1) return this.selectWeapon(owned[0]);
    const idx = owned.indexOf(this.activeWeaponType);
    const next = owned[(idx + 1) % owned.length];
    this.primaryWeapon = next;
    return this.selectWeapon(next);
  }

  selectWeapon(type, immediate=false) {
    if (!this.isMeleeType(type) && !this.weapons[type]?.owned) {
      if (type === 'revolver') this.ui?.prompt?.('Револьвер ещё не куплен');
      return false;
    }
    if(this.switchTimer>0){
      this.switchTimer=0;this.switchFrom=null;this.switchTo=null;this.setOnlyViewModel(this.activeWeaponType);
    }
    if(type===this.activeWeaponType){this.setOnlyViewModel(type);return true;}
    this.cancelShovelAttack();
    const current=this.weapons[this.activeWeaponType];
    if(current?.reloading)current.reloading=false;
    const from=this.activeWeaponType;
    this.activeWeaponType=type;
    if(type==='shotgun'||type==='rifle')this.primaryWeapon=type;
    if(!this.isMeleeType(type))this.lastFirearmType=type;
    if(immediate||!this.getViewModel(from)){
      this.switchTimer=0;this.switchFrom=null;this.switchTo=null;this.setOnlyViewModel(type);return true;
    }
    this.switchFrom=from;this.switchTo=type;this.switchTimer=this.switchDuration;
    const fromModel=this.getViewModel(from),toModel=this.getViewModel(type);
    if(fromModel)fromModel.visible=true;
    if(toModel)toModel.visible=false;
    return true;
  }

  resolveAutoAmmoWeapon() {
    const active=this.activeWeaponType;
    if(active&&!this.isMeleeType(active)&&this.weapons[active]?.owned)return active;
    if(this.lastFirearmType&&this.weapons[this.lastFirearmType]?.owned)return this.lastFirearmType;
    if(this.primaryWeapon&&this.weapons[this.primaryWeapon]?.owned)return this.primaryWeapon;
    if(this.weapons.revolver.owned)return 'revolver';
    return ['shotgun','rifle','revolver'].find(t=>this.weapons[t]?.owned)||null;
  }

  addAmmo(type, amount) {
    let target=type;
    if(!target||target==='auto')target=this.resolveAutoAmmoWeapon();
    const w=this.weapons[target];
    if(!w?.owned||!Number.isFinite(amount)||amount<=0)return false;
    w.reserve+=Math.floor(amount);
    this.lastFirearmType=target;
    return true;
  }

  toggleFlashlight() {
    if (this.dead || this.gameplayLocked) return;
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.intensity = this.flashlightOn ? 12 : 0;
  }

  update(dt, train, wasOnTrainBefore = false) {
    if (this.dead || this.gameplayLocked) return;
    this.classAbilityCooldown=Math.max(0,(this.classAbilityCooldown||0)-dt);
    this.isOnTrain=Boolean(train?.playerOnTrain?.(this.position));
    for (const w of Object.values(this.weapons)) {
      w.cooldown = Math.max(0, (w.cooldown || 0) - dt);
      if (w.reloading) {
        w.reloadTimer -= dt;
        if (w.reloadTimer <= 0) this.finishReload(w);
      }
    }
    this.updateCombatVisuals(dt);

    if (wasOnTrainBefore && Math.abs(train.lastDeltaZ) > 1e-7) {
      this.position.z += train.lastDeltaZ;
      if (this.collisionWorld) this.collisionWorld.resolveCircle(this.position, this.radius, this.height, .45);
      train.resolvePlayerCollision(this.position, this.radius, this.height);
    }

    if (this.pointerLocked) {
      const n=this.classNightFactor||0,c=this.classConfig||{};
      let moveMul=c.baseMoveMultiplier||1,sprintMul=c.baseSprintMultiplier||moveMul;
      if(c.specialAbility==='vampire'){const t=THREE.MathUtils.lerp(1,1.15,n);moveMul=t;sprintMul=t;}
      else if(c.specialAbility==='werewolf'){moveMul=THREE.MathUtils.lerp(.90,1.40,n);sprintMul=THREE.MathUtils.lerp(.90,1.40,n);}
      else if(c.specialAbility==='berserker'&&this.hp/Math.max(1,this.maxHp)<.25){moveMul*=1.08;sprintMul*=1.08;}
      else if(c.specialAbility==='conductor'&&!this.isOnTrain){moveMul*=c.offTrainMoveMultiplier||.95;sprintMul*=c.offTrainMoveMultiplier||.95;}
      const speed = this.keys.ShiftLeft || this.keys.ShiftRight ? this.baseSprintSpeed*sprintMul : this.baseWalkSpeed*moveMul;
      const forward=this._moveForward,right=this._moveRight,move=this._moveVector;
      this.camera.getWorldDirection(forward);forward.y=0;if(forward.lengthSq()>0)forward.normalize();
      right.crossVectors(forward,this._upVector).normalize();move.set(0,0,0);
      if (this.keys.KeyW) move.add(forward); if (this.keys.KeyS) move.sub(forward); if (this.keys.KeyD) move.add(right); if (this.keys.KeyA) move.sub(right);
      if (move.lengthSq() > 0) { move.normalize().multiplyScalar(speed*dt); this.moveWithCollisions(move,train); }
      if (this.consumePress('Space') && this.onGround) { let jm=this.classConfig?.baseJumpMultiplier||1;if(this.classConfig?.specialAbility==='vampire')jm*=THREE.MathUtils.lerp(1,1.075,this.classNightFactor||0);this.velocityY=this.baseJumpSpeed*jm; this.onGround=false; }
    }

    this.velocityY -= 13.5*dt;
    this.position.y += this.velocityY*dt;
    const maxStep=.46;
    const worldFloor=this.collisionWorld?this.collisionWorld.floorHeightAt(this.position,this.position.y,maxStep):.12;
    const trainFloor=train.floorHeightAt(this.position);
    let floor=worldFloor;
    if(trainFloor!=null&&(trainFloor<=this.position.y+maxStep||(this.velocityY<=0&&this.position.y>=trainFloor))) floor=Math.max(floor,trainFloor);
    if(this.position.y<=floor){this.position.y=floor;this.velocityY=0;this.onGround=true;} else this.onGround=false;
    if(this.collisionWorld) this.collisionWorld.resolveCircle(this.position,this.radius,this.height,maxStep);
    train.resolvePlayerCollision(this.position,this.radius,this.height);
    this.syncCamera();
    this.applyTrainCameraMotion(train,dt);
    if (this.combatKick > .0001) this.camera.rotation.x -= this.combatKick;
  }

  updateCombatVisuals(dt) {
    this.combatKick=Math.max(0,this.combatKick-dt*.18);
    this.viewmodelTime+=dt;
    const moving=this.pointerLocked&&(this.keys.KeyW||this.keys.KeyA||this.keys.KeyS||this.keys.KeyD);
    const running=moving&&(this.keys.ShiftLeft||this.keys.ShiftRight);
    const bobAmp=moving?(running?.018:.010):.0038;
    const bobSpeed=moving?(running?10.0:7.0):1.8;
    const bobX=Math.sin(this.viewmodelTime*bobSpeed)*bobAmp*.52;
    const jumpOffset=this.onGround?0:-.012;
    const bobY=Math.sin(this.viewmodelTime*bobSpeed*2)*bobAmp+Math.sin(this.viewmodelTime*1.45)*.0025+jumpOffset;

    for(const [name,group] of Object.entries(this.weaponGroups)){
      const baseP=group.userData.basePosition||new THREE.Vector3();
      const baseR=group.userData.baseRotation||new THREE.Euler();
      group.position.set(baseP.x+bobX,baseP.y+bobY,baseP.z);
      group.rotation.copy(baseR);
      const muzzle=group.userData?.muzzle;
      if(muzzle?.userData.flashTimer>0){muzzle.userData.flashTimer-=dt;muzzle.material.opacity=muzzle.userData.flashTimer>0?1:0;}
      if(group.userData?.recoil>0)group.userData.recoil=Math.max(0,group.userData.recoil-dt*(name==='shotgun'?6.5:9.0));
    }

    if(this.carriedItem&&this.shovelSwingTimer>0)this.cancelShovelAttack();

    // Heavy shovel swing with a short impact hold. Damage is resolved at the visual impact point,
    // not when the mouse button is first pressed.
    const shovel=this.getViewModel(this.activeWeaponType);
    if(this.shovelSwingTimer>0&&shovel&&this.isMeleeType(this.activeWeaponType)){
      const previous=THREE.MathUtils.clamp(1-this.shovelSwingTimer/this.shovelSwingDuration,0,1);
      const dtAnim=this.shovelHitStop>0?0:dt;
      if(this.shovelHitStop>0)this.shovelHitStop=Math.max(0,this.shovelHitStop-dt);
      this.shovelSwingTimer=Math.max(0,this.shovelSwingTimer-dtAnim);
      const t=THREE.MathUtils.clamp(1-this.shovelSwingTimer/this.shovelSwingDuration,0,1);
      if(this.pendingShovelImpact&&!this.pendingShovelImpact.resolved&&previous<this.shovelImpactAt&&t>=this.shovelImpactAt){
        const hit=this.resolveShovelImpact(this.pendingShovelImpact.enemySystem,this.pendingShovelImpact.blockerMeshes);
        this.pendingShovelImpact.resolved=true;
        if(hit)this.shovelHitStop=.035;
      }
      const meleeType=this.activeWeaponType;
      const knifeLike=meleeType==='vampireKnife';
      const clawLike=meleeType==='claws';
      let wind=0,strike=0,returning=0;
      if(t<.20)wind=t/.20;
      else if(t<.52)strike=(t-.20)/.32;
      else returning=(t-.52)/.48;
      if(knifeLike){
        if(wind>0){const e=wind*wind*(3-2*wind);shovel.position.x+=e*.10;shovel.position.z+=e*.10;shovel.rotation.z+=e*.22;}
        else if(strike>0){const e=1-Math.pow(1-strike,3);shovel.position.x-=e*.30;shovel.position.z-=e*.28;shovel.rotation.z-=e*.68;shovel.rotation.y-=e*.12;}
        else {const e=returning*returning*(3-2*returning);shovel.position.x-=.30*(1-e);shovel.position.z-=.28*(1-e);shovel.rotation.z-=.68*(1-e);}
      } else if(clawLike){
        if(wind>0){const e=wind*wind*(3-2*wind);shovel.position.y-=e*.05;shovel.position.z+=e*.08;}
        else if(strike>0){const e=1-Math.pow(1-strike,3);shovel.position.z-=e*.30;shovel.position.y+=e*.06;shovel.rotation.x-=e*.20;}
        else {const e=returning*returning*(3-2*returning);shovel.position.z-=.30*(1-e);shovel.position.y+=.06*(1-e);shovel.rotation.x-=.20*(1-e);}
      } else if(wind>0){
        const e=wind*wind*(3-2*wind);
        shovel.rotation.y-=e*.18;shovel.rotation.z+=e*.30;shovel.position.x+=e*.055;shovel.position.z+=e*.045;
      }else if(strike>0){
        const e=1-Math.pow(1-strike,3);
        shovel.rotation.y-=.18*(1-e);shovel.rotation.z+=.30-(e*1.05);shovel.rotation.x-=e*.11;
        shovel.position.x+=.055-e*.18;shovel.position.y+=e*.075;shovel.position.z-=e*.10;
      }else{
        const e=returning*returning*(3-2*returning);
        shovel.rotation.z-=.75*(1-e);shovel.rotation.x-=.11*(1-e);shovel.position.x-=.125*(1-e);shovel.position.y+=.075*(1-e);shovel.position.z-=.10*(1-e);
      }
      if(this.shovelSwingTimer<=0)this.pendingShovelImpact=null;
    }

    const activeGroup=this.getViewModel(this.activeWeaponType);
    const activeWeapon=this.weapon;
    if(activeGroup&&!this.isMeleeType(this.activeWeaponType)){
      const recoil=activeGroup.userData.recoil||0;
      const strength=this.activeWeaponType==='shotgun'?.22:this.activeWeaponType==='rifle'?.14:.10;
      activeGroup.position.z+=recoil*strength;
      activeGroup.position.y+=recoil*strength*.38;
      activeGroup.rotation.x-=recoil*(this.activeWeaponType==='shotgun'?.10:.065);

      if(activeWeapon?.reloading){
        const p=THREE.MathUtils.clamp(1-activeWeapon.reloadTimer/Math.max(.001,activeWeapon.reloadDuration||activeWeapon.reloadTime),0,1);
        const arc=Math.sin(p*Math.PI);
        activeGroup.position.y-=arc*(this.activeWeaponType==='shotgun'?.24:.17);
        activeGroup.rotation.z+=arc*(this.activeWeaponType==='rifle'?-.07:.08);
        if(this.activeWeaponType==='revolver'&&activeGroup.userData.cylinder){
          activeGroup.userData.cylinder.rotation.x=p*Math.PI*4;
          activeGroup.userData.cylinder.position.x=.30+arc*.07;
        }
        if(this.activeWeaponType==='shotgun'&&activeGroup.userData.barrelGroup){
          activeGroup.userData.barrelGroup.rotation.x=arc*.25;
          activeGroup.userData.barrelGroup.position.y=-arc*.05;
        }
        if(this.activeWeaponType==='rifle'&&activeGroup.userData.bolt){
          const bolt=activeGroup.userData.bolt;
          bolt.position.z=(bolt.userData.baseZ??-.43)+(Math.sin(p*Math.PI*2)<0?-.12:0);
        }
      }else{
        if(activeGroup.userData.cylinder)activeGroup.userData.cylinder.position.x=.30;
        if(activeGroup.userData.barrelGroup){activeGroup.userData.barrelGroup.rotation.x=0;activeGroup.userData.barrelGroup.position.y=0;}
        if(activeGroup.userData.bolt)activeGroup.userData.bolt.position.z=activeGroup.userData.bolt.userData.baseZ??-.43;
      }
    }

    if(this.switchTimer>0){
      this.switchTimer=Math.max(0,this.switchTimer-dt);
      const p=1-this.switchTimer/this.switchDuration;
      const fromModel=this.getViewModel(this.switchFrom),toModel=this.getViewModel(this.switchTo);
      if(p<.5){
        const q=p/.5;
        if(fromModel){fromModel.visible=true;fromModel.position.y-=q*.62;}
        if(toModel)toModel.visible=false;
      }else{
        const q=(p-.5)/.5;
        if(fromModel)fromModel.visible=false;
        if(toModel){toModel.visible=true;toModel.position.y-=(1-q)*.62;}
      }
      if(this.switchTimer<=0){this.setOnlyViewModel(this.activeWeaponType);this.switchFrom=null;this.switchTo=null;}
    }else this.setOnlyViewModel(this.activeWeaponType);

    // Physical carried objects are shown alone; the shovel/firearm viewmodel is hidden until the item is dropped/stowed.
    if(this.carriedItem)for(const g of Object.values(this.weaponGroups))g.visible=false;

    for(const spark of this.hitSparks||[]){
      if(!spark.visible)continue;
      spark.userData.life-=dt;spark.position.addScaledVector(spark.userData.velocity,dt);spark.userData.velocity.y-=3.2*dt;
      spark.material.opacity=Math.max(0,spark.userData.life/Math.max(.001,spark.userData.maxLife));
      if(spark.userData.life<=0)spark.visible=false;
    }
  }

  applyTrainCameraMotion(train, dt) {
    if (!train?.playerOnTrain?.(this.position) || !this.onGround) return;
    const speedRatio=THREE.MathUtils.clamp(train.speed/Math.max(.1,train.maxSpeed),0,1);
    const faultBoost=(train.leakActive||train.jammedActive||train.pressureState?.()==='CRITICAL') ? .008 : 0;
    const amp=.0025+speedRatio*.012+faultBoost;
    this.rideTime+=dt*(3+train.speed*1.35);
    this.camera.position.x+=Math.sin(this.rideTime*1.7)*amp*.45;
    this.camera.position.y+=Math.sin(this.rideTime*2.25)*amp;
  }

  moveWithCollisions(move, train) {
    this.position.x += move.x; if(this.collisionWorld)this.collisionWorld.resolveCircle(this.position,this.radius,this.height,.45); train.resolvePlayerCollision(this.position,this.radius,this.height);
    this.position.z += move.z; if(this.collisionWorld)this.collisionWorld.resolveCircle(this.position,this.radius,this.height,.45); train.resolvePlayerCollision(this.position,this.radius,this.height);
  }

  syncCamera() {
    this.camera.position.set(this.position.x,this.position.y+1.62,this.position.z);
    this.camera.rotation.order='YXZ'; this.camera.rotation.y=this.yaw; this.camera.rotation.x=this.pitch;
  }

  attack(enemySystem, blockerMeshes = []) {
    if(!this.pointerLocked||this.dead||this.gameplayLocked||this.switchTimer>0||this.carriedItem)return false;
    if(this.isMeleeType(this.activeWeaponType))return this.beginMeleeAttack(enemySystem,blockerMeshes);
    return this.shoot(enemySystem,blockerMeshes);
  }

  beginShovelAttack(enemySystem, blockerMeshes=[]) { return this.beginMeleeAttack(enemySystem,blockerMeshes); }

  beginMeleeAttack(enemySystem, blockerMeshes=[]) {
    const w=this.weapon;
    if(!w?.melee||w.cooldown>0||this.shovelSwingTimer>0||this.switchTimer>0||this.carriedItem)return false;
    w.cooldown=w.fireDelay;
    this.shovelSwingDuration=this.activeWeaponType==='vampireKnife'?.36:(this.activeWeaponType==='claws'?.39:.52);
    this.shovelImpactAt=this.activeWeaponType==='vampireKnife'?.45:.50;
    this.shovelSwingTimer=this.shovelSwingDuration;
    this.pendingShovelImpact={enemySystem,blockerMeshes:[...blockerMeshes],resolved:false};
    this.shovelHitStop=0;
    this.playMeleeSwing();
    return true;
  }

  resolveShovelImpact(enemySystem, blockerMeshes=[]) { return this.resolveMeleeImpact(enemySystem,blockerMeshes); }

  resolveMeleeImpact(enemySystem, blockerMeshes=[]) {
    const w=this.weapon;
    this._rayNdc.set(0,0);this.raycaster.setFromCamera(this._rayNdc,this.camera);
    this.raycaster.near=.05;this.raycaster.far=w.range;
    const targets=enemySystem.hittableMeshes();
    const allies=enemySystem.allyMeshes?.()||[];
    const all=[...new Set([...targets,...allies,...blockerMeshes].filter(Boolean))];
    const hit=this.raycaster.intersectObjects(all,false)[0];
    if(!hit)return false;
    const enemy=hit.object?.userData?.enemy;
    if(enemy?.faction===window.IronWastesFaction?.ALLY){this.playMetalHit(.45);this.combatKick=.004;return true;}
    if(enemy){
      const zone=hit.object.userData.hitZone||'body';
      const finalDamage=w.damage*this.getMeleeDamageMultiplier();
      const applied=enemy.damage(finalDamage,zone,hit.point);
      if(applied>0){
        this.emitHitSparks(hit.point,zone==='shield'?8:zone==='core'?7:5);
        this.playMetalHit(zone==='shield'?.75:1);
        this.combatKick=zone==='shield'?.012:.018;
        if(this.activeWeaponType==='vampireKnife')this.applyVampireLifesteal(applied,hit.point);
        return true;
      }
      return false;
    }
    if(this.isMetalSurface(hit.object)){
      this.emitHitSparks(hit.point,4);
      this.playMetalHit(.72);
      this.combatKick=.009;
      return true;
    }
    this.playWoodHit();
    this.combatKick=.005;
    return true;
  }

  isMetalSurface(object) {
    if(!object)return false;
    const tag=String(object.userData?.collisionTag||'').toLowerCase();
    if(/rail|train|pipe|boiler|wreck|iron|metal|crane|engine|signal|tank|industrial|mechanism/.test(tag))return true;
    if(/wood|fence|crate|house|bed|table/.test(tag))return false;
    const mats=Array.isArray(object.material)?object.material:[object.material];
    return mats.some(m=>m&&Number(m.metalness||0)>.38);
  }

  shoot(enemySystem, blockerMeshes = []) {
    const w=this.weapon;
    if(!w?.owned||this.isMeleeType(this.activeWeaponType)||w.reloading||w.cooldown>0||this.switchTimer>0||this.carriedItem)return false;
    if(w.loaded<=0){this.beginReload();return false;}
    w.loaded--;w.cooldown=w.fireDelay;this.lastFirearmType=this.activeWeaponType;
    const group=this.weaponGroups[this.activeWeaponType];
    const muzzle=group?.userData?.muzzle;
    if(muzzle){muzzle.material.opacity=1;muzzle.userData.flashTimer=.06;}
    if(group)group.userData.recoil=1;
    this.combatKick=this.activeWeaponType==='shotgun'?.032:this.activeWeaponType==='rifle'?.02:.016;

    const targets=enemySystem.hittableMeshes();
    const allies=enemySystem.allyMeshes?.()||[];
    const all=[...new Set([...targets,...allies,...blockerMeshes].filter(Boolean))];
    if(this.activeWeaponType==='shotgun'){
      const effects=new Map();
      for(let i=0;i<w.pellets;i++){
        const spread=.027;
        this._rayNdc.set((Math.random()-.5)*spread,(Math.random()-.5)*spread);this.raycaster.setFromCamera(this._rayNdc,this.camera);this.raycaster.far=28;
        const hit=this.raycaster.intersectObjects(all,false)[0];
        const enemy=hit?.object?.userData?.enemy;
        if(!enemy)continue;
        if(enemy.faction===window.IronWastesFaction?.ALLY){this.emitHitSparks(hit.point,2);continue;}
        const zone=hit.object.userData.hitZone||'body';
        const applied=enemy.damage(w.damage,zone,hit.point);
        if(applied<=0)continue;
        const priority=zone==='core'?3:zone==='shield'?2:1;
        const old=effects.get(enemy);
        if(!old||priority>old.priority)effects.set(enemy,{point:hit.point?.clone?.()||hit.point,zone,priority});
      }
      for(const effect of effects.values()){
        this.emitHitSparks(effect.point,effect.zone==='shield'?8:effect.zone==='core'?7:6);
        this.playMetalHit(effect.zone==='shield'?.78:1);
      }
    }else{
      this._rayNdc.set(0,0);this.raycaster.setFromCamera(this._rayNdc,this.camera);this.raycaster.far=this.activeWeaponType==='rifle'?90:60;
      const hit=this.raycaster.intersectObjects(all,false)[0];
      const enemy=hit?.object?.userData?.enemy;
      if(enemy?.faction===window.IronWastesFaction?.ALLY){this.emitHitSparks(hit.point,2);this.playMetalHit(.35);}
      else if(enemy){
        const zone=hit.object.userData.hitZone||'body';
        const applied=enemy.damage(w.damage,zone,hit.point);
        if(applied>0){this.emitHitSparks(hit.point,zone==='shield'?8:zone==='core'?7:5);this.playMetalHit(zone==='shield'?.78:1);}
      }
    }
    return true;
  }

  playShovelSwing() { return this.playMeleeSwing(); }

  playMeleeSwing() {
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
      this.audioCtx=this.audioCtx||new Ctx();
      const osc=this.audioCtx.createOscillator(),gain=this.audioCtx.createGain();
      const knife=this.activeWeaponType==='vampireKnife',claws=this.activeWeaponType==='claws';
      osc.type=claws?'triangle':'sine';const f0=knife?390:(claws?180:250),f1=knife?145:(claws?72:95),dur=knife?.085:(claws?.10:.12);
      osc.frequency.setValueAtTime(f0,this.audioCtx.currentTime);osc.frequency.exponentialRampToValueAtTime(f1,this.audioCtx.currentTime+dur);
      gain.gain.setValueAtTime(knife?.0065:(claws?.010:.008),this.audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,this.audioCtx.currentTime+dur+.02);
      osc.connect(gain).connect(this.audioCtx.destination);osc.start();osc.stop(this.audioCtx.currentTime+dur+.03);
    }catch(_){}
  }

  playWoodHit() {
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
      this.audioCtx=this.audioCtx||new Ctx();
      const osc=this.audioCtx.createOscillator(),gain=this.audioCtx.createGain();
      osc.type='triangle';osc.frequency.setValueAtTime(92,this.audioCtx.currentTime);osc.frequency.exponentialRampToValueAtTime(54,this.audioCtx.currentTime+.055);
      gain.gain.setValueAtTime(.018,this.audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,this.audioCtx.currentTime+.07);
      osc.connect(gain).connect(this.audioCtx.destination);osc.start();osc.stop(this.audioCtx.currentTime+.075);
    }catch(_){}
  }

  playMetalHit(volume=1) {
    try {
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)return;
      this.audioCtx=this.audioCtx||new Ctx();
      const osc=this.audioCtx.createOscillator(),gain=this.audioCtx.createGain();
      osc.type='square';osc.frequency.setValueAtTime(165,this.audioCtx.currentTime);osc.frequency.exponentialRampToValueAtTime(72,this.audioCtx.currentTime+.055);
      gain.gain.setValueAtTime(.035*Math.max(.2,volume),this.audioCtx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,this.audioCtx.currentTime+.07);
      osc.connect(gain).connect(this.audioCtx.destination);osc.start();osc.stop(this.audioCtx.currentTime+.075);
    } catch(_) {}
  }

  beginReload() {
    const w=this.weapon;
    if(this.isMeleeType(this.activeWeaponType)||!w?.owned||w.reloading||w.loaded>=w.capacity||w.reserve<=0||this.switchTimer>0||this.carriedItem)return false;
    let classReload=this.classConfig?.reloadMultiplier||1;
    if(this.classConfig?.specialAbility==='conductor'&&this.isOnTrain)classReload*=this.classConfig?.onTrainReloadMultiplier||.85;
    w.reloading=true; w.reloadDuration=w.reloadTime*classReload; w.reloadTimer=w.reloadDuration; const g=this.weaponGroups[this.activeWeaponType]; if(g)g.userData.recoil=0; return true;
  }

  finishReload(w=this.weapon) {
    if(!w||!Number.isFinite(w.capacity))return;
    const need=w.capacity-w.loaded, taken=Math.min(need,w.reserve);
    w.loaded+=taken; w.reserve-=taken; w.reloading=false; w.reloadDuration=0;
  }

  applyVampireLifesteal(applied,worldPoint){
    if(this.classConfig?.specialAbility!=='vampire'||!Number.isFinite(applied)||applied<=0)return 0;
    const rate=THREE.MathUtils.lerp(.15,.25,this.classNightFactor||0);
    const healed=Math.min(this.maxHp-this.hp,applied*rate);
    if(healed<=0)return 0;
    this.hp+=healed;this.emitLifestealSparks(worldPoint,Math.min(6,Math.max(2,Math.ceil(healed))));this.ui?.flashClassEffect?.('lifesteal');this.playLifestealSound();return healed;
  }
  emitLifestealSparks(worldPoint,count=4){
    if(!worldPoint||!this.hitSparks?.length)return;
    let n=0;for(const spark of this.hitSparks){if(spark.visible)continue;spark.position.copy(worldPoint);spark.userData.velocity.set((Math.random()-.5)*.7,.25+Math.random()*.55,(Math.random()-.5)*.7);spark.userData.life=.14+Math.random()*.08;spark.userData.maxLife=spark.userData.life;spark.material.color.setHex(0x8d1f2b);spark.material.opacity=.75;spark.visible=true;if(++n>=count)break;}
  }
  playLifestealSound(){try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;this.audioCtx=this.audioCtx||new Ctx();const o=this.audioCtx.createOscillator(),g=this.audioCtx.createGain();o.type='sine';o.frequency.setValueAtTime(130,this.audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(62,this.audioCtx.currentTime+.11);g.gain.setValueAtTime(.012,this.audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,this.audioCtx.currentTime+.12);o.connect(g).connect(this.audioCtx.destination);o.start();o.stop(this.audioCtx.currentTime+.13);}catch(_){}}
  playTransformationSound(){try{const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;this.audioCtx=this.audioCtx||new Ctx();const o=this.audioCtx.createOscillator(),g=this.audioCtx.createGain();o.type='sawtooth';o.frequency.setValueAtTime(68,this.audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(105,this.audioCtx.currentTime+.20);g.gain.setValueAtTime(.014,this.audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,this.audioCtx.currentTime+.24);o.connect(g).connect(this.audioCtx.destination);o.start();o.stop(this.audioCtx.currentTime+.25);}catch(_){}}

  useMedkit() {
    if(this.dead||this.gameplayLocked||this.inventory.medkit<=0||this.hp>=this.maxHp)return;
    this.inventory.medkit--; const heal=45*(this.classConfig?.medkitHealMultiplier||1); this.hp=Math.min(this.maxHp,this.hp+heal);
  }

  damage(amount, source='unknown') {
    if(this.dead)return;
    this.lastDamageSource=source;
    this.damageSerial = (this.damageSerial || 0) + 1;
    let mul=(this.difficulty.incomingDamageMultiplier||1);
    if(source==='walker'||source==='stalker'||source==='brute'||source==='automaton'||source==='spider'||source==='shielder')mul*=this.classConfig?.incomingMeleeMultiplier||1;
    if(/steam|environment|firebox|hazard/.test(String(source)))mul*=this.classConfig?.environmentalDamageMultiplier||1;
    if(this.classConfig?.specialAbility==='werewolf')mul*=THREE.MathUtils.lerp(1,.90,this.classNightFactor||0);
    if(this.classConfig?.specialAbility==='conductor'&&this.isOnTrain)mul*=this.classConfig?.onTrainIncomingMultiplier||.85;
    this.hp-=amount*mul; this.ui.flashDamage();
    if(this.hp<=0){this.hp=0;this.dead=true;this.flashlight.intensity=0;this.ui.showDeath();}
  }
}

window.Player = Player;
