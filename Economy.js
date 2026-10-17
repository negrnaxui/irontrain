class EconomySystem {
  constructor(player, itemSystem, train, ui) {
    this.player = player;
    this.items = itemSystem;
    this.train = train;
    this.ui = ui;
    this.starterClaimed = false;
    this.isOpen = false;
    this.currentShop = null;
    this.currentDropPoint = null;
    this.purchaseCounts = Object.create(null);
    this.panel = document.getElementById('shopScreen');
    this.titleEl = document.getElementById('shopTitle');
    this.moneyEl = document.getElementById('shopMoney');
    this.listEl = document.getElementById('shopItems');
    this.closeButton = document.getElementById('shopClose');
    this.toastEl = document.getElementById('toast');
    this.toastTimer = null;
    this.difficulty = { shopPriceMultiplier:1, scrapRewardMultiplier:1, starterCredits:120 };
    this.classConfig = { shopPriceMultiplier:1 };

    this.shops = {
      startGeneral: {
        title: 'СКЛАД СНАБЖЕНИЯ',
        products: [
          { id:'coal', label:'Кусок угля', price:12, kind:'item', itemType:'Coal', description:'Физический уголь. Донесите до хранилища или топки.' },
          { id:'medkit', label:'Аптечка', price:30, kind:'item', itemType:'Medkit', description:'Восстанавливает здоровье. Можно хранить в вагоне.' }
        ]
      },
      startArmory: {
        title: 'ОРУЖЕЙНАЯ ЛАВКА',
        products: [
          { id:'revolver', label:'Стимпанк-револьвер', price:75, kind:'weapon', weapon:'revolver', description:'Надёжное вторичное оружие. Слот 3.' },
          { id:'revAmmo', label:'12 патронов для револьвера', price:18, kind:'ammo', weapon:'revolver', amount:12, description:'Физическая коробка боеприпасов.' }
        ]
      },
      startWorkshop: {
        title: 'РЕМОНТНАЯ МАСТЕРСКАЯ',
        products: [
          { id:'repair', label:'Ремонт локомотива +30%', price:36, kind:'repair', amount:30, description:'Платный ремонт, если состав повреждён.' },
          { id:'coal', label:'Кусок угля', price:12, kind:'item', itemType:'Coal', description:'Запас из угольного склада рядом с мастерской.' }
        ]
      },
      weaponPort: {
        title: 'ОРУЖЕЙНЫЙ ПОРТ — АРСЕНАЛ',
        products: [
          { id:'shotgun', label:'Паровой дробовик', price:135, kind:'weapon', weapon:'shotgun', description:'Мощный бой на короткой дистанции. Основной слот 2.' },
          { id:'rifle', label:'Винтовка дальнего боя', price:160, kind:'weapon', weapon:'rifle', description:'Точная и дальнобойная. Основной слот 2.' },
          { id:'shotAmmo', label:'10 патронов для дробовика', price:28, kind:'ammo', weapon:'shotgun', amount:10, description:'Коробка боеприпасов.' },
          { id:'rifleAmmo', label:'18 патронов для винтовки', price:30, kind:'ammo', weapon:'rifle', amount:18, description:'Коробка боеприпасов.' },
          { id:'medkit', label:'Аптечка', price:32, kind:'item', itemType:'Medkit', description:'Запас лечения в дорогу.' },
          { id:'sellScrap', label:'Продать 1 металлолом', price:0, kind:'sellScrap', value:14, description:'Оружейники принимают пригодный металл.' }
        ]
      },
      tradePort: {
        title: 'ТОРГОВЫЙ ПОРТ',
        products: [
          { id:'coal', label:'Кусок угля', price:14, kind:'item', itemType:'Coal', description:'Физический груз.' },
          { id:'medkit', label:'Аптечка', price:28, kind:'item', itemType:'Medkit', description:'Медицинский набор.' },
          { id:'universalAmmo', label:'Ящик боеприпасов', price:24, kind:'ammo', weapon:'auto', amount:12, description:'Подходит к выбранному купленному оружию.' },
          { id:'sellScrap', label:'Продать 1 металлолом', price:0, kind:'sellScrap', value:14, description:'Металлолом можно оставить для ремонта или продать.' }
        ]
      },
      settlementPort: {
        title: 'ПОРТ-ПОСЕЛЕНИЕ',
        products: [
          { id:'coal', label:'Кусок угля', price:13, kind:'item', itemType:'Coal', description:'Физический груз.' },
          { id:'medkit', label:'Аптечка', price:30, kind:'item', itemType:'Medkit', description:'Восстанавливает здоровье.' },
          { id:'ammo', label:'Ящик боеприпасов', price:25, kind:'ammo', weapon:'auto', amount:14, description:'Боеприпасы для выбранного оружия.' },
          { id:'repair', label:'Ремонт локомотива +30%', price:38, kind:'repair', amount:30, description:'Мастерская восстанавливает прочность состава.' },
          { id:'sellScrap', label:'Продать 1 металлолом', price:0, kind:'sellScrap', value:13, description:'Быстрый обмен металлолома на кредиты.' }
        ]
      }
    };

    this.closeButton?.addEventListener('click', () => this.closeShop(true));
    window.addEventListener('keydown', e => {
      if (this.isOpen && e.code === 'Escape') {
        e.preventDefault();
        this.closeShop(true);
      }
    });
  }


  applyDifficulty(config = {}) {
    this.difficulty = {
      shopPriceMultiplier: Number.isFinite(config.shopPriceMultiplier) ? config.shopPriceMultiplier : 1,
      scrapRewardMultiplier: Number.isFinite(config.scrapRewardMultiplier) ? config.scrapRewardMultiplier : 1,
      starterCredits: Number.isFinite(config.starterCredits) ? Math.max(0, Math.round(config.starterCredits)) : 120
    };
    if (this.isOpen) this.renderShop();
  }

  applyClass(config = {}) {
    this.classConfig = { shopPriceMultiplier: Number.isFinite(config.shopPriceMultiplier) ? config.shopPriceMultiplier : 1 };
    if (this.isOpen) this.renderShop();
  }

  getStarterCapital() {
    return this.difficulty.starterCredits || 120;
  }

  effectivePrice(product) {
    if (!product || product.kind === 'sellScrap') return 0;
    return Math.max(1, Math.round((product.price || 0) * (this.difficulty.shopPriceMultiplier || 1) * (this.classConfig?.shopPriceMultiplier || 1)));
  }

  effectiveScrapValue(product) {
    return Math.max(1, Math.round((product?.value || 0) * (this.difficulty.scrapRewardMultiplier || 1)));
  }

  getProductPrice(shopId, productId) {
    const shop = this.shops[shopId];
    const product = shop?.products?.find?.(p => p.id === productId);
    return product ? this.effectivePrice(product) : null;
  }

  showToast(text, duration = 2200) {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.classList.add('active');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl?.classList.remove('active'), duration);
  }

  claimStarterCapital() {
    if (this.starterClaimed) {
      this.showToast('Дорожное снабжение уже получено');
      return false;
    }
    this.starterClaimed = true;
    const credits = this.getStarterCapital();
    this.player.money += credits;
    this.showToast(`+${credits} КРЕДИТОВ — стартовый капитал получен`, 3000);
    return true;
  }

  openShop(shopId, dropPoint = null) {
    const shop = this.shops[shopId];
    if (!shop || !this.panel) return false;
    this.currentShop = shopId;
    this.currentDropPoint = dropPoint?.clone?.() || this.player.position.clone();
    this.isOpen = true;
    this.player.setGameplayLocked(true);
    document.exitPointerLock?.();
    this.renderShop();
    this.panel.classList.remove('hidden');
    return true;
  }

  closeShop(relock = false) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.currentShop = null;
    this.panel?.classList.add('hidden');
    this.player.setGameplayLocked(false);
    if (relock && this.player.domElement && !this.player.dead) {
      this.player.domElement.requestPointerLock?.();
    }
  }

  renderShop() {
    const shop = this.shops[this.currentShop];
    if (!shop || !this.listEl) return;
    this.titleEl.textContent = shop.title;
    this.moneyEl.textContent = `${this.player.money} КР.`;
    this.listEl.innerHTML = '';
    for (const product of shop.products) {
      const row = document.createElement('div');
      row.className = 'shop-item';
      const info = document.createElement('div');
      info.innerHTML = `<strong>${product.label}</strong><small>${product.description || ''}</small>`;
      const button = document.createElement('button');
      button.textContent = product.kind === 'sellScrap' ? `+${this.effectiveScrapValue(product)} КР.` : `${this.effectivePrice(product)} КР.`;
      button.addEventListener('click', () => this.buy(product));
      row.append(info, button);
      this.listEl.appendChild(row);
    }
  }

  resolveAmmoWeapon(requested) {
    if (requested && requested !== 'auto') return requested;
    return this.player.resolveAutoAmmoWeapon?.() || null;
  }

  spawnPurchasedItem(type, meta = {}) {
    const base = this.currentDropPoint?.clone?.() || this.player.position.clone().add(new THREE.Vector3(1,0,0));
    const item = this.items.spawn(type, base, meta);
    return item;
  }

  buy(product) {
    if (!product) return false;

    if (product.kind === 'sellScrap') {
      if (this.player.inventory.scrap <= 0) {
        this.showToast('Нет металлолома для продажи');
        return false;
      }
      const value = this.effectiveScrapValue(product);
      this.player.inventory.scrap--;
      this.player.money += value;
      this.showToast(`Металлолом продан: +${value} КР.`);
      this.renderShop();
      return true;
    }

    if (product.kind === 'weapon' && this.player.weapons[product.weapon]?.owned) {
      this.showToast('Это оружие уже куплено');
      return false;
    }
    if (product.kind === 'repair' && this.train.integrity >= 100) {
      this.showToast('Локомотив уже полностью исправен');
      return false;
    }
    const price = this.effectivePrice(product);
    if (this.player.money < price) {
      this.showToast('Недостаточно кредитов');
      return false;
    }

    let success = false;
    if (product.kind === 'item') {
      success = Boolean(this.spawnPurchasedItem(product.itemType));
    } else if (product.kind === 'weapon') {
      success = this.player.unlockWeapon(product.weapon);
    } else if (product.kind === 'ammo') {
      const weapon = this.resolveAmmoWeapon(product.weapon);
      if (!weapon) {
        this.showToast('Сначала купите огнестрельное оружие');
        return false;
      }
      success = Boolean(this.spawnPurchasedItem('Ammo', { weaponType:weapon, ammoAmount:product.amount }));
    } else if (product.kind === 'repair') {
      success = this.train.repairIntegrity(product.amount);
    }

    if (!success) {
      this.showToast('Покупку сейчас нельзя разместить');
      return false;
    }
    this.player.money -= price;
    const purchaseKey = product.itemType || product.weapon || product.id;
    this.purchaseCounts[purchaseKey] = (this.purchaseCounts[purchaseKey] || 0) + 1;
    this.showToast(`Покупка: ${product.label}`);
    this.renderShop();
    return true;
  }
}

window.EconomySystem = EconomySystem;
