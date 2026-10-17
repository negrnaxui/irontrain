(() => {
  const base = {
    fuelBurnMultiplier:1,
    repairMultiplier:1,
    reloadMultiplier:1,
    starterCoalBonus:0,
    starterMedkitBonus:0,
    medkitHealMultiplier:1,
    environmentalDamageMultiplier:1,
    enemyLootMultiplier:1,
    poiLootMultiplier:1,
    shopPriceMultiplier:1,
    baseMaxHp:100,
    baseMoveMultiplier:1,
    baseSprintMultiplier:1,
    baseJumpMultiplier:1,
    baseMeleeMultiplier:1,
    incomingMeleeMultiplier:1,
    detectionMultiplier:1,
    onTrainReloadMultiplier:1,
    onTrainIncomingMultiplier:1,
    offTrainMoveMultiplier:1,
    specialAbility:null,
    rarity:'common'
  };

  const make = cfg => Object.freeze(Object.assign({}, base, cfg));
  const CLASSES = Object.freeze({
    machinist: make({
      key:'machinist', label:'МАШИНИСТ', price:0, iconType:'gear',
      tagline:'Сбалансированный путь',
      description:'Базовый класс экспедиции. Без штрафов и специальных бонусов.',
      pros:['Без штрафов','Предсказуемый старт'], cons:[]
    }),
    stoker: make({
      key:'stoker', label:'КОЧЕГАР', price:160, iconType:'flame',
      tagline:'Экономит топливо',
      description:'Лучше чувствует котёл: уголь расходуется медленнее, а в начале маршрута есть небольшой запас топлива.',
      fuelBurnMultiplier:.92, starterCoalBonus:1,
      pros:['−8% расход угля','+1 стартовый уголь'], cons:[]
    }),
    mechanic: make({
      key:'mechanic', label:'МЕХАНИК', price:220, iconType:'wrench',
      tagline:'Сильнее ремонт',
      description:'Каждая единица металлолома восстанавливает больше прочности локомотива.',
      repairMultiplier:1.20,
      pros:['+20% эффективность ремонта'], cons:[]
    }),
    marksman: make({
      key:'marksman', label:'СТРЕЛОК', price:260, iconType:'reticle',
      tagline:'Быстрее перезарядка',
      description:'Оружие остаётся тем же, но перезарядка огнестрельного оружия занимает примерно на 10% меньше времени.',
      reloadMultiplier:.90,
      pros:['−10% время перезарядки'], cons:[]
    }),
    plagueDoctor: make({
      key:'plagueDoctor', label:'ЧУМНОЙ ДОКТОР', price:300, iconType:'mask',
      tagline:'Выживание и медицина',
      description:'Аптечки работают заметно лучше. Начинает экспедицию с дополнительной аптечкой и лучше переносит опасную среду.',
      starterMedkitBonus:1, medkitHealMultiplier:1.35, environmentalDamageMultiplier:.82,
      pros:['+35% лечение аптечкой','+1 стартовая аптечка','−18% environmental damage'], cons:[]
    }),
    marauder: make({
      key:'marauder', label:'МАРОДЁР', price:340, iconType:'scrap',
      tagline:'Больше добычи',
      description:'Чаще находит Scrap и Ammo у уничтоженных машин и немного лучше обчищает точки интереса, но торговцы берут больше.',
      enemyLootMultiplier:1.20, poiLootMultiplier:1.18, shopPriceMultiplier:1.05,
      pros:['+20% шанс/объём боевого лута','Больше лута в POI'], cons:['Магазины +5%']
    }),
    bruiser: make({
      key:'bruiser', label:'ГРОМИЛА', price:380, iconType:'hammer',
      tagline:'Тяжёлый ближний бой',
      description:'Выносливый тяжёлый боец. Лопата бьёт значительно сильнее, но персонаж медленнее и дольше перезаряжает оружие.',
      baseMaxHp:130, baseMoveMultiplier:.92, baseSprintMultiplier:.92, baseMeleeMultiplier:1.30, reloadMultiplier:1.10,
      pros:['130 HP','Лопата +30% урона'], cons:['Скорость −8%','Перезарядка +10%']
    }),
    vampire: make({
      key:'vampire', label:'ВАМПИР', price:480, iconType:'vampire', rarity:'special',
      tagline:'Ночной хищник',
      description:'Дневной свет медленно обжигает его, но ночью кровь врагов становится источником силы.',
      specialAbility:'vampire',
      pros:['Вампирский нож','Lifesteal','Скорость и melee ночью'], cons:['Солнечный урон днём']
    }),
    werewolf: make({
      key:'werewolf', label:'ОБОРОТЕНЬ', price:520, iconType:'werewolf', rarity:'special',
      tagline:'Зверь пробуждается ночью',
      description:'При свете дня ослаблен. После наступления ночи превращается в крайне опасного охотника ближнего боя.',
      specialAbility:'werewolf', baseMaxHp:90, baseMoveMultiplier:.90, baseSprintMultiplier:.90, baseMeleeMultiplier:.80,
      pros:['Огромная сила ночью','Высокая скорость ночью','135 HP ночью'], cons:['Ослаблен днём']
    }),

    teslaEngineer: make({
      key:'teslaEngineer', label:'ТЕСЛА-ИНЖЕНЕР', price:600, iconType:'tesla', rarity:'advanced',
      tagline:'EMP-контроль поля боя',
      description:'Хрупкий инженер с ручным импульсным генератором. Коротко глушит вражеские автоматы вокруг себя.',
      baseMaxHp:90, specialAbility:'tesla',
      pros:['[G] EMP: радиус 8 м','Оглушение 2.5 сек'], cons:['90 HP','Перезарядка EMP 35 сек']
    }),
    ghost: make({
      key:'ghost', label:'ПРИЗРАК', price:520, iconType:'ghost', rarity:'advanced',
      tagline:'Избегает ненужных боёв',
      description:'Двигается легче и тише, поэтому автоматы замечают его с меньшей дистанции. Ошибка обходится дорого.',
      baseMaxHp:85, baseMoveMultiplier:1.08, baseSprintMultiplier:1.08, detectionMultiplier:.75,
      pros:['Дальность обнаружения врагами −25%','Скорость +8%'], cons:['85 HP']
    }),
    berserker: make({
      key:'berserker', label:'БЕРСЕРК', price:500, iconType:'berserk', rarity:'advanced',
      tagline:'Сильнее на грани смерти',
      description:'Чем меньше здоровья, тем опаснее становится в ближнем бою. Аптечки лечат хуже.',
      medkitHealMultiplier:.80, specialAbility:'berserker',
      pros:['Melee +35% при HP 25–50%','Melee +70% при HP <25%','Скорость +8% при HP <25%'], cons:['Аптечки −20%']
    }),
    conductor: make({
      key:'conductor', label:'КОНДУКТОР', price:420, iconType:'conductor', rarity:'advanced',
      tagline:'Сражается от своего поезда',
      description:'Лучше всего чувствует себя рядом с локомотивом: быстрее перезаряжает оружие и лучше держит удар на борту.',
      onTrainReloadMultiplier:.85, onTrainIncomingMultiplier:.85, offTrainMoveMultiplier:.95, specialAbility:'conductor',
      pros:['На поезде: reload −15%','На поезде: входящий урон −15%'], cons:['Вне поезда скорость −5%']
    }),
    robototechnician: make({
      key:'robototechnician', label:'РОБОТОТЕХНИК', price:760, iconType:'robototech', rarity:'prestige',
      tagline:'Перепрограммирует машины',
      description:'Специалист по старым системам управления. Может попытаться обратить вражеский автомат против своих.',
      specialAbility:'robototechnician',
      pros:['[G] Перепрограммирование','50% шанс','До 2 союзных автоматов'], cons:['Одна попытка на каждого робота']
    })
  });

  const KEYS={owned:'ironWastesOwnedClasses',selected:'ironWastesSelectedClass',marks:'ironWastesClassMarks'};
  function safeGet(key,fallback){try{const v=localStorage.getItem(key);return v==null?fallback:v;}catch(_){return fallback;}}
  function safeSet(key,value){try{localStorage.setItem(key,value);}catch(_){}}
  function ownedSet(){
    try{const parsed=JSON.parse(safeGet(KEYS.owned,'["machinist"]'));const set=new Set(Array.isArray(parsed)?parsed:['machinist']);set.add('machinist');return set;}catch(_){return new Set(['machinist']);}
  }
  function saveOwned(set){safeSet(KEYS.owned,JSON.stringify([...set]));}
  function marks(){const raw=safeGet(KEYS.marks,null);if(raw==null){safeSet(KEYS.marks,'320');return 320;}const n=Number(raw);return Number.isFinite(n)?Math.max(0,Math.floor(n)):320;}
  function setMarks(v){const n=Math.max(0,Math.floor(Number(v)||0));safeSet(KEYS.marks,String(n));return n;}
  function selectedKey(){const key=safeGet(KEYS.selected,'machinist');return CLASSES[key]&&ownedSet().has(key)?key:'machinist';}
  function select(key){if(!CLASSES[key]||!ownedSet().has(key))return false;safeSet(KEYS.selected,key);return true;}
  function buy(key){const c=CLASSES[key];if(!c)return{ok:false,reason:'missing'};const owned=ownedSet();if(owned.has(key))return{ok:true,already:true,marks:marks()};const balance=marks();if(balance<c.price)return{ok:false,reason:'funds',marks:balance};owned.add(key);saveOwned(owned);setMarks(balance-c.price);return{ok:true,marks:marks()};}
  function addMarks(amount){return setMarks(marks()+Math.max(0,Math.floor(Number(amount)||0)));}
  function get(key){return CLASSES[key]||CLASSES.machinist;}
  function isOwned(key){return ownedSet().has(key);}

  window.IronWastesClasses=Object.freeze({CLASSES,get,ownedSet,marks,setMarks,addMarks,selectedKey,select,buy,isOwned});
})();
