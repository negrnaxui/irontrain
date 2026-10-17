class TutorialSystem {
  constructor(scene, camera, player, train, economy, ui, refs = {}) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.train = train;
    this.economy = economy;
    this.ui = ui;
    this.refs = refs;
    this.started = false;
    this.completed = false;
    this.coalLoaded = false;
    this.stage = '';
    this.hintsShown = new Set();
    this.time = 0;
    this.marker = this.createMarker();
    this.marker.visible = false;
    this.scene.add(this.marker);
  }

  createMarker() {
    const group = new THREE.Group();
    const brass = new THREE.MeshStandardMaterial({
      color: 0xd9a34d,
      emissive: 0x8b4c12,
      emissiveIntensity: 1.35,
      roughness: .38,
      metalness: .72,
      depthTest: true,
      depthWrite: true
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x3a2b1d,
      emissive: 0x3a2109,
      emissiveIntensity: .55,
      roughness: .62,
      metalness: .72,
      depthTest: true,
      depthWrite: true
    });
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(.22, 0), brass);
    diamond.scale.set(1, 1.35, 1);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.31, .035, 7, 18), dark);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -.02;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .34, 6), brass);
    stem.position.y = -.38;
    group.add(diamond, ring, stem);
    group.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      o.userData.ignoreRaycast = true;
      o.userData.noShadow = true;
      o.frustumCulled = false;
    });
    group.userData.target = null;
    group.userData.offset = new THREE.Vector3();
    return group;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.ui.showIntro?.('СТАРТОВЫЙ ПОРТ', '0 КМ', 'Получите дорожные кредиты и подготовьте локомотив.', 3800);
    setTimeout(() => { if (this.started && !this.completed) { const t=this.player.getSlot1WeaponType?.()||'shovel'; const label=this.player.weapons?.[t]?.label||'ЛОПАТА'; this.hintOnce('starterMelee', `[1] ${label} — оружие ближнего боя`, 2800); } }, 2100);
    this.refreshObjective(true);
  }

  notifyCoalLoaded() {
    this.coalLoaded = true;
    this.refreshObjective(true);
  }

  hintOnce(id, text, duration = 2600) {
    if (this.hintsShown.has(id)) return;
    this.hintsShown.add(id);
    this.economy?.showToast?.(text, duration);
  }

  resolveObjectPosition(object, offset = null) {
    if (!object?.getWorldPosition) return null;
    const p = object.getWorldPosition(new THREE.Vector3());
    if (offset) p.add(offset);
    return p;
  }

  setStage(stage, text, target, options = {}) {
    const nextHint=options.hint||'';
    const changed = stage !== this.stage || text !== this.currentText || target !== this.currentTarget || nextHint !== this.currentHint;
    this.stage = stage;
    this.currentText = text;
    this.currentTarget = target || null;
    this.currentOffset = options.offset?.clone?.() || new THREE.Vector3(0, .9, 0);
    this.currentHint = nextHint;
    if (changed || options.force) this.ui.setObjective?.(text, '', this.currentHint);
  }

  refreshObjective(force = false) {
    if (!this.started || this.completed) return;

    const distanceKm = Math.max(0, this.train.group.position.z / 100);
    if (distanceKm >= .25) {
      this.complete();
      return;
    }

    if (!this.economy.starterClaimed) {
      this.setStage('capital', 'Получите дорожное снабжение', this.refs.supplyClerk, {
        offset: new THREE.Vector3(0, 2.05, 0),
        hint: 'Найдите снабженца в стартовом порту',
        force
      });
      return;
    }

    this.hintOnce('armoryOptional', 'Оружие можно купить в оружейной, но это необязательно.', 3300);

    const coalBought = (this.economy.purchaseCounts?.Coal || 0) > 0;
    const coalPrice = this.economy.getProductPrice?.('startGeneral','coal') ?? 12;
    const emergencyStartFuel = !coalBought && this.player.money < coalPrice;
    if (!coalBought && !emergencyStartFuel) {
      this.setStage('buyCoal', 'Купите уголь для локомотива', this.refs.startGeneral, {
        offset: new THREE.Vector3(0, 2.0, 0),
        hint: 'Склад снабжения находится рядом со снабженцем',
        force
      });
      return;
    }
    if (emergencyStartFuel) this.hintOnce('noCoalMoney', 'Кредитов на уголь не осталось. В топке есть аварийный стартовый запас.', 3600);

    if (!this.coalLoaded && !emergencyStartFuel) {
      const holdingCoal = this.player.carriedItem?.userData?.type === 'Coal';
      const trainPos = this.train.group.getWorldPosition(new THREE.Vector3());
      const horizontalDistance = Math.hypot(this.player.position.x - trainPos.x, this.player.position.z - trainPos.z);

      if (holdingCoal) this.hintOnce('dropCoal', '[Q] ПОЛОЖИТЬ / БРОСИТЬ ПРЕДМЕТ', 2200);

      if (holdingCoal && horizontalDistance < 9.5) {
        const fireHint = this.train.fireboxOpen ? '[E] Загрузите уголь' : '[E] Откройте топку';
        this.setStage('loadCoal', 'Загрузите уголь в топку', this.refs.firebox, {
          offset: new THREE.Vector3(0, .8, 0),
          hint: fireHint,
          force
        });
        if (!this.train.fireboxOpen) this.hintOnce('openFirebox', '[E] ОТКРЫТЬ ТОПКУ', 2200);
      } else if (!holdingCoal && this.player.inventory.coal > 0) {
        this.setStage('retrieveCoal', 'Достаньте уголь из грузового хранилища', this.refs.storage || this.refs.train, {
          offset: new THREE.Vector3(0, .8, 0),
          hint: '[E] Достать уголь',
          force
        });
      } else {
        this.setStage('carryCoal', 'Отнесите уголь к локомотиву', this.refs.train, {
          offset: new THREE.Vector3(0, 5.8, -1.8),
          hint: holdingCoal ? 'Несите уголь к кабине машиниста' : 'Подберите купленный уголь у торговой стойки',
          force
        });
        if (!holdingCoal) this.hintOnce('pickupCoal', '[E] ВЗЯТЬ КУПЛЕННЫЙ УГОЛЬ', 2400);
      }
      return;
    }

    if (this.train.brake > .5) {
      this.setStage('brake', 'Отпустите тормоз', this.refs.brake, {
        offset: new THREE.Vector3(0, .65, 0),
        hint: '[E] Отпустить тормоз',
        force
      });
      return;
    }

    if (this.train.throttle < .25) {
      this.setStage('throttle', 'Установите тягу минимум на 25%', this.refs.throttle, {
        offset: new THREE.Vector3(0, .75, 0),
        hint: '[E] Увеличить тягу',
        force
      });
      return;
    }

    this.setStage('depart', 'Покиньте стартовый порт', this.refs.train, {
      offset: new THREE.Vector3(0, 6.0, 2.4),
      hint: 'Поезд готов к отправлению',
      force
    });
  }

  complete() {
    if (this.completed) return;
    this.completed = true;
    this.marker.visible = false;
    this.ui.clearObjective?.();
    this.economy?.showToast?.('ПУТЕШЕСТВИЕ НАЧАЛОСЬ', 3000);
  }

  updateMarker(dt) {
    if (this.completed || !this.currentTarget) {
      this.marker.visible = false;
      return;
    }

    const target = this.resolveObjectPosition(this.currentTarget, this.currentOffset);
    if (!target) {
      this.marker.visible = false;
      return;
    }

    const distance = this.player.position.distanceTo(target);
    const visible = distance <= 62;
    this.marker.visible = visible;
    this.ui.updateObjectiveDistance?.(distance);
    if (!visible) return;

    this.time += dt;
    target.y += Math.sin(this.time * 2.7) * .08;
    this.marker.position.lerp(target, Math.min(1, dt * 12));
    this.marker.rotation.y += dt * .8;
    const pulse = 1 + Math.sin(this.time * 4.2) * .06;
    this.marker.scale.setScalar(pulse);
  }

  update(dt) {
    if (!this.started || this.completed) return;
    this.refreshObjective(false);
    this.updateMarker(dt);
  }
}

window.TutorialSystem = TutorialSystem;
