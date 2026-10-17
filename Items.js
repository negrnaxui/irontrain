class ItemSystem {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.floorResolver = null;
    this.collisionWorld = null;
    this.train = null;
    this.sharedAssets = this.createSharedAssets();
    this._carryDesired=new THREE.Vector3(-.06,-.60,-1.08);this._carryTarget=new THREE.Vector3();this._carryCamera=new THREE.Vector3();this._carryDir=new THREE.Vector3();this._carryFinal=new THREE.Vector3();
    this._visibilityTimer=0;this._itemWorld=new THREE.Vector3();this._visibleDistanceSq=155*155;
  }

  createSharedAssets() {
    const M = {
      coal:new THREE.MeshStandardMaterial({ color:0x17191a, roughness:1, metalness:.15 }),
      scrap:new THREE.MeshStandardMaterial({ color:0x704c35, roughness:.75, metalness:.65 }),
      ammoBox:new THREE.MeshStandardMaterial({ color:0x574635, roughness:.76, metalness:.25 }),
      ammoBand:new THREE.MeshStandardMaterial({ color:0xa67938, roughness:.45, metalness:.85 }),
      medkit:new THREE.MeshStandardMaterial({ color:0x654336, roughness:.75, metalness:.15 }),
      medCross:new THREE.MeshStandardMaterial({ color:0xc9b36b, emissive:0x2b1d08, emissiveIntensity:.22, roughness:.65 })
    };
    return {
      materials:M,
      coalGeo:new THREE.DodecahedronGeometry(.28,0),
      scrapGeo:new THREE.BoxGeometry(.7,.12,.18),
      ammoBoxGeo:new THREE.BoxGeometry(.48,.24,.34),
      ammoBandGeo:new THREE.BoxGeometry(.12,.255,.35),
      medkitGeo:new THREE.BoxGeometry(.55,.32,.42),
      medCrossHGeo:new THREE.BoxGeometry(.3,.07,.045),
      medCrossVGeo:new THREE.BoxGeometry(.07,.31,.045)
    };
  }

  setFloorResolver(fn) {
    this.floorResolver = fn;
  }

  setEnvironment(collisionWorld, train) {
    this.collisionWorld = collisionWorld;
    this.train = train;
  }

  itemOffset(type) {
    if (type === 'Coal') return .28;
    if (type === 'Scrap Metal') return .22;
    if (type === 'Ammo') return .17;
    return .20;
  }

  itemRadius(type) {
    if (type === 'Coal') return .31;
    if (type === 'Scrap Metal') return .34;
    return .30;
  }

  surfaceAt(position, referenceY = null) {
    const worldFloor = this.floorResolver ? this.floorResolver(position) : 0.12;
    const trainFloor = this.train?.deckFloorAtXZ?.(position);
    const nearTrainHeight = referenceY == null || Math.abs(referenceY - (trainFloor ?? 999)) < 1.35;
    if (trainFloor != null && nearTrainHeight && trainFloor >= worldFloor - .05) {
      return { type: 'train', y: trainFloor };
    }
    return { type: 'world', y: worldFloor };
  }

  isPlacementClear(position, type, surface) {
    const radius = this.itemRadius(type) * .82;
    const height = Math.max(.26, this.itemOffset(type) * 1.85);
    const probe = position.clone();
    probe.y = surface.y + .035;
    if (this.collisionWorld && !this.collisionWorld.isPositionClear(probe, radius, height)) return false;
    if (this.train?.isPlacementClear && !this.train.isPlacementClear(probe, radius, height, surface.type === 'train')) return false;
    return true;
  }

  findSafePlacement(origin, type, referenceY = null) {
    const candidates = [[0,0]];
    for (const radius of [.4,.8,1.2,1.8,2.5,3.5,5,7,10,12]) {
      const steps = radius < 2 ? 8 : 16;
      for (let i=0;i<steps;i++) {
        const a = i / steps * Math.PI * 2;
        candidates.push([Math.cos(a)*radius, Math.sin(a)*radius]);
      }
    }
    for (const [dx,dz] of candidates) {
      const p = origin.clone();
      p.x += dx; p.z += dz;
      const surface = this.surfaceAt(p, referenceY ?? origin.y);
      p.y = surface.y + this.itemOffset(type);
      if (this.isPlacementClear(p, type, surface)) return { position:p, surface };
    }

    // Never force an item into unchecked geometry. If the local area is completely sealed,
    // callers can safely skip/restore the item instead of creating an embedded pickup.
    return null;
  }

  attachToSurface(item, surface) {
    item.updateWorldMatrix(true, false);
    if (surface.type === 'train' && this.train) this.train.group.attach(item);
    else this.scene.attach(item);
    item.userData.surface = surface.type;
    item.userData.baseY = item.position.y;
  }

  spawn(type, position, meta = {}) {
    const group = new THREE.Group();
    const offset = this.itemOffset(type);
    const A = this.sharedAssets;
    const M = A.materials;

    let label = ({'Coal':'Уголь','Scrap Metal':'Металлолом','Medkit':'Аптечка','Ammo':'Патроны'})[type] || type;
    if (type === 'Coal') {
      const mesh = new THREE.Mesh(A.coalGeo, M.coal);
      mesh.scale.set(1.2,.8,1);
      group.add(mesh);
    } else if (type === 'Scrap Metal') {
      const bar1 = new THREE.Mesh(A.scrapGeo, M.scrap);
      const bar2 = new THREE.Mesh(A.scrapGeo, M.scrap); bar2.rotation.y=Math.PI/2; bar2.position.y=.12;
      group.add(bar1,bar2);
    } else if (type === 'Ammo') {
      const box = new THREE.Mesh(A.ammoBoxGeo, M.ammoBox);
      const band = new THREE.Mesh(A.ammoBandGeo, M.ammoBand);
      group.add(box,band);
      const ammoNames={revolver:'револьвера',shotgun:'дробовика',rifle:'винтовки'};
      label=meta.weaponType?`Патроны для ${ammoNames[meta.weaponType]||'оружия'}`:'Коробка патронов';
    } else {
      const box = new THREE.Mesh(A.medkitGeo, M.medkit);
      const h = new THREE.Mesh(A.medCrossHGeo, M.medCross);
      const v = new THREE.Mesh(A.medCrossVGeo, M.medCross);
      h.position.z=.232; v.position.z=.232;
      group.add(box,h,v);
    }

    group.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.userData.pickupRoot = group;
      }
    });
    group.userData = {
      type,
      label,
      weaponType: meta.weaponType || null,
      ammoAmount: meta.ammoAmount || 12,
      baseY: 0,
      phase: Math.random() * Math.PI * 2,
      carried: false,
      offset,
      surface: 'world'
    };
    this.scene.add(group);
    this.items.push(group);

    const safe = this.findSafePlacement(position.clone(), type, position.y);
    if (!safe) {
      this.scene.remove(group);
      this.items = this.items.filter(i => i !== group);
      return null;
    }
    group.position.copy(safe.position);
    group.userData.baseY = group.position.y;
    this.attachToSurface(group, safe.surface);
    return group;
  }

  update(dt, time, player = null) {
    if (player?.carriedItem) this.updateCarried(player);
    this._visibilityTimer-=dt;
    const refreshVisibility=Boolean(player&&this._visibilityTimer<=0);
    if(refreshVisibility)this._visibilityTimer=.24;
    for (const item of this.items) {
      if (item.userData.carried){item.visible=true;continue;}
      if(refreshVisibility){item.getWorldPosition(this._itemWorld);item.visible=this._itemWorld.distanceToSquared(player.position)<=this._visibleDistanceSq;}
      if(!item.visible)continue;
      item.rotation.y += dt * .7;
      item.position.y = item.userData.baseY + Math.sin(time * 2 + item.userData.phase) * .025;
    }
  }

  updateCarried(player) {
    const item = player.carriedItem;
    if (!item || item.parent !== player.camera) return;

    const targetWorld=this._carryTarget.copy(this._carryDesired);player.camera.localToWorld(targetWorld);
    const cameraWorld=player.camera.getWorldPosition(this._carryCamera);
    const extra=this.train?.getRaycastMeshes?.()||[];
    const hit=this.collisionWorld?.raycastSegment(cameraWorld,targetWorld,extra);
    const finalWorld=this._carryFinal.copy(targetWorld);
    if(hit){
      const dir=this._carryDir.subVectors(targetWorld,cameraWorld),fullDistance=dir.length();
      if(fullDistance>.001){dir.normalize();const safeDistance=THREE.MathUtils.clamp(hit.distance-this.itemRadius(item.userData.type)-.06,0,fullDistance);finalWorld.copy(cameraWorld).addScaledVector(dir,safeDistance);}
    }
    item.position.copy(finalWorld);player.camera.worldToLocal(item.position);
    item.rotation.set(.15, .4, .1);
  }

  worldMeshes() {
    const meshes = [];
    for (const item of this.items) {
      if (item.userData.carried || !item.visible) continue;
      item.traverse(o => o.isMesh && meshes.push(o));
    }
    return meshes;
  }

  carry(item, player) {
    if (!item || player.carriedItem || item.userData.type === 'Ammo') return false;
    item.userData.carried = true;item.visible=true;
    item.userData.surface = 'carried';
    player.carriedItem = item;
    player.camera.attach(item);
    item.position.set(-.06, -.60, -.86);
    item.rotation.set(.15, .4, .1);
    item.scale.setScalar(.92);
    this.updateCarried(player);
    return true;
  }

  findDropPlacement(player, item) {
    const forward = new THREE.Vector3();
    player.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0,0,-1);
    forward.normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const cameraWorld = player.camera.getWorldPosition(new THREE.Vector3());
    const distances = [1.15, .9, .65, .4, .15];
    const sides = [0, .42, -.42, .72, -.72];

    for (const d of distances) {
      for (const side of sides) {
        const candidate = player.position.clone().addScaledVector(forward,d).addScaledVector(right,side);
        const surface = this.surfaceAt(candidate, player.position.y);
        candidate.y = surface.y + item.userData.offset;
        if (!this.isPlacementClear(candidate, item.userData.type, surface)) continue;

        const sightTarget = candidate.clone();
        sightTarget.y += .12;
        const blocker = this.collisionWorld?.raycastSegment(cameraWorld, sightTarget, this.train?.getRaycastMeshes?.() || []);
        if (blocker && blocker.distance < cameraWorld.distanceTo(sightTarget) - .18) continue;
        return { position:candidate, surface };
      }
    }

    const fallback = player.position.clone();
    const surface = this.surfaceAt(fallback, player.position.y);
    fallback.y = surface.y + item.userData.offset;
    if (this.isPlacementClear(fallback, item.userData.type, surface)) return { position:fallback, surface };
    return null;
  }

  dropCarried(player) {
    const item = player.carriedItem;
    if (!item) return false;

    const placement = this.findDropPlacement(player, item);
    if (!placement) return false;
    this.scene.attach(item);
    item.scale.setScalar(1);
    item.userData.carried = false;
    player.carriedItem = null;
    item.position.copy(placement.position);
    item.rotation.set(0, Math.random() * Math.PI, 0);
    this.attachToSurface(item, placement.surface);
    return true;
  }

  stowCarried(player) {
    const item = player.carriedItem;
    if (!item) return false;
    const type = item.userData.type;
    if (type === 'Coal') player.inventory.coal++;
    else if (type === 'Scrap Metal') player.inventory.scrap++;
    else if (type === 'Medkit') player.inventory.medkit++;
    else return false;
    this.removeItem(item);
    player.carriedItem = null;
    return true;
  }

  takeStored(type, player) {
    if (player.carriedItem) return false;
    const key = type === 'Coal' ? 'coal' : type === 'Scrap Metal' ? 'scrap' : 'medkit';
    if ((player.inventory[key] || 0) <= 0) return false;
    player.inventory[key]--;
    const item = this.spawn(type, player.position.clone().add(new THREE.Vector3(0,.3,0)));
    if (!item) {
      player.inventory[key]++;
      return false;
    }
    if (!this.carry(item, player)) {
      this.removeItem(item);
      player.inventory[key]++;
      return false;
    }
    return true;
  }

  consumeCarried(player, type) {
    const item = player.carriedItem;
    if (!item || item.userData.type !== type) return false;
    this.removeItem(item);
    player.carriedItem = null;
    return true;
  }

  collect(item, player) {
    return this.carry(item, player);
  }

  collectAmmo(item, player, amount = null) {
    if (!item || item.userData.type !== 'Ammo') return false;
    const ammoAmount = amount ?? item.userData.ammoAmount ?? 12;
    const weaponType = item.userData.weaponType || 'auto';
    if (!player.addAmmo?.(weaponType, ammoAmount)) return false;
    this.removeItem(item);
    return true;
  }

  removeItem(item) {
    if (!item) return;
    if (item.parent) item.parent.remove(item);
    this.items = this.items.filter(i => i !== item);
  }
}

window.ItemSystem = ItemSystem;
