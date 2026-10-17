(() => {
  window.__IRON_WASTES_ERRORS__ = [];
  window.addEventListener('error', e => window.__IRON_WASTES_ERRORS__.push(String(e.error?.stack || e.message || e.error)));
  window.addEventListener('unhandledrejection', e => window.__IRON_WASTES_ERRORS__.push(String(e.reason?.stack || e.reason)));

  if (!window.THREE) {
    const msg = document.querySelector('#startScreen p');
    if (msg) msg.textContent = 'Не удалось загрузить Three.js. Проверьте подключение к интернету и обновите страницу.';
    const btn = document.getElementById('startButton');
    if (btn) btn.disabled = true;
    return;
  }

  const gameEl = document.getElementById('game');
  const startScreen = document.getElementById('startScreen');
  const startButton = document.getElementById('startButton');
  const restartButtons = document.querySelectorAll('.restartButton');
  const difficultyButtons = document.querySelectorAll('.difficulty-btn');
  const difficultyDescription = document.getElementById('difficultyDescription');
  const newGameButton = document.getElementById('newGameButton');
  const classesButton = document.getElementById('classesButton');
  const settingsButton = document.getElementById('settingsButton');
  const aboutButton = document.getElementById('aboutButton');
  const exitButton = document.getElementById('exitButton');
  const openClassesFromNewGame = document.getElementById('openClassesFromNewGame');
  const mainMenuPanel = document.getElementById('mainMenuPanel');
  const newGamePanel = document.getElementById('newGamePanel');
  const classesPanel = document.getElementById('classesPanel');
  const settingsPanel = document.getElementById('settingsPanel');
  const aboutPanel = document.getElementById('aboutPanel');
  const classCards = document.getElementById('classCards');
  const classMarks = document.getElementById('classMarks');
  const menuMarksBadge = document.getElementById('menuMarksBadge');
  const selectedClassCard = document.getElementById('selectedClassCard');
  const menuSelectedSummary = document.getElementById('menuSelectedSummary');
  const cinematicToggle = document.getElementById('cinematicToggle');
  const grainToggle = document.getElementById('grainToggle');
  const replayIntroButton = document.getElementById('replayIntroButton');
  const skipIntroRow = document.getElementById('skipIntroRow');
  const skipIntroCheckbox = document.getElementById('skipIntroCheckbox');
  const DIFFICULTY_PRESETS = window.IronWastesDifficulty?.PRESETS || { normal:{ key:'normal', label:'НОРМАЛЬНАЯ', description:'Стандартный баланс.', starterCredits:120 } };
  const CLASS_SYSTEM = window.IronWastesClasses;
  let selectedDifficultyKey = window.IronWastesDifficulty?.savedKey?.() || 'normal';
  let selectedClassKey = CLASS_SYSTEM?.selectedKey?.() || 'machinist';

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const performanceGovernor = window.IronWastesPerformanceGovernor ? new IronWastesPerformanceGovernor(renderer) : null;
  if(!performanceGovernor) renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.15));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .9;
  gameEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x637078, 0.0092);

  const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, .05, 650);
  scene.add(camera);

  const hemi = new THREE.HemisphereLight(0x879dab, 0x2b241f, 1.05);
  scene.add(hemi);
  const visuals = new IronWastesEffects(renderer);
  const weather = new WeatherSystem(scene, camera);
  const dayNight = new DayNightCycle(scene, renderer, camera, hemi, weather);

  const collisions = new CollisionWorld();
  const worldArt = new WorldArtSystem(scene, collisions, visuals.materials, dayNight, visuals, weather);
  const ui = new GameUI();
  const items = new ItemSystem(scene);
  const train = new Train(scene, visuals);
  train.configureLightingQuality?.(dayNight.lightingQuality);
  const player = new Player(camera, renderer.domElement, ui);
  player.setCollisionWorld(collisions);
  const enemies = new EnemySystem(scene, items, collisions, train, visuals);
  const economy = new EconomySystem(player, items, train, ui);
  const portSafeZones = [
    {id:'start',name:'СТАРТОВЫЙ ПОРТ',x:0,z:0,halfX:58,halfZ:62},
    {id:'weapon',name:'ОРУЖЕЙНЫЙ ПОРТ',x:0,z:1000,halfX:58,halfZ:58},
    {id:'trade',name:'ТОРГОВЫЙ ПОРТ',x:0,z:2000,halfX:58,halfZ:58},
    {id:'settlement',name:'ПОРТ-ПОСЕЛЕНИЕ',x:0,z:3000,halfX:58,halfZ:58},
    {id:'industrial',name:'ПРОМЫШЛЕННЫЙ ПОРТ',x:0,z:4000,halfX:72,halfZ:78}
  ];
  enemies.setSafeZones(portSafeZones);

  let started = false;
  let elapsed = 0;
  let lastTime = performance.now();
  let completeShown = false;
  let completeSequenceStarted = false;
  let completeRewardGranted = false;
  let hackTarget = null, hackProgress = 0;
  const hackDuration = 1.45;
  let trainDestroyedShown = false;
  let introMode = false;
  let headlightRayTimer = 0;
  let interactionRayTimer=0,cachedInteractionHit=null;
  let hackAimTimer=0,cachedHackAim=null;
  const hackRaycaster=new THREE.Raycaster(),hackNdc=new THREE.Vector2(0,0);
  const headlightFrom=new THREE.Vector3(),headlightTo=new THREE.Vector3(),menuSmokePos=new THREE.Vector3(),menuSmokeVel=new THREE.Vector3();
  const interactionMeshes=[],hackMeshes=[],hackMeshSet=new Set();
  let debugFpsAccum = 0, debugFpsFrames = 0, debugFps = 0;
  let appliedPerformanceQuality='';
  // Must exist before buildWorld() runs: buildRailPort() creates signs during world construction.
  const portSignMaterialCache = new Map();
  const directionSignMaterialCache = new Map();
  const tutorialRefs = {};
  let tutorial = null;
  let worldPOI = null;

  function updateAtmosphere(stepDt, focus, channel='atmosphere') {
    let dt=stepDt;
    if(performanceGovernor){
      const interval=performanceGovernor.quality==='LOW'?1/30:(performanceGovernor.quality==='MEDIUM'?1/45:0);
      if(interval)dt=performanceGovernor.consume(channel,stepDt,interval);
    }
    if(!(dt>0))return false;
    dayNight.update(dt,focus);
    weather.setNightFactor?.(dayNight.nightFactor);
    weather.update(dt,focus);
    return true;
  }

  function setDifficultyUI(key, persist = true) {
    const config = window.IronWastesDifficulty?.get?.(key) || DIFFICULTY_PRESETS[key] || DIFFICULTY_PRESETS.normal;
    selectedDifficultyKey = config.key || 'normal';
    difficultyButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.difficulty === selectedDifficultyKey));
    if (difficultyDescription) difficultyDescription.textContent = config.description || '';
    if (persist) window.IronWastesDifficulty?.saveKey?.(selectedDifficultyKey);
    return config;
  }

  function applyDifficulty(key = selectedDifficultyKey) {
    const config = window.IronWastesDifficulty?.get?.(key) || DIFFICULTY_PRESETS[key] || DIFFICULTY_PRESETS.normal;
    selectedDifficultyKey = config.key || 'normal';
    player.applyDifficulty?.(config);
    train.applyDifficulty?.(config);
    enemies.applyDifficulty?.(config);
    economy.applyDifficulty?.(config);
    worldPOI?.applyDifficulty?.(config);
    window.IronWastesDifficulty?.saveKey?.(selectedDifficultyKey);
    window.__IRON_WASTES_DIFFICULTY__ = config;
    if (window.__IRON_WASTES__) window.__IRON_WASTES__.difficulty = config;
    return config;
  }


  function applyClass(key = selectedClassKey) {
    const config = CLASS_SYSTEM?.get?.(key) || {key:'machinist',label:'МАШИНИСТ',reloadMultiplier:1,fuelBurnMultiplier:1,repairMultiplier:1,starterCoalBonus:0};
    selectedClassKey = config.key || 'machinist';
    player.applyClass?.(config);
    train.applyClass?.(config);
    enemies.applyClass?.(config);
    economy.applyClass?.(config);
    worldPOI?.applyClass?.(config);
    CLASS_SYSTEM?.select?.(selectedClassKey);
    window.__IRON_WASTES_CLASS__ = config;
    if (window.__IRON_WASTES__) window.__IRON_WASTES__.playerClass = config;
    return config;
  }

  function classIconMarkup(type='gear') {
    const common='viewBox=\"0 0 64 64\" aria-hidden=\"true\"';
    const stroke='fill=\"none\" stroke=\"currentColor\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"';
    const map={
      gear:`<svg ${common}><circle cx=\"32\" cy=\"32\" r=\"11\" ${stroke}/><path d=\"M32 7v8M32 49v8M7 32h8M49 32h8M14 14l6 6M44 44l6 6M50 14l-6 6M20 44l-6 6\" ${stroke}/></svg>`,
      flame:`<svg ${common}><path d=\"M34 6c4 13-7 15-2 25 4-7 10-9 11-17 10 12 10 24 3 34-8 12-27 11-33-1C7 35 17 28 22 17c2 8 0 13 5 17-1-13 8-17 7-28z\" ${stroke}/></svg>`,
      wrench:`<svg ${common}><path d=\"M40 8a15 15 0 0 0-14 20L9 45l10 10 17-17A15 15 0 0 0 56 24l-10 8-8-8 8-10a15 15 0 0 0-6-6z\" ${stroke}/></svg>`,
      reticle:`<svg ${common}><circle cx=\"32\" cy=\"32\" r=\"16\" ${stroke}/><circle cx=\"32\" cy=\"32\" r=\"4\" ${stroke}/><path d=\"M32 5v12M32 47v12M5 32h12M47 32h12\" ${stroke}/></svg>`,
      mask:`<svg ${common}><path d=\"M16 15c11-8 27-5 32 5l-8 11 11 5-17 5-8 15-5-18-10-5 10-4z\" ${stroke}/><circle cx=\"29\" cy=\"27\" r=\"3\" fill=\"currentColor\"/></svg>`,
      scrap:`<svg ${common}><path d=\"M10 44l13-25 12 7 8-16 11 7-9 17 9 9-16 11-9-9-10 10z\" ${stroke}/><path d=\"M25 32l14 8\" ${stroke}/></svg>`,
      hammer:`<svg ${common}><path d=\"M13 14h31l8 9-8 9H31L18 56l-9-8 14-16H13z\" ${stroke}/></svg>`,
      vampire:`<svg ${common}><path d=\"M15 49L42 10l7 5-25 40z\" ${stroke}/><path d=\"M13 42l16 11M44 10l8 6\" ${stroke}/><path d=\"M49 37c0 7-7 12-7 17 0 4 3 7 7 7s7-3 7-7c0-5-7-10-7-17z\" fill=\"currentColor\" opacity=\".72\"/></svg>`,
      werewolf:`<svg ${common}><path d=\"M24 11a21 21 0 1 0 25 32A18 18 0 0 1 24 11z\" ${stroke}/><path d=\"M37 20L29 45M46 24L38 49M54 29L46 53\" ${stroke}/></svg>`,
      tesla:`<svg ${common}><path d=\"M34 5L17 34h13l-3 25 20-33H34z\" ${stroke}/><circle cx=\"32\" cy=\"32\" r=\"25\" ${stroke} opacity=\".55\"/></svg>`,
      ghost:`<svg ${common}><path d=\"M17 52V29c0-13 7-21 15-21s15 8 15 21v23l-7-6-8 7-8-7z\" ${stroke}/><circle cx=\"27\" cy=\"28\" r=\"2.5\" fill=\"currentColor\"/><circle cx=\"38\" cy=\"28\" r=\"2.5\" fill=\"currentColor\"/></svg>`,
      berserk:`<svg ${common}><path d=\"M14 52l14-19-9-8 12-15 8 15-7 8 18 19\" ${stroke}/><path d=\"M23 48h21\" ${stroke}/></svg>`,
      conductor:`<svg ${common}><path d=\"M12 45h40M17 45l4-20h22l4 20M24 25V13h16v12M20 54h24\" ${stroke}/><circle cx=\"26\" cy=\"35\" r=\"3\" fill=\"currentColor\"/><circle cx=\"39\" cy=\"35\" r=\"3\" fill=\"currentColor\"/></svg>`,
      robototech:`<svg ${common}><rect x=\"16\" y=\"14\" width=\"32\" height=\"28\" rx=\"7\" ${stroke}/><circle cx=\"26\" cy=\"28\" r=\"3\" fill=\"currentColor\"/><circle cx=\"38\" cy=\"28\" r=\"3\" fill=\"currentColor\"/><path d=\"M32 14V7M22 49l20-12M37 45l9 9\" ${stroke}/></svg>`
    };
    return map[type]||map.gear;
  }

  let menuAudioCtx=null;
  function menuClack(pitch=118, volume=.018) {
    try {
      const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
      menuAudioCtx=menuAudioCtx||new Ctx();const o=menuAudioCtx.createOscillator(),g=menuAudioCtx.createGain();
      o.type='square';o.frequency.setValueAtTime(pitch,menuAudioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(48,pitch*.55),menuAudioCtx.currentTime+.045);
      g.gain.setValueAtTime(volume,menuAudioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,menuAudioCtx.currentTime+.055);o.connect(g).connect(menuAudioCtx.destination);o.start();o.stop(menuAudioCtx.currentTime+.06);
    } catch(_) {}
  }

  function playRadioStoryCue(){
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
      const ctx=new Ctx(),master=ctx.createGain();master.gain.value=.13;master.connect(ctx.destination);const now=ctx.currentTime;
      const len=Math.floor(ctx.sampleRate*3.8),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(.32+.28*Math.sin(i*.021));
      const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),ng=ctx.createGain();src.buffer=buf;filter.type='bandpass';filter.frequency.value=1450;filter.Q.value=.9;ng.gain.setValueAtTime(.028,now);ng.gain.exponentialRampToValueAtTime(.003,now+3.7);src.connect(filter).connect(ng).connect(master);src.start(now);
      [410,520,410].forEach((f,i)=>{const o=ctx.createOscillator(),g=ctx.createGain(),t=now+.2+i*.75;o.type='square';o.frequency.value=f;g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(.018,t+.04);g.gain.exponentialRampToValueAtTime(.0001,t+.28);o.connect(g).connect(master);o.start(t);o.stop(t+.3);});
      setTimeout(()=>{try{ctx.close()}catch(_){}},4200);
    }catch(_){}
  }

  function hideMenuPanels() {
    [newGamePanel,classesPanel,settingsPanel,aboutPanel].forEach(el=>el?.classList.add('hidden'));
    mainMenuPanel?.classList.remove('hidden');
  }
  function showMenuPanel(panel) {
    mainMenuPanel?.classList.add('hidden');
    [newGamePanel,classesPanel,settingsPanel,aboutPanel].forEach(el=>el?.classList.add('hidden'));
    panel?.classList.remove('hidden');
    menuClack(132,.014);
  }
  function updateClassUI() {
    const cfg=CLASS_SYSTEM?.get?.(selectedClassKey)||{label:'МАШИНИСТ',iconType:'gear',tagline:'Сбалансированный путь',description:'Базовый класс экспедиции.'};
    const traits=[...(cfg.pros||[]).map(v=>`<span class=\"pro\">+ ${v}</span>`),...(cfg.cons||[]).map(v=>`<span class=\"con\">− ${v}</span>`)].join('');
    if(selectedClassCard) selectedClassCard.innerHTML=`<div class="class-icon">${classIconMarkup(cfg.iconType)}</div><h3>${cfg.label}</h3><small>${cfg.tagline||''}</small><p>${cfg.description||''}</p><div class="class-traits">${traits}</div>`;
    const marks=CLASS_SYSTEM?.marks?.()||0;
    if(classMarks)classMarks.textContent=`${marks} МАРОК`;if(menuMarksBadge)menuMarksBadge.textContent=`${marks} МАРОК`;
    const diff=(window.IronWastesDifficulty?.get?.(selectedDifficultyKey)||DIFFICULTY_PRESETS.normal);
    if(menuSelectedSummary)menuSelectedSummary.textContent=`${cfg.label} · ${diff.label}`;
  }
  function renderClassShop() {
    if(!classCards||!CLASS_SYSTEM)return;
    const owned=CLASS_SYSTEM.ownedSet(); const balance=CLASS_SYSTEM.marks();
    classCards.innerHTML='';
    Object.values(CLASS_SYSTEM.CLASSES).forEach(cfg=>{
      const isOwned=owned.has(cfg.key), selected=selectedClassKey===cfg.key;
      const card=document.createElement('article');card.className=`class-card${selected?' selected':''}${isOwned?'':' locked'}${cfg.rarity==='special'?' special':''}${cfg.rarity==='prestige'?' prestige':''}${cfg.rarity==='advanced'?' advanced':''}`;
      const action=isOwned?(selected?'ВЫБРАН':'ВЫБРАТЬ'):`КУПИТЬ — ${cfg.price} МАРОК`;
      const traits=[...(cfg.pros||[]).map(v=>`<span class="pro">+ ${v}</span>`),...(cfg.cons||[]).map(v=>`<span class="con">− ${v}</span>`)].join('');
      card.innerHTML=`<div class="class-top"><div><div class="class-symbol">${classIconMarkup(cfg.iconType)}</div><h3>${cfg.label}</h3><div class="tagline">${cfg.tagline}</div></div><div class="class-price ${isOwned?'owned-mark':''}">${isOwned?'КУПЛЕНО':cfg.price+' МАРОК'}</div></div><p>${cfg.description}</p><div class="class-traits">${traits}</div><button class="metal-button ${selected?'primary':'secondary'}" ${selected?'disabled':''}>${action}</button>`;
      card.querySelector('button').addEventListener('click',()=>{
        if(!CLASS_SYSTEM.isOwned(cfg.key)){
          const result=CLASS_SYSTEM.buy(cfg.key);if(!result.ok){economy.showToast?.('НЕДОСТАТОЧНО МАРОК',1500);menuClack(72,.02);return;}
          economy.showToast?.(`КЛАСС КУПЛЕН: ${cfg.label}`,1600);
        }
        CLASS_SYSTEM.select(cfg.key);selectedClassKey=cfg.key;applyClass(cfg.key);renderClassShop();updateClassUI();menuClack(156,.018);
      });
      classCards.appendChild(card);
    });
    if(classMarks)classMarks.textContent=`${balance} МАРОК`;
  }

  let cinematicEnabled = (()=>{try{return localStorage.getItem('iwMenuCinematic')!=='0'}catch(_){return true}})();
  let grainEnabled = (()=>{try{return localStorage.getItem('iwMenuGrain')!=='0'}catch(_){return true}})();
  function syncMenuSettings(){
    document.body.classList.toggle('menu-cinematic-off',!cinematicEnabled);document.body.classList.toggle('menu-grain-off',!grainEnabled);
    if(cinematicToggle)cinematicToggle.textContent=cinematicEnabled?'ВКЛ':'ВЫКЛ';if(grainToggle)grainToggle.textContent=grainEnabled?'ВКЛ':'ВЫКЛ';
  }

  buildWorld();
  worldPOI = new WorldPOISystem(scene, collisions, visuals.materials, items, dayNight, portSafeZones).build();
  items.setFloorResolver(pos => collisions.floorHeightAt(pos));
  items.setEnvironment(collisions, train);
  worldPOI.seedLoot();
  enemies.setEnvironmentSpawns(worldPOI.enemySpawnPoints());
  seedStationLootAndEnemies();
  seedRouteEncountersAndLoot();

  tutorialRefs.train = train.group;
  tutorialRefs.firebox = train.fireboxOpening;
  tutorialRefs.brake = train.brakeLever;
  tutorialRefs.throttle = train.throttleLever;
  tutorialRefs.storage = train.storageCrate;
  tutorial = new TutorialSystem(scene, camera, player, train, economy, ui, tutorialRefs);
  const cinematicAssets = new CinematicAssets({visuals,enemyAssets:enemies.assets});
  const introCutscene = new IntroCutscene(renderer,cinematicAssets);
  const endCutscene = new EndCutscene({scene,camera,renderer,train,enemies,cinematicAssets});

  // Exposed only to make regression/smoke testing possible without changing gameplay.
  window.__IRON_WASTES__ = { scene, camera, renderer, collisions, ui, items, train, player, enemies, economy, tutorial, visuals, weather, dayNight, worldArt, introCutscene, endCutscene, cinematicAssets, portSafeZones, worldPOI, difficultyPresets: DIFFICULTY_PRESETS, setDifficulty: applyDifficulty, classPresets: CLASS_SYSTEM?.CLASSES, setClass: applyClass };

  difficultyButtons.forEach(btn => btn.addEventListener('click', () => { setDifficultyUI(btn.dataset.difficulty, true); updateClassUI(); menuClack(144,.012); }));
  setDifficultyUI(selectedDifficultyKey, false);
  applyDifficulty(selectedDifficultyKey);
  player.setClassNotifier?.((text)=>ui.showClassStatus?.(text));
  applyClass(selectedClassKey);
  updateClassUI(); renderClassShop(); syncMenuSettings();
  function syncIntroSeenUI(){
    let seen=false;try{seen=localStorage.getItem('ironWastesIntroSeen')==='true'}catch(_){}
    skipIntroRow?.classList.toggle('hidden',!seen);
    if(!seen&&skipIntroCheckbox)skipIntroCheckbox.checked=false;
    return seen;
  }
  syncIntroSeenUI();
  // Menu-only presentation: show the warm firebox glow. Gameplay state is restored on Start.
  train.fireboxOpen=true; if(train.fireboxDoor) train.fireboxDoor.rotation.y=-1.35;

  document.querySelectorAll('.menu-link').forEach(btn=>btn.addEventListener('mouseenter',()=>{if(!btn.disabled)menuClack(96,.006)}));
  document.querySelectorAll('[data-menu-back]').forEach(btn=>btn.addEventListener('click',hideMenuPanels));
  newGameButton?.addEventListener('click',()=>{updateClassUI();showMenuPanel(newGamePanel);});
  classesButton?.addEventListener('click',()=>{renderClassShop();showMenuPanel(classesPanel);});
  openClassesFromNewGame?.addEventListener('click',()=>{renderClassShop();showMenuPanel(classesPanel);});
  settingsButton?.addEventListener('click',()=>showMenuPanel(settingsPanel));
  aboutButton?.addEventListener('click',()=>showMenuPanel(aboutPanel));
  replayIntroButton?.addEventListener('click',()=>playIntroForMenu());
  exitButton?.addEventListener('click',()=>{menuClack(70,.02);window.close();economy.showToast?.('БРАУЗЕР НЕ РАЗРЕШИЛ ЗАКРЫТЬ ВКЛАДКУ',1800);});
  cinematicToggle?.addEventListener('click',()=>{cinematicEnabled=!cinematicEnabled;try{localStorage.setItem('iwMenuCinematic',cinematicEnabled?'1':'0')}catch(_){}syncMenuSettings();menuClack();});
  grainToggle?.addEventListener('click',()=>{grainEnabled=!grainEnabled;try{localStorage.setItem('iwMenuGrain',grainEnabled?'1':'0')}catch(_){}syncMenuSettings();menuClack();});

  let menuTime=0,menuSmokeTimer=.1,classStarterApplied=false;
  const menuTarget=new THREE.Vector3(0,3.15,.35);
  function setViewmodelsVisible(visible){for(const g of Object.values(player.weaponGroups||{}))g.visible=visible&&g===player.weaponGroups[player.activeWeaponType];}
  function applyStarterBonuses(playerClass){
    if(classStarterApplied)return;
    if(playerClass.starterCoalBonus)train.coalFuel+=playerClass.starterCoalBonus;
    if(playerClass.starterMedkitBonus)player.inventory.medkit+=playerClass.starterMedkitBonus;
    worldPOI?.seedClassBonusLoot?.(playerClass);
    classStarterApplied=true;
  }

  function enterGameplay({fromRestart=false}={}) {
    if(started)return;
    const difficulty=applyDifficulty(selectedDifficultyKey),playerClass=applyClass(selectedClassKey);
    applyStarterBonuses(playerClass);
    introMode=false;started=true;startScreen.classList.add('hidden');camera.fov=72;camera.updateProjectionMatrix();dayNight.time=220;lastTime=performance.now();
    train.fireboxOpen=false; if(train.fireboxDoor) train.fireboxDoor.rotation.y=0;
    setViewmodelsVisible(true);player.syncCamera();ui.showHUD();
    economy.showToast?.(`${playerClass.label} · СЛОЖНОСТЬ: ${difficulty.label}`,2100);tutorial?.start();renderer.domElement.requestPointerLock();
  }

  function playIntroForNewGame(){
    if(started||introMode||introCutscene.active)return;
    const difficulty=applyDifficulty(selectedDifficultyKey),playerClass=applyClass(selectedClassKey);
    introMode=true;startScreen.classList.add('hidden');setViewmodelsVisible(false);document.exitPointerLock?.();
    introCutscene.play({playerClass,difficulty,onComplete:()=>{syncIntroSeenUI();enterGameplay();}});
  }

  function playIntroForMenu(){
    if(started||introMode||introCutscene.active)return;
    const difficulty=window.IronWastesDifficulty?.get?.(selectedDifficultyKey)||DIFFICULTY_PRESETS.normal;
    const playerClass=CLASS_SYSTEM?.get?.(selectedClassKey)||CLASS_SYSTEM?.get?.('machinist');
    introMode=true;startScreen.classList.add('hidden');setViewmodelsVisible(false);document.exitPointerLock?.();
    introCutscene.play({playerClass,difficulty,returnToMenu:true,onComplete:()=>{introMode=false;startScreen.classList.remove('hidden');showMenuPanel(aboutPanel);syncIntroSeenUI();lastTime=performance.now();}});
  }

  function startNewGame(){
    if(started||introMode||introCutscene.active)return;
    const seen=syncIntroSeenUI();
    if(seen&&skipIntroCheckbox?.checked) enterGameplay();
    else playIntroForNewGame();
  }

  startButton?.addEventListener('click', startNewGame);
  restartButtons.forEach(b => b.addEventListener('click', () => {try{sessionStorage.setItem('ironWastesAutoRestart','1')}catch(_){}location.reload();}));
  try{if(sessionStorage.getItem('ironWastesAutoRestart')==='1'){sessionStorage.removeItem('ironWastesAutoRestart');setTimeout(()=>enterGameplay({fromRestart:true}),60);}}catch(_){}

  renderer.domElement.addEventListener('click', () => {
    if (!started || player.dead || completeShown || trainDestroyedShown) return;
    if (document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock();
    } else {
      if (!economy.isOpen) player.attack(enemies, [...collisions.raycastMeshes, ...train.getRaycastMeshes()]);
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);
  });

  function buildWorld() {
    const M = visuals.materials;

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(320,4700), M.ground);
    ground.rotation.x=-Math.PI/2; ground.position.set(0,0,2000); ground.receiveShadow=true; scene.add(ground);

    const ballast = new THREE.Mesh(new THREE.PlaneGeometry(7.8,4500), M.ballast);
    ballast.rotation.x=-Math.PI/2; ballast.position.set(0,.025,2000); ballast.receiveShadow=true; scene.add(ballast);

    // Sleepers are one InstancedMesh instead of hundreds of individual draw calls.
    const sleeperGeo=new THREE.BoxGeometry(4.7,.16,.36);
    const sleeperCount=Math.ceil((4220-(-180))/2.5);
    const sleepers=new THREE.InstancedMesh(sleeperGeo,M.wood,sleeperCount);
    const dummy=new THREE.Object3D(); let si=0;
    for(let z=-180;z<4220;z+=2.5){
      const jitter=((si*17)%11)/11-.5;
      dummy.position.set(jitter*.07,.10,z); dummy.rotation.set(0,jitter*.018,0); dummy.scale.set(1,.94+((si%5)*.012),1); dummy.updateMatrix(); sleepers.setMatrixAt(si++,dummy.matrix);
    }
    sleepers.receiveShadow=true; sleepers.castShadow=false; scene.add(sleepers);

    const railMat=M.darkIron;
    for(const x of [-1.45,1.45]){
      const rail=new THREE.Mesh(new THREE.BoxGeometry(.13,.22,4500),railMat);
      rail.position.set(x,.24,2000); rail.receiveShadow=true; scene.add(rail);
      collisions.addSolid(rail,{collide:false,raycast:true,tag:'rail'});
    }

    worldArt.addRailEnhancements();

    // Trackside detail: ballast rocks, scrap, puddles and dry weeds. Visual only and instanced.
    const rockGeo=new THREE.DodecahedronGeometry(.14,0); const rocks=new THREE.InstancedMesh(rockGeo,M.debris,520);
    const scrapGeo=new THREE.BoxGeometry(.12,.07,.48); const scrap=new THREE.InstancedMesh(scrapGeo,M.rust,220);
    const grassGeo=new THREE.ConeGeometry(.035,.55,3); const grassMat=new THREE.MeshStandardMaterial({color:0x5a5137,roughness:1}); const grass=new THREE.InstancedMesh(grassGeo,grassMat,300);
    let seed=7731; const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
    for(let i=0;i<520;i++){
      const side=rnd()>.5?1:-1; dummy.position.set(side*(3.4+rnd()*32),.12+rnd()*.05,-80+rnd()*4200); dummy.rotation.set(rnd()*2,rnd()*6,rnd()*2); const sc=.55+rnd()*1.65; dummy.scale.set(sc,.55+sc*.35,sc); dummy.updateMatrix(); rocks.setMatrixAt(i,dummy.matrix);
    }
    for(let i=0;i<220;i++){
      const side=rnd()>.5?1:-1; dummy.position.set(side*(4+rnd()*24),.12,-60+rnd()*4160); dummy.rotation.set((rnd()-.5)*.45,rnd()*Math.PI,(rnd()-.5)*.45); dummy.scale.set(.6+rnd()*1.6,.7+rnd(),.6+rnd()*1.8); dummy.updateMatrix(); scrap.setMatrixAt(i,dummy.matrix);
    }
    for(let i=0;i<300;i++){
      const side=rnd()>.5?1:-1; dummy.position.set(side*(5+rnd()*29),.32,-50+rnd()*4140); dummy.rotation.set(0,rnd()*Math.PI,0); dummy.scale.set(.7+rnd(),.7+rnd()*.8,.7+rnd()); dummy.updateMatrix(); grass.setMatrixAt(i,dummy.matrix);
    }
    scene.add(rocks,scrap,grass);
    const puddleMat=new THREE.MeshStandardMaterial({color:0x151c1e,roughness:.22,metalness:.18,transparent:true,opacity:.72});
    for(let i=0;i<42;i++){
      const puddle=new THREE.Mesh(new THREE.CircleGeometry(1.1+rnd()*2.1,18),puddleMat);
      puddle.rotation.x=-Math.PI/2; puddle.position.set((rnd()>.5?1:-1)*(5+rnd()*25),.035,20+rnd()*3980); puddle.scale.y=.45+rnd()*.45; scene.add(puddle);
    }

    // Telegraph line now comes in irregular sections instead of repeating forever.
    // Intact wire runs alternate with broken gaps, leaning posts and fallen poles.
    const telegraphSections=[[-80,620,45],[1030,1510,52],[1660,2110,47],[2360,2740,58],[3070,3510,44],[3710,4080,62]];
    const wireMat=new THREE.LineBasicMaterial({color:0x24292a,transparent:true,opacity:.72});
    let poleIndex=0;
    const addWireRun=(points)=>{if(points.length<2)return;const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),wireMat);line.frustumCulled=true;scene.add(line);};
    telegraphSections.forEach(([from,to,step],sectionIndex)=>{
      const side=sectionIndex%2===0?-10:10;let wireLeft=[],wireRight=[];
      const flush=()=>{addWireRun(wireLeft);addWireRun(wireRight);wireLeft=[];wireRight=[];};
      for(let z=from;z<to;z+=step){
        const fallen=poleIndex%9===6, lean=fallen?0:(poleIndex%5===2?.12:(poleIndex%8===4?-.09:0));
        const pole=new THREE.Mesh(new THREE.CylinderGeometry(.13,.18,5,8),M.darkIron);
        if(fallen){
          flush();pole.position.set(side+(side>0?1.8:-1.8),.34,z+1.2);pole.rotation.z=side>0?1.38:-1.38;scene.add(pole);collisions.addSolid(pole,{collide:false,raycast:true,tag:'fallen-telegraph-pole'});
        }else{
          pole.position.set(side,2.5,z);pole.rotation.z=lean;scene.add(pole);
          const bar=new THREE.Mesh(new THREE.BoxGeometry(2.2,.1,.12),M.darkIron);bar.position.set(side+Math.sin(lean)*-.23,4.7,z);bar.rotation.z=lean;scene.add(bar);
          const ins1=new THREE.Mesh(new THREE.SphereGeometry(.08,6,5),M.brass);ins1.position.set(side-.72,4.82,z);scene.add(ins1);const ins2=ins1.clone();ins2.position.x=side+.72;scene.add(ins2);
          collisions.addSolid(pole,{collide:true,raycast:true,tag:'telegraph-pole'});collisions.addSolid(bar,{collide:false,raycast:true,tag:'telegraph-bar'});
          wireLeft.push(new THREE.Vector3(side-.72,4.84,z));wireRight.push(new THREE.Vector3(side+.72,4.84,z));
          if(poleIndex%13===9)flush();
        }
        poleIndex++;
      }
      flush();
    });


    buildDistantEnvironment(rnd);
    buildTracksideInfrastructure(rnd);

    // Station platform stays outside the rolling stock with a visible safety gap.
    const platformTop=1.95, platformMinX=2.45, platformMaxX=13.95;
    const platform=new THREE.Mesh(new THREE.BoxGeometry(platformMaxX-platformMinX,platformTop,50),M.concrete);
    platform.position.set((platformMinX+platformMaxX)/2,platformTop/2,430); platform.receiveShadow=true; scene.add(platform);
    collisions.addFloorRect(platformMinX,platformMaxX,405,455,platformTop,'platform');
    collisions.addSolid(platform,{collide:true,raycast:true,walkableTop:true,tag:'platform'});

    const stepData=[[16.425,.40],[15.675,.75],[14.925,1.15],[14.175,1.55]];
    for(const [x,top] of stepData){
      const step=new THREE.Mesh(new THREE.BoxGeometry(.8,top,3.0),M.concrete); step.position.set(x,top/2,407.5); step.receiveShadow=true; scene.add(step);
      collisions.addFloorRect(x-.4,x+.4,406,409,top,'station-step'); collisions.addSolid(step,{collide:true,raycast:true,walkableTop:true,tag:'station-step'});
    }

    addBuilding(17.4,420,9.2,7.8,15.5);
    addBuilding(-17,443,9,7,12);
    addBuilding(19.5,451.5,7,6,8.5);

    const crateData=[[-7,410,1.2,1.0,1.1],[-14,416,1.5,.9,1.2],[24,429,1.3,1.1,1.0],[10.8,438,1.2,.8,1.4],[-25,432,1.4,1.2,1.2],[-7,462,1.1,.9,1.3],[27,459,1.5,1.0,1.1],[-27,455,1.2,.8,1.1],[9,457,1.0,.9,1.0],[-4,427,1.2,.8,1.2],[29,414,1.1,1.1,1.1],[-23,406,1.4,.9,1.0]];
    for(const [x,z,w,h,d] of crateData){
      const floor=(x>=platformMinX&&x<=platformMaxX&&z>=405&&z<=455)?platformTop:.12;
      const crate=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),M.wood); crate.position.set(x,floor+h/2,z); crate.rotation.y=(x+z)*.13; crate.castShadow=true; crate.receiveShadow=true; scene.add(crate);
      const box=new THREE.Box3().setFromCenterAndSize(crate.position.clone(),new THREE.Vector3(w*.94,h,d*.94));
      collisions.addSolid(crate,{tag:'crate',walkableTop:true,collisionBox:box});
    }

    // Canopy, beams and pillars enrich the station without blocking the central walking route.
    const canopy=new THREE.Mesh(new THREE.BoxGeometry(6.1,.18,34),M.darkIron); canopy.position.set(10.65,6.1,430); canopy.castShadow=true; scene.add(canopy); collisions.addSolid(canopy,{collide:false,raycast:true,tag:'canopy'});
    for(const z of [414,430,446]){
      const post=new THREE.Mesh(new THREE.BoxGeometry(.20,4.0,.20),M.rust); post.position.set(12.8,4.0,z); scene.add(post); collisions.addSolid(post,{tag:'canopy-post'});
      const beam=new THREE.Mesh(new THREE.BoxGeometry(5.6,.16,.16),M.brass); beam.position.set(10.25,5.55,z); scene.add(beam); collisions.addSolid(beam,{collide:false,raycast:true});
    }

    for(const z of [412,428,446]) addStationLamp(4.25,z,platformTop);
    addStationLamp(12.2,419,platformTop); addStationLamp(12.2,443,platformTop);

    // Railings on the outer platform edge.
    for(const z of [411,421,431,441,451]){
      const post=new THREE.Mesh(new THREE.BoxGeometry(.12,1.0,.12),M.darkIron); post.position.set(13.65,platformTop+.5,z); scene.add(post); collisions.addSolid(post,{tag:'railing'});
      if(z<451){ const bar=new THREE.Mesh(new THREE.BoxGeometry(.09,.09,9.6),M.darkIron); bar.position.set(13.65,platformTop+.82,z+5); scene.add(bar); collisions.addSolid(bar,{tag:'railing-bar'}); }
    }

    addBarrel(11.5,424,platformTop); addBarrel(12.1,425.0,platformTop); addBarrel(9.7,449,platformTop);
    addWorldPipe(11.9,410.5,platformTop,2.6); addWorldPipe(12.4,452,platformTop,2.1);

    // Baggage cart and abandoned machine near outer platform edge.
    const cartBody=new THREE.Mesh(new THREE.BoxGeometry(1.8,.38,1.1),M.wood); cartBody.position.set(10.8,platformTop+.45,435); scene.add(cartBody); collisions.addSolid(cartBody,{walkableTop:true,tag:'cart'});
    for(const dx of [-.68,.68]) for(const dz of [-.42,.42]){ const w=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.10,10),M.black); w.rotation.z=Math.PI/2; w.position.set(10.8+dx,platformTop+.20,435+dz); scene.add(w); }
    const machine=new THREE.Mesh(new THREE.CylinderGeometry(.55,.62,1.2,10),M.rust); machine.position.set(11.1,platformTop+.6,454); scene.add(machine); collisions.addSolid(machine,{tag:'station-machine'});
    const machineWheel=new THREE.Mesh(new THREE.TorusGeometry(.42,.08,8,14),M.brass); machineWheel.position.set(10.5,platformTop+.7,454); machineWheel.rotation.y=Math.PI/2; scene.add(machineWheel);

    buildRouteDiversity(rnd);
    worldArt.buildLandmarks();
    worldArt.buildDistantHorizon();
    worldArt.buildDistantLights();
    worldArt.buildTerrainRelief();
    worldArt.buildStoryScenes();
    worldArt.buildAmbientSmoke();
    buildRailPort(0,'СТАРТОВЫЙ ПОРТ','start');
    buildRailPort(1000,'ОРУЖЕЙНЫЙ ПОРТ','weapon');
    buildRailPort(2000,'ТОРГОВЫЙ ПОРТ','trade');
    buildRailPort(3000,'ПОРТ-ПОСЕЛЕНИЕ','settlement');
    buildRailPort(4000,'ПРОМЫШЛЕННЫЙ ПОРТ','industrial');

    const gateMat=M.darkIron;
    const left=new THREE.Mesh(new THREE.BoxGeometry(.5,8,.5),gateMat); left.position.set(-4,4,4004);
    const right=left.clone(); right.position.x=4; const top=new THREE.Mesh(new THREE.BoxGeometry(8.5,.5,.5),gateMat); top.position.set(0,7.8,4004); scene.add(left,right,top);
    collisions.addSolid(left,{collide:false,raycast:true}); collisions.addSolid(right,{collide:false,raycast:true}); collisions.addSolid(top,{collide:false,raycast:true});
  }

  function addStationLamp(x,z,floor,kind='station'){
    const M=visuals.materials;
    const palettes={station:0xff9d45,start:0xffa54d,weapon:0xd75a37,trade:0xd9d3b4,settlement:0xffbd68,industrial:0xd98a54};
    const c=palettes[kind]||palettes.station;
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,4.2,8),M.darkIron); pole.position.set(x,floor+2.1,z); scene.add(pole); collisions.addSolid(pole,{collide:true,raycast:true,tag:'lamp-post'});
    const hood=new THREE.Mesh(new THREE.ConeGeometry(.34,.26,10),M.rust); hood.position.set(x,floor+4.25,z); hood.rotation.x=Math.PI; scene.add(hood);
    const bulbMat=new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.16,roughness:.35});
    const bulb=new THREE.Mesh(new THREE.SphereGeometry(.11,8,6),bulbMat); bulb.position.set(x,floor+4.08,z); scene.add(bulb);
    const lamp=new THREE.PointLight(c,.07,kind==='industrial'?14:12,2); lamp.position.copy(bulb.position); scene.add(lamp); dayNight.registerLamp(lamp,bulbMat,{day:.025,night:kind==='weapon'?3.0:(kind==='settlement'?3.4:3.2),flicker:kind==='industrial'?.065:.045,fadeStart:80,maxDistance:118});
    if(kind!=='station')worldArt.addLightSpill?.(kind,x,z,3.2,floor+.018);
  }

  function addBarrel(x,z,floor){
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.38,.42,.85,12),visuals.materials.rust); barrel.position.set(x,floor+.425,z); scene.add(barrel); collisions.addSolid(barrel,{tag:'barrel',walkableTop:true});
    for(const y of [floor+.16,floor+.68]){ const ring=new THREE.Mesh(new THREE.TorusGeometry(.405,.025,6,12),visuals.materials.darkIron); ring.position.set(x,y,z); ring.rotation.x=Math.PI/2; scene.add(ring); }
  }

  function addWorldPipe(x,z,floor,height){
    const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,height,9),visuals.materials.copper); pipe.position.set(x,floor+height/2,z); scene.add(pipe); collisions.addSolid(pipe,{tag:'large-pipe'});
    const cap=new THREE.Mesh(new THREE.TorusGeometry(.22,.04,7,12),visuals.materials.brass); cap.position.set(x,floor+height,z); cap.rotation.x=Math.PI/2; scene.add(cap);
  }

  function addBuilding(x,z,w,h,d) {
    const M=visuals.materials;
    const foundation=new THREE.Mesh(new THREE.BoxGeometry(w+.6,.34,d+.6),M.concrete);foundation.position.set(x,.17,z);foundation.receiveShadow=true;scene.add(foundation);collisions.addSolid(foundation,{walkableTop:true,tag:'building-foundation'});
    const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),M.soot); b.position.set(x,.34+h/2,z); b.castShadow=true; b.receiveShadow=true; scene.add(b); collisions.addSolid(b,{tag:'building'});
    // Corner columns and facade ribs break up the primitive mass.
    for(const sx of [-1,1])for(const sz of [-1,1]){const c=new THREE.Mesh(new THREE.BoxGeometry(.18,h+.2,.18),M.darkIron);c.position.set(x+sx*(w/2+.05),.4+h/2,z+sz*(d/2+.05));scene.add(c);}
    for(let i=-2;i<=2;i++){const rib=new THREE.Mesh(new THREE.BoxGeometry(.10,h*.84,.12),M.rust);rib.position.set(x+i*w/5.2,.4+h*.48,z-d/2-.07);scene.add(rib);}
    // Industrial pitched roof made from two panels, not a cone.
    const angle=.26,half=w*.54,rise=Math.tan(angle)*half;
    for(const side of [-1,1]){const roof=new THREE.Mesh(new THREE.BoxGeometry(half,.18,d+.65),M.rust);roof.position.set(x+side*half*.48,.34+h+rise*.50,z);roof.rotation.z=-side*angle;roof.castShadow=true;scene.add(roof);collisions.addSolid(roof,{collide:false,raycast:true});}
    const windowMat=new THREE.MeshStandardMaterial({color:0x263138,emissive:0x4a2410,emissiveIntensity:.12,roughness:.2,metalness:.2});
    for(const ox of [-w*.27,w*.27]){
      const win=new THREE.Mesh(new THREE.PlaneGeometry(1.25,1.55),windowMat); win.position.set(x+ox,2.8,z-d/2-.015); scene.add(win);
      const v=new THREE.Mesh(new THREE.BoxGeometry(.07,1.75,.07),M.darkIron);v.position.set(x+ox,2.8,z-d/2-.06);scene.add(v);
      const hbar=new THREE.Mesh(new THREE.BoxGeometry(1.42,.07,.07),M.darkIron);hbar.position.set(x+ox,2.8,z-d/2-.065);scene.add(hbar);
    }
    const door=new THREE.Mesh(new THREE.BoxGeometry(1.45,2.65,.10),M.wood); door.position.set(x,1.67,z-d/2-.06); scene.add(door);
    const awning=new THREE.Mesh(new THREE.BoxGeometry(2.2,.12,1.2),M.rust);awning.position.set(x,3.25,z-d/2-.58);awning.rotation.x=-.10;scene.add(awning);
    const step=new THREE.Mesh(new THREE.BoxGeometry(1.9,.24,.82),M.concrete);step.position.set(x,.46,z-d/2-.52);scene.add(step);collisions.addSolid(step,{walkableTop:true,tag:'building-step'});
    const vent=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,2.2,9),M.darkIron); vent.position.set(x+w*.32,h+1.55,z+d*.18); scene.add(vent);
    for(let i=0;i<3;i++){ const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,h*.62,7),M.copper); pipe.position.set(x-w*.35+i*.28,h*.48,z-d/2-.10); scene.add(pipe); }
  }


  function buildDistantEnvironment(rnd){
    const M=visuals.materials;
    // Distant silhouettes are clustered by route theme instead of evenly repeating along all 40 km.
    const chimneyGeo=new THREE.CylinderGeometry(1.0,1.65,16,8), chimneys=new THREE.InstancedMesh(chimneyGeo,M.soot,24);
    const hillGeo=new THREE.ConeGeometry(9,12,9), hills=new THREE.InstancedMesh(hillGeo,M.ground,36);
    const treeGeo=new THREE.CylinderGeometry(.08,.22,5,6), trees=new THREE.InstancedMesh(treeGeo,M.soot,72);
    const dummy=new THREE.Object3D();
    for(let i=0;i<24;i++){ const side=i%2?1:-1; dummy.position.set(side*(42+rnd()*48),8+rnd()*6,2050+i*82+rnd()*55); dummy.scale.set(.7+rnd()*.8,.7+rnd()*1.2,.7+rnd()*.8); dummy.rotation.y=rnd(); dummy.updateMatrix(); chimneys.setMatrixAt(i,dummy.matrix); }
    for(let i=0;i<36;i++){ const side=i%2?1:-1; dummy.position.set(side*(52+rnd()*58),4,60+i*114+rnd()*65); dummy.scale.set(.8+rnd()*1.8,.6+rnd()*1.0,.8+rnd()*1.8); dummy.rotation.y=rnd()*Math.PI; dummy.updateMatrix(); hills.setMatrixAt(i,dummy.matrix); }
    for(let i=0;i<72;i++){ const side=i%2?1:-1; dummy.position.set(side*(18+rnd()*42),2.5,1040+rnd()*880); dummy.scale.set(.7+rnd()*.8,.7+rnd()*.8,.7+rnd()*.8); dummy.rotation.z=(rnd()-.5)*.18; dummy.updateMatrix(); trees.setMatrixAt(i,dummy.matrix); }
    chimneys.castShadow=false; hills.castShadow=false; trees.castShadow=false; scene.add(chimneys,hills,trees);

    // A few coherent factory silhouettes replace the old stream of random boxes.
    const clusters=[{z:2350,x:-72},{z:2870,x:68},{z:3340,x:-76},{z:3750,x:70},{z:3970,x:-62}];
    for(const c of clusters){
      const group=new THREE.Group();group.position.set(c.x,0,c.z);
      const h=8+rnd()*6;const body=new THREE.Mesh(new THREE.BoxGeometry(13+rnd()*6,h,14+rnd()*8),M.soot);body.position.y=h/2;group.add(body);
      const upper=new THREE.Mesh(new THREE.BoxGeometry(7,h*.55,8),M.rust);upper.position.set((rnd()-.5)*4,h+h*.27,(rnd()-.5)*3);group.add(upper);
      const tank=new THREE.Mesh(new THREE.CylinderGeometry(2.0,2.5,4,10),M.rust);tank.position.set((rnd()-.5)*7,h*.82+2,(rnd()-.5)*7);group.add(tank);
      scene.add(group);
    }
  }


  function buildTracksideInfrastructure(rnd){
    const M=visuals.materials;
    const postGeo=new THREE.BoxGeometry(.12,1.55,.12), railGeo=new THREE.BoxGeometry(.09,.09,3.7);
    const fenceSections=[[-40,290],[520,830],[1120,1410],[1760,1920],[2210,2580],[3300,3560],[3790,3940]];
    const postTransforms=[],railTransforms=[];const d=new THREE.Object3D();
    for(const [from,to] of fenceSections){
      for(const side of [-1,1]){
        for(let z=from;z<to;z+=24+rnd()*8){
          if(rnd()<.17)continue;
          const x=side*(15.2+rnd()*3.2),fallen=rnd()<.09;
          d.position.set(x,fallen?.28:.78,z);d.rotation.set(0,(rnd()-.5)*.10,fallen?(side>0?.62:-.62):(rnd()-.5)*.10);d.scale.set(1,.80+rnd()*.36,1);d.updateMatrix();postTransforms.push(d.matrix.clone());
          if(!fallen&&rnd()>.18){d.position.set(x,.94,z+1.7);d.rotation.set((rnd()-.5)*.04,0,(rnd()-.5)*.07);d.scale.set(1,1,.78+rnd()*.30);d.updateMatrix();railTransforms.push(d.matrix.clone());}
        }
      }
    }
    const posts=new THREE.InstancedMesh(postGeo,M.darkIron,postTransforms.length),rails=new THREE.InstancedMesh(railGeo,M.rust,railTransforms.length);
    postTransforms.forEach((m,i)=>posts.setMatrixAt(i,m));railTransforms.forEach((m,i)=>rails.setMatrixAt(i,m));
    posts.castShadow=false;rails.castShadow=false;scene.add(posts,rails);

    const signalZ=[]; for(let z=100;z<3950;z+=230) signalZ.push(z);
    for(let i=0;i<signalZ.length;i++){
      const side=i%2?1:-1,x=side*4.7,z=signalZ[i];
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.10,.14,4.6,8),M.darkIron); pole.position.set(x,2.3,z); scene.add(pole); collisions.addSolid(pole,{tag:'signal-post'});
      const head=new THREE.Mesh(new THREE.BoxGeometry(.65,1.05,.34),M.rust); head.position.set(x,4.25,z); scene.add(head); collisions.addSolid(head,{collide:false,raycast:true,tag:'signal-head'});
      const lensMat=new THREE.MeshStandardMaterial({color:i%3===0?0x93402d:0x725b2b,emissive:i%3===0?0xd44220:0xa87925,emissiveIntensity:.35,roughness:.4});
      const lens=new THREE.Mesh(new THREE.CircleGeometry(.16,12),lensMat); lens.position.set(x,4.36,z-(side>0?.18:-.18)); lens.rotation.y=side>0?0:Math.PI; scene.add(lens);
    }

    const gantries=[145,315,615,790,1180,1530,1870,2240,2630,3380,3720];
    for(const z of gantries){
      for(const x of [-6.2,6.2]){ const support=new THREE.Mesh(new THREE.BoxGeometry(.30,6.6,.30),M.soot); support.position.set(x,3.3,z); scene.add(support); collisions.addSolid(support,{tag:'gantry-support'}); const foot=new THREE.Mesh(new THREE.BoxGeometry(.85,.18,.85),M.rust); foot.position.set(x,.09,z); scene.add(foot); }
      const beam=new THREE.Mesh(new THREE.BoxGeometry(12.7,.28,.30),M.darkIron); beam.position.set(0,6.45,z); scene.add(beam); collisions.addSolid(beam,{collide:false,raycast:true,tag:'gantry-beam'});
    }

    for(let i=0;i<30;i++){
      const side=i%2?1:-1,x=side*(7.0+rnd()*4.5),z=95+i*128+rnd()*35;
      const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.16,.20,4.0+rnd()*2.8,9),M.copper); pipe.rotation.x=Math.PI/2; pipe.rotation.z=(rnd()-.5)*.12; pipe.position.set(x,.55,z); scene.add(pipe); collisions.addSolid(pipe,{tag:'trackside-pipe'});
      const valve=new THREE.Mesh(new THREE.TorusGeometry(.32,.055,7,12),M.brass); valve.position.set(x,.95,z-1.2); valve.rotation.y=Math.PI/2; scene.add(valve);
    }
  }

  function buildRouteDiversity(rnd){
    const M=visuals.materials,d=new THREE.Object3D();
    // 0–10 km: old coal workings, low spoil heaps and mine headframes.
    const coalHeapGeo=new THREE.DodecahedronGeometry(1.9,0),coalHeaps=new THREE.InstancedMesh(coalHeapGeo,M.soot,34);
    for(let i=0;i<34;i++){const side=i%2?1:-1;d.position.set(side*(18+rnd()*34),.75,90+rnd()*780);d.rotation.set(rnd()*.25,rnd()*4,rnd()*.22);d.scale.set(1+rnd()*2,.45+rnd()*.8,1+rnd()*2.1);d.updateMatrix();coalHeaps.setMatrixAt(i,d.matrix);} scene.add(coalHeaps);
    for(const z of [170,610,840]){
      const side=z%2===0?1:-1,x=side*28;
      const frame=new THREE.Group();frame.position.set(x,0,z);
      for(const sx of [-2.2,2.2]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.36,8,.36),M.darkIron);leg.position.set(sx,4,0);leg.rotation.z=-sx*.025;frame.add(leg);}
      const beam=new THREE.Mesh(new THREE.BoxGeometry(5.4,.38,.38),M.rust);beam.position.set(0,7.4,0);frame.add(beam);
      const wheel=new THREE.Mesh(new THREE.TorusGeometry(1.05,.12,8,18),M.brass);wheel.position.set(0,6.55,0);wheel.rotation.y=Math.PI/2;frame.add(wheel);scene.add(frame);
    }
    // 10–20 km: dead forest and water towers.
    const deadGeo=new THREE.CylinderGeometry(.08,.26,6,6), deadTrees=new THREE.InstancedMesh(deadGeo,M.soot,72);
    for(let i=0;i<72;i++){const side=i%2?1:-1;d.position.set(side*(14+rnd()*34),3,1080+rnd()*820);d.rotation.set((rnd()-.5)*.14,rnd()*3,(rnd()-.5)*.2);d.scale.set(.7+rnd()*.7,.75+rnd()*.7,.7+rnd()*.7);d.updateMatrix();deadTrees.setMatrixAt(i,d.matrix);} scene.add(deadTrees);
    // 20–30 km: scrap fields / slag piles.
    const heapGeo=new THREE.DodecahedronGeometry(2.6,0),heaps=new THREE.InstancedMesh(heapGeo,M.rust,46);
    for(let i=0;i<46;i++){const side=i%2?1:-1;d.position.set(side*(16+rnd()*38),1.2,2100+rnd()*760);d.rotation.set(rnd(),rnd()*4,rnd());d.scale.set(1+rnd()*2,.5+rnd()*1.1,1+rnd()*2.2);d.updateMatrix();heaps.setMatrixAt(i,d.matrix);} scene.add(heaps);
    // 30–40 km: dense industrial pylons and abandoned pressure tanks.
    const pylonGeo=new THREE.BoxGeometry(1.2,12,1.2),pylons=new THREE.InstancedMesh(pylonGeo,M.darkIron,36);
    for(let i=0;i<36;i++){const side=i%2?1:-1;d.position.set(side*(23+rnd()*36),6,3080+rnd()*820);d.rotation.y=(rnd()-.5)*.2;d.scale.set(.7+rnd()*.7,.7+rnd()*.9,.7+rnd()*.7);d.updateMatrix();pylons.setMatrixAt(i,d.matrix);} scene.add(pylons);
  }

  function addShopTerminal(x,z,floor,shopId,label){
    const M=visuals.materials;
    const body=new THREE.Mesh(new THREE.BoxGeometry(1.05,1.45,.72),M.rust); body.position.set(x,floor+.725,z); scene.add(body); collisions.addSolid(body,{tag:'shop-terminal'});
    body.userData.interactive='shop'; body.userData.shopId=shopId; body.userData.shopLabel=label; body.userData.dropPoint=new THREE.Vector3(x-2.0,floor,z);
    const accents={startGeneral:0x8f7a3c,startArmory:0xa33b2d,startWorkshop:0x4d7381,weaponPort:0xa33b2d,tradePort:0x628b78,settlementPort:0xa87843};
    const accent=accents[shopId]||0x8f6a28;
    const faceMat=new THREE.MeshStandardMaterial({color:0x1d2425,emissive:accent,emissiveIntensity:.82,roughness:.34,metalness:.32});
    const face=new THREE.Mesh(new THREE.PlaneGeometry(.68,.48),faceMat); face.position.set(x-.001,floor+1.0,z-.365); face.rotation.y=Math.PI; scene.add(face);
    const hood=new THREE.Mesh(new THREE.BoxGeometry(1.22,.10,.86),M.darkIron); hood.position.set(x,floor+1.53,z); scene.add(hood);
    const lamp=new THREE.PointLight(accent, .08, 6.5, 2); lamp.position.set(x,floor+1.60,z-.46); scene.add(lamp); dayNight.registerLamp(lamp,null,{day:.05,night:1.65,flicker:.025});
    return body;
  }

  function addSupplyClerk(x,z,floor){
    const M=visuals.materials;
    const booth=new THREE.Mesh(new THREE.BoxGeometry(1.15,1.5,.75),M.brass); booth.position.set(x,floor+.75,z); scene.add(booth); collisions.addSolid(booth,{tag:'supply-clerk'});
    booth.userData.interactive='supplyClerk';
    const lampMat=new THREE.MeshStandardMaterial({color:0xffc47a,emissive:0xff8c35,emissiveIntensity:2.2});
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.09,7,5),lampMat);lamp.position.set(x,floor+1.60,z-.3);scene.add(lamp);
    const glow=new THREE.PointLight(0xffa34d,.12,7,2);glow.position.set(x,floor+1.62,z-.35);scene.add(glow);dayNight.registerLamp(glow,lampMat,{day:.08,night:2.1,flicker:.03});
    return booth;
  }

  function addStaticLocomotive(x,z,scale=.8){
    const M=visuals.materials,g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);
    const frame=new THREE.Mesh(new THREE.BoxGeometry(4,.55,8),M.darkIron);frame.position.y=1.0;g.add(frame);
    const boiler=new THREE.Mesh(new THREE.CylinderGeometry(1,1,4.8,12),M.soot);boiler.rotation.x=Math.PI/2;boiler.position.set(0,2.8,.7);g.add(boiler);
    const cab=new THREE.Mesh(new THREE.BoxGeometry(3.6,3,2.6),M.rust);cab.position.set(0,3,-2.5);g.add(cab);
    for(const xw of [-1.55,1.55])for(const zw of [-2.5,0,2.4]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.72,.72,.22,12),M.black);w.rotation.z=Math.PI/2;w.position.set(xw,.72,zw);g.add(w);}scene.add(g);
  }

  function portSignMaterial(name,kind){
    const key=`${kind}:${name}`; if(portSignMaterialCache.has(key)) return portSignMaterialCache.get(key);
    const canvas=document.createElement('canvas'); canvas.width=768; canvas.height=160;
    const ctx=canvas.getContext('2d');
    const accents={start:'#d29b4b',weapon:'#ad4939',trade:'#769b8b',settlement:'#c58f52',industrial:'#7e8991'};
    ctx.fillStyle='#171b1c';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle=accents[kind]||'#b78b4e';ctx.lineWidth=10;ctx.strokeRect(9,9,canvas.width-18,canvas.height-18);
    const grad=ctx.createLinearGradient(0,0,canvas.width,0);grad.addColorStop(0,'rgba(0,0,0,.15)');grad.addColorStop(.5,'rgba(255,255,255,.055)');grad.addColorStop(1,'rgba(0,0,0,.22)');ctx.fillStyle=grad;ctx.fillRect(18,18,canvas.width-36,canvas.height-36);
    ctx.fillStyle='#e4d4b0';ctx.font='700 46px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(name,canvas.width/2,67);
    const km={start:'0 КМ',weapon:'10 КМ',trade:'20 КМ',settlement:'30 КМ',industrial:'40 КМ'}[kind]||'';
    ctx.fillStyle=accents[kind]||'#b78b4e';ctx.font='700 24px Arial';ctx.fillText(km,canvas.width/2,122);
    const tex=new THREE.CanvasTexture(canvas);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy?.()||1);
    const mat=new THREE.MeshStandardMaterial({map:tex,roughness:.62,metalness:.28,emissive:0x17110a,emissiveIntensity:.18});
    portSignMaterialCache.set(key,mat);return mat;
  }

  function directionSignMaterial(text,accent='#c69a4b'){
    const key=`${accent}:${text}`;
    if(directionSignMaterialCache.has(key))return directionSignMaterialCache.get(key);
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=150;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#191b1b';ctx.fillRect(0,0,640,150);
    ctx.strokeStyle=accent;ctx.lineWidth=8;ctx.strokeRect(6,6,628,138);
    ctx.fillStyle='#e6d5b1';ctx.font='700 38px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,320,76);
    const tex=new THREE.CanvasTexture(canvas);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy?.()||1);
    const mat=new THREE.MeshStandardMaterial({map:tex,roughness:.62,metalness:.28,emissive:0x17110a,emissiveIntensity:.28,side:THREE.DoubleSide});
    directionSignMaterialCache.set(key,mat);return mat;
  }

  function addDirectionSign(text,x,z,top,rotationY=0,accent='#c69a4b'){
    const M=visuals.materials,g=new THREE.Group();g.position.set(x,top+2.35,z);g.rotation.y=rotationY;
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.055,.075,2.25,7),M.darkIron);post.position.y=-1.10;g.add(post);
    const board=new THREE.Mesh(new THREE.BoxGeometry(3.55,.88,.10),M.darkIron);g.add(board);
    const face=new THREE.Mesh(new THREE.PlaneGeometry(3.40,.74),directionSignMaterial(text,accent));face.position.z=.056;g.add(face);
    const back=face.clone();back.position.z=-.056;back.rotation.y=Math.PI;g.add(back);
    scene.add(g);g.updateMatrixWorld(true);
    // Only the thin post blocks movement; the overhead board stays readable without widening invisible collision.
    collisions.addSolid(post,{tag:'direction-sign'});
    return g;
  }

  function addPortSpecificDetails(kind,z,top){
    const M=visuals.materials;
    if(kind==='start'){
      // Coal depot and repair gantry make the first port read as a service hub.
      for(let i=0;i<6;i++){const heap=new THREE.Mesh(new THREE.DodecahedronGeometry(.85+(.12*(i%3)),0),M.soot);heap.position.set(24+(i%3)*1.5,.55,z-28+Math.floor(i/3)*1.6);heap.scale.y=.55;scene.add(heap);}
      const gantry=new THREE.Group();gantry.position.set(-13,0,z-18);
      for(const sx of [-2.8,2.8]){const post=new THREE.Mesh(new THREE.BoxGeometry(.28,5.8,.28),M.darkIron);post.position.set(sx,2.9,0);gantry.add(post);}
      const beam=new THREE.Mesh(new THREE.BoxGeometry(6,.3,.35),M.rust);beam.position.y=5.65;gantry.add(beam);scene.add(gantry);
    }else if(kind==='weapon'){
      // Armoured racks and red warning beacons distinguish the arsenal port.
      for(const dz of [-24,-16,16,24]){const rack=new THREE.Mesh(new THREE.BoxGeometry(2.8,1.7,.7),M.darkIron);rack.position.set(23,top+.85,z+dz);scene.add(rack);collisions.addSolid(rack,{tag:'weapon-rack'});}
      for(const dz of [-30,30]){const mast=new THREE.Mesh(new THREE.CylinderGeometry(.11,.15,5.4,8),M.darkIron);mast.position.set(21,2.7,z+dz);scene.add(mast);collisions.addSolid(mast,{tag:'weapon-beacon'});const lamp=new THREE.PointLight(0xc13d2c,0.05,9,2);lamp.position.set(21,5.25,z+dz);scene.add(lamp);dayNight.registerLamp(lamp,null,{day:.02,night:2.2,flicker:.035});}
    }else if(kind==='trade'){
      // Cargo stacks and awnings make this a commercial interchange.
      for(let i=0;i<9;i++){const w=1.2+(i%2)*.35,h=.7+(i%3)*.18;const box=new THREE.Mesh(new THREE.BoxGeometry(w,h,1.05),i%3===0?M.rust:M.wood);box.position.set(23+(i%3)*1.6,h/2,z-24+Math.floor(i/3)*3.1);scene.add(box);collisions.addSolid(box,{walkableTop:true,tag:'trade-cargo'});}
      const awning=new THREE.Mesh(new THREE.BoxGeometry(9,.18,7),M.rust);awning.position.set(27,4.7,z+21);scene.add(awning);
    }else if(kind==='settlement'){
      // Small warm huts and utility pipes give the settlement a lived-in silhouette.
      for(const [dx,dz] of [[24,-24],[29,-12],[25,19],[33,27]]){const hut=new THREE.Mesh(new THREE.BoxGeometry(5,3.4,5.8),M.wood);hut.position.set(dx,1.7,z+dz);scene.add(hut);collisions.addSolid(hut,{tag:'settlement-hut'});const roof=new THREE.Mesh(new THREE.ConeGeometry(4.1,1.5,4),M.rust);roof.position.set(dx,4.1,z+dz);roof.rotation.y=Math.PI/4;scene.add(roof);}
      for(const dz of [-30,30]) addWorldPipe(22,z+dz,0,4.4);
    }else if(kind==='industrial'){
      // Final port: heavy stacks and an overhead loading gantry.
      for(const x of [25,32]){const stack=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.7,18,10),M.soot);stack.position.set(x,9,z+18);scene.add(stack);}
      const gantry=new THREE.Group();gantry.position.set(0,0,z-18);
      for(const x of [-7,7]){const post=new THREE.Mesh(new THREE.BoxGeometry(.55,10,.55),M.darkIron);post.position.set(x,5,0);gantry.add(post);}
      const beam=new THREE.Mesh(new THREE.BoxGeometry(15,.55,.55),M.rust);beam.position.y=9.6;gantry.add(beam);scene.add(gantry);
    }
  }

  function buildRailPort(z,name,kind){
    const M=visuals.materials,top=1.95,minX=2.45,maxX=19.5,length=({start:92,weapon:86,trade:110,settlement:100,industrial:124}[kind]||76);
    const platform=new THREE.Mesh(new THREE.BoxGeometry(maxX-minX,top,length),M.concrete);platform.position.set((minX+maxX)/2,top/2,z);platform.receiveShadow=true;scene.add(platform);
    collisions.addFloorRect(minX,maxX,z-length/2,z+length/2,top,`port-${kind}`);collisions.addSolid(platform,{collide:true,raycast:true,walkableTop:true,tag:`port-${kind}`});
    // Outer stairs keep ports naturally accessible from ground.
    const sz=z-length/2+6; for(let i=0;i<4;i++){const h=.4+i*.39,x=maxX+.42+i*.78;const step=new THREE.Mesh(new THREE.BoxGeometry(.82,h,3),M.concrete);step.position.set(x,h/2,sz);scene.add(step);collisions.addFloorRect(x-.41,x+.41,sz-1.5,sz+1.5,h,'port-step');collisions.addSolid(step,{walkableTop:true,tag:'port-step'});}
    // Functional platform stays shared; the architecture itself is built per-port by WorldArtSystem.
    const lampLayout = kind==='trade'?[-32,-12,13,34] : kind==='industrial'?[-38,-15,15,38] : [-28,-10,10,28];
    for(const dz of lampLayout)addStationLamp(4.5,z+dz,top,kind);
    for(const dz of [-24,18])addBarrel(15.8,z+dz,top);
    for(const dz of [-29,24]){const c=new THREE.Mesh(new THREE.BoxGeometry(1.4,.9,1.2),M.wood);c.position.set(17.0,top+.45,z+dz);scene.add(c);collisions.addSolid(c,{walkableTop:true,tag:'port-crate'});}

    if(kind==='start'){
      tutorialRefs.supplyClerk=addSupplyClerk(8,z-26,top);
      tutorialRefs.startGeneral=addShopTerminal(11.5,z-15,top,'startGeneral','Склад снабжения');
      tutorialRefs.startArmory=addShopTerminal(11.5,z-3,top,'startArmory','Оружейная лавка');
      tutorialRefs.startWorkshop=addShopTerminal(11.5,z+9,top,'startWorkshop','Ремонтная мастерская');
      addDirectionSign('СНАБЖЕНИЕ  ←',9.0,z-10.5,top,0,'#d29b4b');
      addDirectionSign('ОРУЖЕЙНАЯ  →',16.8,z-4.0,top,Math.PI,'#a64b3b');
      addDirectionSign('←  ПОЕЗД',7.2,z+4.5,top,0,'#d29b4b');
      addStaticLocomotive(-22,z+17,.82);addStaticLocomotive(-31,z-13,.68);
    }else if(kind==='weapon'){
      addShopTerminal(11.5,z-8,top,'weaponPort','Арсенал');addStaticLocomotive(-24,z+15,.72);
    }else if(kind==='trade'){
      addShopTerminal(11.5,z-8,top,'tradePort','Торговая контора');
    }else if(kind==='settlement'){
      addShopTerminal(11.5,z-8,top,'settlementPort','Снабжение поселения');
    }
    worldArt.buildPort(kind,z,top);
    // Readable port sign; only five shared CanvasTextures are created for the entire route.
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(7.2,1.5),portSignMaterial(name,kind));sign.position.set(15.8,top+4.2,z+length/2-5.65);sign.rotation.y=Math.PI;scene.add(sign);collisions.addSolid(sign,{collide:false,raycast:true,tag:'port-sign'});
    const signBack=new THREE.Mesh(new THREE.BoxGeometry(7.35,1.65,.18),M.darkIron);signBack.position.set(15.8,top+4.2,z+length/2-5.5);scene.add(signBack);collisions.addSolid(signBack,{collide:false,raycast:true,tag:'port-sign-back'});
  }

  function seedStationLootAndEnemies() {
    const loot = [
      ['Coal', new THREE.Vector3(7,0,416)],
      ['Coal',new THREE.Vector3(10,0,434)],
      ['Coal',new THREE.Vector3(-9,0,421)],
      ['Coal', new THREE.Vector3(24,0,439)],
      ['Scrap Metal',new THREE.Vector3(6,0,446)],
      ['Scrap Metal',new THREE.Vector3(-8,0,453)],
      ['Scrap Metal',new THREE.Vector3(25,0,423)],
      ['Medkit',new THREE.Vector3(24,0,417)],
      ['Medkit',new THREE.Vector3(-7,0,435)],
      ['Ammo',new THREE.Vector3(11,0,441)],
      ['Ammo',new THREE.Vector3(-11,0,431)]
    ];
    loot.forEach(([type,pos])=>items.spawn(type,pos));
    enemies.spawn(new THREE.Vector3(11,0,435), {awake:false, station:true});
    enemies.spawn(new THREE.Vector3(-8,0,446), {awake:false, station:true});
    enemies.spawn(new THREE.Vector3(25,0,451), {awake:false, station:true});
  }

  function seedRouteEncountersAndLoot() {
    const caches = [
      ['Coal', new THREE.Vector3(9,0,1240)], ['Scrap Metal', new THREE.Vector3(-10,0,1460)],
      ['Medkit', new THREE.Vector3(12,0,1760)], ['Coal', new THREE.Vector3(-11,0,1860)],
      ['Scrap Metal', new THREE.Vector3(10,0,2260)], ['Ammo', new THREE.Vector3(-9,0,2520)],
      ['Coal', new THREE.Vector3(11,0,2760)], ['Medkit', new THREE.Vector3(-10,0,2860)],
      ['Scrap Metal', new THREE.Vector3(10,0,3260)], ['Ammo', new THREE.Vector3(-11,0,3460)],
      ['Coal', new THREE.Vector3(9,0,3670)]
    ];
    caches.forEach(([type,pos]) => items.spawn(type,pos));
    // Hand-placed encounters now sit near believable ruins/POIs rather than empty field.
    const encounters = [
      ['walker', -15, 1168], ['stalker', 17, 1398],
      ['brute', -21, 1688], ['stalker', -19, 2228], ['gunner', 22, 2488],
      ['brute', -17, 2748], ['gunner', 14, 3188], ['stalker', -19, 3448], ['brute', 18, 3658], ['gunner', -21, 3828]
    ];
    encounters.forEach(([type,x,z]) => enemies.spawn(new THREE.Vector3(x,0,z), {awake:true,type,distanceKm:z/100}));
  }

  function refreshAimedObject(maxDistance=3.5) {
    const localWorld=collisions.nearbyRaycastMeshes?.(camera.position,maxDistance+2)||collisions.raycastMeshes;
    interactionMeshes.length=0;for(const m of localWorld)interactionMeshes.push(m);for(const m of train.getRaycastMeshes())interactionMeshes.push(m);for(const m of items.worldMeshes())interactionMeshes.push(m);
    cachedInteractionHit=collisions.raycastFromCamera(camera,interactionMeshes,maxDistance);interactionRayTimer=.05;
    return cachedInteractionHit;
  }

  function computeAimedHostileRobot(maxDistance=6){
    hackRaycaster.setFromCamera(hackNdc,camera);hackRaycaster.near=.05;hackRaycaster.far=maxDistance;
    const localWorld=collisions.nearbyRaycastMeshes?.(camera.position,maxDistance+2)||collisions.raycastMeshes;
    hackMeshSet.clear();for(const m of enemies.hostileHittableMeshes())if(m)hackMeshSet.add(m);for(const m of localWorld)if(m)hackMeshSet.add(m);for(const m of train.getRaycastMeshes())if(m)hackMeshSet.add(m);hackMeshes.length=0;for(const m of hackMeshSet)hackMeshes.push(m);
    const hit=hackRaycaster.intersectObjects(hackMeshes,false)[0];
    const enemy=hit?.object?.userData?.enemy;
    cachedHackAim=enemy&&enemy.faction===window.IronWastesFaction?.HOSTILE?{enemy,hit}:null;hackAimTimer=.065;return cachedHackAim;
  }

  function classAbilityPrompt(dt){
    const cfg=window.__IRON_WASTES_CLASS__||CLASS_SYSTEM?.get?.(selectedClassKey);const ability=cfg?.specialAbility;
    if(ability==='tesla'){
      if(player.consumePress('KeyG')){
        if((player.classAbilityCooldown||0)>0){economy.showToast?.(`EMP: ${Math.ceil(player.classAbilityCooldown)} С`,900);}
        else {const count=enemies.stunHostiles(player.position,8,2.5);player.classAbilityCooldown=35;economy.showToast?.(count?`EMP: ОГЛУШЕНО ${count}`:'EMP: ЦЕЛЕЙ НЕТ',1200);}
      }
      return (player.classAbilityCooldown||0)>0?`[G] EMP — ${Math.ceil(player.classAbilityCooldown)} С`:'[G] EMP ИМПУЛЬС — ГОТОВ';
    }
    if(ability!=='robototechnician'){hackTarget=null;hackProgress=0;hackDamageSerial=player.damageSerial||0;return '';}
    hackAimTimer-=dt;const aimed=(hackAimTimer<=0||player.justPressed.has('KeyG'))?computeAimedHostileRobot(6):cachedHackAim,enemy=aimed?.enemy||null;
    if(!enemy){hackTarget=null;hackProgress=0;hackDamageSerial=player.damageSerial||0;return '';}
    if(enemies.allyCount()>=2){hackTarget=null;hackProgress=0;return 'ЛИМИТ СОЮЗНЫХ АВТОМАТОВ: 2';}
    if(enemy.hackAttempted){hackTarget=null;hackProgress=0;return 'ПРОТОКОЛ ЭТОГО АВТОМАТА УЖЕ ПРОВЕРЕН';}
    if(hackTarget!==enemy){hackTarget=enemy;hackProgress=0;hackDamageSerial=player.damageSerial||0;}
    if((player.damageSerial||0)!==hackDamageSerial){hackProgress=0;hackDamageSerial=player.damageSerial||0;return '[УДЕРЖИВАТЬ G] СТАБИЛИЗИРОВАТЬ СИГНАЛ — 0%';}
    if(player.keys.KeyG){
      hackProgress+=dt;
      if(hackProgress>=hackDuration){
        enemy.hackAttempted=true;hackProgress=0;hackTarget=null;
        if(Math.random()<.5){enemy.emitHackPulse?.(true);enemies.convertToAlly(enemy);economy.showToast?.('АВТОМАТ ПЕРЕПРОГРАММИРОВАН',1800);}
        else {enemy.emitHackPulse?.(false);enemy.awake=true;enemy.healthVisibleTimer=4;economy.showToast?.('ПРОТОКОЛ ОТКЛОНЁН',1500);}
        return '';
      }
    } else hackProgress=0;
    return `[УДЕРЖИВАТЬ G] ПЕРЕПРОГРАММИРОВАТЬ — ${Math.round(hackProgress/hackDuration*100)}% · ШАНС 50%`;
  }

  function processInteraction(dt) {
    let holdingLeak = false;
    let holdingJam = false;
    let prompt = '';

    if (!player.pointerLocked || player.dead || completeShown || trainDestroyedShown || economy.isOpen) {
      train.updateHoldRepairs(dt, false, false);
      ui.prompt('');
      return;
    }

    const abilityPrompt = classAbilityPrompt(dt);

    if (player.consumePress('KeyQ') && player.carriedItem) {
      prompt = items.dropCarried(player) ? 'Предмет положен' : 'Здесь нельзя положить предмет';
    }

    interactionRayTimer-=dt;const hit=(interactionRayTimer<=0||player.justPressed.has('KeyE'))?refreshAimedObject(3.5):cachedInteractionHit;
    if (hit) {
      const pickup = hit.object.userData.pickupRoot;
      const type = hit.object.userData.interactive;

      if (pickup && !pickup.userData.carried) {
        if (pickup.userData.type === 'Ammo') {
          const ammoType = pickup.userData.weaponType || 'auto';
          const ammoAmount = pickup.userData.ammoAmount || 12;
          const targetType = ammoType === 'auto' ? player.resolveAutoAmmoWeapon() : ammoType;
          if (!targetType || !player.weapons[targetType]?.owned) {
            prompt = 'Боеприпасы — сначала нужно подходящее оружие';
          } else {
            prompt = `[E] Подобрать ${pickup.userData.label} (+${ammoAmount})`;
            if (player.consumePress('KeyE')) items.collectAmmo(pickup, player);
          }
        } else if (player.carriedItem) {
          prompt = `Руки заняты — вы несёте ${player.carriedItem.userData.label} (Q — бросить)`;
        } else {
          prompt = `[E] Взять ${pickup.userData.label}`;
          if (player.consumePress('KeyE')) items.carry(pickup, player);
        }
      } else if (type === 'supplyClerk') {
        prompt = economy.starterClaimed ? 'Снабженец — стартовый капитал уже получен' : `[E] Получить дорожное снабжение (+${economy.getStarterCapital?.() || 120} кредитов)`;
        if (player.consumePress('KeyE')) economy.claimStarterCapital();
      } else if (type === 'shop') {
        const label = hit.object.userData.shopLabel || 'Магазин';
        prompt = `[E] Открыть: ${label}`;
        if (player.consumePress('KeyE')) economy.openShop(hit.object.userData.shopId, hit.object.userData.dropPoint);
      } else if (type === 'fireboxDoor') {
        prompt = `[E] ${train.fireboxOpen ? 'Закрыть' : 'Открыть'} дверцу топки`;
        if (player.consumePress('KeyE')) train.toggleFireboxDoor();
      } else if (type === 'fireboxOpening') {
        if (!train.fireboxOpen) {
          prompt = '[E] Открыть дверцу топки';
          if (player.consumePress('KeyE')) train.toggleFireboxDoor();
        } else if (!train.canLoadFirebox(player.position)) {
          prompt = 'Подойдите ближе к открытой топке из кабины';
        } else if (player.carriedItem?.userData.type === 'Coal') {
          prompt = '[E] Загрузить уголь в топку';
          if (player.consumePress('KeyE')) {
            if (train.addCoal(1) && items.consumeCarried(player, 'Coal')) tutorial?.notifyCoalLoaded();
          }
        } else if (player.carriedItem) {
          prompt = `В топку нельзя загрузить ${player.carriedItem.userData.label} — нужен уголь`;
        } else {
          prompt = 'Топка открыта — принесите сюда уголь';
        }
      } else if (type === 'valve') {
        prompt = train.pressure <= .05
          ? 'Паровой клапан — давления почти нет'
          : `[Удерживать E] Сбросить пар — ${Math.round(train.pressure)}% (${({NORMAL:'НОРМА',HIGH:'ВЫСОКОЕ',CRITICAL:'КРИТИЧЕСКОЕ'})[train.pressureState()]})`;
        if (player.keys.KeyE && train.pressure > .05) train.openValve(dt);
      } else if (type === 'throttle') {
        if (train.atStation && !train.departureUnlocked) {
          prompt = 'Тяга заблокирована на станции';
        } else {
          prompt = `[E] УВЕЛИЧИТЬ ТЯГУ · [SHIFT + E] УМЕНЬШИТЬ · ТЯГА: ${Math.round(train.throttle*100)}%`;
          if (player.consumePress('KeyE')) {
            const reverse = player.keys.ShiftLeft || player.keys.ShiftRight;
            train.adjustThrottle(reverse ? -.25 : .25);
          }
        }
      } else if (type === 'brake') {
        prompt = train.atStation && !train.departureUnlocked
          ? 'Тормоз заблокирован на станции'
          : `[E] ${train.brake > .5 ? 'Отпустить' : 'Включить'} тормоз`;
        if (player.consumePress('KeyE')) train.toggleBrake();
      } else if (type === 'leak') {
        if (!train.leakActive) {
          prompt = 'Паровая труба — исправна';
        } else {
          const pct = Math.min(100, Math.round(train.leakProgress / 3 * 100));
          prompt = `[Удерживать E] Устранить УТЕЧКУ ПАРА — ${pct}%`;
          holdingLeak = Boolean(player.keys.KeyE);
        }
      } else if (type === 'mechanism') {
        if (!train.jammedActive) {
          prompt = 'Механизм привода — исправен';
        } else {
          const pct = Math.min(100, Math.round(train.jamProgress / 2.5 * 100));
          prompt = `[Удерживать E] Освободить ЗАКЛИНИВШИЙ МЕХАНИЗМ — ${pct}%`;
          holdingJam = Boolean(player.keys.KeyE);
        }
      } else if (type === 'repairPanel') {
        if (train.integrity >= 100) {
          prompt = 'Прочность поезда — 100%';
        } else if (player.carriedItem?.userData.type === 'Scrap Metal') {
          prompt = `[E] Починить поезд металлоломом в руках — ${Math.round(train.integrity)}%`;
          if (player.consumePress('KeyE') && train.repairIntegrity(25)) items.consumeCarried(player, 'Scrap Metal');
        } else if (player.inventory.scrap > 0) {
          prompt = `[E] Починить поезд металлоломом из запаса (${player.inventory.scrap}) — ${Math.round(train.integrity)}%`;
          if (player.consumePress('KeyE') && train.repairIntegrity(25)) player.inventory.scrap--;
        } else {
          prompt = `Ремонтная панель — нужен металлолом (${Math.round(train.integrity)}%)`;
        }
      } else if (type === 'storage') {
        if (player.carriedItem) {
          prompt = `[E] Положить ${player.carriedItem.userData.label} в грузовое хранилище`;
          if (player.consumePress('KeyE')) items.stowCarried(player);
        } else {
          const wantScrap = Boolean(player.keys.ShiftLeft || player.keys.ShiftRight);
          if (wantScrap && player.inventory.scrap > 0) {
            prompt = `[Shift+E] Взять металлолом (${player.inventory.scrap})`;
            if (player.consumePress('KeyE')) items.takeStored('Scrap Metal', player);
          } else if (player.inventory.coal > 0) {
            prompt = `[E] Взять уголь (${player.inventory.coal})${player.inventory.scrap>0 ? ` | Shift+E металлолом (${player.inventory.scrap})` : ''}`;
            if (player.consumePress('KeyE')) items.takeStored('Coal', player);
          } else if (player.inventory.scrap > 0) {
            prompt = `[E] Взять металлолом (${player.inventory.scrap})`;
            if (player.consumePress('KeyE')) items.takeStored('Scrap Metal', player);
          } else if (player.inventory.medkit > 0) {
            prompt = `Грузовое хранилище — ${player.inventory.medkit} аптечек (H — использовать)`;
          } else {
            prompt = 'Грузовое хранилище — приносите сюда уголь, металлолом и аптечки';
          }
        }
      }
    }

    train.updateHoldRepairs(dt, holdingLeak, holdingJam);

    if (!prompt) {
      if (player.weapon.reloading) prompt = 'ПЕРЕЗАРЯДКА...';
      else if (player.carriedItem) prompt = `В руках: ${player.carriedItem.userData.label} — Q бросить`;
    }
    if(!prompt&&abilityPrompt)prompt=abilityPrompt;
    ui.prompt(prompt);
  }

  function stationAreaContains(position) {
    return position.z >= 403 && position.z <= 458 && position.x >= 2.2 && position.x <= 31;
  }

  function showTrainDestroyed() {
    if (trainDestroyedShown) return;
    trainDestroyedShown = true;
    player.setGameplayLocked(true);
    train.updateHoldRepairs(0, false, false);
    ui.prompt('');
    ui.showTrainDestroyed();
  }

  function showComplete() {
    if (completeShown) return;
    completeShown = true;
    if (CLASS_SYSTEM && !completeRewardGranted) { completeRewardGranted=true; CLASS_SYSTEM.addMarks(120); updateClassUI(); }
    const p=document.querySelector('#completeScreen p'); if(p) p.textContent='Глава I завершена. Восточный комплекс открыл канал. Награда профиля: +120 марок классов.';
    player.setGameplayLocked(true);
    train.updateHoldRepairs(0, false, false);
    ui.prompt('');
    ui.showComplete();
  }

  function beginCompleteSequence(){
    if(completeSequenceStarted||completeShown||endCutscene.active)return;
    completeSequenceStarted=true;player.setGameplayLocked(true);train.updateHoldRepairs(0,false,false);ui.prompt('');document.exitPointerLock?.();
    const playerClass=CLASS_SYSTEM?.get?.(selectedClassKey)||CLASS_SYSTEM?.get?.('machinist');
    endCutscene.play({playerClass,onComplete:()=>showComplete()});
  }

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(.033, (now-lastTime)/1000 || .016);
    lastTime = now;
    performanceGovernor?.update(dt);
    if(performanceGovernor&&performanceGovernor.quality!==appliedPerformanceQuality){appliedPerformanceQuality=performanceGovernor.quality;dayNight.setPerformanceQuality?.(appliedPerformanceQuality);}
    const gameActive = started && !player.dead && !completeShown && !completeSequenceStarted && !trainDestroyedShown;
    if (gameActive) elapsed += dt;
    const visualDt = (!started || gameActive) ? dt : 0;
    debugFpsAccum += dt; debugFpsFrames++;
    if (debugFpsAccum >= 1) { debugFps = Math.round(debugFpsFrames / debugFpsAccum); debugFpsAccum = 0; debugFpsFrames = 0; }
    if (introMode || introCutscene.active) {
      introCutscene.update(dt);
      if (introCutscene.active) introCutscene.render();
      return;
    }
    if (endCutscene.active) {
      const focus=train.group.position;
      dayNight.setMotionSpeed?.(0);updateAtmosphere(dt,focus,'atmosphereEnd');
      const artDt=performanceGovernor?performanceGovernor.consume('worldArtEnd',dt,1/30):dt;if(artDt)worldArt.update(artDt,focus,weather,performanceGovernor?.quality==='LOW'?.82:performanceGovernor?.quality==='MEDIUM'?.92:1);
      const poiDt=performanceGovernor?performanceGovernor.consume('poiEnd',dt,.15):dt;if(poiDt)worldPOI?.updateVisuals?.(dayNight.nightFactor,focus,performanceGovernor?.quality==='LOW'?155:185);
      train.setWeatherVisuals?.(weather);train.setNightFactor(dayNight.nightFactor,elapsed,scene.fog?.density||.0092);train.updateSteam(dt);endCutscene.update(dt);renderer.render(scene,camera);return;
    }
    if (!started) {
      menuTime += dt;
      dayNight.time = (415 + menuTime*.15) % dayNight.totalDuration;
      const drift = cinematicEnabled ? Math.sin(menuTime*.10)*1.75 : 0;
      const lift = cinematicEnabled ? Math.sin(menuTime*.07+.8)*.18 : 0;
      camera.fov = 57; camera.updateProjectionMatrix();
      camera.position.set(-8.8+drift,3.55+lift,10.2+Math.cos(menuTime*.08)*.75);
      menuTarget.set(.65,3.05,.45+Math.sin(menuTime*.06)*.35); camera.lookAt(menuTarget);
      setViewmodelsVisible(false);
      menuSmokeTimer-=dt;
      if(menuSmokeTimer<=0){menuSmokeTimer=.22+Math.random()*.18;const pos=train.chimney.localToWorld(menuSmokePos.set(0,1.18,0));train.emitSmoke(pos,menuSmokeVel.set((Math.random()-.5)*.12,.72+Math.random()*.18,(Math.random()-.5)*.1),.92+Math.random()*.25);}
    }
    const lightingFocus = started ? player.position : camera.position;
    dayNight.setMotionSpeed?.(started ? (train.speed || 0) : 0);
    dayNight.setExposureInfluence?.(train.getExposureInfluence?.(lightingFocus) || 0);
    updateAtmosphere(visualDt,lightingFocus,'atmosphere');
    const artDt=performanceGovernor?performanceGovernor.consume('worldArt',visualDt,1/30):visualDt;
    if(artDt)worldArt.update(artDt,lightingFocus,weather,performanceGovernor?.quality==='LOW'?.82:performanceGovernor?.quality==='MEDIUM'?.92:1);
    const poiDt=performanceGovernor?performanceGovernor.consume('poi',visualDt,.15):visualDt;
    if(poiDt)worldPOI?.updateVisuals?.(dayNight.nightFactor,lightingFocus,performanceGovernor?.quality==='LOW'?155:185);
    train.setWeatherVisuals?.(weather);
    train.setNightFactor(dayNight.nightFactor, elapsed, scene.fog?.density || .0092);
    headlightRayTimer -= dt;
    if (headlightRayTimer <= 0) {
      headlightRayTimer = .12;
      const from=train.headlight?.getWorldPosition?.(headlightFrom);
      if(from){
        const to=train.group.localToWorld(headlightTo.set(0,1.15,86));
        const hit=collisions.raycastSegment(from,to,[]);
        train.setHeadlightBeamDistance?.(hit?Math.max(6,hit.distance-.45):82);
      }
    }

    if (gameActive) {
      const wasOnTrainBefore = train.playerOnTrain(player.position);
      train.update(dt, elapsed, player.position);

      if (train.destroyed) {
        showTrainDestroyed();
      } else if (train.finished) {
        // Finish is terminal immediately: no last-frame shot/interaction after crossing the gate.
        beginCompleteSequence();
      } else {
        player.updateClassEffects?.(dt,dayNight,train);
        player.update(dt, train, wasOnTrainBefore);

        if ((train.atStation && train.currentStop?.id === 'abandoned') || stationAreaContains(player.position)) enemies.awakenStationEnemies();

        processInteraction(dt);
        player.justPressed.clear();
        items.update(dt, elapsed, player);
        const distanceKm = Math.max(0, train.group.position.z / 100);
        const safeZone = portSafeZones.some(z => Math.abs(player.position.z-z.z)<=z.halfZ && Math.abs(player.position.x-z.x)<=z.halfX);
        enemies.update(dt, player, camera, {phase:dayNight.phase, nightFactor:dayNight.nightFactor, distanceKm, safeZone});
        tutorial?.update(dt);
      }
      const hudDt=performanceGovernor?performanceGovernor.consume('hud',dt,.08):dt;if(hudDt)ui.update(player,train,dayNight);
    } else {
      if (started) items.update(dt, elapsed, player);
      train.updateSteam(dt);
      if(started){const hudDt=performanceGovernor?performanceGovernor.consume('hudIdle',dt,.10):dt;if(hudDt)ui.update(player,train,dayNight);}
    }

    renderer.render(scene, camera);
    if (window.__IRON_WASTES_LIGHT_DEBUG__) {
      const info=renderer.info;
      window.__IRON_WASTES_LIGHT_DEBUG__.fps=debugFps;
      window.__IRON_WASTES_LIGHT_DEBUG__.renderer={
        geometries:info.memory?.geometries||0,
        textures:info.memory?.textures||0,
        programs:Array.isArray(info.programs)?info.programs.length:0,
        calls:info.render?.calls||0,
        triangles:info.render?.triangles||0
      };
    }
  }

  requestAnimationFrame(animate);
})();
