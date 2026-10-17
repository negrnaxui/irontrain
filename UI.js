class GameUI {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      hp: document.getElementById('hp'),
      hpBar: document.getElementById('hpBar'),
      integrity: document.getElementById('integrity'),
      integrityBar: document.getElementById('integrityBar'),
      coal: document.getElementById('coal'),
      steam: document.getElementById('steam'),
      steamState: document.getElementById('steamState'),
      steamBar: document.getElementById('steamBar'),
      speed: document.getElementById('speed'),
      throttle: document.getElementById('throttle'),
      brake: document.getElementById('brake'),
      ammo: document.getElementById('ammo'),
      heldItem: document.getElementById('heldItem'),
      invCoal: document.getElementById('invCoal'),
      invScrap: document.getElementById('invScrap'),
      invMedkit: document.getElementById('invMedkit'),
      flashlight: document.getElementById('flashlight'),
      dayPhase: document.getElementById('dayPhase'),
      dayTime: document.getElementById('dayTime'),
      money: document.getElementById('money'),
      distance: document.getElementById('distance'),
      weaponName: document.getElementById('weaponName'),
      interaction: document.getElementById('interaction'),
      warning: document.getElementById('warning'),
      damageFlash: document.getElementById('damageFlash'),
      classEffectFlash: document.getElementById('classEffectFlash'),
      classStatus: document.getElementById('classStatus'),
      death: document.getElementById('deathScreen'),
      trainDestroyed: document.getElementById('trainDestroyedScreen'),
      complete: document.getElementById('completeScreen'),
      objectivePanel: document.getElementById('objectivePanel'),
      objectiveText: document.getElementById('objectiveText'),
      objectiveDistance: document.getElementById('objectiveDistance'),
      objectiveHint: document.getElementById('objectiveHint'),
      introBanner: document.getElementById('introBanner'),
      introTitle: document.getElementById('introTitle'),
      introKm: document.getElementById('introKm'),
      introText: document.getElementById('introText')
    };
    this.introTimer = null;
    this.classStatusTimer = null;
    this.classEffectTimer = null;
    this._cache = new Map();
    this._lastPrompt = null;
    this._lastWarnings = null;
  }

  showHUD() { this.el.hud.classList.remove('hidden'); }

  setText(el,value,key=null){if(!el)return;const k=key||el.id||el;if(this._cache.get(k)===value)return;this._cache.set(k,value);el.textContent=value;}
  setStyle(el,prop,value,key){if(!el)return;const k=key||`${el.id}:${prop}`;if(this._cache.get(k)===value)return;this._cache.set(k,value);el.style[prop]=value;}

  update(player, train, dayNight = null) {
    const state = train.pressureState();
    this.setText(this.el.hp,String(Math.max(0,Math.round(player.hp))));
    this.setStyle(this.el.hpBar,'width',`${THREE.MathUtils.clamp(player.hp/Math.max(1,player.maxHp||100)*100,0,100)}%`,'hpBar:width');
    this.setText(this.el.integrity,`${Math.round(train.integrity)}%`);
    this.setStyle(this.el.integrityBar,'width',`${THREE.MathUtils.clamp(train.integrity,0,100)}%`,'integrityBar:width');
    this.setText(this.el.coal,`${Math.max(0,Math.floor(train.coalFuel))}`);
    this.setText(this.el.steam,`${Math.round(train.pressure)}%`);
    this.setText(this.el.steamState,({NORMAL:'НОРМА',HIGH:'ВЫСОКОЕ',CRITICAL:'КРИТИЧЕСКОЕ'})[state]||state);
    if(this.el.steamState.dataset.state!==state)this.el.steamState.dataset.state=state;
    this.setStyle(this.el.steamBar,'width',`${THREE.MathUtils.clamp(train.pressure/120*100,0,100)}%`,'steamBar:width');
    this.setText(this.el.speed,train.speed.toFixed(1));
    this.setText(this.el.throttle,`${Math.round(train.throttle*100)}%`);
    this.setText(this.el.brake,train.brake>.5?'ВКЛЮЧЁН':'ОТПУЩЕН');
    const weapon=player.weapon;this.setText(this.el.weaponName,weapon?.label||'ЛОПАТА');
    this.setText(this.el.ammo,player.isMeleeType?.(player.activeWeaponType)?'—':`${weapon.loaded} / ${weapon.reserve}`);
    this.setText(this.el.money,`${player.money}`);this.setText(this.el.distance,`${Math.max(0,train.group.position.z/100).toFixed(1)} КМ`);
    this.setText(this.el.heldItem,player.carriedItem?.userData?.label||'ПУСТО');this.setText(this.el.invCoal,String(player.inventory.coal));this.setText(this.el.invScrap,String(player.inventory.scrap));this.setText(this.el.invMedkit,String(player.inventory.medkit));this.setText(this.el.flashlight,player.flashlightOn?'ВКЛ':'ВЫКЛ');
    if(dayNight){this.setText(this.el.dayPhase,dayNight.label());if(this.el.dayPhase.dataset.phase!==dayNight.phase)this.el.dayPhase.dataset.phase=dayNight.phase;this.setText(this.el.dayTime,dayNight.getClockString());}
    const warnings=[];
    if(train.destroyed)warnings.push('⚠ ПОЕЗД УНИЧТОЖЕН');
    if(state==='CRITICAL')warnings.push('⚠ КРИТИЧЕСКОЕ ДАВЛЕНИЕ — ОТКРОЙТЕ КЛАПАН');else if(state==='HIGH')warnings.push('ВЫСОКОЕ ДАВЛЕНИЕ ПАРА');
    if(train.overheatActive)warnings.push('⚠ ПЕРЕГРЕВ КОТЛА — СБРОСЬТЕ ДАВЛЕНИЕ');if(train.leakActive)warnings.push('⚠ УТЕЧКА ПАРА');if(train.jammedActive)warnings.push('⚠ МЕХАНИЗМ ЗАКЛИНИЛО');if(train.integrity<35)warnings.push('⚠ НИЗКАЯ ПРОЧНОСТЬ ПОЕЗДА — ИСПОЛЬЗУЙТЕ МЕТАЛЛОЛОМ');if(train.coalFuel<=0)warnings.push('УГОЛЬ ЗАКОНЧИЛСЯ');if(train.safetyStopped)warnings.push('АВАРИЙНЫЙ ТОРМОЗ — ВЕРНИТЕСЬ В ПОЕЗД');if(dayNight?.nightWarningTimer>0)warnings.unshift('⚠ НОЧЬ — АКТИВНОСТЬ АВТОМАТОНОВ ВОЗРОСЛА');
    if(train.atStation){const stopName=train.currentStop?.name||'ОСТАНОВКА';warnings.push(train.departureUnlocked?`${stopName} — МОЖНО ПРОДОЛЖАТЬ ПУТЬ`:`${stopName} — ПОЕЗД ОСТАНОВЛЕН`);}
    const warningHtml=warnings.join('<br>');if(warningHtml!==this._lastWarnings){this._lastWarnings=warningHtml;this.el.warning.innerHTML=warningHtml;}
  }

  prompt(text = '') {
    if(text===this._lastPrompt)return;this._lastPrompt=text;
    this.el.interaction.textContent=text;this.el.interaction.classList.toggle('active',Boolean(text));
  }

  setObjective(text, distanceText = '', hint = '') {
    if (!this.el.objectivePanel) return;
    this.el.objectiveText.textContent = text || '';
    this.el.objectiveDistance.textContent = distanceText || '';
    this.el.objectiveHint.textContent = hint || '';
    this.el.objectiveHint.classList.toggle('hidden', !hint);
    this.el.objectivePanel.classList.remove('hidden');
  }

  updateObjectiveDistance(distance) {
    if (!this.el.objectiveDistance) return;
    if (!Number.isFinite(distance)) { this.el.objectiveDistance.textContent = ''; return; }
    this.el.objectiveDistance.textContent = `${Math.max(0, Math.round(distance))} м`;
  }

  clearObjective() {
    this.el.objectivePanel?.classList.add('hidden');
  }

  showIntro(title, km, text, duration = 3600) {
    if (!this.el.introBanner) return;
    this.el.introTitle.textContent = title || '';
    this.el.introKm.textContent = km || '';
    this.el.introText.textContent = text || '';
    this.el.introBanner.classList.remove('hidden');
    clearTimeout(this.introTimer);
    this.introTimer = setTimeout(() => this.el.introBanner?.classList.add('hidden'), duration);
  }

  flashDamage() {
    this.el.damageFlash.classList.add('active');
    clearTimeout(this.damageTimer);
    this.damageTimer = setTimeout(() => this.el.damageFlash.classList.remove('active'), 120);
  }

  flashClassEffect(type='lifesteal') {
    if (!this.el.classEffectFlash) return;
    this.el.classEffectFlash.dataset.type=type;
    this.el.classEffectFlash.classList.remove('active');
    void this.el.classEffectFlash.offsetWidth;
    this.el.classEffectFlash.classList.add('active');
    clearTimeout(this.classEffectTimer);
    this.classEffectTimer=setTimeout(()=>this.el.classEffectFlash?.classList.remove('active'),180);
  }

  showClassStatus(text,duration=1800) {
    if(!this.el.classStatus||!text)return;
    this.el.classStatus.textContent=text;this.el.classStatus.classList.add('active');
    clearTimeout(this.classStatusTimer);this.classStatusTimer=setTimeout(()=>this.el.classStatus?.classList.remove('active'),duration);
  }

  showDeath() {
    document.exitPointerLock?.();
    this.el.death.classList.remove('hidden');
  }

  showTrainDestroyed() {
    document.exitPointerLock?.();
    this.el.trainDestroyed?.classList.remove('hidden');
  }

  showComplete() {
    document.exitPointerLock?.();
    this.el.complete.classList.remove('hidden');
  }
}

window.GameUI = GameUI;
