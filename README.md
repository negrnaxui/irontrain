# Iron Wastes Pre-Beta — Story / Faction / End + Performance Pass

Эта сборка продолжает текущую Iron Wastes Pre-Beta. Проект не пересоздавался. Сохранены поезд, 40-км маршрут, пять портов, экономика, Easy/Normal/Hard, Day/Night, Weather, Tutorial, главное меню, Class Store, Intro, End Cutscene, 14 классов и четыре роли автоматов. `START_GAME.bat` и `server.ps1` не изменялись.

## Главное в этой версии

Помимо Story/Faction/End-функций предыдущей сборки выполнен отдельный performance pass. Цель — убрать сильные просадки CPU/GPU без заметного ухудшения картинки и без упрощения геймплея.

### Крупнейшие оптимизации

- Добавлен `Performance.js` с автоматическим governor качества. Он следит за реальным FPS, плавно снижает/повышает внутренний pixel ratio и меняет частоту обновления shadow maps.
- Обычный desktop стартует примерно с DPR до 1.15, максимум AUTO — около 1.30; на слабом режиме DPR может опускаться примерно до 0.78. Мобильный диапазон ниже.
- Directional shadow map больше не держится на дорогом 4096 в AUTO. LOW использует 1024, MEDIUM/HIGH — до 2048 с tight shadow frustum. `?iwUltra=1` оставляет 4096 как ручной режим для скриншотов.
- Shadow maps обновляются не обязательно на каждом display frame: обычно примерно 30 Hz, в LOW около 20 Hz. Само движение игры остаётся на обычном RAF.
- При переходе governor в LOW основной shadow map динамически уменьшается до 1024, зона локальных lights сокращается, самый дальний HIGH cloud layer временно отключается.
- `CollisionWorld` получил spatial broad-phase grid по X/Z. Player и Enemy больше не перебирают все collider/raycast объекты 4-км маршрута при каждом движении и LOS check.
- `floorHeightAt`, `resolveCircle`, line-of-sight и raycast работают только с соседними grid cells; из горячих путей убрана часть временных массивов.
- Enemy AI получил distance LOD: близкие машины работают каждый frame, дальние — примерно 22 / 11 / 5–6 Hz в зависимости от расстояния. Накопленный `dt` сохраняет правильную скорость движения.
- Статические враги далеко от игрока скрываются и не выполняют дорогую AI-логику. Это не удаляет hand-placed encounters.
- Детальные POI и крупные port-detail groups скрываются на большой дистанции, задолго до того как мелкие детали могли бы быть видны сквозь fog. Landmarks остаются отдельными.
- Грунтовые дорожки, колеи и камни POI теперь находятся в собственных distance-culled groups, а не остаются навсегда отдельными объектами scene.
- Physical loot дальше примерно 155 units временно скрывается и перестаёт анимироваться; при приближении возвращается автоматически. Carry/Drop/Storage не менялись.
- WorldArt обновляется примерно до 30 Hz, POI emissive/culling — примерно 6–7 Hz. HUD обычно обновляется около 10–12 Hz, а не делает десятки одинаковых DOM write каждый second.
- Interaction raycast кэшируется примерно на 50 мс, Robototechnician aim check — примерно на 65 мс. Static world raycasts используют spatial grid.
- `Player`, `Items`, `Enemy`, `DayNight`, `IntroCutscene` и `EndCutscene` получили reusable Vector/Color buffers вместо большого количества `new Vector3/new Color` в hot loops.
- `CinematicAssets.animate()` больше не делает полный `root.traverse()` каждый frame: animated nodes кэшируются один раз на cinematic root.
- DayNight больше не создаёт массивы/Set/Color/Vector объекты каждый кадр для основных lighting calculations. CSS vignette обновляется только когда значение реально изменилось.
- Weather/DayNight на LOW/MEDIUM могут обновляться с более разумной частотой (примерно 30/45 Hz), сохраняя накопленное время. HIGH оставляет full-rate atmospheric update.
- Item geometry/material assets по-прежнему shared, поэтому предыдущий GPU-memory fix не потерян.

## Отладка производительности

В DevTools доступны:

```js
window.__IRON_WASTES_PERFORMANCE__
```

Показывает приблизительно:

- `fps`
- `pixelRatio`
- `quality` (`LOW / MEDIUM / HIGH`)
- `shadowFps`
- `drawCalls`
- `triangles`
- `geometries`
- `textures`

Также остаётся:

```js
window.__IRON_WASTES_LIGHT_DEBUG__
```

с exposure, fog, cloud coverage, количеством видимых lights и shadow tier.

## Story / cinematic

Intro остаётся отдельной компактной сценой примерно на 84 секунды и использует `CinematicAssets.js`, который переиспользует реальную модель `Train` и реальные модели AUTOMATON / SPIDER / SHIELDER / SNIPER. Полная 40-км карта во время Intro не рендерится.

End Cutscene длится около 52 секунд и работает внутри существующего main RAF: промышленный комплекс просыпается, открываются ворота, появляется далёкий Heart glow, звучат `СЕРДЦЕ РАБОТАЕТ`, `ОЖИДАЕТСЯ МАШИНИСТ`, `КАНАЛ ОТКРЫТ`, после чего поезд уходит в туман. Награда +120 марок защищена `completeRewardGranted` и выдаётся один раз за run даже при Skip.

## Классы

Доступно 14 классов:

1. МАШИНИСТ — 0.
2. КОЧЕГАР — 160.
3. МЕХАНИК — 220.
4. СТРЕЛОК — 260.
5. ЧУМНОЙ ДОКТОР — 300.
6. МАРОДЁР — 340.
7. ГРОМИЛА — 380.
8. КОНДУКТОР — 420.
9. ВАМПИР — 480.
10. БЕРСЕРК — 500.
11. ОБОРОТЕНЬ — 520.
12. ПРИЗРАК — 520.
13. ТЕСЛА-ИНЖЕНЕР — 600.
14. РОБОТОТЕХНИК — 760.

Старые localStorage-ключи покупок/марок/выбранного класса сохранены.

### Робототехник

- Hold `G` 1.45 s по HOSTILE-автомату до 6 м и с прямой LOS.
- После полного удержания — ровно 50% шанс.
- Одна попытка на конкретного робота.
- Максимум 2 активных ALLY.
- Реальная faction-модель `PLAYER / HOSTILE / ALLY`.
- AUTOMATON, SPIDER, SHIELDER и SNIPER сохраняют свои роли после перепрограммирования.
- Союзник не лечится при conversion, не считается в hostile spawn limits, не удаляется safe-zone cleanup и не получает friendly fire от Player.
- Если поезд уезжает слишком быстро, отставший союзник вне камеры переходит в `ESCORT_STOWED`, считается закреплённым в грузовом вагоне и возвращается возле состава после остановки.

## Проверка после performance pass

- Все JS проходят `node --check`.
- Проверен loader: `Performance.js` загружается до `main.js`.
- Сохранены `PLAYER / HOSTILE / ALLY`, 50% Robototechnician hack, 1.45 s hold и лимит 2 союзника.
- Сохранены Intro ~84 s и End ~52 s.
- Сохранена single-run completion reward.
- Сохранён Day/Night timing: 255 / 75 / 300 / 75 секунд.
- `START_GAME.bat` и `server.ps1` сверяются по прежним SHA-256.
- Финальный ZIP после упаковки повторно распаковывается и все JS проверяются ещё раз.

Реальный аппаратный FPS в execution environment измерить достоверно нельзя, поэтому цифры прироста не выдумываются. Governor и debug-поля добавлены специально, чтобы увидеть результат на реальном ПК в START / SETTLEMENT / INDUSTRIAL ночью и при Night Spawn.

## Запуск

1. Полностью распаковать ZIP.
2. Запустить `START_GAME.bat`.
3. Не открывать `index.html` непосредственно из WinRAR.

Для загрузки Three.js r149 требуется интернет-доступ к CDN.
