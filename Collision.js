class CollisionWorld {
  constructor(cellSize = 32) {
    this.colliders = [];
    this.raycastMeshes = [];
    this.floorRects = [];
    this.raycaster = new THREE.Raycaster();

    // Static broad-phase grid. The route is ~4 km long, so scanning every collider on
    // every player/enemy movement was one of the most expensive CPU paths in the game.
    // Objects are registered in all cells touched by their AABB and queries only inspect
    // the few cells around the player/ray segment.
    this.cellSize = cellSize;
    this.colliderGrid = new Map();
    this.raycastGrid = new Map();
    this.floorGrid = new Map();
    this.raycastMeta = new Map();
    this._querySet = new Set();
    this._raySet = new Set();
    this._rayArray = [];
    this._tmpV2 = new THREE.Vector2(0, 0);
    this._tmpDir = new THREE.Vector3();
    this._tmpFrom = new THREE.Vector3();
    this._tmpTo = new THREE.Vector3();
  }

  _cell(v) { return Math.floor(v / this.cellSize); }
  _key(x, z) { return `${x},${z}`; }
  _keysForBounds(minX, maxX, minZ, maxZ) {
    const keys = [];
    const x0 = this._cell(minX), x1 = this._cell(maxX);
    const z0 = this._cell(minZ), z1 = this._cell(maxZ);
    for (let x=x0; x<=x1; x++) for (let z=z0; z<=z1; z++) keys.push(this._key(x,z));
    return keys;
  }
  _addToGrid(grid, key, value) {
    let bucket = grid.get(key);
    if (!bucket) { bucket = []; grid.set(key, bucket); }
    bucket.push(value);
  }
  _removeFromGrid(grid, keys, value) {
    if (!keys) return;
    for (const key of keys) {
      const bucket = grid.get(key); if (!bucket) continue;
      const i = bucket.indexOf(value); if (i >= 0) bucket.splice(i,1);
      if (!bucket.length) grid.delete(key);
    }
  }
  _indexCollider(c) {
    const b = c.box;
    c.gridKeys = this._keysForBounds(b.min.x,b.max.x,b.min.z,b.max.z);
    for (const key of c.gridKeys) this._addToGrid(this.colliderGrid,key,c);
  }
  _indexRaycast(mesh) {
    mesh.updateWorldMatrix(true,false);
    const box = new THREE.Box3().setFromObject(mesh);
    const keys = this._keysForBounds(box.min.x,box.max.x,box.min.z,box.max.z);
    const meta = {mesh,box,keys};
    this.raycastMeta.set(mesh,meta);
    for (const key of keys) this._addToGrid(this.raycastGrid,key,mesh);
    return meta;
  }

  addSolid(mesh, {
    collide = true,
    raycast = true,
    padding = 0,
    walkableTop = false,
    tag = '',
    collisionBox = null
  } = {}) {
    if (!mesh) return mesh;
    mesh.updateWorldMatrix(true, false);
    if (collide) {
      const box = collisionBox ? collisionBox.clone() : new THREE.Box3().setFromObject(mesh);
      if (padding) box.expandByScalar(padding);
      const c = { mesh, box, walkableTop, tag, gridKeys:null };
      this.colliders.push(c);
      this._indexCollider(c);
    }
    if (raycast && mesh.isMesh && !this.raycastMeta.has(mesh)) {
      this.raycastMeshes.push(mesh);
      this._indexRaycast(mesh);
    }
    mesh.userData.worldSolid = true;
    if (tag) mesh.userData.collisionTag = tag;
    return mesh;
  }

  refreshSolid(mesh) {
    if (!mesh) return false;
    mesh.updateWorldMatrix(true, false);
    let refreshed = false;
    for (const c of this.colliders) {
      if (c.mesh !== mesh) continue;
      this._removeFromGrid(this.colliderGrid,c.gridKeys,c);
      c.box.setFromObject(mesh);
      this._indexCollider(c);
      refreshed = true;
    }
    const rm = this.raycastMeta.get(mesh);
    if (rm) {
      this._removeFromGrid(this.raycastGrid,rm.keys,mesh);
      rm.box.setFromObject(mesh);
      rm.keys=this._keysForBounds(rm.box.min.x,rm.box.max.x,rm.box.min.z,rm.box.max.z);
      for (const key of rm.keys) this._addToGrid(this.raycastGrid,key,mesh);
      refreshed = true;
    }
    return refreshed;
  }

  addFloorRect(minX, maxX, minZ, maxZ, y, tag = '') {
    const f={ minX, maxX, minZ, maxZ, y, tag, gridKeys:null };
    this.floorRects.push(f);
    f.gridKeys=this._keysForBounds(minX,maxX,minZ,maxZ);
    for(const key of f.gridKeys)this._addToGrid(this.floorGrid,key,f);
  }

  _queryGrid(grid,minX,maxX,minZ,maxZ,set=this._querySet) {
    set.clear();
    const x0=this._cell(minX),x1=this._cell(maxX),z0=this._cell(minZ),z1=this._cell(maxZ);
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
      const bucket=grid.get(this._key(x,z));if(!bucket)continue;for(const v of bucket)set.add(v);
    }
    return set;
  }
  _arrayFromSet(set){const arr=this._rayArray;arr.length=0;for(const v of set)arr.push(v);return arr;}
  _nearbyColliders(position,radius=.5) {
    return this._queryGrid(this.colliderGrid,position.x-radius,position.x+radius,position.z-radius,position.z+radius,this._querySet);
  }

  floorSurfaceAt(position, currentY = null, maxStep = Infinity) {
    let best = { y: 0.12, tag: 'ground' };
    const floorSet=this._queryGrid(this.floorGrid,position.x,position.x,position.z,position.z,this._querySet);
    for (const f of floorSet) {
      if (position.x < f.minX || position.x > f.maxX || position.z < f.minZ || position.z > f.maxZ) continue;
      if (currentY != null && f.y > currentY + maxStep + 0.001) continue;
      if (f.y > best.y) best = { y: f.y, tag: f.tag || 'floor' };
    }
    // floorSet is no longer needed after the loop above, so the reusable set can be reused.
    for (const c of this._nearbyColliders(position,.08)) {
      if(!c.walkableTop)continue;
      const b = c.box, margin = 0.05;
      if (position.x < b.min.x + margin || position.x > b.max.x - margin || position.z < b.min.z + margin || position.z > b.max.z - margin) continue;
      if (currentY != null && b.max.y > currentY + maxStep + 0.001) continue;
      if (b.max.y > best.y) best = { y:b.max.y, tag:c.tag || 'object-top' };
    }
    return best;
  }

  floorHeightAt(position, currentY = null, maxStep = Infinity) {
    let bestY=.12;
    const floorSet=this._queryGrid(this.floorGrid,position.x,position.x,position.z,position.z,this._querySet);
    for(const f of floorSet){
      if(position.x<f.minX||position.x>f.maxX||position.z<f.minZ||position.z>f.maxZ)continue;
      if(currentY!=null&&f.y>currentY+maxStep+.001)continue;
      if(f.y>bestY)bestY=f.y;
    }
    for(const c of this._nearbyColliders(position,.08)){if(!c.walkableTop)continue;const b=c.box,margin=.05;if(position.x<b.min.x+margin||position.x>b.max.x-margin||position.z<b.min.z+margin||position.z>b.max.z-margin)continue;if(currentY!=null&&b.max.y>currentY+maxStep+.001)continue;if(b.max.y>bestY)bestY=b.max.y;}
    return bestY;
  }

  circleIntersectsBox(position, radius, height, box) {
    if (position.y + height <= box.min.y + 0.02 || position.y >= box.max.y - 0.02) return false;
    const nx = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
    const nz = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);
    const dx = position.x - nx, dz = position.z - nz;
    return dx * dx + dz * dz < radius * radius;
  }

  isPositionClear(position, radius = 0.28, height = 0.55) {
    for (const c of this._nearbyColliders(position,radius+.08)) {
      if (this.circleIntersectsBox(position, radius, height, c.box)) return false;
    }
    return true;
  }

  resolveCircle(position, radius = 0.34, height = 1.72, maxStep = 0.45) {
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      const nearby=this._nearbyColliders(position,radius+.12);
      for (const c of nearby) {
        const b = c.box;
        if (c.walkableTop && position.y >= b.max.y - maxStep - 0.03) continue;
        if (position.y + height < b.min.y + 0.03 || position.y > b.max.y - 0.03) continue;
        const nx = THREE.MathUtils.clamp(position.x, b.min.x, b.max.x);
        const nz = THREE.MathUtils.clamp(position.z, b.min.z, b.max.z);
        let dx = position.x - nx, dz = position.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = radius - d + 0.001;
          position.x += (dx / d) * push; position.z += (dz / d) * push;
        } else {
          const left = Math.abs(position.x - b.min.x), right = Math.abs(b.max.x - position.x);
          const back = Math.abs(position.z - b.min.z), front = Math.abs(b.max.z - position.z);
          const m = Math.min(left, right, back, front);
          if (m === left) position.x = b.min.x - radius - 0.001;
          else if (m === right) position.x = b.max.x + radius + 0.001;
          else if (m === back) position.z = b.min.z - radius - 0.001;
          else position.z = b.max.z + radius + 0.001;
        }
        moved = true;
      }
      if (!moved) break;
    }
    return position;
  }

  nearbyRaycastMeshes(position, radius=12) {
    const set=this._queryGrid(this.raycastGrid,position.x-radius,position.x+radius,position.z-radius,position.z+radius,this._raySet);
    return Array.from(set);
  }

  _raycastSpatial(from,to,extraMeshes=[],farOverride=null) {
    const minX=Math.min(from.x,to.x)-.35,maxX=Math.max(from.x,to.x)+.35;
    const minZ=Math.min(from.z,to.z)-.35,maxZ=Math.max(from.z,to.z)+.35;
    const set=this._queryGrid(this.raycastGrid,minX,maxX,minZ,maxZ,this._raySet);
    for(const m of extraMeshes)if(m)set.add(m);
    const dir=this._tmpDir.subVectors(to,from);const distance=dir.length();
    if(distance<=1e-4)return null;
    dir.normalize();this.raycaster.set(from,dir);this.raycaster.near=.001;this.raycaster.far=farOverride==null?distance:Math.min(distance,farOverride);
    return this.raycaster.intersectObjects(this._arrayFromSet(set),false)[0]||null;
  }

  raycastFromCamera(camera, meshes, maxDistance = 60) {
    this.raycaster.setFromCamera(this._tmpV2, camera);
    this.raycaster.near = 0; this.raycaster.far = maxDistance;
    // If the caller supplied the whole static world list, broad-phase it first.
    if(!meshes||meshes===this.raycastMeshes){
      const from=camera.getWorldPosition(this._tmpFrom),dir=camera.getWorldDirection(this._tmpDir);
      const to=this._tmpTo.copy(from).addScaledVector(dir,maxDistance);
      const set=this._queryGrid(this.raycastGrid,Math.min(from.x,to.x)-.4,Math.max(from.x,to.x)+.4,Math.min(from.z,to.z)-.4,Math.max(from.z,to.z)+.4,this._raySet);
      return this.raycaster.intersectObjects(this._arrayFromSet(set),false)[0]||null;
    }
    const unique=this._raySet;unique.clear();for(const m of meshes)if(m)unique.add(m);
    return this.raycaster.intersectObjects(this._arrayFromSet(unique), false)[0] || null;
  }

  raycastSegment(from, to, extraMeshes = []) {
    return this._raycastSpatial(from,to,extraMeshes);
  }

  isLineBlocked(from, to, extraMeshes = []) {
    const dir=this._tmpDir.subVectors(to,from),distance=dir.length();
    if(distance<=.08)return false;
    const minX=Math.min(from.x,to.x)-.25,maxX=Math.max(from.x,to.x)+.25;
    const minZ=Math.min(from.z,to.z)-.25,maxZ=Math.max(from.z,to.z)+.25;
    const set=this._queryGrid(this.raycastGrid,minX,maxX,minZ,maxZ,this._raySet);for(const m of extraMeshes)if(m)set.add(m);
    dir.normalize();this.raycaster.set(from,dir);this.raycaster.near=.02;this.raycaster.far=Math.max(0,distance-.12);
    return this.raycaster.intersectObjects(this._arrayFromSet(set),false).length>0;
  }
}

window.CollisionWorld = CollisionWorld;
