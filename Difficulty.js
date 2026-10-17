(() => {
  const PRESETS = Object.freeze({
    easy: Object.freeze({
      key: 'easy',
      label: 'ЛЁГКАЯ',
      shortDescription: 'Больше ресурсов, слабее автоматы',
      description: 'Для первого прохождения и исследования: меньше входящего урона, реже аварии, спокойнее ночь и немного дешевле снабжение.',
      incomingDamageMultiplier: 0.70,
      enemyHealthMultiplier: 0.85,
      enemyDamageMultiplier: 0.75,
      enemySpeedMultiplier: 0.95,
      nightSpawnIntervalMultiplier: 1.40,
      enemyLocalMaxOffset: -2,
      enemyDynamicMaxOffset: -2,
      sniperAimTimeMultiplier: 1.30,
      sniperReloadMultiplier: 1.15,
      faultRateMultiplier: 0.70,
      trainDamageMultiplier: 0.75,
      lootMultiplier: 1.25,
      shopPriceMultiplier: 0.90,
      scrapRewardMultiplier: 1.20,
      starterCredits: 140
    }),
    normal: Object.freeze({
      key: 'normal',
      label: 'НОРМАЛЬНАЯ',
      shortDescription: 'Рекомендуемый баланс Iron Wastes',
      description: 'Текущий базовый баланс Pre-Beta: стандартная экономика, ночь, неисправности, урон и количество автоматонов.',
      incomingDamageMultiplier: 1.00,
      enemyHealthMultiplier: 1.00,
      enemyDamageMultiplier: 1.00,
      enemySpeedMultiplier: 1.00,
      nightSpawnIntervalMultiplier: 1.00,
      enemyLocalMaxOffset: 0,
      enemyDynamicMaxOffset: 0,
      sniperAimTimeMultiplier: 1.00,
      sniperReloadMultiplier: 1.00,
      faultRateMultiplier: 1.00,
      trainDamageMultiplier: 1.00,
      lootMultiplier: 1.00,
      shopPriceMultiplier: 1.00,
      scrapRewardMultiplier: 1.00,
      starterCredits: 120
    }),
    hard: Object.freeze({
      key: 'hard',
      label: 'ТЯЖЁЛАЯ',
      shortDescription: 'Меньше ресурсов, опаснее ночь и сильнее враги',
      description: 'Для знакомых с маршрутом: опаснее атаки, активнее Night Spawn, чаще неисправности и немного более дорогие припасы.',
      incomingDamageMultiplier: 1.25,
      enemyHealthMultiplier: 1.15,
      enemyDamageMultiplier: 1.20,
      enemySpeedMultiplier: 1.05,
      nightSpawnIntervalMultiplier: 0.80,
      enemyLocalMaxOffset: 2,
      enemyDynamicMaxOffset: 2,
      sniperAimTimeMultiplier: 0.85,
      sniperReloadMultiplier: 0.90,
      faultRateMultiplier: 1.25,
      trainDamageMultiplier: 1.20,
      lootMultiplier: 0.85,
      shopPriceMultiplier: 1.10,
      scrapRewardMultiplier: 0.90,
      starterCredits: 100
    })
  });

  const STORAGE_KEY = 'ironWastesDifficulty';

  function get(key) {
    return PRESETS[key] || PRESETS.normal;
  }

  function savedKey() {
    try {
      const key = sessionStorage.getItem(STORAGE_KEY);
      return PRESETS[key] ? key : 'normal';
    } catch (_) {
      return 'normal';
    }
  }

  function saveKey(key) {
    const resolved = get(key).key;
    try { sessionStorage.setItem(STORAGE_KEY, resolved); } catch (_) {}
    return resolved;
  }

  window.IronWastesDifficulty = Object.freeze({ PRESETS, get, savedKey, saveKey });
})();
