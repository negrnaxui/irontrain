const IRON_WASTES_FACTION = Object.freeze({ PLAYER:'PLAYER', HOSTILE:'HOSTILE', ALLY:'ALLY' });

class Automaton {
  constructor(scene, position, onDeath, collisionWorld, train, assets, options = {}) {
    this.scene = scene;
    this.onDeath = onDeath;
    this.collisionWorld = collisionWorld;
    this.train = train;
    this.assets = assets;
    this.type = Automaton.normalizeType(options.type || 'walker');
    this.config = Automaton.CONFIG[this.type] || Automaton.CONFIG.walker;
    this.group = new THREE.Group();
    this.modelRoot = new THREE.Group();
    this.group.add(this.modelRoot);
    this.group.position.copy(position);
    this.hp = this.config.hp;
    this.maxHp = this.config.hp;
    this.speed = this.config.speed;
    this.attackDamage = this.config.damage;
    this.baseStats = {
      maxHp:this.maxHp, hp:this.hp, speed:this.speed, attackDamage:this.attackDamage,
      rangedDamage:this.config.rangedDamage || 0, rangedDelay:this.config.rangedDelay || 0,
      sniperAimTime:this.config.ranged ? .58 : 0, detect:this.config.detect
    };
    this.rangedDamage = this.baseStats.rangedDamage;
    this.rangedDelay = this.baseStats.rangedDelay;
    this.sniperAimDuration = this.baseStats.sniperAimTime || .58;
    this.difficultyConfig = { enemyHealthMultiplier:1, enemyDamageMultiplier:1, enemySpeedMultiplier:1, sniperAimTimeMultiplier:1, sniperReloadMultiplier:1 };
    this.attackCooldown = Math.random() * .25;
    this.dead = false;
    this.awake = options.awake ?? false;
    this.dynamic = Boolean(options.dynamic);
    this.faction = options.faction || IRON_WASTES_FACTION.HOSTILE;
    this.hackAttempted = Boolean(options.hackAttempted);
    this.stunnedTimer = 0;
    this.allyStowed = false;
    this.currentTarget = null;
    this.factionOwnedMaterials = [];
    this.hackPulseMesh = null;
    this.hackPulseTimer = 0;
    this.stationEnemy = Boolean(options.station);
    this.stationary = Boolean(options.stationary);
    this.radius = this.config.radius;
    this.role = this.config.role;
    this.group.userData.enemyRole = this.role;
    this.group.userData.faction = this.faction;
    this.sidestepSign = Math.random() > .5 ? 1 : -1;
    this.maxStep = this.type === 'stalker' ? .42 : .55;
    this.healthVisibleTimer = 0;
    this.stuckTimer = 0;
    this.walkPhase = Math.random() * Math.PI * 2;
    this.onRangedAttack = options.onRangedAttack || null;
    this.parts = {};
    this.hittableParts = [];
    this._perfAccum = 0;
    this._tmpFrom=new THREE.Vector3();this._tmpTo=new THREE.Vector3();this._tmpBefore=new THREE.Vector3();this._tmpCandidate=new THREE.Vector3();this._tmpDisp=new THREE.Vector3();this._tmpSideA=new THREE.Vector3();this._tmpSideB=new THREE.Vector3();this._tmpQuatA=new THREE.Quaternion();this._tmpQuatB=new THREE.Quaternion();
    this._tmpTarget3D=new THREE.Vector3();this._tmpTargetFlat=new THREE.Vector3();this._tmpSteamPos=new THREE.Vector3();this._tmpSteamVel=new THREE.Vector3();this._tmpForward=new THREE.Vector3();this._tmpIncoming=new THREE.Vector3();this._tmpHitSteam=new THREE.Vector3();
    this.sniperCharge = 0;
    this.sniperCharging = false;
    this.effectTimer = 1.2 + Math.random() * 1.8;
    this.chargeBeam = null;
    this.chargeOpticMat = null;
    this.buildModel();
    scene.add(this.group);
  }

  static TYPE_ALIASES = {
    walker:'walker', automaton:'walker', AUTOMATON:'walker',
    stalker:'stalker', spider:'stalker', SPIDER:'stalker',
    brute:'brute', shielder:'brute', SHIELDER:'brute',
    gunner:'gunner', sniper:'gunner', SNIPER:'gunner'
  };

  static normalizeType(type) { return Automaton.TYPE_ALIASES[type] || Automaton.TYPE_ALIASES[String(type).toLowerCase()] || 'walker'; }

  static CONFIG = {
    walker:  { role:'AUTOMATON', label:'АВТОМАТОН', hp:60,  speed:1.25, damage:10, radius:.58, height:2.55, eyeHeight:1.65, healthY:2.82, detect:18, attackDelay:1.18, meleeRange:1.60, verticalAttack:1.10 },
    stalker: { role:'SPIDER', label:'ПАУК',      hp:42,  speed:1.90, damage:8,  radius:.82, height:.92, eyeHeight:.55, healthY:1.27, detect:22, attackDelay:.86, meleeRange:1.52, verticalAttack:.72 },
    brute:   { role:'SHIELDER', label:'ЩИТОВИК',   hp:140, speed:.78, damage:18, radius:1.02, height:2.48, eyeHeight:1.55, healthY:2.90, detect:17, attackDelay:1.48, meleeRange:1.95, verticalAttack:1.20 },
    gunner:  { role:'SNIPER', label:'СНАЙПЕР',   hp:74,  speed:1.02, damage:8,  radius:.44, height:2.88, eyeHeight:2.48, healthY:3.28, detect:30, attackDelay:1.20, meleeRange:1.45, verticalAttack:1.15, ranged:true, rangedDamage:7, rangedDelay:2.10, rangedMin:6.0, rangedMax:24 }
  };

  mesh(geo, mat, position, rotation = null, scale = null, parent = this.modelRoot) {
    const m = new THREE.Mesh(geo, mat);
    if (position) m.position.set(position[0], position[1], position[2]);
    if (rotation) m.rotation.set(rotation[0], rotation[1], rotation[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    parent.add(m);
    return m;
  }

  buildModel() {
    if (this.type === 'stalker') this.buildSpiderModel();
    else if (this.type === 'brute') this.buildShielderModel();
    else if (this.type === 'gunner') this.buildSniperModel();
    else this.buildAutomatonModel();

    const A = this.assets;
    this.healthGroup = new THREE.Group();
    this.healthBack = new THREE.Mesh(A.healthBackGeo, A.healthBackMat);
    this.healthFill = new THREE.Mesh(A.healthFillGeo, A.healthFillMat);
    this.healthFill.position.z = .006;
    this.healthGroup.position.set(0, this.config.healthY, 0);
    this.healthGroup.visible = false;
    this.healthGroup.add(this.healthBack, this.healthFill);
    this.group.add(this.healthGroup);

    this.group.traverse(o => {
      if (o.isMesh && o !== this.healthBack && o !== this.healthFill) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.userData.enemy = this;
        if (!o.userData.hitZone) o.userData.hitZone = 'body';
        this.hittableParts.push(o);
      }
    });
  }

  buildAutomatonModel() {
    const A = this.assets, iron=A.ironMat, brass=A.brassMat, rust=A.rustMat, soot=A.sootMat, eyeMat=A.eyeMat;
    const torso = this.mesh(A.workerTorsoGeo, iron, [0,1.38,0], null, [1.06,1.0,.88]);
    const boiler = this.mesh(A.workerBoilerGeo, rust, [0,1.30,.28], [Math.PI/2,0,0], [1,1,1]);
    const chestBand = this.mesh(A.bandGeo, brass, [0,1.40,.32], null, [1.18,1.18,.75]);
    const gear = this.mesh(A.gearGeo, brass, [-.38,1.35,.49], null, [.72,.72,.72]);
    const chimney = this.mesh(A.chimneyGeo, soot, [-.24,2.14,-.03]);
    const chimneyCap = this.mesh(A.chimneyCapGeo, brass, [-.24,2.45,-.03]);
    const eyeRing = this.mesh(A.eyeRingGeo, brass, [0,1.71,.49]);
    const mainEye = this.mesh(A.eyeGeo, eyeMat, [0,1.71,.555], null, [1.08,.82,.62]);
    const smallEye = this.mesh(A.eyeGeo, eyeMat, [.27,1.56,.50], null, [.50,.50,.38]);
    this.parts.body = torso;
    this.parts.eyes = [mainEye,smallEye];

    this.parts.leftLeg = this.buildWorkerLeg(-1);
    this.parts.rightLeg = this.buildWorkerLeg(1);
    this.parts.leftArm = this.buildWorkerArm(-1);
    this.parts.rightArm = this.buildWorkerArm(1);

    for (const sx of [-1,1]) {
      const cable = this.mesh(A.pipeGeo, sx < 0 ? A.copperMat : brass, [sx*.52,1.43,-.22], [0,0,sx*.26], [1,1.15,1]);
      cable.castShadow = false;
    }
    this.mesh(A.sideTankGeo, brass, [.48,1.20,-.28], [0,0,-.12], [1.05,1.15,1.05]);
    this.mesh(A.valveGeo, brass, [.52,1.52,-.28], [0,0,Math.PI/2]);
  }

  buildWorkerLeg(sign) {
    const A=this.assets, g=new THREE.Group(); g.position.set(sign*.34,1.03,0); this.modelRoot.add(g);
    this.mesh(A.workerUpperLegGeo,A.ironMat,[0,-.24,0],[0,0,sign*.035],null,g);
    this.mesh(A.jointGeo,A.brassMat,[0,-.56,.015],null,[1.15,1.15,1.15],g);
    this.mesh(A.workerLowerLegGeo,A.rustMat,[0,-.84,.01],[0,0,-sign*.035],null,g);
    this.mesh(A.pistonGeo,A.copperMat,[sign*.10,-.75,.12],[0,0,-sign*.08],[.75,.95,.75],g);
    this.mesh(A.workerFootGeo,A.sootMat,[0,-1.12,.12],null,null,g);
    return g;
  }

  buildWorkerArm(sign) {
    const A=this.assets, g=new THREE.Group(); g.position.set(sign*.69,1.72,0); this.modelRoot.add(g);
    this.mesh(A.shoulderGeo,A.brassMat,[0,0,0],[Math.PI/2,0,0],[1.18,1.18,1.18],g);
    this.mesh(A.armRodGeo,A.ironMat,[sign*.03,-.34,.01],[0,0,sign*.07],null,g);
    this.mesh(A.jointGeo,A.brassMat,[sign*.07,-.66,.03],null,null,g);
    this.mesh(A.armRodGeo,A.rustMat,[sign*.11,-.92,.15],[-.30,0,sign*.09],[.92,.82,.92],g);
    const clawBase=this.mesh(A.clawBaseGeo,A.sootMat,[sign*.14,-1.18,.31],[-.20,0,0],null,g);
    this.mesh(A.clawFingerGeo,A.brassMat,[-.09,-.10,.19],[-.28,0,.18],null,clawBase);
    this.mesh(A.clawFingerGeo,A.brassMat,[.09,-.10,.19],[-.28,0,-.18],null,clawBase);
    return g;
  }

  buildSpiderModel() {
    const A=this.assets, soot=A.sootMat, rust=A.rustMat, brass=A.brassMat, eye=A.redEyeMat;
    const body=this.mesh(A.spiderBodyGeo,soot,[0,.57,0],null,[1.05,.72,.92]);
    const boiler=this.mesh(A.spiderBoilerGeo,rust,[0,.66,-.05],[0,0,Math.PI/2],[1,.95,1]);
    this.mesh(A.spiderBackPlateGeo,A.darkBrassMat,[0,.82,-.02]);
    this.mesh(A.spiderVentGeo,brass,[-.18,1.00,-.10],[0,0,-.12]);
    this.mesh(A.spiderVentGeo,brass,[.18,1.00,-.10],[0,0,.12]);
    this.parts.body=body;
    this.parts.spiderLegs=[];
    const zOffsets=[-.43,0,.43];
    for(const side of [-1,1]){
      zOffsets.forEach((zOff,index)=>{
        const root=new THREE.Group();root.position.set(side*.43,.59,zOff);root.userData.baseZ=side*(.82+.10*index);root.userData.phase=index*2.05+(side>0?Math.PI:0);this.modelRoot.add(root);
        const upper=this.mesh(A.spiderLegGeo,ironOr(A, index),[side*.33,-.11,0],[0,0,side*1.04],[1,.92+index*.06,1],root);
        const knee=this.mesh(A.spiderKneeGeo,brass,[side*.60,-.28,0],null,null,root);
        const lower=this.mesh(A.spiderLegGeo,rust,[side*.78,-.47,.01],[0,0,side*.62],[.90,.88, .90],root);
        this.mesh(A.spiderFootGeo,soot,[side*.96,-.66,.05],[0,0,-side*.12],null,root);
        root.userData.upper=upper;root.userData.lower=lower;root.userData.knee=knee;
        this.parts.spiderLegs.push(root);
      });
    }
    const eyeXs=[-.22,0,.22];
    this.parts.eyes=eyeXs.map((x,i)=>this.mesh(A.spiderEyeGeo,eye,[x,.63,.59],null,[i===1?1.05:.75,i===1?1.05:.75,.65]));
    this.mesh(A.mandibleGeo,A.darkBrassMat,[-.24,.44,.69],[.15,0,.26]);
    this.mesh(A.mandibleGeo,A.darkBrassMat,[.24,.44,.69],[.15,0,-.26]);
  }

  buildShielderModel() {
    const A=this.assets, iron=A.ironMat, rust=A.rustMat, soot=A.sootMat, brass=A.brassMat;
    const chassis=this.mesh(A.shielderBodyGeo,soot,[0,1.18,-.05],null,[1.10,1.0,.94]);
    const boiler=this.mesh(A.shielderBoilerGeo,rust,[0,1.52,-.47],[Math.PI/2,0,0],[1.0,1.0,1.0]);
    this.mesh(A.shielderBandGeo,brass,[0,1.52,-.48],null,[1.08,1.08,1]);
    this.parts.body=chassis;
    this.parts.shielderLegs=[];
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const g=new THREE.Group();g.position.set(sx*.58,.80,sz*.25);g.userData.phase=(sx===sz?0:Math.PI);this.modelRoot.add(g);
      this.mesh(A.shielderLegGeo,iron,[0,-.23,0],[0,0,sx*.05],null,g);
      this.mesh(A.shielderJointGeo,brass,[0,-.53,0],null,null,g);
      this.mesh(A.shielderFootGeo,soot,[0,-.74,sz*.06],null,null,g);
      this.parts.shielderLegs.push(g);
    }
    const shield=this.mesh(A.shieldGeo,rust,[0,1.13,.69],null,[1.04,1,1]);shield.userData.hitZone='shield';this.parts.shield=shield;
    for(const x of [-.67,0,.67]){const rib=this.mesh(A.shieldRibGeo,iron,[x,1.13,.80],null,null,this.modelRoot);rib.userData.hitZone='shield';}
    for(const y of [.40,.82,1.25,1.67])for(const x of [-.80,.80]){const rivet=this.mesh(A.rivetGeo,brass,[x,y,.80],null,[.75,.75,.75]);rivet.userData.hitZone='shield';}
    const slit=this.mesh(A.visionSlitGeo,A.redEyeMat,[0,1.50,.805]);slit.userData.hitZone='shield';
    this.parts.core=this.mesh(A.coreGeo,A.coreMat,[0,1.45,-.92],[Math.PI/2,0,0]);this.parts.core.userData.hitZone='core';
    const coreRing=this.mesh(A.coreRingGeo,brass,[0,1.45,-.98]);coreRing.userData.hitZone='core';
    for(const x of [-.63,.63]){
      this.mesh(A.exhaustGeo,soot,[x,2.00,-.46],[0,0,x<0?-.12:.12]);
      this.mesh(A.valveGeo,brass,[x,2.26,-.46],[0,0,Math.PI/2]);
    }
    this.steamPoint=new THREE.Object3D();this.steamPoint.position.set(0,2.15,-.72);this.modelRoot.add(this.steamPoint);
  }

  buildSniperModel() {
    const A=this.assets, iron=A.ironMat, soot=A.sootMat, brass=A.brassMat, rust=A.rustMat;
    this.parts.sniperLegs=[];
    for(const sign of [-1,1]){
      const g=new THREE.Group();g.position.set(sign*.19,1.53,0);this.modelRoot.add(g);
      this.mesh(A.sniperUpperLegGeo,iron,[0,-.40,0],[0,0,sign*.025],null,g);
      this.mesh(A.sniperKneeGeo,brass,[0,-.82,.01],null,null,g);
      this.mesh(A.sniperLowerLegGeo,rust,[0,-1.17,.02],[0,0,-sign*.035],null,g);
      this.mesh(A.sniperFootGeo,soot,[0,-1.45,.12],null,null,g);
      this.parts.sniperLegs.push(g);
    }
    const torso=this.mesh(A.sniperTorsoGeo,soot,[0,1.88,0],null,[.92,1,.88]);this.parts.body=torso;
    this.mesh(A.sniperChestGeo,brass,[0,1.93,.25]);
    this.mesh(A.sniperBackTankGeo,rust,[0,2.00,-.36],[0,0,Math.PI/2]);
    this.mesh(A.pipeGeo,A.copperMat,[-.24,2.05,-.30],[0,0,-.18],[.75,.72,.75]);
    const head=this.mesh(A.sniperHeadGeo,iron,[0,2.58,.02]);this.parts.head=head;
    this.chargeOpticMat=A.sniperOpticMat.clone();
    this.chargeCoilMat=A.sniperCoilMat.clone();
    this.mesh(A.sniperOpticGeo,this.chargeOpticMat,[0,2.58,.39],[Math.PI/2,0,0]);
    this.mesh(A.sniperLensGeo,A.redEyeMat,[0,2.58,.615]);
    this.mesh(A.antennaGeo,brass,[-.20,2.90,-.04],[0,0,-.10]);
    this.mesh(A.antennaGeo,brass,[.20,2.84,-.06],[0,0,.15],[.75,.75,.75]);

    this.parts.weaponRig=new THREE.Group();this.parts.weaponRig.position.set(.28,1.88,.17);this.modelRoot.add(this.parts.weaponRig);
    this.mesh(A.sniperChamberGeo,rust,[0,0,.24],[Math.PI/2,0,0],null,this.parts.weaponRig);
    this.mesh(A.sniperBarrelGeo,soot,[0,0,1.05],[Math.PI/2,0,0],null,this.parts.weaponRig);
    for(const z of [.45,.72,.98])this.mesh(A.sniperCoilGeo,this.chargeCoilMat,[0,0,z],null,null,this.parts.weaponRig);
    this.mesh(A.sniperScopeGeo,brass,[-.10,.15,.48],[Math.PI/2,0,0],null,this.parts.weaponRig);
    this.mesh(A.sniperBoltGeo,brass,[.14,-.10,.18],null,null,this.parts.weaponRig);
    this.weaponMuzzle=new THREE.Object3D();this.weaponMuzzle.position.set(0,0,1.88);this.parts.weaponRig.add(this.weaponMuzzle);

    const beamGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
    this.chargeBeam=new THREE.Line(beamGeo,new THREE.LineBasicMaterial({color:0xff2d20,transparent:true,opacity:0,depthTest:true,depthWrite:false}));
    this.chargeBeam.visible=false;this.chargeBeam.frustumCulled=false;this.scene.add(this.chargeBeam);
  }

  setAwake(awake=true){this.awake=awake;}

  floorFor(position,currentY=this.group.position.y,limitStep=false){
    let floor=this.collisionWorld?this.collisionWorld.floorHeightAt(position,limitStep?currentY:null,limitStep?this.maxStep:Infinity):.12;
    const trainFloor=this.train?.deckFloorAtXZ?.(position);
    if(trainFloor!=null&&currentY>1.25&&(!limitStep||trainFloor<=currentY+this.maxStep+.02))floor=Math.max(floor,trainFloor);
    return floor;
  }

  targetPosition(target){ return target?.position || target?.group?.position || null; }

  hasLineOfSight(target){
    if(!this.collisionWorld)return true;
    const tp=this.targetPosition(target);if(!tp)return false;
    const from=this._tmpFrom.copy(this.group.position);from.y+=this.config.eyeHeight;
    const targetHeight=target?.group?.position?Math.min(1.35,(target.config?.eyeHeight||1.2)):1.35;
    const to=this._tmpTo.copy(tp);to.y+=targetHeight;
    return !this.collisionWorld.isLineBlocked(from,to,this.train?.getRaycastMeshes?.()||[]);
  }

  tryDisplacement(direction,amount){
    const before=this._tmpBefore.copy(this.group.position);
    const candidate=this._tmpCandidate.copy(before).addScaledVector(direction,amount);
    const candidateFloor=this.floorFor(candidate,before.y,false);
    if(candidateFloor>before.y+this.maxStep+.02)return false;
    this.group.position.copy(candidate);
    this.collisionWorld?.resolveCircle(this.group.position,this.radius,this.config.height,this.maxStep);
    this.train?.resolveEnemyCollision?.(this.group.position,this.radius,this.config.height);
    const resolvedFloor=this.floorFor(this.group.position,before.y,false);
    if(resolvedFloor>before.y+this.maxStep+.02){this.group.position.copy(before);return false;}
    this.group.position.y=resolvedFloor;
    const displacement=this._tmpDisp.copy(this.group.position).sub(before);displacement.y=0;
    if(displacement.dot(direction)<amount*.28){this.group.position.copy(before);return false;}
    return true;
  }

  tryMove(direction,amount){
    if(this.tryDisplacement(direction,amount))return true;
    const sideA=this._tmpSideA.set(-direction.z*this.sidestepSign,0,direction.x*this.sidestepSign).normalize();
    if(this.tryDisplacement(sideA,amount*.9))return true;
    const sideB=this._tmpSideB.copy(sideA).multiplyScalar(-1);
    if(this.tryDisplacement(sideB,amount*.9)){this.sidestepSign*=-1;return true;}
    sideB.copy(direction).multiplyScalar(-1);
    if(this.tryDisplacement(sideB,amount*.45)){this.sidestepSign*=-1;return true;}
    this.sidestepSign*=-1;return false;
  }

  faceTarget(target){const p=this.targetPosition(target);if(p)this.group.lookAt(p.x,this.group.position.y+this.config.eyeHeight*.7,p.z);}
  facePlayer(player){this.faceTarget(player);}

  updateHealthBillboard(camera,player,canSee,distance){
    const parentWorld=this._tmpQuatA,cameraWorld=this._tmpQuatB;
    this.group.getWorldQuaternion(parentWorld);camera.getWorldQuaternion(cameraWorld);
    this.healthGroup.quaternion.copy(parentWorld.invert().multiply(cameraWorld));
    this.healthGroup.visible=this.healthVisibleTimer>0||(this.awake&&distance<6.5&&canSee);
  }

  animateWalk(dt){
    this.walkPhase+=dt*(4.5+this.speed*2);
    const p=this.walkPhase;
    if(this.type==='stalker'){
      this.parts.spiderLegs?.forEach((leg,i)=>{
        const phase=p*1.55+leg.userData.phase;
        leg.rotation.x=Math.sin(phase)*.20;
        leg.rotation.z=Math.sin(phase+Math.PI/2)*.07;
      });
      this.modelRoot.position.y=.025+Math.abs(Math.sin(p*1.45))*.035;
      this.modelRoot.rotation.z=Math.sin(p*.72)*.025;
    }else if(this.type==='brute'){
      this.parts.shielderLegs?.forEach((leg,i)=>leg.rotation.x=Math.sin(p*.62+leg.userData.phase)*.095);
      this.modelRoot.position.y=Math.abs(Math.sin(p*.62))*.025;
      this.modelRoot.rotation.z=Math.sin(p*.31)*.018;
    }else if(this.type==='gunner'){
      this.parts.sniperLegs?.forEach((leg,i)=>leg.rotation.x=Math.sin(p*(.72)+i*Math.PI)*.17);
      this.modelRoot.position.y=Math.abs(Math.sin(p*.72))*.018;
      if(this.parts.weaponRig&&!this.sniperCharging)this.parts.weaponRig.rotation.x=THREE.MathUtils.lerp(this.parts.weaponRig.rotation.x,0,Math.min(1,dt*8));
    }else{
      if(this.parts.leftLeg)this.parts.leftLeg.rotation.x=Math.sin(p)*.16;
      if(this.parts.rightLeg)this.parts.rightLeg.rotation.x=-Math.sin(p)*.16;
      if(this.parts.leftArm)this.parts.leftArm.rotation.x=-Math.sin(p)*.09;
      if(this.parts.rightArm)this.parts.rightArm.rotation.x=Math.sin(p)*.09;
      this.modelRoot.position.y=Math.abs(Math.sin(p))* .018;
    }
  }

  hideCharge(){
    this.sniperCharging=false;this.sniperCharge=0;
    if(this.chargeBeam)this.chargeBeam.visible=false;
    if(this.chargeOpticMat)this.chargeOpticMat.emissiveIntensity=1.8;
    if(this.chargeCoilMat)this.chargeCoilMat.emissiveIntensity=.55;
    if(this.parts.weaponRig)this.parts.weaponRig.rotation.x=0;
  }

  startSniperCharge(){
    this.sniperCharging=true;this.sniperCharge=this.sniperAimDuration;
    if(this.chargeBeam)this.chargeBeam.visible=true;
  }

  updateSniperCharge(dt,target){
    if(!this.sniperCharging)return false;
    const tp=this.targetPosition(target);
    if(!tp||target?.dead||!this.hasLineOfSight(target)){this.hideCharge();this.attackCooldown=.35;return false;}
    this.sniperCharge=Math.max(0,this.sniperCharge-dt);
    const power=1-this.sniperCharge/Math.max(.001,this.sniperAimDuration);
    if(this.chargeOpticMat)this.chargeOpticMat.emissiveIntensity=2.0+power*6.0;
    if(this.chargeCoilMat)this.chargeCoilMat.emissiveIntensity=.55+power*3.4;
    if(this.parts.weaponRig)this.parts.weaponRig.rotation.x=-.015-Math.sin(power*Math.PI*3)*.008;
    if(this.chargeBeam&&this.weaponMuzzle){
      const from=this.weaponMuzzle.getWorldPosition(this._tmpFrom);
      const to=this._tmpTo.copy(tp);to.y+=target?.group?.position?.y!=null?Math.min(1.15,target.config?.eyeHeight||1.0):1.15;
      const pos=this.chargeBeam.geometry.attributes.position;pos.setXYZ(0,from.x,from.y,from.z);pos.setXYZ(1,to.x,to.y,to.z);pos.needsUpdate=true;
      this.chargeBeam.material.opacity=.18+power*.62;
    }
    if(this.sniperCharge>0)return true;
    const from=this.weaponMuzzle?.getWorldPosition(this._tmpFrom)||this._tmpFrom.copy(this.group.position).setY(this.group.position.y+this.config.eyeHeight);
    const to=this._tmpTo.copy(tp);to.y+=target?.group?.position?.y!=null?Math.min(1.15,target.config?.eyeHeight||1.0):1.15;
    this.onRangedAttack?.(from,to,this,target);if(target?.receiveAttack)target.receiveAttack(this.rangedDamage,this.group.position,this.faction===IRON_WASTES_FACTION.ALLY?'allySniper':'sniper');else target?.damage?.(this.rangedDamage,this.faction===IRON_WASTES_FACTION.ALLY?'allySniper':'sniper');
    this.attackCooldown=this.rangedDelay;
    this.hideCharge();
    return true;
  }


  setFaction(faction){
    if(!faction||this.faction===faction)return;
    this.faction=faction;this.group.userData.faction=faction;this.currentTarget=null;this.hideCharge();
    if(faction===IRON_WASTES_FACTION.ALLY){
      const allyColor=0x63c7c1,allyEmissive=0x2b8f92;
      this.modelRoot.traverse(o=>{
        if(!o.isMesh||!o.material)return;
        const mats=Array.isArray(o.material)?o.material:[o.material];
        const next=mats.map(mat=>{
          if(!mat)return mat;
          const isOptic=mat===this.assets.eyeMat||mat===this.assets.redEyeMat||mat===this.chargeOpticMat||mat===this.assets.sniperOpticMat||mat===this.assets.coreMat;
          if(!isOptic)return mat;
          const clone=mat.clone();clone.color?.setHex?.(allyColor);clone.emissive?.setHex?.(allyEmissive);clone.emissiveIntensity=Math.max(2.2,clone.emissiveIntensity||0);this.factionOwnedMaterials.push(clone);
          if(mat===this.chargeOpticMat)this.chargeOpticMat=clone;if(mat===this.chargeCoilMat)this.chargeCoilMat=clone;return clone;
        });
        o.material=Array.isArray(o.material)?next:next[0];
      });
      if(this.healthFill){this.healthFill.material=this.healthFill.material.clone();this.healthFill.material.color.setHex(0x68b7ad);this.factionOwnedMaterials.push(this.healthFill.material);}
      const marker=new THREE.Mesh(new THREE.TorusGeometry(.12,.025,6,12),new THREE.MeshBasicMaterial({color:allyColor,transparent:true,opacity:.8,depthWrite:false}));
      marker.position.set(0,this.config.healthY-.22,0);marker.rotation.x=Math.PI/2;this.modelRoot.add(marker);this.allyIndicator=marker;
    }
  }


  emitHackPulse(success){
    if(this.hackPulseMesh){this.modelRoot.remove(this.hackPulseMesh);this.hackPulseMesh.geometry?.dispose?.();this.hackPulseMesh.material?.dispose?.();this.hackPulseMesh=null;}
    const color=success?0x63c7c1:0xff3528;
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.34,.035,7,18),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false}));
    ring.position.set(0,Math.min(this.config.healthY-.38,this.config.height+.18),0);ring.rotation.x=Math.PI/2;ring.userData.hackPulse=true;this.modelRoot.add(ring);this.hackPulseMesh=ring;this.hackPulseTimer=.42;
  }

  updateHackPulse(dt){
    if(!this.hackPulseMesh)return;this.hackPulseTimer=Math.max(0,this.hackPulseTimer-dt);const p=this.hackPulseTimer/.42;this.hackPulseMesh.scale.setScalar(1+(1-p)*1.8);this.hackPulseMesh.material.opacity=.9*p;
    if(this.hackPulseTimer<=0){this.modelRoot.remove(this.hackPulseMesh);this.hackPulseMesh.geometry?.dispose?.();this.hackPulseMesh.material?.dispose?.();this.hackPulseMesh=null;}
  }

  disposeOwnedVisuals(){
    if(this.hackPulseMesh){this.modelRoot.remove(this.hackPulseMesh);this.hackPulseMesh.geometry?.dispose?.();this.hackPulseMesh.material?.dispose?.();this.hackPulseMesh=null;}
    if(this.allyIndicator){this.modelRoot.remove(this.allyIndicator);this.allyIndicator.geometry?.dispose?.();this.allyIndicator.material?.dispose?.();this.allyIndicator=null;}
    for(const mat of this.factionOwnedMaterials||[])mat?.dispose?.();this.factionOwnedMaterials=[];
  }

  stun(duration=2.5){
    if(this.dead||this.faction!==IRON_WASTES_FACTION.HOSTILE)return false;
    this.stunnedTimer=Math.max(this.stunnedTimer,Math.max(0,duration||0));this.hideCharge();this.attackCooldown=Math.max(this.attackCooldown,.35);return true;
  }

  applyDifficulty(config = {}) {
    this.difficultyConfig = {
      enemyHealthMultiplier: Number.isFinite(config.enemyHealthMultiplier) ? config.enemyHealthMultiplier : 1,
      enemyDamageMultiplier: Number.isFinite(config.enemyDamageMultiplier) ? config.enemyDamageMultiplier : 1,
      enemySpeedMultiplier: Number.isFinite(config.enemySpeedMultiplier) ? config.enemySpeedMultiplier : 1,
      sniperAimTimeMultiplier: Number.isFinite(config.sniperAimTimeMultiplier) ? config.sniperAimTimeMultiplier : 1,
      sniperReloadMultiplier: Number.isFinite(config.sniperReloadMultiplier) ? config.sniperReloadMultiplier : 1
    };
    const prevMax = this.maxHp || this.baseStats.maxHp || this.hp || 1;
    const healthRatio = THREE.MathUtils.clamp(this.hp / Math.max(.0001, prevMax), 0, 1);
    this.maxHp = Math.max(1, Math.round(this.baseStats.maxHp * this.difficultyConfig.enemyHealthMultiplier));
    this.hp = this.maxHp * healthRatio;
    this.speed = this.baseStats.speed * this.difficultyConfig.enemySpeedMultiplier;
    this.attackDamage = this.baseStats.attackDamage * this.difficultyConfig.enemyDamageMultiplier;
    this.rangedDamage = this.baseStats.rangedDamage * this.difficultyConfig.enemyDamageMultiplier;
    this.rangedDelay = this.baseStats.rangedDelay * this.difficultyConfig.sniperReloadMultiplier;
    this.sniperAimDuration = Math.max(.34, this.baseStats.sniperAimTime * this.difficultyConfig.sniperAimTimeMultiplier);
    if(this.sniperCharging)this.sniperCharge=Math.min(this.sniperCharge,this.sniperAimDuration);
    const ratio = Math.max(0, this.hp / this.maxHp);
    if (this.healthFill) {
      this.healthFill.scale.x = ratio;
      this.healthFill.position.x = -(1 - ratio) * .52;
    }
  }

  update(dt,player,camera,context={}){
    if(this.dead||this.allyStowed)return;
    this.attackCooldown=Math.max(0,this.attackCooldown-dt);
    this.healthVisibleTimer=Math.max(0,this.healthVisibleTimer-dt);
    this.stunnedTimer=Math.max(0,this.stunnedTimer-dt);
    this.updateHackPulse(dt);
    this.group.position.y=this.floorFor(this.group.position,this.group.position.y,false);
    if(this.stunnedTimer>0){this.hideCharge();if(this.healthGroup)this.healthGroup.visible=this.healthVisibleTimer>0;return;}

    const target=context.target||player;
    this.currentTarget=target||null;
    const tp=this.targetPosition(target);
    if(!tp){this.hideCharge();return;}
    const toTarget3D=this._tmpTarget3D.subVectors(tp,this.group.position);
    const verticalDistance=Math.abs(toTarget3D.y);
    const toTarget=this._tmpTargetFlat.set(toTarget3D.x,0,toTarget3D.z);
    const horizontalDistance=toTarget.length();
    const night=context.nightFactor||0;
    const targetIsPlayer=target===player;
    const flashlightBonus=targetIsPlayer&&player.flashlightOn?night*3.5:0;
    const detectionMul=targetIsPlayer?(context.playerDetectionMultiplier||1):1;
    const detection=(this.config.detect+night*4.5+flashlightBonus)*detectionMul;
    const canSee=this.awake&&horizontalDistance<detection&&verticalDistance<4&&this.hasLineOfSight(target);
    this.updateHealthBillboard(camera,player,canSee,horizontalDistance);
    if(!this.awake){this.hideCharge();return;}

    if(this.type==='brute'&&canSee){
      this.effectTimer-=dt;
      if(this.effectTimer<=0&&this.train?.emitSteam&&this.steamPoint){
        const p=this.steamPoint.getWorldPosition(this._tmpSteamPos);
        this.train.emitSteam(p,this._tmpSteamVel.set((Math.random()-.5)*.28,.45+Math.random()*.25,(Math.random()-.5)*.28),.42);
        this.effectTimer=1.8+Math.random()*1.8;
      }
    }

    if(this.config.ranged){
      if(this.sniperCharging){this.faceTarget(target);this.updateSniperCharge(dt,target);return;}
      if(canSee){
        if(!this.stationary&&horizontalDistance>this.config.rangedMax*.92){toTarget.normalize();const moved=this.tryMove(toTarget,this.speed*(1+night*.04)*dt);this.stuckTimer=moved?0:this.stuckTimer+dt;this.animateWalk(dt);}
        else if(!this.stationary&&horizontalDistance<this.config.rangedMin){toTarget.normalize().multiplyScalar(-1);this.tryMove(toTarget,this.speed*.68*dt);this.animateWalk(dt);}
        this.faceTarget(target);
        if(horizontalDistance>=this.config.rangedMin&&horizontalDistance<=this.config.rangedMax&&verticalDistance<2.8&&this.attackCooldown<=0&&this.hasLineOfSight(target))this.startSniperCharge();
      }
      return;
    }

    if(canSee&&horizontalDistance>this.config.meleeRange*.84){
      toTarget.normalize();
      const moved=this.tryMove(toTarget,this.speed*(1+night*.06)*dt);
      this.stuckTimer=moved?0:this.stuckTimer+dt;if(this.stuckTimer>.7){this.sidestepSign*=-1;this.stuckTimer=0;}
      this.faceTarget(target);this.animateWalk(dt);
    }
    const meleeVisible=horizontalDistance<this.config.meleeRange&&verticalDistance<=this.config.verticalAttack&&this.hasLineOfSight(target);
    if(meleeVisible&&this.attackCooldown<=0){this.attackCooldown=Math.max(.72,this.config.attackDelay-night*.16);if(target?.receiveAttack)target.receiveAttack(this.attackDamage,this.group.position,this.faction===IRON_WASTES_FACTION.ALLY?'allyRobot':this.type);else target?.damage?.(this.attackDamage,this.faction===IRON_WASTES_FACTION.ALLY?'allyRobot':this.type);}
  }

  receiveAttack(amount,sourcePosition=null,sourceType='body'){
    let zone='body';
    if(this.type==='brute'&&sourcePosition){
      const forward=this._tmpForward.set(0,0,1).applyQuaternion(this.group.quaternion).normalize();
      const incoming=this._tmpIncoming.subVectors(sourcePosition,this.group.position);incoming.y=0;if(incoming.lengthSq()>0)incoming.normalize();
      if(forward.dot(incoming)>.20)zone='shield';
    }
    return this.damage(amount,zone,null);
  }

  damageMultiplier(hitZone='body'){
    if(this.type!=='brute')return 1;
    if(hitZone==='shield')return .15;
    if(hitZone==='core')return 1.9;
    return 1;
  }

  damage(amount, hitZone='body', hitPoint=null){
    if(this.dead||!Number.isFinite(amount)||amount<=0)return 0;
    const multiplier=this.damageMultiplier(hitZone);
    const raw=amount*multiplier;
    const applied=Math.min(this.hp,raw);
    this.awake=true;this.healthVisibleTimer=5;this.hp=Math.max(0,this.hp-raw);
    const ratio=Math.max(0,this.hp/this.maxHp);this.healthFill.scale.x=ratio;this.healthFill.position.x=-(1-ratio)*.52;
    if(hitZone==='core'&&this.train?.emitSteam){
      const p=hitPoint?this._tmpHitSteam.copy(hitPoint):this.parts.core?.getWorldPosition?.(this._tmpHitSteam);
      if(p)this.train.emitSteam(p,this._tmpSteamVel.set((Math.random()-.5)*.25,.55,(Math.random()-.5)*.25),.26);
    }
    if(this.hp<=0)this.die();
    return applied;
  }

  die(){
    if(this.dead)return;this.dead=true;const deathPos=this.group.position.clone();
    if(this.chargeBeam){this.scene.remove(this.chargeBeam);this.chargeBeam.geometry.dispose();this.chargeBeam.material.dispose();this.chargeBeam=null;}
    if(this.chargeOpticMat)this.chargeOpticMat.dispose();
    if(this.chargeCoilMat)this.chargeCoilMat.dispose();
    this.disposeOwnedVisuals();
    this.scene.remove(this.group);this.onDeath?.(this,deathPos);
  }
}

function ironOr(A,index){ return index===1 ? A.darkIronMat : A.ironMat; }

class EnemySystem {
  constructor(scene,itemSystem,collisionWorld=null,train=null,visuals=null){
    this.scene=scene;this.itemSystem=itemSystem;this.collisionWorld=collisionWorld;this.train=train;this.visuals=visuals;
    this.enemies=[];this.stationEnemiesAwakened=false;this.spawnTimer=8+Math.random()*5;this.assets=this.createAssets();this.safeZones=[];this.environmentSpawns=[];
    this.difficulty = { enemyHealthMultiplier:1, enemyDamageMultiplier:1, enemySpeedMultiplier:1, nightSpawnIntervalMultiplier:1, maxTotalOffset:0, maxDynamicOffset:0, sniperAimTimeMultiplier:1, sniperReloadMultiplier:1, lootMultiplier:1 };
    this.classConfig = { enemyLootMultiplier:1, detectionMultiplier:1 };
    this.tracers=[];this.buildTracerPool();
    this._sysCamDir=new THREE.Vector3();this._sysDelta=new THREE.Vector3();this._sysCamPos=new THREE.Vector3();this._sysViewDir=new THREE.Vector3();this._escortLocal=new THREE.Vector3();this._escortPos=new THREE.Vector3();this._escortDelta=new THREE.Vector3();
  }

  createAssets(){
    const V=this.visuals?.materials||{};
    const iron=V.darkIron||new THREE.MeshStandardMaterial({color:0x42494a,roughness:.74,metalness:.82});
    const darkIron=V.soot||new THREE.MeshStandardMaterial({color:0x252a2b,roughness:.82,metalness:.74});
    const brass=V.brass||new THREE.MeshStandardMaterial({color:0x98703b,roughness:.5,metalness:.88});
    const darkBrass=new THREE.MeshStandardMaterial({color:0x604b2d,roughness:.66,metalness:.82});
    const copper=V.copper||new THREE.MeshStandardMaterial({color:0x7d4934,roughness:.62,metalness:.78});
    const rust=V.rust||new THREE.MeshStandardMaterial({color:0x5e4735,roughness:.82,metalness:.66});
    const soot=V.soot||darkIron,patina=V.patina||rust;
    const eye=new THREE.MeshStandardMaterial({color:0xff8a3c,emissive:0xff4b14,emissiveIntensity:4.4,roughness:.25,metalness:.25});
    const redEye=new THREE.MeshStandardMaterial({color:0x8f1911,emissive:0xff2e19,emissiveIntensity:5.0,roughness:.22,metalness:.18});
    const core=new THREE.MeshStandardMaterial({color:0xff7b22,emissive:0xff4a12,emissiveIntensity:4.2,roughness:.28,metalness:.18});
    const sniperOptic=new THREE.MeshStandardMaterial({color:0x8c6232,emissive:0x6a2416,emissiveIntensity:1.8,roughness:.34,metalness:.72});
    const sniperCoil=new THREE.MeshStandardMaterial({color:0x6b4427,emissive:0x5d1912,emissiveIntensity:.55,roughness:.4,metalness:.8});
    return {
      ironMat:iron,darkIronMat:darkIron,brassMat:brass,darkBrassMat:darkBrass,copperMat:copper,rustMat:rust,patinaMat:patina,sootMat:soot,eyeMat:eye,redEyeMat:redEye,coreMat:core,sniperOpticMat:sniperOptic,sniperCoilMat:sniperCoil,
      workerTorsoGeo:new THREE.CylinderGeometry(.54,.63,1.05,10),workerBoilerGeo:new THREE.CylinderGeometry(.39,.43,.66,10),bandGeo:new THREE.TorusGeometry(.42,.045,7,14),gearGeo:new THREE.TorusGeometry(.18,.055,7,12),chimneyGeo:new THREE.CylinderGeometry(.10,.15,.55,8),chimneyCapGeo:new THREE.CylinderGeometry(.17,.12,.10,8),
      workerUpperLegGeo:new THREE.CylinderGeometry(.12,.15,.55,7),workerLowerLegGeo:new THREE.CylinderGeometry(.11,.14,.48,7),workerFootGeo:new THREE.BoxGeometry(.34,.18,.48),pistonGeo:new THREE.CylinderGeometry(.035,.045,.48,6),jointGeo:new THREE.SphereGeometry(.13,8,6),shoulderGeo:new THREE.CylinderGeometry(.18,.18,.22,8),armRodGeo:new THREE.CylinderGeometry(.09,.11,.62,7),clawBaseGeo:new THREE.BoxGeometry(.26,.22,.28),clawFingerGeo:new THREE.BoxGeometry(.10,.12,.32),sideTankGeo:new THREE.CylinderGeometry(.16,.18,.62,8),valveGeo:new THREE.CylinderGeometry(.08,.11,.28,8),pipeGeo:new THREE.CylinderGeometry(.045,.045,.8,7),eyeGeo:new THREE.SphereGeometry(.115,10,8),eyeRingGeo:new THREE.TorusGeometry(.16,.045,8,14),
      spiderBodyGeo:new THREE.SphereGeometry(.63,12,8),spiderBoilerGeo:new THREE.CylinderGeometry(.28,.34,.72,10),spiderBackPlateGeo:new THREE.BoxGeometry(.70,.12,.58),spiderVentGeo:new THREE.CylinderGeometry(.055,.09,.32,7),spiderLegGeo:new THREE.CylinderGeometry(.055,.075,.72,6),spiderKneeGeo:new THREE.SphereGeometry(.095,7,5),spiderFootGeo:new THREE.ConeGeometry(.09,.30,5),spiderEyeGeo:new THREE.SphereGeometry(.075,8,6),mandibleGeo:new THREE.BoxGeometry(.10,.10,.42),
      shielderBodyGeo:new THREE.BoxGeometry(1.55,1.25,.95),shielderBoilerGeo:new THREE.CylinderGeometry(.48,.55,1.18,10),shielderBandGeo:new THREE.TorusGeometry(.53,.055,7,14),shielderLegGeo:new THREE.CylinderGeometry(.17,.22,.55,8),shielderJointGeo:new THREE.SphereGeometry(.18,8,6),shielderFootGeo:new THREE.BoxGeometry(.43,.20,.52),shieldGeo:new THREE.BoxGeometry(1.95,1.92,.18),shieldRibGeo:new THREE.BoxGeometry(.11,1.72,.12),rivetGeo:new THREE.SphereGeometry(.055,6,4),visionSlitGeo:new THREE.BoxGeometry(.52,.10,.035),coreGeo:new THREE.CylinderGeometry(.28,.33,.42,10),coreRingGeo:new THREE.TorusGeometry(.34,.055,7,14),exhaustGeo:new THREE.CylinderGeometry(.08,.12,.62,8),
      sniperUpperLegGeo:new THREE.CylinderGeometry(.07,.10,.84,7),sniperLowerLegGeo:new THREE.CylinderGeometry(.065,.09,.70,7),sniperKneeGeo:new THREE.SphereGeometry(.10,7,5),sniperFootGeo:new THREE.BoxGeometry(.25,.14,.42),sniperTorsoGeo:new THREE.BoxGeometry(.52,.82,.42),sniperChestGeo:new THREE.BoxGeometry(.40,.28,.10),sniperBackTankGeo:new THREE.CylinderGeometry(.13,.16,.72,8),sniperHeadGeo:new THREE.SphereGeometry(.20,9,7),sniperOpticGeo:new THREE.CylinderGeometry(.10,.13,.42,9),sniperLensGeo:new THREE.CircleGeometry(.085,10),antennaGeo:new THREE.CylinderGeometry(.018,.024,.55,5),sniperChamberGeo:new THREE.CylinderGeometry(.13,.16,.52,9),sniperBarrelGeo:new THREE.CylinderGeometry(.045,.07,1.65,8),sniperCoilGeo:new THREE.TorusGeometry(.13,.035,7,12),sniperScopeGeo:new THREE.CylinderGeometry(.055,.07,.48,8),sniperBoltGeo:new THREE.BoxGeometry(.10,.08,.26),
      healthBackGeo:new THREE.PlaneGeometry(1.1,.12),healthFillGeo:new THREE.PlaneGeometry(1.04,.07),
      healthBackMat:new THREE.MeshBasicMaterial({color:0x1a1111,side:THREE.DoubleSide,depthTest:true,depthWrite:false,transparent:true,opacity:.86}),healthFillMat:new THREE.MeshBasicMaterial({color:0xb93229,side:THREE.DoubleSide,depthTest:true,depthWrite:false})
    };
  }

  buildTracerPool(){
    const mat=new THREE.LineBasicMaterial({color:0xff9d48,transparent:true,opacity:0,depthTest:true});
    for(let i=0;i<10;i++){
      const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
      const line=new THREE.Line(geo,mat.clone());line.visible=false;line.frustumCulled=false;line.userData.life=0;this.scene.add(line);this.tracers.push(line);
    }
  }

  emitTracer(from,to){
    const line=this.tracers.find(t=>!t.visible);if(!line)return;
    const pos=line.geometry.attributes.position;pos.setXYZ(0,from.x,from.y,from.z);pos.setXYZ(1,to.x,to.y,to.z);pos.needsUpdate=true;
    line.material.opacity=.85;line.userData.life=.11;line.visible=true;
  }

  updateTracers(dt){for(const t of this.tracers){if(!t.visible)continue;t.userData.life-=dt;t.material.opacity=Math.max(0,t.userData.life/.11);if(t.userData.life<=0)t.visible=false;}}
  setNavigation(collisionWorld,train){this.collisionWorld=collisionWorld;this.train=train;}
  setSafeZones(zones=[]){this.safeZones=zones;}
  setEnvironmentSpawns(points=[]){this.environmentSpawns=Array.isArray(points)?points:[];}
  inSafeZone(position){return this.safeZones.some(z=>Math.abs(position.z-z.z)<=z.halfZ&&Math.abs(position.x-(z.x||0))<=z.halfX);}

  pickType(distanceKm=0,nightFactor=0){
    const r=Math.random();
    if(distanceKm<8)return r<.78?'walker':'stalker';
    if(distanceKm<18)return r<.50?'walker':r<.78?'stalker':r<.92?'brute':'gunner';
    if(distanceKm<28)return r<.34?'walker':r<.60?'stalker':r<.82?'brute':'gunner';
    const n=nightFactor>.55;
    const w1=n?.18:.25,w2=n?.48:.50,w3=n?.72:.76;
    return r<w1?'walker':r<w2?'stalker':r<w3?'brute':'gunner';
  }

  spawn(position,options={}){
    const start=position.clone();if(this.collisionWorld)start.y=this.collisionWorld.floorHeightAt(start);
    const type=Automaton.normalizeType(options.type||this.pickType(options.distanceKm||Math.max(0,start.z/100),options.nightFactor||0));
    const enemy=new Automaton(this.scene,start,(e,deathPos)=>{
      if(e.faction===IRON_WASTES_FACTION.ALLY){this.enemies=this.enemies.filter(x=>x!==e);return;}
      const difficultyLoot=this.difficulty.lootMultiplier||1;
      const classLoot=this.classConfig?.enemyLootMultiplier||1;
      if(Math.random()<Math.min(.98,.90*difficultyLoot*classLoot))this.itemSystem.spawn('Scrap Metal',deathPos.clone());
      if(Math.random()<Math.min(.42,.19*difficultyLoot))this.itemSystem.spawn('Medkit',deathPos.clone().add(new THREE.Vector3(.5,0,.25)));
      if(Math.random()<Math.min(.72,.42*difficultyLoot*classLoot)){
        const ammoMul=THREE.MathUtils.clamp(difficultyLoot*Math.sqrt(classLoot),.80,1.32);
        const ammo=Math.max(6,Math.round((8+Math.floor(Math.random()*7))*ammoMul));
        this.itemSystem.spawn('Ammo',deathPos.clone().add(new THREE.Vector3(-.45,0,.2)),{weaponType:'auto',ammoAmount:ammo});
      }
      this.enemies=this.enemies.filter(x=>x!==e);
    },this.collisionWorld,this.train,this.assets,{awake:options.awake??(options.dynamic?true:this.stationEnemiesAwakened),dynamic:Boolean(options.dynamic),station:Boolean(options.station),stationary:Boolean(options.stationary),faction:options.faction||IRON_WASTES_FACTION.HOSTILE,type,onRangedAttack:(from,to)=>this.emitTracer(from,to)});
    enemy.applyDifficulty?.(this.difficulty);
    this.enemies.push(enemy);return enemy;
  }

  removeEnemy(enemy){if(!enemy||enemy.dead)return;enemy.dead=true;if(enemy.chargeBeam){this.scene.remove(enemy.chargeBeam);enemy.chargeBeam.geometry.dispose();enemy.chargeBeam.material.dispose();}enemy.chargeOpticMat?.dispose?.();enemy.chargeCoilMat?.dispose?.();enemy.disposeOwnedVisuals?.();this.scene.remove(enemy.group);this.enemies=this.enemies.filter(e=>e!==enemy);}
  awakenStationEnemies(){if(this.stationEnemiesAwakened)return;this.stationEnemiesAwakened=true;for(const enemy of this.enemies)if(enemy.stationEnemy)enemy.setAwake(true);}
  applyDifficulty(config={}){
    this.difficulty = {
      enemyHealthMultiplier: Number.isFinite(config.enemyHealthMultiplier) ? config.enemyHealthMultiplier : 1,
      enemyDamageMultiplier: Number.isFinite(config.enemyDamageMultiplier) ? config.enemyDamageMultiplier : 1,
      enemySpeedMultiplier: Number.isFinite(config.enemySpeedMultiplier) ? config.enemySpeedMultiplier : 1,
      nightSpawnIntervalMultiplier: Number.isFinite(config.nightSpawnIntervalMultiplier) ? config.nightSpawnIntervalMultiplier : 1,
      maxTotalOffset: Number.isFinite(config.enemyLocalMaxOffset) ? config.enemyLocalMaxOffset : 0,
      maxDynamicOffset: Number.isFinite(config.enemyDynamicMaxOffset) ? config.enemyDynamicMaxOffset : 0,
      sniperAimTimeMultiplier: Number.isFinite(config.sniperAimTimeMultiplier) ? config.sniperAimTimeMultiplier : 1,
      sniperReloadMultiplier: Number.isFinite(config.sniperReloadMultiplier) ? config.sniperReloadMultiplier : 1,
      lootMultiplier: Number.isFinite(config.lootMultiplier) ? config.lootMultiplier : 1
    };
    for(const enemy of this.enemies)enemy.applyDifficulty?.(this.difficulty);
  }
  applyClass(config={}){this.classConfig={enemyLootMultiplier:Number.isFinite(config.enemyLootMultiplier)?config.enemyLootMultiplier:1,detectionMultiplier:Number.isFinite(config.detectionMultiplier)?config.detectionMultiplier:1,specialAbility:config.specialAbility||null};}
  dynamicCount(){return this.enemies.filter(e=>!e.dead&&e.dynamic).length;}
  activeCount(){return this.enemies.filter(e=>!e.dead&&e.awake).length;}

  nearbyActiveCount(position,radius=80){
    const r2=radius*radius;let count=0;
    for(const e of this.enemies){if(e.dead||!e.awake||e.faction!==IRON_WASTES_FACTION.HOSTILE)continue;if(e.group.position.distanceToSquared(position)<=r2)count++;}
    return count;
  }
  nearbyDynamicCount(position,radius=80){
    const r2=radius*radius;let count=0;
    for(const e of this.enemies){if(e.dead||!e.awake||!e.dynamic||e.faction!==IRON_WASTES_FACTION.HOSTILE)continue;if(e.group.position.distanceToSquared(position)<=r2)count++;}
    return count;
  }
  nearbyTypeCount(position,type,radius=80){
    const normalized=Automaton.normalizeType(type),r2=radius*radius;let count=0;
    for(const e of this.enemies){if(e.dead||!e.awake||e.type!==normalized||e.faction!==IRON_WASTES_FACTION.HOSTILE)continue;if(e.group.position.distanceToSquared(position)<=r2)count++;}
    return count;
  }
  canSpawnTypeNearby(type,position,radius=80){
    const normalized=Automaton.normalizeType(type);
    if(normalized==='gunner'&&this.nearbyTypeCount(position,'gunner',radius)>=2)return false;
    if(normalized==='brute'&&this.nearbyTypeCount(position,'brute',radius)>=2)return false;
    return true;
  }

  isSpawnPointSafe(candidate,player,camera,minDistance=18){
    const dist=candidate.distanceTo(player.position);if(dist<minDistance||this.inSafeZone(candidate))return false;
    const floor=this.collisionWorld?.floorHeightAt(candidate)??.12;const probe=candidate.clone();probe.y=floor+.02;
    if(this.train?.deckRegion?.(probe))return false;
    if(this.collisionWorld&&!this.collisionWorld.isPositionClear(probe,1.08,3.0))return false;
    if(this.train?.isPlacementClear&&!this.train.isPlacementClear(probe,1.08,3.0,false))return false;
    for(const enemy of this.enemies){if(enemy.dead)continue;const dx=enemy.group.position.x-probe.x,dz=enemy.group.position.z-probe.z;if(dx*dx+dz*dz<5.3)return false;}
    const camPos=camera.getWorldPosition(new THREE.Vector3());const camDir=new THREE.Vector3();camera.getWorldDirection(camDir);camDir.y=0;if(camDir.lengthSq()>0)camDir.normalize();
    const dir=probe.clone().sub(camPos);dir.y=0;const d=dir.length();if(d>0)dir.normalize();const central=camDir.dot(dir);
    const blocked=this.collisionWorld?.isLineBlocked(camPos,probe.clone().add(new THREE.Vector3(0,1.3,0)),this.train?.getRaycastMeshes?.()||[])??false;
    if(!blocked&&central>.67&&d<34)return false;candidate.y=floor;return true;
  }

  findEnvironmentSpawn(player,camera,highSpeed=false){
    if(!this.environmentSpawns.length)return null;
    const shuffled=this.environmentSpawns.map((p,i)=>({p,k:Math.random()+i*.00001})).sort((a,b)=>a.k-b.k);
    for(const entry of shuffled){
      const anchor=entry.p;const pos=anchor.position?.clone?.()||new THREE.Vector3(anchor.x||0,anchor.y||0,anchor.z||0);
      const dz=pos.z-player.position.z;const dist=pos.distanceTo(player.position);
      if(dist<18||dist>46)continue;
      if(highSpeed&&dz<12)continue;
      if(this.isSpawnPointSafe(pos,player,camera,18))return {position:pos,preferredTypes:anchor.preferredTypes||null,tag:anchor.tag||'poi'};
    }
    return null;
  }

  findDynamicSpawn(player,camera,context={}){
    const highSpeed=(this.train?.speed||0)>6;const atStation=this.stationEnemiesAwakened&&Math.abs(player.position.z-(this.train?.stationZ||430))<65;
    if(!atStation&&Math.random()<.78){const env=this.findEnvironmentSpawn(player,camera,highSpeed);if(env)return env;}
    for(let attempt=0;attempt<24;attempt++){
      let candidate;
      if(atStation&&context.phase==='NIGHT'){
        const points=[[-12,407],[23,410],[28,432],[-15,455],[27,458],[-20,420],[18,462]];const p=points[Math.floor(Math.random()*points.length)];candidate=new THREE.Vector3(p[0]+(Math.random()-.5)*5,0,p[1]+(Math.random()-.5)*5);
      }else if(highSpeed&&this.train?.playerOnTrain?.(player.position)){
        const side=Math.random()>.5?1:-1;candidate=new THREE.Vector3(side*(7+Math.random()*10),0,player.position.z+22+Math.random()*24);
      }else{
        const angle=Math.random()*Math.PI*2,dist=20+Math.random()*16;candidate=player.position.clone().add(new THREE.Vector3(Math.cos(angle)*dist,0,Math.sin(angle)*dist));
      }
      if(this.isSpawnPointSafe(candidate,player,camera,18))return {position:candidate,preferredTypes:null,tag:'fallback'};
    }return null;
  }

  updateDynamic(dt,player,camera,context={}){
    const phase=context.phase||'DAY',night=phase==='NIGHT',distanceKm=context.distanceKm||0;
    if(context.safeZone||this.inSafeZone(player.position)){this.spawnTimer=Math.max(this.spawnTimer,3);return;}
    const stationZone=this.stationEnemiesAwakened&&Math.abs(player.position.z-(this.train?.stationZ||430))<65;
    const tier=Math.min(3,Math.floor(distanceKm/10));
    const maxTotal=Math.max(2,(night?(stationZone?7:7+tier):3+Math.min(2,tier)) + (this.difficulty.maxTotalOffset||0));
    const maxDynamic=Math.max(1,(night?(stationZone?4:4+tier):1+Math.floor(tier/2)) + (this.difficulty.maxDynamicOffset||0));
    const localRadius=80;

    const camDir=this._sysCamDir;camera.getWorldDirection(camDir);camDir.y=0;if(camDir.lengthSq()>0)camDir.normalize();
    for(const enemy of [...this.enemies]){
      if(!enemy.dynamic||enemy.dead||enemy.faction!==IRON_WASTES_FACTION.HOSTILE)continue;const delta=this._sysDelta.subVectors(enemy.group.position,player.position),dist=delta.length();delta.y=0;const facing=delta.lengthSq()>0?camDir.dot(delta.normalize()):1;
      if((dist>145||(dist>112&&enemy.group.position.z<player.position.z-35))&&facing<.5)this.removeEnemy(enemy);
    }
    // Absolute safety cap only prevents pathological accumulation while local limits drive gameplay.
    const dynamicAlive=this.enemies.filter(e=>!e.dead&&e.dynamic&&e.faction===IRON_WASTES_FACTION.HOSTILE).sort((a,b)=>b.group.position.distanceToSquared(player.position)-a.group.position.distanceToSquared(player.position));
    while(dynamicAlive.length>18){const far=dynamicAlive.shift();if(far)this.removeEnemy(far);}

    this.spawnTimer-=dt;if(this.spawnTimer>0)return;
    const speed=this.train?.speed||0;const vulnerable=speed<3.2||!this.train?.playerOnTrain?.(player.position)||this.train?.leakActive||this.train?.jammedActive||this.train?.atStation;
    let shouldTry=night;if(!night)shouldTry=distanceKm>8&&vulnerable&&Math.random()<(.22+tier*.08);
    const nearbyActive=this.nearbyActiveCount(player.position,localRadius);
    const nearbyDynamic=this.nearbyDynamicCount(player.position,localRadius);
    if(shouldTry&&nearbyActive<maxTotal&&nearbyDynamic<maxDynamic){
      const info=this.findDynamicSpawn(player,camera,context);
      if(info){
        let type=this.pickType(distanceKm,context.nightFactor||0);
        if(info.tag==='sniper-perch')type='gunner';
        else if(info.preferredTypes?.length&&Math.random()<.78)type=info.preferredTypes[Math.floor(Math.random()*info.preferredTypes.length)];
        type=Automaton.normalizeType(type);
        if(!this.canSpawnTypeNearby(type,player.position,localRadius)){
          if(info.tag!=='sniper-perch')type=Math.random()<.52?'walker':'stalker';
          else type=null;
        }
        if(type)this.spawn(info.position,{awake:true,dynamic:true,distanceKm,nightFactor:context.nightFactor||0,type,stationary:info.tag==='sniper-perch'&&type==='gunner'});
      }
    }
    let next=night?(7+Math.random()*6):(34+Math.random()*22);if(night&&vulnerable)next*=.72;if(night&&speed>7)next*=1.55;next*=Math.max(.72,1-tier*.07);next*=Math.max(.55,this.difficulty.nightSpawnIntervalMultiplier||1);this.spawnTimer=next;
  }

  allyCount(){return this.enemies.filter(e=>!e.dead&&e.faction===IRON_WASTES_FACTION.ALLY).length;}
  hostileEnemies(){return this.enemies.filter(e=>!e.dead&&e.faction===IRON_WASTES_FACTION.HOSTILE);}
  allyEnemies(){return this.enemies.filter(e=>!e.dead&&e.faction===IRON_WASTES_FACTION.ALLY);}

  convertToAlly(enemy){
    if(!enemy||enemy.dead||enemy.faction!==IRON_WASTES_FACTION.HOSTILE||this.allyCount()>=2)return false;
    enemy.setFaction(IRON_WASTES_FACTION.ALLY);enemy.awake=true;enemy.stationary=false;enemy.dynamic=false;enemy.attackCooldown=.8;return true;
  }

  stunHostiles(center,radius=8,duration=2.5){
    const r2=radius*radius;let count=0;
    for(const e of this.enemies){if(e.dead||e.faction!==IRON_WASTES_FACTION.HOSTILE)continue;if(e.group.position.distanceToSquared(center)<=r2&&e.stun(duration))count++;}
    return count;
  }

  nearestHostile(position,radius=30){
    const r2=radius*radius;let best=null,bestD=r2;
    for(const e of this.enemies){if(e.dead||!e.awake||e.faction!==IRON_WASTES_FACTION.HOSTILE||e.allyStowed)continue;const d=e.group.position.distanceToSquared(position);if(d<bestD){best=e;bestD=d;}}
    return best;
  }

  chooseHostileTarget(enemy,player,allies=null){
    let target=player,best=enemy.group.position.distanceToSquared(player.position);
    const list=allies||this.enemies;
    for(const ally of list){if(ally.dead||ally.allyStowed||ally.faction!==IRON_WASTES_FACTION.ALLY)continue;const d=enemy.group.position.distanceToSquared(ally.group.position);if(d<best*.88&&d<32*32){target=ally;best=d;}}
    return target;
  }

  updateAllyEscort(enemy,dt,player,camera,context){
    if(enemy.dead)return;
    const safe=Boolean(context.safeZone||this.inSafeZone(player.position));
    const onTrain=this.train?.playerOnTrain?.(player.position);const speed=this.train?.speed||0;
    if(enemy.allyStowed){
      enemy.group.visible=false;enemy.hideCharge?.();
      if(speed<.55&&!onTrain){
        const local=this._escortLocal.set((this.allyEnemies().indexOf(enemy)%2?4.8:-4.8),0,-12.5);let pos;if(this.train?.group?.localToWorld){pos=this.train.group.localToWorld(local);}else{pos=this._escortPos.copy(player.position);pos.x+=4;pos.z-=4;}
        pos.y=this.collisionWorld?.floorHeightAt(pos)??.12;
        if(!this.collisionWorld||this.collisionWorld.isPositionClear(pos,enemy.radius,enemy.config.height)){enemy.group.position.copy(pos);enemy.allyStowed=false;enemy.group.visible=true;}
      }
      return true;
    }
    if(onTrain&&speed>3&&enemy.group.position.distanceToSquared(player.position)>28*28){
      const camPos=camera.getWorldPosition(this._sysCamPos),camDir=this._sysCamDir;camera.getWorldDirection(camDir);const dir=this._sysViewDir.subVectors(enemy.group.position,camPos);const inView=dir.lengthSq()>0&&camDir.dot(dir.normalize())>.45;
      if(!inView){enemy.allyStowed=true;enemy.group.visible=false;enemy.hideCharge?.();return true;}
    }
    if(safe){
      enemy.hideCharge?.();enemy.attackCooldown=Math.max(enemy.attackCooldown,.6);
      const wait=this.train?.group?.localToWorld?.(this._escortLocal.set((this.allyEnemies().indexOf(enemy)%2?4.5:-4.5),0,-11.5));
      if(wait){wait.y=this.collisionWorld?.floorHeightAt(wait)??.12;const d=this._escortDelta.subVectors(wait,enemy.group.position);d.y=0;if(d.length()>6){d.normalize();enemy.tryMove(d,enemy.speed*.45*dt);enemy.animateWalk(dt);}}
      return true;
    }
    return false;
  }

  update(dt,player,camera,context={}){
    this.updateTracers(dt);
    if(context.safeZone){
      for(const enemy of [...this.enemies])if(enemy.dynamic&&enemy.faction===IRON_WASTES_FACTION.HOSTILE)this.removeEnemy(enemy);
      for(const enemy of this.enemies){
        if(enemy.dead)continue;
        if(enemy.faction===IRON_WASTES_FACTION.ALLY)this.updateAllyEscort(enemy,dt,player,camera,context);
        else {enemy.hideCharge?.();if(enemy.healthGroup)enemy.healthGroup.visible=false;}
      }
      return;
    }
    this.updateDynamic(dt,player,camera,context);
    const farStaticSq=150*150;
    const allies=this.allyEnemies();
    for(const enemy of [...this.enemies]){
      if(enemy.dead)continue;
      if(enemy.faction===IRON_WASTES_FACTION.ALLY){
        if(this.updateAllyEscort(enemy,dt,player,camera,context))continue;
        const target=this.nearestHostile(enemy.group.position,30);
        if(target)enemy.update(dt,player,camera,{nightFactor:context.nightFactor||0,target,playerDetectionMultiplier:1});
        else{
          const delta=this._tmpAllyDelta||(this._tmpAllyDelta=new THREE.Vector3());delta.subVectors(player.position,enemy.group.position);delta.y=0;const dist=delta.length();
          if(dist>5.2){delta.normalize();enemy.tryMove(delta,enemy.speed*.72*dt);enemy.faceTarget(player);enemy.animateWalk(dt);}
          enemy.updateHealthBillboard(camera,player,false,dist);
        }
        continue;
      }
      const d2=enemy.group.position.distanceToSquared(player.position);
      const visualRangeSq=165*165;
      enemy.group.visible=d2<=visualRangeSq;
      if(!enemy.dynamic&&d2>farStaticSq){enemy.hideCharge?.();if(enemy.healthGroup)enemy.healthGroup.visible=false;continue;}

      // AI LOD: detection ranges top out near 30 m, so distant robots do not need 60 full
      // navigation/LOS updates per second. Accumulated dt keeps movement speed correct.
      const dist=Math.sqrt(d2);
      let interval=0;
      if(dist>78)interval=.18;
      else if(dist>48)interval=.09;
      else if(dist>30)interval=.045;
      enemy._perfAccum=(enemy._perfAccum||0)+dt;
      if(interval>0&&enemy._perfAccum<interval){
        if(enemy.healthGroup)enemy.healthGroup.visible=false;
        continue;
      }
      const stepDt=Math.min(.20,enemy._perfAccum||dt);enemy._perfAccum=0;
      const target=this.chooseHostileTarget(enemy,player,allies);
      enemy.update(stepDt,player,camera,{nightFactor:context.nightFactor||0,target,playerDetectionMultiplier:this.classConfig?.detectionMultiplier||1});
    }
  }

  hostileHittableMeshes(){const arr=[];for(const e of this.enemies){if(e.dead||e.faction!==IRON_WASTES_FACTION.HOSTILE||e.allyStowed||!e.group.visible)continue;arr.push(...(e.hittableParts||[]));}return arr;}
  allyMeshes(){const arr=[];for(const e of this.enemies){if(e.dead||e.faction!==IRON_WASTES_FACTION.ALLY||e.allyStowed||!e.group.visible)continue;arr.push(...(e.hittableParts||[]));}return arr;}
  hittableMeshes(){return this.hostileHittableMeshes();}
}

window.IronWastesFaction=IRON_WASTES_FACTION;
window.Automaton=Automaton;
window.EnemySystem=EnemySystem;
