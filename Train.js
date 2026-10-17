class Train {
  constructor(scene, visuals = null) {
    this.scene = scene;
    this.visuals = visuals;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.speed = 0;
    this.targetSpeed = 0;
    this.maxSpeed = 10;
    this.coalFuel = 7;
    this.pressure = 58;
    this.integrity = 100;
    this.throttle = 0;
    this.brake = 1;

    this.stationZ = 430;
    this.finishZ = 4000;
    this.routeStops = [
      { id:'abandoned', name:'ЗАБРОШЕННАЯ СТАНЦИЯ', z:430, minStop:6, kind:'station' },
      { id:'weapon', name:'ОРУЖЕЙНЫЙ ПОРТ', z:1000, minStop:3, kind:'port' },
      { id:'trade', name:'ТОРГОВЫЙ ПОРТ', z:2000, minStop:3, kind:'port' },
      { id:'settlement', name:'ПОРТ-ПОСЕЛЕНИЕ', z:3000, minStop:3, kind:'port' },
      // Финальный промышленный порт использует ту же плавную схему подхода,
      // после остановки на 40 км сразу срабатывает завершение текущей версии.
      { id:'industrial', name:'ПРОМЫШЛЕННЫЙ ПОРТ', z:4000, minStop:0, kind:'final' }
    ];
    this.stopIndex = 0;
    this.currentStop = null;
    this.approachStop = null;
    this.stationApproach = false;
    this.atStation = false;
    this.stationStopTime = 0;
    this.departedStation = false;
    this.departureUnlocked = false;

    this.fireboxOpen = false;
    this.leakActive = false;
    this.leakProgress = 0;
    this.jammedActive = false;
    this.jamProgress = 0;
    this.overheatActive = false;
    this.faultTimer = 38 + Math.random() * 22;

    this.offTrainTimer = 0;
    this.safetyStopped = false;
    this.lastDeltaZ = 0;
    this.finished = false;
    this.destroyed = false;
    this.difficulty = { trainDamageMultiplier:1, faultRateMultiplier:1 };
    this.classConfig = { fuelBurnMultiplier:1, repairMultiplier:1 };

    this.effects = [];
    this.effectPool = [];
    this.sparkPool = [];
    this.nightFactor = 0;
    this.wheelPhase = 0;
    this.visualWind = new THREE.Vector2(.12,.02);
    this.visualWindSpeed = .3;
    this.visualAsh = .1;
    this.currentFogDensity = .0092;
    this.interactives = [];
    this.collisionMeshes = [];
    this.raycastMeshes = [];
    this.buildModel();
    this.updateControlsVisuals();
    this.initEffectPools();
  }

  buildModel() {
    const VM = this.visuals?.materials || {};
    const rust = VM.rust || new THREE.MeshStandardMaterial({ color: 0x4b3328, roughness: .8, metalness: .65 });
    const darkIron = VM.darkIron || new THREE.MeshStandardMaterial({ color: 0x202629, roughness: .72, metalness: .82 });
    const brass = VM.brass || new THREE.MeshStandardMaterial({ color: 0xa37633, roughness: .5, metalness: .9 });
    const copper = VM.copper || new THREE.MeshStandardMaterial({ color: 0x7a4c2d, roughness: .52, metalness: .82 });
    const wood = VM.wood || new THREE.MeshStandardMaterial({ color: 0x4f321f, roughness: .92, metalness: .05 });
    const hot = new THREE.MeshStandardMaterial({ color: 0x9d341b, emissive: 0xff5a20, emissiveIntensity: 2.5, roughness: .8, side: THREE.DoubleSide });

    const markSolid = mesh => { this.collisionMeshes.push(mesh); return mesh; };
    const markInteractive = (mesh, type) => {
      mesh.userData.interactive = type;
      mesh.userData.train = this;
      this.interactives.push(mesh);
      return mesh;
    };
    const visualOnly = mesh => {
      mesh.userData.ignoreRaycast = true;
      return mesh;
    };

    // Engine frame and deck.
    const chassis = markSolid(new THREE.Mesh(new THREE.BoxGeometry(4.2,.55,10), darkIron)); chassis.position.y = 1.05; chassis.userData.lowBody = true;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4,.28,10), wood); deck.position.y = 2.02;
    this.group.add(chassis, deck);

    // Continuous underframe: visually joins the wheel/chassis layer to the deck so the
    // locomotive reads as one machine instead of two disconnected horizontal halves.
    const frameBeamGeo = new THREE.BoxGeometry(.24,.54,9.55);
    for (const x of [-1.72,1.72]) {
      const beam = visualOnly(new THREE.Mesh(frameBeamGeo, darkIron));
      beam.position.set(x,1.60,.08); this.group.add(beam);
    }
    const crossGeo = new THREE.BoxGeometry(3.72,.36,.22);
    for (const z of [-4.30,-2.15,0,2.15,4.30]) {
      const cross = visualOnly(new THREE.Mesh(crossGeo, rust));
      cross.position.set(0,1.55,z); this.group.add(cross);
    }
    const skirtGeo = new THREE.BoxGeometry(.11,.38,8.85);
    for (const x of [-1.92,1.92]) {
      const skirt = visualOnly(new THREE.Mesh(skirtGeo, rust));
      skirt.position.set(x,1.73,.15); this.group.add(skirt);
    }

    // Boiler.
    const boiler = markSolid(new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.15,5.3,16), darkIron));
    boiler.rotation.x = Math.PI/2; boiler.position.set(0,3.25,1.3); this.group.add(boiler);
    for (let z=-.8; z<=3.4; z+=1.3) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.18,.07,8,20), brass);
      ring.rotation.x = Math.PI/2; ring.position.set(0,3.25,z); this.group.add(ring);
    }

    // Chimney and exhaust details.
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(.42,.58,2.1,10), darkIron);
    chimney.position.set(0,5.1,3.1); this.group.add(chimney); this.chimney = chimney;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.64,.44,.28,10), darkIron); cap.position.set(0,6.18,3.1); this.group.add(cap);

    // Cab shell with open rear doorway.
    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(4.4,.22,3.8), darkIron); cabRoof.position.set(0,5.25,-3);
    const cabLeft = markSolid(new THREE.Mesh(new THREE.BoxGeometry(.18,3,3.4), rust)); cabLeft.position.set(-1.92,3.55,-3);
    const cabRight = markSolid(cabLeft.clone()); cabRight.position.x = 1.92;
    const cabFront = markSolid(new THREE.Mesh(new THREE.BoxGeometry(4,3,.18), rust)); cabFront.position.set(0,3.55,-1.4);
    this.group.add(cabRoof,cabLeft,cabRight,cabFront);

    // Furnace body and physical door.
    const furnace = markSolid(new THREE.Mesh(new THREE.BoxGeometry(1.15,1.3,.8), rust));
    furnace.position.set(.75,2.8,-1.72); this.group.add(furnace);
    this.fire = new THREE.Mesh(new THREE.PlaneGeometry(.65,.58), hot); this.fire.position.set(.75,2.77,-2.132); this.group.add(this.fire);
    this.fireboxOpening = new THREE.Mesh(
      new THREE.PlaneGeometry(.74,.66),
      new THREE.MeshBasicMaterial({ transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false })
    );
    this.fireboxOpening.position.set(.75,2.77,-2.137);
    this.fireboxOpening.userData.noShadow=true;
    this.group.add(this.fireboxOpening);
    markInteractive(this.fireboxOpening, 'fireboxOpening');

    this.fireboxDoor = new THREE.Group();
    this.fireboxDoor.position.set(.37,2.77,-2.18);
    const doorMesh = markInteractive(new THREE.Mesh(new THREE.BoxGeometry(.72,.72,.10), darkIron), 'fireboxDoor');
    doorMesh.position.x = .36;
    const doorRing = new THREE.Mesh(new THREE.TorusGeometry(.19,.045,8,14), brass); doorRing.position.set(.36,0,-.075);
    const doorHandle = new THREE.Mesh(new THREE.BoxGeometry(.08,.34,.07), brass); doorHandle.position.set(.36,0,-.09);
    this.fireboxDoor.add(doorMesh,doorRing,doorHandle); this.group.add(this.fireboxDoor);
    this.fireboxDoor.traverse(o => { if (o.isMesh) markInteractive(o, 'fireboxDoor'); });

    // Pressure valve: fixed pipe/hub plus a separate spinning wheel assembly.
    this.valve = new THREE.Group(); this.valve.position.set(-1.02,3.17,-1.72);
    const valvePipe = new THREE.Mesh(new THREE.CylinderGeometry(.115,.135,.46,10), darkIron); valvePipe.rotation.x=Math.PI/2; valvePipe.position.z=.16;
    const valveHub = new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.20,12), brass); valveHub.rotation.x=Math.PI/2;
    this.valveWheelMount = new THREE.Group(); this.valveWheelMount.rotation.x=Math.PI/2;
    this.valveWheelPivot = new THREE.Group(); this.valveWheelMount.add(this.valveWheelPivot);
    this.valveWheel = new THREE.Mesh(new THREE.TorusGeometry(.39,.052,8,22), brass); this.valveWheelPivot.add(this.valveWheel);
    for (let i=0;i<6;i++) {
      const a=i/6*Math.PI*2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(.045,.58,.045), brass); spoke.rotation.z=a; this.valveWheelPivot.add(spoke);
      const bolt = new THREE.Mesh(new THREE.SphereGeometry(.035,7,5), copper); bolt.position.set(Math.cos(a)*.30,Math.sin(a)*.30,0); this.valveWheelPivot.add(bolt);
    }
    const valveCentre = new THREE.Mesh(new THREE.CylinderGeometry(.085,.085,.08,10), copper); valveCentre.rotation.x=Math.PI/2; this.valveWheelPivot.add(valveCentre);
    this.valve.add(valvePipe,valveHub,this.valveWheelMount); this.group.add(this.valve);
    this.valve.traverse(o => { if (o.isMesh) markInteractive(o, 'valve'); });

    // Dedicated pressure gauge next to the valve. The needle is updated from actual Steam Pressure.
    this.pressureGauge = new THREE.Group(); this.pressureGauge.position.set(-.43,3.93,-1.66);
    const gaugeBody = new THREE.Mesh(new THREE.CylinderGeometry(.30,.30,.105,18), darkIron); gaugeBody.rotation.x=Math.PI/2;
    const gaugeRing = new THREE.Mesh(new THREE.TorusGeometry(.255,.032,7,20), brass); gaugeRing.position.z=-.060;
    const gaugeFace = new THREE.Mesh(new THREE.CircleGeometry(.225,20), new THREE.MeshStandardMaterial({color:0xb9ac87,roughness:.84,metalness:.05})); gaugeFace.position.z=-.063; gaugeFace.rotation.y=Math.PI;
    this.pressureNeedlePivot = new THREE.Group(); this.pressureNeedlePivot.position.z=-.072;
    const pressureNeedle = new THREE.Mesh(new THREE.BoxGeometry(.020,.165,.018), new THREE.MeshBasicMaterial({color:0x5b1e13})); pressureNeedle.position.y=.075; this.pressureNeedlePivot.add(pressureNeedle);
    const needleHub = new THREE.Mesh(new THREE.SphereGeometry(.035,7,5), brass); needleHub.position.z=-.006; this.pressureNeedlePivot.add(needleHub);
    for(let i=0;i<7;i++){
      const a=-2.15+i*(4.30/6);
      const tick=new THREE.Mesh(new THREE.BoxGeometry(.015,.048,.012),i>=5?rust:darkIron);
      tick.position.set(Math.sin(a)*.18,Math.cos(a)*.18,-.071);tick.rotation.z=-a;this.pressureGauge.add(tick);
    }
    this.pressureGauge.add(gaugeBody,gaugeRing,gaugeFace,this.pressureNeedlePivot);this.group.add(this.pressureGauge);

    // THROTTLE: compact brass regulator with a proper quadrant, detents and one rigid pivot assembly.
    this.throttleLever = new THREE.Group(); this.throttleLever.position.set(1.20,2.54,-3.00);
    const throttlePlinth = new THREE.Mesh(new THREE.CylinderGeometry(.31,.36,.18,14), darkIron); throttlePlinth.position.y=.09;
    const throttleColumn = new THREE.Mesh(new THREE.CylinderGeometry(.12,.17,.48,12), darkIron); throttleColumn.position.y=.34;
    const throttleBoss = new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,.22,14), brass); throttleBoss.rotation.x=Math.PI/2; throttleBoss.position.set(0,.52,.02);
    const tqShape=new THREE.Shape(); tqShape.moveTo(-.47,0); tqShape.absarc(0,0,.47,Math.PI*.10,Math.PI*.90,false); tqShape.lineTo(0,.08); tqShape.closePath();
    const tqGeo=new THREE.ExtrudeGeometry(tqShape,{depth:.055,bevelEnabled:true,bevelSize:.012,bevelThickness:.010,bevelSegments:1});
    const throttleQuadrant=new THREE.Mesh(tqGeo,darkIron); throttleQuadrant.rotation.set(Math.PI/2,0,0); throttleQuadrant.position.set(0,.54,-.18);
    const throttleRim=new THREE.Mesh(new THREE.TorusGeometry(.46,.025,6,36,Math.PI*.80),brass); throttleRim.rotation.set(Math.PI/2,0,-Math.PI*.40); throttleRim.position.set(0,.55,-.205);
    this.throttleLever.add(throttlePlinth,throttleColumn,throttleBoss,throttleQuadrant,throttleRim);
    this.throttleDetents=[];
    for(let i=0;i<5;i++){
      const a=THREE.MathUtils.lerp(.78,-.31,i/4);
      const tooth=new THREE.Mesh(new THREE.BoxGeometry(.055,.13,.07),i===0?copper:brass);
      tooth.position.set(Math.sin(a)*.40,.54+Math.cos(a)*.40,-.245); tooth.rotation.z=-a; this.throttleLever.add(tooth); this.throttleDetents.push(tooth);
      const tick=new THREE.Mesh(new THREE.BoxGeometry(.018,.060,.020),brass); tick.position.set(Math.sin(a)*.33,.54+Math.cos(a)*.33,-.25); tick.rotation.z=-a; this.throttleLever.add(tick);
    }
    this.throttlePivot=new THREE.Group(); this.throttlePivot.position.set(0,.52,.02);
    const throttleRod=new THREE.Mesh(new THREE.CylinderGeometry(.043,.054,.91,10),brass); throttleRod.position.y=.455;
    const throttleCollar=new THREE.Mesh(new THREE.CylinderGeometry(.070,.080,.12,10),copper); throttleCollar.position.y=.88;
    const throttleGripRoot=new THREE.Group(); throttleGripRoot.position.set(0,.955,0);
    const throttleGrip=new THREE.Mesh(new THREE.CylinderGeometry(.047,.052,.40,12),wood); throttleGrip.rotation.z=Math.PI/2;
    const tgL=new THREE.Mesh(new THREE.CylinderGeometry(.057,.057,.040,10),brass); tgL.rotation.z=Math.PI/2; tgL.position.x=-.20;
    const tgR=tgL.clone(); tgR.position.x=.20; throttleGripRoot.add(throttleGrip,tgL,tgR);
    this.throttlePivot.add(throttleRod,throttleCollar,throttleGripRoot); this.throttleLever.add(this.throttlePivot); this.group.add(this.throttleLever);
    this.throttleRod=this.throttlePivot;
    this.throttleLever.traverse(o=>{if(o.isMesh)markInteractive(o,'throttle');});

    // BRAKE: larger cast-iron ratchet lever. It deliberately differs in mass, colour and silhouette.
    this.brakeLever=new THREE.Group(); this.brakeLever.position.set(-1.24,2.51,-3.01);
    const brakePlinth=new THREE.Mesh(new THREE.CylinderGeometry(.36,.42,.20,14),darkIron); brakePlinth.position.y=.10;
    const brakeColumn=new THREE.Mesh(new THREE.CylinderGeometry(.16,.21,.50,12),rust); brakeColumn.position.y=.35;
    const brakeBoss=new THREE.Mesh(new THREE.CylinderGeometry(.20,.20,.24,14),darkIron); brakeBoss.rotation.x=Math.PI/2;brakeBoss.position.set(0,.54,.02);
    const bqShape=new THREE.Shape();bqShape.moveTo(-.52,0);bqShape.absarc(0,0,.52,Math.PI*.08,Math.PI*.92,false);bqShape.lineTo(0,.09);bqShape.closePath();
    const bqGeo=new THREE.ExtrudeGeometry(bqShape,{depth:.070,bevelEnabled:true,bevelSize:.014,bevelThickness:.012,bevelSegments:1});
    const brakeQuadrant=new THREE.Mesh(bqGeo,darkIron);brakeQuadrant.rotation.set(Math.PI/2,0,0);brakeQuadrant.position.set(0,.57,-.20);
    const brakeRim=new THREE.Mesh(new THREE.TorusGeometry(.50,.038,7,36,Math.PI*.84),copper);brakeRim.rotation.set(Math.PI/2,0,-Math.PI*.42);brakeRim.position.set(0,.57,-.235);
    this.brakeLever.add(brakePlinth,brakeColumn,brakeBoss,brakeQuadrant,brakeRim);
    for(let i=0;i<9;i++){
      const a=THREE.MathUtils.lerp(.68,-.42,i/8);const tooth=new THREE.Mesh(new THREE.BoxGeometry(.065,.15,.085),darkIron);
      tooth.position.set(Math.sin(a)*.44,.57+Math.cos(a)*.44,-.275);tooth.rotation.z=-a;this.brakeLever.add(tooth);
    }
    const latch=new THREE.Mesh(new THREE.BoxGeometry(.15,.22,.18),brass);latch.position.set(.17,.62,.08);latch.rotation.z=-.22;this.brakeLever.add(latch);
    this.brakePivot=new THREE.Group();this.brakePivot.position.set(0,.54,.02);
    const brakeRod=new THREE.Mesh(new THREE.CylinderGeometry(.060,.078,1.05,10),darkIron);brakeRod.position.y=.525;
    const brakeSleeve=new THREE.Mesh(new THREE.CylinderGeometry(.082,.092,.18,10),copper);brakeSleeve.position.y=.99;
    const brakeGrip=new THREE.Mesh(new THREE.CylinderGeometry(.055,.060,.52,12),new THREE.MeshStandardMaterial({color:0x5a2c20,roughness:.78,metalness:.18}));brakeGrip.rotation.z=Math.PI/2;brakeGrip.position.y=1.12;
    const bgL=new THREE.Mesh(new THREE.CylinderGeometry(.066,.066,.045,10),brass);bgL.rotation.z=Math.PI/2;bgL.position.set(-.26,1.12,0);
    const bgR=bgL.clone();bgR.position.x=.26;
    this.brakePivot.add(brakeRod,brakeSleeve,brakeGrip,bgL,bgR);this.brakeLever.add(this.brakePivot);this.group.add(this.brakeLever);
    this.brakeRod=this.brakePivot;
    this.brakeLever.traverse(o=>{if(o.isMesh)markInteractive(o,'brake');});

    // Pipe that can leak.
    this.leakPipe = new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,2.4,10), brass);
    this.leakPipe.rotation.z = Math.PI/2; this.leakPipe.position.set(1.7,3.75,.2); this.group.add(this.leakPipe);
    markInteractive(this.leakPipe, 'leak');
    this.leakMarker = new THREE.PointLight(0xff7438, 0, 4, 2); this.leakMarker.position.copy(this.leakPipe.position); this.group.add(this.leakMarker);

    // Jammed mechanism repair gear.
    this.jamGear = new THREE.Mesh(new THREE.TorusGeometry(.48,.12,8,12), darkIron);
    this.jamGear.position.set(-1.68,2.75,.45); this.jamGear.rotation.y=Math.PI/2; this.group.add(this.jamGear);
    for (let i=0;i<6;i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(.13,.22,.18), brass);
      const a = i/6*Math.PI*2; tooth.position.set(-1.68,2.75+Math.cos(a)*.58,.45+Math.sin(a)*.58); markInteractive(tooth, 'mechanism'); this.group.add(tooth);
    }
    markInteractive(this.jamGear, 'mechanism');

    // Integrity repair panel.
    this.repairPanel = markSolid(new THREE.Mesh(new THREE.BoxGeometry(.8,.75,.18), darkIron));
    this.repairPanel.position.set(-1.78,3.15,-3.55); this.group.add(this.repairPanel); markInteractive(this.repairPanel, 'repairPanel');
    const panelLamp = new THREE.Mesh(new THREE.SphereGeometry(.06,8,6), new THREE.MeshBasicMaterial({color:0xd69b4a})); panelLamp.position.set(-1.68,3.32,-3.65); this.group.add(panelLamp);

    // Cargo wagon.
    const wagon = markSolid(new THREE.Mesh(new THREE.BoxGeometry(4,.6,9), darkIron)); wagon.position.set(0,1.1,-12.0); wagon.userData.lowBody = true; this.group.add(wagon);
    const wagonDeck = new THREE.Mesh(new THREE.BoxGeometry(3.8,.25,8.8), wood); wagonDeck.position.set(0,2.02,-12); this.group.add(wagonDeck);
    for (const x of [-1.70,1.70]) {
      const beam = visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.22,.52,8.55), darkIron));
      beam.position.set(x,1.62,-12); this.group.add(beam);
    }
    for (const z of [-15.7,-13.8,-11.9,-10.0,-8.3]) {
      const brace = visualOnly(new THREE.Mesh(new THREE.BoxGeometry(3.55,.32,.20), rust));
      brace.position.set(0,1.57,z); this.group.add(brace);
    }
    const sideGeo = new THREE.BoxGeometry(.18,1.25,8.8);
    const sideL = markSolid(new THREE.Mesh(sideGeo, rust)); sideL.position.set(-1.92,2.55,-12);
    // Platform-side wagon wall has a real walk-through opening around local z=-12.
    const sideRRear = markSolid(new THREE.Mesh(new THREE.BoxGeometry(.18,1.25,3.5), rust)); sideRRear.position.set(1.92,2.55,-14.65);
    const sideRFront = markSolid(new THREE.Mesh(new THREE.BoxGeometry(.18,1.25,3.5), rust)); sideRFront.position.set(1.92,2.55,-9.35);
    const end1 = markSolid(new THREE.Mesh(new THREE.BoxGeometry(3.8,1.25,.18), rust)); end1.position.set(0,2.55,-16.35);
    // Front of the cargo wagon has a walk-through center doorway.
    const frontL = markSolid(new THREE.Mesh(new THREE.BoxGeometry(1.05,1.25,.18), rust)); frontL.position.set(-1.38,2.55,-7.65);
    const frontR = markSolid(frontL.clone()); frontR.position.x=1.38;
    this.group.add(sideL,sideRRear,sideRFront,end1,frontL,frontR);

    // Cargo storage box: physical items can be stowed/retrieved here.
    this.storageCrate = markSolid(new THREE.Mesh(new THREE.BoxGeometry(1.25,.85,1.0), wood));
    this.storageCrate.position.set(1.05,2.58,-13.8); this.group.add(this.storageCrate); markInteractive(this.storageCrate, 'storage');

    // Coupler walkway.
    const coupler = new THREE.Mesh(new THREE.BoxGeometry(1.2,.25,2), darkIron); coupler.position.set(0,1.95,-6.5); this.group.add(coupler);

    // Simple boarding steps on both sides. They make a dead-man stop recoverable on open track
    // without teleporting the player back onto the locomotive.
    this.boardingStepSurfaces = [];
    const boardingLevels = [
      { z:-7.12, top:.45 },
      { z:-6.68, top:.88 },
      { z:-6.24, top:1.31 },
      { z:-5.80, top:1.74 }
    ];
    for (const side of [-1, 1]) {
      for (const level of boardingLevels) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(.72,.12,.40), darkIron);
        step.position.set(side * 2.42, level.top - .06, level.z);
        this.group.add(step);
        this.boardingStepSurfaces.push({
          minX: side > 0 ? 2.06 : -2.78,
          maxX: side > 0 ? 2.78 : -2.06,
          minZ: level.z - .22,
          maxZ: level.z + .22,
          y: level.top
        });
      }
    }

    // Wheels.
    const wheelMat = new THREE.MeshStandardMaterial({ color:0x15191a, roughness:.58, metalness:.9 });
    const addWheel = (x,z,r=.65) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(r,r,.22,14), wheelMat);
      w.rotation.z=Math.PI/2; w.position.set(x,.75,z); this.group.add(w);
      return w;
    };
    this.wheels=[];
    for (const z of [-3,0,3,-15,-12,-9]) { this.wheels.push(addWheel(-2.05,z),addWheel(2.05,z)); }


    // Dense visual layer for the locomotive and wagon. These pieces are visual only, so
    // the proven collision/interactions keep the same dimensions as the previous build.
    this.wheelDetailGroups = [];
    const wheelPositions = [-3,0,3,-15,-12,-9];
    // Shared wheel-detail geometry. Keep these allocations outside the loop so every
    // wheel reuses the same buffers. The previous build accidentally self-referenced
    // wheelFlangeGeo / wheelHubGeo before initialization and crashed at startup.
    const wheelFlangeGeo = new THREE.TorusGeometry(.66,.055,7,18);
    const wheelHubGeo = new THREE.CylinderGeometry(.16,.16,.16,10);
    const wheelSpokeGeo = new THREE.BoxGeometry(.055,.92,.055);
    for (const z of wheelPositions) {
      for (const side of [-1,1]) {
        const wg = new THREE.Group();
        wg.position.set(side*2.18,.75,z);
        const flange = visualOnly(new THREE.Mesh(wheelFlangeGeo, darkIron));
        flange.rotation.y=Math.PI/2;
        wg.add(flange);
        const hub = visualOnly(new THREE.Mesh(wheelHubGeo, brass));
        hub.rotation.z=Math.PI/2; wg.add(hub);
        const spokes = visualOnly(new THREE.InstancedMesh(wheelSpokeGeo, darkIron, 6));
        const spokeDummy = new THREE.Object3D();
        for(let i=0;i<6;i++){
          spokeDummy.rotation.set(i*Math.PI/3,0,0);
          spokeDummy.updateMatrix();
          spokes.setMatrixAt(i,spokeDummy.matrix);
        }
        wg.add(spokes);
        this.group.add(wg); this.wheelDetailGroups.push(wg);
      }
    }

    // Rounded smokebox face and hardware make the front read as a locomotive instead of a box.
    const frontDoor = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(1.06,1.06,.20,24), darkIron));
    frontDoor.rotation.x=Math.PI/2; frontDoor.position.set(0,3.25,4.02); this.group.add(frontDoor);
    const frontRing = visualOnly(new THREE.Mesh(new THREE.TorusGeometry(1.02,.085,8,28), brass));
    frontRing.position.set(0,3.25,4.14); this.group.add(frontRing);
    const frontBoss = visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,.20,12), brass));
    frontBoss.rotation.x=Math.PI/2; frontBoss.position.set(0,3.25,4.18); this.group.add(frontBoss);
    for(const x of [-.68,.68]){
      const hinge=visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.16,.34,.10), brass));
      hinge.position.set(x,3.25,4.18); this.group.add(hinge);
    }

    // Steam dome, sand dome and whistle cluster on top of the boiler.
    const domeData=[[1.15,.42,.56],[-.10,.34,.44]];
    for(const [z,r,h] of domeData){
      const base=visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(r*.86,r,h,14), brass));
      base.position.set(0,4.43,z); this.group.add(base);
      const capD=visualOnly(new THREE.Mesh(new THREE.SphereGeometry(r*.72,14,8,0,Math.PI*2,0,Math.PI*.55), brass));
      capD.position.set(0,4.43+h*.52,z); this.group.add(capD);
    }
    for(const x of [-.13,.13]){
      const whistle=visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.045,.06,.54,8), copper));
      whistle.position.set(x,4.92,.55); this.group.add(whistle);
      const bell=visualOnly(new THREE.Mesh(new THREE.ConeGeometry(.095,.18,9), brass));
      bell.position.set(x,5.18,.55); this.group.add(bell);
    }

    // Side running boards, hand rails and external plumbing.
    for(const side of [-1,1]){
      const board=visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.42,.10,8.7), darkIron));
      board.position.set(side*1.55,2.16,.35); this.group.add(board);
      const handrail=visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,7.5,6), brass));
      handrail.rotation.x=Math.PI/2; handrail.position.set(side*1.30,3.82,.55); this.group.add(handrail);
      for(const z of [-2.2,-.5,1.2,2.9]){
        const post=visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.48,6), brass));
        post.position.set(side*1.30,3.58,z); this.group.add(post);
      }
      const curve=new THREE.CatmullRomCurve3([
        new THREE.Vector3(side*1.21,4.08,-1.0),
        new THREE.Vector3(side*1.34,4.24,.3),
        new THREE.Vector3(side*1.28,4.00,1.75),
        new THREE.Vector3(side*1.12,3.62,3.10)
      ]);
      const pipeGeo=new THREE.TubeGeometry(curve,28,.045,6,false);
      const pipe=visualOnly(new THREE.Mesh(pipeGeo, side>0?copper:brass)); this.group.add(pipe);
    }

    // Front buffer beam, buffers and a simple pilot/cowcatcher silhouette.
    const bufferBeam=visualOnly(new THREE.Mesh(new THREE.BoxGeometry(4.35,.28,.28), rust));
    bufferBeam.position.set(0,1.48,5.0); this.group.add(bufferBeam);
    for(const x of [-1.45,1.45]){
      const buffer=visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.24,.28,.48,12), darkIron));
      buffer.rotation.x=Math.PI/2; buffer.position.set(x,1.48,5.30); this.group.add(buffer);
      const face=visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.08,14), darkIron));
      face.rotation.x=Math.PI/2; face.position.set(x,1.48,5.56); this.group.add(face);
    }
    for(let i=-3;i<=3;i++){
      const bar=visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.07,.08,1.45), darkIron));
      bar.position.set(i*.42,.82,5.55); bar.rotation.x=-.38; this.group.add(bar);
    }
    const pilotCross=visualOnly(new THREE.Mesh(new THREE.BoxGeometry(3.25,.10,.10), darkIron));
    pilotCross.position.set(0,.56,6.02); this.group.add(pilotCross);
    const pilotCollider=markSolid(new THREE.Mesh(new THREE.BoxGeometry(3.5,1.15,1.15),new THREE.MeshBasicMaterial({visible:false})));
    pilotCollider.position.set(0,.95,5.52); pilotCollider.userData.ignoreRaycast=true; pilotCollider.userData.noShadow=true; this.group.add(pilotCollider);

    // Cab windows, trim and roof lip. The existing solid shell remains the collision surface.
    const glass = VM.glassDark || new THREE.MeshStandardMaterial({color:0x26343c,roughness:.2,metalness:.12,transparent:true,opacity:.66});
    for(const side of [-1,1]){
      const win=visualOnly(new THREE.Mesh(new THREE.PlaneGeometry(1.05,1.05),glass));
      win.position.set(side*1.926,4.10,-2.82); win.rotation.y=side>0?Math.PI/2:-Math.PI/2; this.group.add(win);
      for(const dz of [-3.42,-2.22]){
        const trim=visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.05,1.28,.05),brass));
        trim.position.set(side*1.955,4.10,dz); this.group.add(trim);
      }
    }
    const roofLip=visualOnly(new THREE.Mesh(new THREE.BoxGeometry(4.62,.12,4.05),rust));
    roofLip.position.set(0,5.18,-3.0); this.group.add(roofLip);
    const roofCenter=visualOnly(new THREE.Mesh(new THREE.BoxGeometry(2.25,.12,4.18),darkIron));
    roofCenter.position.set(0,5.36,-3.0); this.group.add(roofCenter);
    for(const side of [-1,1]){
      const roofWing=visualOnly(new THREE.Mesh(new THREE.BoxGeometry(1.35,.10,4.12),darkIron));
      roofWing.position.set(side*1.52,5.28,-3.0); roofWing.rotation.z=side>0?-.14:.14; this.group.add(roofWing);
    }

    // Cargo wagon: visible wood panels, steel uprights, top rails and floor planks.
    // The platform-side doorway stays visually open: no decorative bars are allowed to cross it.
    const wagonPostGeo=new THREE.BoxGeometry(.15,1.55,.15);
    for(const side of [-1,1]){
      const postZ = side > 0 ? [-15.7,-14.1,-12.95,-11.05,-9.3,-7.8] : [-15.7,-14.1,-12.5,-10.9,-9.3,-7.8];
      for(const z of postZ){
        const post=visualOnly(new THREE.Mesh(wagonPostGeo,darkIron));
        post.position.set(side*2.0,2.72,z); this.group.add(post);
      }
      if(side < 0){
        const topRail=visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.14,.14,8.85),darkIron));
        topRail.position.set(side*1.98,3.23,-12.0); this.group.add(topRail);
        for(const y of [2.30,2.82]){
          const strap=visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.07,.10,8.65),brass));
          strap.position.set(side*1.995,y,-12.0); this.group.add(strap);
        }
      } else {
        for(const [z,len] of [[-14.65,3.35],[-9.35,3.35]]){
          const topRail=visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.14,.14,len),darkIron));
          topRail.position.set(side*1.98,3.23,z); this.group.add(topRail);
          for(const y of [2.30,2.82]){
            const strap=visualOnly(new THREE.Mesh(new THREE.BoxGeometry(.07,.10,len-.12),brass));
            strap.position.set(side*1.995,y,z); this.group.add(strap);
          }
        }
      }
    }
    const wagonPanelGeo=new THREE.BoxGeometry(.045,1.02,1.20);
    const addWagonPanel=(side,z)=>{ const p=visualOnly(new THREE.Mesh(wagonPanelGeo,wood)); p.position.set(side*2.025,2.62,z); this.group.add(p); };
    for(const z of [-15.5,-14.15,-12.8,-11.45,-10.1,-8.65]) addWagonPanel(-1,z);
    for(const z of [-15.45,-14.1,-9.9,-8.55]) addWagonPanel(1,z);
    const wagonPlankGeo=new THREE.BoxGeometry(3.62,.035,.62);
    for(let z=-15.8;z<=-8.0;z+=.72){
      const plank=visualOnly(new THREE.Mesh(wagonPlankGeo,wood));
      plank.position.set(0,2.165,z); this.group.add(plank);
    }
    const rearBeam=visualOnly(new THREE.Mesh(new THREE.BoxGeometry(4.15,.25,.25),rust));
    rearBeam.position.set(0,1.50,-16.55); this.group.add(rearBeam);
    for(const x of [-1.42,1.42]){
      const rearBuffer=visualOnly(new THREE.Mesh(new THREE.CylinderGeometry(.23,.27,.42,12),darkIron));
      rearBuffer.rotation.x=Math.PI/2; rearBuffer.position.set(x,1.50,-16.82); this.group.add(rearBuffer);
    }
    const rearBufferCollider=markSolid(new THREE.Mesh(new THREE.BoxGeometry(3.55,.65,.52),new THREE.MeshBasicMaterial({visible:false})));
    rearBufferCollider.position.set(0,1.48,-16.72); rearBufferCollider.userData.ignoreRaycast=true; rearBufferCollider.userData.noShadow=true; this.group.add(rearBufferCollider);

    // Coupler chain links between locomotive and wagon.
    for(let i=0;i<5;i++){
      const link=visualOnly(new THREE.Mesh(new THREE.TorusGeometry(.16,.035,6,10),darkIron));
      link.position.set(0,1.53,-5.95-i*.25); link.rotation.y=(i%2)*Math.PI/2; this.group.add(link);
    }

    // Extra pipes, gauges and gears for stronger steampunk silhouette.
    for (const x of [-1.35,1.35]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,4.3,8), copper);
      pipe.rotation.x=Math.PI/2; pipe.position.set(x,3.25,1.1); this.group.add(pipe);
    }
    for (const x of [-.55,.55]) {
      const gauge = new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,.09,16), brass);
      gauge.rotation.x=Math.PI/2; gauge.position.set(x,4.18,-1.52); this.group.add(gauge);
      const face = new THREE.Mesh(new THREE.CircleGeometry(.22,16), new THREE.MeshBasicMaterial({color:0xd1c39e}));
      face.position.set(x,4.18,-1.575); face.rotation.x=Math.PI; this.group.add(face);
    }
    for (let z=-14.8; z<=-9.2; z+=2.8) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(3.4,.08,.08), brass); brace.position.set(0,3.02,z); this.group.add(brace);
    }

    // Animated wheel rods and piston hardware. These are visual only; collision stays simple.
    this.connectingRods = [];
    const rodMat = brass;
    for (const side of [-1, 1]) {
      const rod = new THREE.Mesh(new THREE.BoxGeometry(.10,.12,6.15), rodMat);
      rod.position.set(side*2.19,.77,0); this.group.add(rod); this.connectingRods.push(rod);
      const piston = new THREE.Mesh(new THREE.BoxGeometry(.18,.18,1.65), copper);
      piston.position.set(side*2.22,1.12,3.35); this.group.add(piston); this.connectingRods.push(piston);
    }

    // Reused rivet geometry gives the locomotive a much denser silhouette without adding colliders.
    const rivetGeo = new THREE.SphereGeometry(.045,6,4);
    const rivetCount = 56;
    const rivets = new THREE.InstancedMesh(rivetGeo, brass, rivetCount);
    const dummy = new THREE.Object3D(); let ri=0;
    for (const x of [-1.77,1.77]) {
      for (let z=-4.2; z<=4.2 && ri<rivetCount; z+=.65) {
        dummy.position.set(x,4.93,z); dummy.scale.setScalar(.8+((ri%3)*.08)); dummy.updateMatrix(); rivets.setMatrixAt(ri++,dummy.matrix);
      }
    }
    while (ri<rivetCount) {
      const side=ri%2?1:-1; const z=-15.6 + ((ri*1.17)%7.2);
      dummy.position.set(side*1.86,3.0,z); dummy.scale.setScalar(.78); dummy.updateMatrix(); rivets.setMatrixAt(ri++,dummy.matrix);
    }
    rivets.userData.ignoreRaycast=true; rivets.userData.noShadow=true; rivets.castShadow=false; this.group.add(rivets);

    // Front headlamp: a warm spot light aimed down the rails, especially important at night.
    const headHousing = new THREE.Mesh(new THREE.CylinderGeometry(.38,.46,.52,14), darkIron);
    headHousing.rotation.x=Math.PI/2; headHousing.position.set(0,3.58,4.72); this.group.add(headHousing);
    const lensMat = new THREE.MeshStandardMaterial({color:0xffd59a,emissive:0xffa13a,emissiveIntensity:.7,roughness:.2,metalness:.08});
    this.headLens = new THREE.Mesh(new THREE.CircleGeometry(.31,18), lensMat); this.headLens.position.set(0,3.58,5.0); this.group.add(this.headLens);
    this.headlight = new THREE.SpotLight(0xffc06a, .5, 82, Math.PI/7.4, .56, 1.18);
    this.headlight.position.set(0,3.58,4.95); this.headlight.castShadow=false;
    this.headlightTarget = new THREE.Object3D(); this.headlightTarget.position.set(0,1.15,68);
    this.group.add(this.headlight,this.headlightTarget); this.headlight.target=this.headlightTarget;
    this.headBeamMat = new THREE.MeshBasicMaterial({color:0xffc06a,transparent:true,opacity:.006,depthWrite:false,depthTest:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
    this.headBeam = new THREE.Mesh(new THREE.CylinderGeometry(.16,5.4,42,16,1,true),this.headBeamMat);
    this.headBeam.rotation.x=-Math.PI/2; this.headBeam.position.set(0,2.28,25.8); this.headBeam.userData.ignoreRaycast=true; this.headBeam.userData.noShadow=true; this.group.add(this.headBeam);
    this.headBeamCoreMat = new THREE.MeshBasicMaterial({color:0xffdda3,transparent:true,opacity:.002,depthWrite:false,depthTest:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
    this.headBeamCore = new THREE.Mesh(new THREE.CylinderGeometry(.10,2.25,44,14,1,true),this.headBeamCoreMat);
    this.headBeamCore.rotation.x=-Math.PI/2; this.headBeamCore.position.set(0,2.55,26.8); this.headBeamCore.userData.ignoreRaycast=true; this.headBeamCore.userData.noShadow=true; this.group.add(this.headBeamCore);

    // Firebox lighting and glowing coals.
    this.fireboxLight = new THREE.PointLight(0xff5a18,.55,6,2); this.fireboxLight.position.set(.75,2.77,-2.45); this.group.add(this.fireboxLight);
    this.coalGlow = new THREE.Group();
    const coalGlowMat = new THREE.MeshStandardMaterial({color:0x431208,emissive:0xff3a08,emissiveIntensity:2.8,roughness:1});
    for(let i=0;i<10;i++){
      const c=new THREE.Mesh(new THREE.DodecahedronGeometry(.08+((i%3)*.025),0),coalGlowMat);
      c.position.set(.55+(i%4)*.13,2.56+((i%2)*.07),-2.18-(i%3)*.025); this.coalGlow.add(c);
    }
    this.group.add(this.coalGlow);

    // Warm cab lamp. Intensity is driven by the day/night system through setNightFactor().
    this.cabLamp = new THREE.PointLight(0xff8a38, .35, 9, 2); this.cabLamp.position.set(0,4.35,-3.1); this.group.add(this.cabLamp);
    this.cabMoonFill = new THREE.PointLight(0x7898bd, .04, 7, 2); this.cabMoonFill.position.set(-.8,4.0,-1.1); this.group.add(this.cabMoonFill);
    this.cabBulbMat = new THREE.MeshBasicMaterial({color:0xffb35a,transparent:true,opacity:.62});
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.11,8,6), this.cabBulbMat); bulb.position.copy(this.cabLamp.position); this.group.add(bulb); this.cabBulb=bulb;

    // More readable gauges and piping inside the cab.
    for (const x of [-1.25,-.78,.78,1.25]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,1.6,7), copper); pipe.position.set(x,3.6,-1.60); this.group.add(pipe);
    }
    for (const x of [-.88,0,.88]) {
      const gaugeRing = new THREE.Mesh(new THREE.TorusGeometry(.18,.035,7,14), brass); gaugeRing.position.set(x,4.55,-1.54); this.group.add(gaugeRing);
      const needle = new THREE.Mesh(new THREE.BoxGeometry(.018,.12,.025), new THREE.MeshBasicMaterial({color:0x3a180f})); needle.position.set(x,4.55,-1.57); needle.rotation.z=(x+.9)*.45; this.group.add(needle);
    }

    // Story/detail pass: serial plate, grime, hanging chain and working tools. Visual only.
    {
      const c=document.createElement('canvas');c.width=256;c.height=96;const cx=c.getContext('2d');cx.fillStyle='#2a2e2e';cx.fillRect(0,0,256,96);cx.strokeStyle='#ad824b';cx.lineWidth=5;cx.strokeRect(5,5,246,86);cx.fillStyle='#d0b27b';cx.font='bold 24px Arial';cx.textAlign='center';cx.fillText('IW-04 / 771',128,44);cx.font='bold 13px Arial';cx.fillStyle='#7e8a8c';cx.fillText('PORT AUTHORITY',128,70);const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;const plateMat=new THREE.MeshStandardMaterial({map:tex,roughness:.52,metalness:.72});
      const plate=new THREE.Mesh(new THREE.PlaneGeometry(1.75,.65),plateMat);plate.position.set(-1.785,3.5,.65);plate.rotation.y=Math.PI/2;this.group.add(plate);
      const grimeMat=new THREE.MeshBasicMaterial({color:0x121516,transparent:true,opacity:.23,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
      for(const [x,y,z,sx,sy,rz] of [[-1.79,2.0,1.6,.7,1.7,.08],[1.79,1.25,-.4,.55,1.0,-.05],[-1.79,1.05,-3.2,.75,.85,.03]]){const g=new THREE.Mesh(new THREE.PlaneGeometry(sx,sy),grimeMat);g.position.set(x,y,z);g.rotation.y=x<0?Math.PI/2:-Math.PI/2;g.rotation.z=rz;g.userData.ignoreRaycast=true;g.userData.noShadow=true;this.group.add(g);}
      this.cabChainGroup=new THREE.Group();this.cabChainGroup.position.set(1.52,4.85,-3.6);for(let i=0;i<7;i++){const link=new THREE.Mesh(new THREE.TorusGeometry(.09,.025,6,10),darkIron);link.position.y=-i*.16;link.rotation.y=(i%2)*Math.PI/2;this.cabChainGroup.add(link);}this.group.add(this.cabChainGroup);
      // Small wrench/hammer on the cab shelf.
      const tool1=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.72),darkIron);tool1.position.set(-1.2,2.34,-3.7);tool1.rotation.y=.6;this.group.add(tool1);const toolHead=new THREE.Mesh(new THREE.BoxGeometry(.38,.13,.14),rust);toolHead.position.set(-.98,2.35,-3.48);toolHead.rotation.y=.6;this.group.add(toolHead);
      const hose=new THREE.Mesh(new THREE.TorusGeometry(.48,.035,7,18,Math.PI*1.45),copper);hose.position.set(1.48,2.5,-3.8);hose.rotation.y=Math.PI/2;this.group.add(hose);
    }

    // Cheap contact shadows keep the locomotive and wagon visually grounded without SSAO.
    const contactMat=new THREE.MeshBasicMaterial({color:0x08090a,transparent:true,opacity:.13,depthWrite:false,depthTest:true});
    const locoShadow=new THREE.Mesh(new THREE.PlaneGeometry(4.2,10.2),contactMat);locoShadow.rotation.x=-Math.PI/2;locoShadow.position.set(0,.035,-.1);locoShadow.userData.ignoreRaycast=true;locoShadow.userData.noShadow=true;this.group.add(locoShadow);
    const wagonShadow=new THREE.Mesh(new THREE.PlaneGeometry(4.3,9.6),contactMat);wagonShadow.rotation.x=-Math.PI/2;wagonShadow.position.set(0,.035,-12);wagonShadow.userData.ignoreRaycast=true;wagonShadow.userData.noShadow=true;this.group.add(wagonShadow);

    this.group.traverse(o => {
      if (o.isMesh) {
        o.castShadow = !o.userData.noShadow;
        o.receiveShadow = !o.userData.noShadow;
        if (!o.userData.ignoreRaycast) this.raycastMeshes.push(o);
      }
    });
    this.updateControlsVisuals();
  }

  initEffectPools() {
    const smokeMap = this.visuals?.textures?.smoke || null;
    const sparkMap = this.visuals?.textures?.spark || smokeMap;
    for (let i=0;i<96;i++) {
      const mat = new THREE.SpriteMaterial({ map:smokeMap, color:0xffffff, transparent:true, opacity:0, depthWrite:false, fog:true });
      const sprite = new THREE.Sprite(mat); sprite.visible=false; sprite.frustumCulled=true; this.scene.add(sprite); this.effectPool.push(sprite);
    }
    for (let i=0;i<40;i++) {
      const mat = new THREE.SpriteMaterial({ map:sparkMap, color:0xff9b35, transparent:true, opacity:0, depthWrite:false, blending:THREE.AdditiveBlending, fog:true });
      const sprite = new THREE.Sprite(mat); sprite.visible=false; this.scene.add(sprite); this.sparkPool.push(sprite);
    }
  }

  configureLightingQuality(quality={}) {
    this.lightingQuality = quality || {};
    if (!this.headlight) return;
    const high = quality.tier === 'HIGH' && quality.headlightShadow;
    this.headlight.castShadow = Boolean(high);
    if (high) {
      const size = 512;
      this.headlight.shadow.mapSize.set(size,size);
      this.headlight.shadow.camera.near = .3;
      this.headlight.shadow.camera.far = 88;
      this.headlight.shadow.bias = -.00035;
      this.headlight.shadow.normalBias = .035;
    }
  }

  setNightFactor(factor, elapsed = 0, fogDensity = null) {
    this.nightFactor = THREE.MathUtils.clamp(factor,0,1);
    if (Number.isFinite(fogDensity)) this.currentFogDensity = fogDensity;
    const actualFog = this.currentFogDensity || .0092;
    const n = THREE.MathUtils.smoothstep(this.nightFactor,.08,.85);
    const fogBoost = THREE.MathUtils.clamp((actualFog-.008)/.010,0,1);
    if (this.headlight) { this.headlight.intensity = THREE.MathUtils.lerp(.22,20,n); this.headlight.distance = 78 + fogBoost*7; }
    if (this.headLens?.material) this.headLens.material.emissiveIntensity = THREE.MathUtils.lerp(.45,3.0,n);
    if (this.headBeamMat) this.headBeamMat.opacity = THREE.MathUtils.lerp(.0015,.045,n) + n*fogBoost*.022;
    if (this.headBeamCoreMat) this.headBeamCoreMat.opacity = THREE.MathUtils.lerp(.0007,.020,n) + n*fogBoost*.010;
    const cabFlicker=1+Math.sin(elapsed*11.7)*.018*n+Math.sin(elapsed*3.3+1.2)*.010*n;
    if (this.cabLamp) this.cabLamp.intensity = THREE.MathUtils.lerp(.16,2.55,n) * cabFlicker;
    if (this.cabMoonFill) this.cabMoonFill.intensity = THREE.MathUtils.lerp(.015,.30,n);
    if (this.cabBulbMat) this.cabBulbMat.opacity = THREE.MathUtils.lerp(.36,.92,n);
    const fireOpen = this.fireboxOpen ? 1 : 0;
    const fireNoise=.94+Math.sin(elapsed*16.8)*.045+Math.sin(elapsed*31.2+1.7)*.026+Math.sin(elapsed*5.1+.4)*.018;
    const fireLevel = THREE.MathUtils.lerp(.05,5.6,fireOpen);
    if (this.fireboxLight) this.fireboxLight.intensity = fireLevel * (this.coalFuel>0 ? fireNoise : .14);
    if (this.fire?.material) this.fire.material.emissiveIntensity = this.fireboxOpen ? (2.75 + (fireNoise-1)*4.0) : .34;
  }

  setHeadlightBeamDistance(distance=82) {
    const d=THREE.MathUtils.clamp(Number(distance)||82,6,82);
    if(this.headBeam){this.headBeam.scale.y=d/42;this.headBeam.position.z=4.8+d/2;}
    if(this.headBeamCore){this.headBeamCore.scale.y=d/44;this.headBeamCore.position.z=4.8+d/2;}
  }

  getExposureInfluence(worldPosition) {
    if (!worldPosition) return 0;
    let influence = 0;
    const probe = new THREE.Vector3();
    if (this.fireboxLight && this.fireboxOpen) {
      this.fireboxLight.getWorldPosition(probe);
      const d=probe.distanceTo(worldPosition);
      if(d<8) influence += Math.max(0,1-d/8)*3.2;
    }
    if (this.cabLamp && this.nightFactor>.25) {
      this.cabLamp.getWorldPosition(probe);
      const d=probe.distanceTo(worldPosition);
      if(d<7) influence += Math.max(0,1-d/7)*1.2*this.nightFactor;
    }
    return influence;
  }

  setWeatherVisuals(weather) {
    if (!weather) return;
    if (weather.windDirection) this.visualWind.copy(weather.windDirection);
    this.visualWindSpeed = weather.windSpeed || .3;
    this.visualAsh = weather.ashFactor?.() ?? weather.current?.ash ?? .1;
  }

  emitSpark(worldPos, velocity = null, scale = 1) {
    const sprite = this.sparkPool.find(s=>!s.visible);
    if (!sprite) return;
    sprite.visible=true; sprite.position.copy(worldPos);
    const sparkSize=.052*scale*(.8+Math.random()*.7);
    sprite.scale.set(sparkSize,sparkSize*(1.55+this.nightFactor*.55),1);
    sprite.material.opacity=.95; sprite.material.color.setHex(Math.random()>.45?0xff9b35:0xffd27a);
    sprite.userData.vel=(velocity||new THREE.Vector3((Math.random()-.5)*1.2,1.8+Math.random()*1.5,(Math.random()-.5)*1.2)).clone();
    sprite.userData.life=.28+Math.random()*.42; sprite.userData.maxLife=sprite.userData.life;
  }

  pressureState() {
    if (this.pressure < 85) return 'NORMAL';
    if (this.pressure < 100) return 'HIGH';
    return 'CRITICAL';
  }

  getRaycastMeshes() {
    return this.raycastMeshes;
  }

  toggleFireboxDoor() {
    if (this.destroyed) return false;
    this.fireboxOpen = !this.fireboxOpen;
    this.fireboxDoor.rotation.y = this.fireboxOpen ? -1.35 : 0;
    if (this.fireboxOpen && this.coalFuel > 0) {
      const pos = this.fireboxOpening.localToWorld(new THREE.Vector3(0,0,-.08));
      for (let i=0;i<4;i++) this.emitSpark(pos, new THREE.Vector3((Math.random()-.5)*.8,.6+Math.random()*.8,-.4-Math.random()*.5), .9);
    }
    return true;
  }

  addCoal(amount=1) {
    if (this.destroyed) return false;
    this.coalFuel = Math.min(100, this.coalFuel + amount * 9);
    this.pressure = Math.min(120, this.pressure + 6);
    const pos = this.fireboxOpening.localToWorld(new THREE.Vector3(0,0,-.12));
    for (let i=0;i<8;i++) this.emitSpark(pos, new THREE.Vector3((Math.random()-.5)*1.4,.8+Math.random()*1.5,-.2-Math.random()), 1.05);
    return true;
  }

  adjustThrottle(delta) {
    if (this.destroyed || (this.atStation && !this.departureUnlocked)) return false;
    this.throttle = THREE.MathUtils.clamp(Math.round((this.throttle + delta) * 4) / 4, 0, 1);
    if (this.atStation && this.departureUnlocked && this.throttle > 0 && this.brake < .5) this.depart();
    this.updateControlsVisuals();
    return true;
  }

  toggleBrake() {
    if (this.destroyed || (this.atStation && !this.departureUnlocked)) return false;
    this.brake = this.brake > .5 ? 0 : 1;
    if (this.atStation && this.departureUnlocked && this.brake < .5 && this.throttle > 0) this.depart();
    this.updateControlsVisuals();
    return true;
  }

  updateControlsVisuals() {
    // Exact visual detents matching the 0/25/50/75/100 gameplay states.
    const throttleAngles = [.78,.52,.25,-.03,-.31];
    const throttleIndex = THREE.MathUtils.clamp(Math.round(this.throttle * 4),0,4);
    if (this.throttlePivot) this.throttlePivot.rotation.z = throttleAngles[throttleIndex];
    if (this.brakePivot) this.brakePivot.rotation.z = this.brake > .5 ? .64 : -.34;
    this.updatePressureGauge();
  }

  updatePressureGauge() {
    if (!this.pressureNeedlePivot) return;
    const t = THREE.MathUtils.clamp(this.pressure / 120, 0, 1);
    this.pressureNeedlePivot.rotation.z = THREE.MathUtils.lerp(2.15,-2.15,t);
  }

  applyDifficulty(config = {}) {
    this.difficulty = {
      trainDamageMultiplier: Number.isFinite(config.trainDamageMultiplier) ? config.trainDamageMultiplier : 1,
      faultRateMultiplier: Number.isFinite(config.faultRateMultiplier) ? config.faultRateMultiplier : 1
    };
  }

  applyClass(config = {}) {
    this.classConfig = {
      fuelBurnMultiplier: Number.isFinite(config.fuelBurnMultiplier) ? config.fuelBurnMultiplier : 1,
      repairMultiplier: Number.isFinite(config.repairMultiplier) ? config.repairMultiplier : 1
    };
  }

  openValve(dt) {
    if (this.destroyed || this.pressure <= .05) {
      this.pressure = Math.max(0, this.pressure);
      return false;
    }
    const before = this.pressure;
    this.pressure = Math.max(0, this.pressure - 24 * dt);
    if (this.valveWheelPivot) this.valveWheelPivot.rotation.z += dt * 5;
    if (before > .8 && Math.random() < dt * 16) {
      const pos = this.valve.localToWorld(new THREE.Vector3(0,0,.2));
      this.emitSteam(pos, new THREE.Vector3(-1,.4,0), .8 + Math.min(1, before / 100) * .45);
    }
    return true;
  }

  startLeak() {
    if (this.destroyed || this.leakActive) return false;
    this.leakActive = true;
    this.leakProgress = 0;
    this.leakMarker.intensity = 2.4;
    return true;
  }

  startJam() {
    if (this.destroyed || this.jammedActive) return false;
    this.jammedActive = true;
    this.jamProgress = 0;
    return true;
  }

  updateHoldRepairs(dt, holdingLeak, holdingJam) {
    if (this.destroyed) {
      this.leakProgress = 0;
      this.jamProgress = 0;
      return;
    }
    if (this.leakActive) {
      if (holdingLeak) this.leakProgress += dt;
      else this.leakProgress = 0;
      if (this.leakProgress >= 3) {
        this.leakActive = false;
        this.leakProgress = 0;
        this.leakMarker.intensity = 0;
        this.faultTimer = 90 + Math.random() * 50;
      }
    } else this.leakProgress = 0;

    if (this.jammedActive) {
      if (holdingJam) this.jamProgress += dt;
      else this.jamProgress = 0;
      if (this.jamProgress >= 2.5) {
        this.jammedActive = false;
        this.jamProgress = 0;
        this.faultTimer = 90 + Math.random() * 50;
      }
    } else this.jamProgress = 0;
  }

  repairIntegrity(amount=25) {
    if (this.destroyed || this.integrity >= 100) return false;
    const repaired = amount * (this.classConfig?.repairMultiplier || 1);
    this.integrity = Math.min(100, this.integrity + repaired);
    return true;
  }

  depart() {
    if (!this.atStation || !this.departureUnlocked) return false;
    if (this.currentStop?.id === 'abandoned') this.departedStation = true;
    if (this.currentStop && this.routeStops?.[this.stopIndex]?.id === this.currentStop.id) this.stopIndex++;
    this.atStation = false;
    this.stationApproach = false;
    this.approachStop = null;
    this.currentStop = null;
    this.departureUnlocked = false;
    this.safetyStopped = false;
    this.faultTimer = 42 + Math.random() * 22;
    return true;
  }

  nextRouteStop() { return this.routeStops?.[this.stopIndex] || null; }
  currentStopName() { return this.currentStop?.name || this.approachStop?.name || ''; }

  deckRegion(position) {
    const localZ = position.z - this.group.position.z;
    const x = Math.abs(position.x - this.group.position.x);
    const engine = x < 2.25 && localZ > -5.3 && localZ < 5.4;
    const wagon = x < 2.25 && localZ > -16.5 && localZ < -7.4;
    const bridge = x < .8 && localZ >= -7.4 && localZ <= -5.1;
    return engine || wagon || bridge;
  }

  playerOnTrain(position) {
    return position.y > 1.15 && position.y < 6.2 && this.deckRegion(position);
  }

  playerInCab(position) {
    if(!position)return false;
    const local=this.group.worldToLocal(position.clone());
    return local.y>1.45&&local.y<5.3&&Math.abs(local.x)<1.78&&local.z>-4.9&&local.z<-1.55;
  }

  deckFloorAtXZ(position) {
    return this.deckRegion(position) ? 2.18 : null;
  }

  boardingStepFloorAt(position) {
    if (!this.boardingStepSurfaces?.length) return null;
    const local = this.group.worldToLocal(position.clone());
    let floor = null;
    for (const step of this.boardingStepSurfaces) {
      if (local.x >= step.minX && local.x <= step.maxX && local.z >= step.minZ && local.z <= step.maxZ) {
        floor = floor == null ? step.y : Math.max(floor, step.y);
      }
    }
    return floor;
  }

  canLoadFirebox(playerPosition) {
    if (!this.fireboxOpen || this.destroyed) return false;
    const local = this.group.worldToLocal(playerPosition.clone());
    const dx = local.x - .75;
    const dz = local.z + 2.14;
    return local.z < -2.18 && local.z > -5.25 && Math.abs(local.x) < 2.05 && Math.hypot(dx, dz) <= 2.35;
  }

  isPlacementClear(position, radius=.28, height=.55) {
    for (const mesh of this.collisionMeshes) {
      mesh.updateWorldMatrix(true, false);
      const b = new THREE.Box3().setFromObject(mesh);
      if (position.y + height <= b.min.y + .02 || position.y >= b.max.y - .02) continue;
      const nx = THREE.MathUtils.clamp(position.x, b.min.x, b.max.x);
      const nz = THREE.MathUtils.clamp(position.z, b.min.z, b.max.z);
      const dx = position.x - nx, dz = position.z - nz;
      if (dx*dx + dz*dz < radius*radius) return false;
    }
    return true;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.integrity = 0;
    this.speed = 0;
    this.targetSpeed = 0;
    this.throttle = 0;
    this.brake = 1;
    this.leakActive = false;
    this.jammedActive = false;
    this.overheatActive = false;
    this.leakProgress = 0;
    this.jamProgress = 0;
    this.faultTimer = Infinity;
    if (this.leakMarker) this.leakMarker.intensity = 0;
    this.updateControlsVisuals();
  }


  floorHeightAt(position) {
    const stepFloor = this.boardingStepFloorAt(position);
    if (stepFloor != null) return stepFloor;
    if (!this.deckRegion(position) || position.y < 1.05) return null;
    return 2.18;
  }

  resolveAgainstTrain(position, radius, height, allowBoarding = false) {
    for (let pass=0; pass<2; pass++) {
      let moved = false;
      for (const mesh of this.collisionMeshes) {
        if (allowBoarding && mesh.userData.lowBody && position.y > .82) continue;
        mesh.updateWorldMatrix(true, false);
        const b = new THREE.Box3().setFromObject(mesh);
        if (position.y + height < b.min.y + .03 || position.y > b.max.y - .03) continue;
        const nx = THREE.MathUtils.clamp(position.x, b.min.x, b.max.x);
        const nz = THREE.MathUtils.clamp(position.z, b.min.z, b.max.z);
        let dx = position.x - nx;
        let dz = position.z - nz;
        const d2 = dx*dx + dz*dz;
        if (d2 >= radius*radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = radius - d + .001;
          position.x += dx/d*push; position.z += dz/d*push;
        } else {
          const left=Math.abs(position.x-b.min.x), right=Math.abs(b.max.x-position.x), back=Math.abs(position.z-b.min.z), front=Math.abs(b.max.z-position.z);
          const m=Math.min(left,right,back,front);
          if (m===left) position.x=b.min.x-radius-.001;
          else if (m===right) position.x=b.max.x+radius+.001;
          else if (m===back) position.z=b.min.z-radius-.001;
          else position.z=b.max.z+radius+.001;
        }
        moved = true;
      }
      if (!moved) break;
    }
  }

  resolvePlayerCollision(position, radius=.34, height=1.72) {
    this.resolveAgainstTrain(position, radius, height, true);
  }

  resolveEnemyCollision(position, radius=.5, height=2.25) {
    this.resolveAgainstTrain(position, radius, height);
  }

  update(dt, elapsed, playerPosition = null) {
    if (this.finished || this.destroyed) {
      this.lastDeltaZ = 0;
      this.updateEffects(dt);
      return;
    }
    const previousZ = this.group.position.z;

    // Dead-man safety is persistent until the player physically returns to the train.
    if (this.safetyStopped && playerPosition && this.playerOnTrain(playerPosition)) {
      this.safetyStopped = false;
      this.offTrainTimer = 0;
    }
    if (playerPosition && this.speed > .75 && !this.atStation && !this.stationApproach) {
      if (!this.playerOnTrain(playerPosition)) this.offTrainTimer += dt;
      else this.offTrainTimer = 0;
      if (this.offTrainTimer > 4) {
        this.brake = 1;
        this.throttle = 0;
        this.safetyStopped = true;
        this.updateControlsVisuals();
      }
    } else if (!this.safetyStopped && this.speed <= .75) {
      this.offTrainTimer = 0;
    }

    // Controlled approach to the next route stop. The original abandoned station is preserved,
    // and later ports reuse the same proven stop/departure mechanics.
    const nextStop = this.routeStops?.[this.stopIndex] || null;
    if (nextStop && !this.atStation && !this.stationApproach && this.group.position.z > nextStop.z - 65) {
      this.stationApproach = true;
      this.approachStop = nextStop;
    }

    const leakFactor = this.leakActive ? .62 : 1;
    const jamFactor = this.jammedActive ? .22 : 1;
    const integrityFactor = .35 + .65 * (this.integrity / 100);
    const brakeFactor = this.brake > .5 ? 0 : 1;
    const manualTarget = this.coalFuel > 0
      ? this.maxSpeed * this.throttle * leakFactor * jamFactor * integrityFactor * brakeFactor
      : 0;

    if (this.atStation) {
      this.targetSpeed = 0;
      const minStop = this.currentStop?.minStop ?? 4;
      if (elapsed - this.stationStopTime > minStop) this.departureUnlocked = true;
    } else if (this.stationApproach) {
      const stopZ = this.approachStop?.z ?? this.stationZ;
      const remaining = Math.max(0, stopZ - this.group.position.z);
      const safeApproachSpeed = Math.sqrt(2 * 3.6 * remaining) * .92;
      this.targetSpeed = Math.min(manualTarget, safeApproachSpeed);
    } else {
      this.targetSpeed = manualTarget;
    }

    const braking = this.stationApproach || this.brake > .5 || this.targetSpeed < this.speed;
    const accel = this.targetSpeed > this.speed ? 1.2 : (braking ? 4.0 : 2.8);
    if (this.speed < this.targetSpeed) this.speed = Math.min(this.targetSpeed, this.speed + accel * dt);
    else this.speed = Math.max(this.targetSpeed, this.speed - accel * dt);

    // Fuel/steam simulation. A parked locomotive burns slowly enough to allow a safe tutorial start.
    if (this.coalFuel > 0) {
      const normalizedSpeed = THREE.MathUtils.clamp(this.speed / this.maxSpeed, 0, 1);
      // Обслуживание стало реже: одного запаса угля хватает на заметно более длинный участок пути.
      const burnRate = (.016 + this.throttle * .032 + normalizedSpeed * .018) * (this.classConfig?.fuelBurnMultiplier || 1);
      this.coalFuel = Math.max(0, this.coalFuel - dt * burnRate);
      // Низкое давление больше не наказывает скоростью. Пар теперь в первую очередь риск перегрева.
      // При рабочей топке давление очень медленно растёт; тяга расходует часть пара и сдерживает рост.
      const generation = .36;
      const use = .07 + this.throttle * .14 + normalizedSpeed * .08;
      this.pressure += dt * (generation - use);
    } else {
      this.pressure -= dt * .34;
    }
    if (this.leakActive) this.pressure -= dt * 1.45;
    this.pressure = THREE.MathUtils.clamp(this.pressure, 0, 120);
    this.updatePressureGauge();

    // CRITICAL pressure drives overheat; leaving CRITICAL ends it immediately.
    this.overheatActive = this.pressure >= 100;
    if (this.overheatActive) {
      this.integrity -= dt * (.42 + Math.max(0, this.pressure - 100) * .055) * (this.difficulty.trainDamageMultiplier || 1);
      if (!this.leakActive && Math.random() < dt * .012 * (this.difficulty.faultRateMultiplier || 1)) this.startLeak();
    }
    if (this.leakActive) this.integrity -= dt * .06 * (this.difficulty.trainDamageMultiplier || 1);
    this.integrity = THREE.MathUtils.clamp(this.integrity, 0, 100);
    if (this.integrity <= 0) {
      this.destroy();
      this.lastDeltaZ = 0;
      this.updateEffects(dt);
      return;
    }

    // Lightweight service faults; never spawn while stopped at/approaching the station.
    if (!this.atStation && !this.stationApproach && this.speed > 1 && !this.leakActive && !this.jammedActive) {
      this.faultTimer -= dt * (this.difficulty.faultRateMultiplier || 1);
      if (this.faultTimer <= 0) {
        if (Math.random() < .62) this.startLeak(); else this.startJam();
        this.faultTimer = 9999;
      }
    }

    if (this.leakActive && Math.random() < dt * 16) {
      const pos = this.leakPipe.localToWorld(new THREE.Vector3(0,1.1,0));
      this.emitSteam(pos, new THREE.Vector3(1,.15,(Math.random()-.5)*.2), 1.05);
    }
    if (this.pressure >= 100 && Math.random() < dt * 18) {
      const pos = this.chimney.localToWorld(new THREE.Vector3(0,1.05,0));
      this.emitSteam(pos, new THREE.Vector3((Math.random()-.5)*.28,1,(Math.random()-.5)*.28), 1.35);
    } else if (this.pressure >= 85 && Math.random() < dt * 5) {
      const pos = this.chimney.localToWorld(new THREE.Vector3(0,1.05,0));
      this.emitSteam(pos, new THREE.Vector3((Math.random()-.5)*.2,1,(Math.random()-.5)*.2), .9);
    }
    if (this.coalFuel > 0 && Math.random() < dt * (2.8 + this.speed*.25 + this.throttle*1.4)) {
      const pos = this.chimney.localToWorld(new THREE.Vector3(0,1.25,0));
      this.emitSmoke(pos, new THREE.Vector3((Math.random()-.5)*.18,.85+Math.random()*.25,(Math.random()-.5)*.18), .9 + this.throttle*.65);
    }
    if (this.nightFactor > .38 && this.throttle > .48 && Math.random() < dt * (1.1 + this.throttle*2.1)) {
      const pos = this.chimney.localToWorld(new THREE.Vector3(0,1.2,0));
      this.emitSpark(pos, new THREE.Vector3((Math.random()-.5)*1.5,2.1+Math.random()*1.8,(Math.random()-.5)*1.2), .8+this.throttle*.45);
    }

    if (this.jammedActive) this.jamGear.rotation.x += dt * .35;
    else this.jamGear.rotation.x += dt * (1.2 + this.speed*.08);

    this.group.position.z += this.speed * dt;

    // Snap only at the final centimeters so the train cannot drift through a stop.
    if (this.stationApproach && !this.atStation) {
      const stop = this.approachStop || this.routeStops?.[this.stopIndex] || null;
      const stopZ = stop?.z ?? this.stationZ;
      const remaining = stopZ - this.group.position.z;
      if (this.group.position.z >= stopZ || (remaining < .16 && this.speed < .55)) {
        this.group.position.z = stopZ;
        this.speed = 0;
        this.targetSpeed = 0;
        this.atStation = true;
        this.currentStop = stop;
        this.stationStopTime = elapsed;
        this.departureUnlocked = false;
        this.throttle = 0;
        this.brake = 1;
        this.updateControlsVisuals();
      }
    }

    this.lastDeltaZ = this.group.position.z - previousZ;
    this.wheelPhase += this.speed * dt * 1.8;
    for (const wheel of this.wheels) wheel.rotation.x = -this.wheelPhase;
    if (this.wheelDetailGroups) for (const wg of this.wheelDetailGroups) wg.rotation.x = -this.wheelPhase;
    if (this.connectingRods?.length >= 4) {
      const lift = Math.sin(this.wheelPhase) * .14;
      const pistonShift = Math.cos(this.wheelPhase) * .32;
      const rodTilt = Math.sin(this.wheelPhase) * .045;
      this.connectingRods[0].position.y = .77 + lift;
      this.connectingRods[2].position.y = .77 - lift;
      this.connectingRods[0].rotation.x = rodTilt;
      this.connectingRods[2].rotation.x = -rodTilt;
      this.connectingRods[1].position.z = 3.35 + pistonShift;
      this.connectingRods[3].position.z = 3.35 - pistonShift;
    }
    const cabMotion=THREE.MathUtils.clamp(this.speed/Math.max(.01,this.maxSpeed),0,1);
    if(this.cabChainGroup)this.cabChainGroup.rotation.z=Math.sin(elapsed*2.4+this.wheelPhase*.15)*(.015+.055*cabMotion);
    if(this.cabBulb)this.cabBulb.position.x=this.cabLamp.position.x+Math.sin(elapsed*2.1)*.012*cabMotion;
    if(this.pressureNeedlePivot)this.pressureNeedlePivot.rotation.z+=Math.sin(elapsed*13.7)*(.0025+.0045*cabMotion);
    if(this.valveWheelMount)this.valveWheelMount.position.x=Math.sin(elapsed*18.0)*.004*THREE.MathUtils.clamp((this.pressure-82)/38,0,1);
    this.setNightFactor(this.nightFactor, elapsed);
    this.updateEffects(dt);

    if (this.group.position.z >= this.finishZ) {
      this.group.position.z = this.finishZ;
      this.finished = true;
      this.speed = 0;
      this.targetSpeed = 0;
      this.throttle = 0;
      this.brake = 1;
      this.updateControlsVisuals();
    }
  }

  emitSteam(worldPos, velocity, scale=1) {
    this.emitEffect(worldPos, velocity, scale, 0xe8efee, .46, .55, 1.25, 1.45, 'steam');
  }

  emitSmoke(worldPos, velocity, scale=1) {
    this.emitEffect(worldPos, velocity, scale, 0x252a2c, .48, 1.35, 2.7, 1.05, 'smoke');
  }

  emitEffect(worldPos, velocity, scale, color, opacity, minLife, maxLife, growth=1.2, effectType='steam') {
    const sprite = this.effectPool.find(s=>!s.visible);
    if (!sprite) return;
    sprite.visible=true;
    sprite.position.copy(worldPos);
    const base=.34*scale*(.8+Math.random()*.55);
    sprite.scale.set(base,base,1);
    sprite.material.color.setHex(color);
    sprite.material.opacity=opacity*(.8+Math.random()*.2);
    sprite.userData.vel=velocity.clone().multiplyScalar(.82+Math.random()*.72);
    sprite.userData.life=minLife+Math.random()*(maxLife-minLife);
    sprite.userData.maxLife=sprite.userData.life;
    sprite.userData.baseOpacity=sprite.material.opacity;
    sprite.userData.growth=growth;
    sprite.userData.spin=(Math.random()-.5)*.8;
    sprite.userData.effectType=effectType;
    this.effects.push(sprite);
  }

  removeEffect(effect) {
    const i=this.effects.indexOf(effect);
    if(i>=0) this.effects.splice(i,1);
    effect.visible=false;
    effect.material.opacity=0;
  }

  updateEffects(dt) {
    for (const puff of [...this.effects]) {
      puff.userData.life-=dt;
      puff.position.addScaledVector(puff.userData.vel,dt);
      puff.userData.vel.x += ((Math.random()-.5)*.15 + this.visualWind.x*this.visualWindSpeed*.28)*dt;
      puff.userData.vel.z += ((Math.random()-.5)*.15 + this.visualWind.y*this.visualWindSpeed*.28)*dt;
      const grow=1+dt*(puff.userData.growth||1.1);
      puff.scale.x*=grow; puff.scale.y*=grow;
      puff.material.rotation=(puff.material.rotation||0)+(puff.userData.spin||0)*dt;
      const ratio=Math.max(0,puff.userData.life/puff.userData.maxLife);
      const litBoost=puff.userData.effectType==='steam'?THREE.MathUtils.lerp(1,1.24,this.nightFactor):1;
      puff.material.opacity=puff.userData.baseOpacity*Math.min(1,ratio*1.8)*ratio*litBoost;
      if(puff.userData.effectType==='steam')puff.material.color.setHex(this.nightFactor>.45?0xf2f4ef:0xe8efee);
      else if(puff.userData.effectType==='smoke')puff.material.color.setHex(this.visualAsh>.65?0x4a4844:0x252a2c);
      if(puff.userData.life<=0) this.removeEffect(puff);
    }
    for (const spark of this.sparkPool) {
      if(!spark.visible) continue;
      spark.userData.life-=dt;
      spark.userData.vel.y-=4.5*dt;
      spark.position.addScaledVector(spark.userData.vel,dt);
      const sr=Math.max(0,spark.userData.life/spark.userData.maxLife); spark.material.opacity=sr*sr; spark.scale.multiplyScalar(1+dt*.45);
      if(spark.userData.life<=0){ spark.visible=false; spark.material.opacity=0; }
    }
  }

  updateSteam(dt) {
    this.updateEffects(dt);
  }
}

window.Train = Train;
