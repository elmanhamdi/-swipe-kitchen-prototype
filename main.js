/**
 * Three.js restaurant room prototype — vanilla ES modules, GitHub Pages friendly.
 */

import * as THREE from 'three';
import { Burger } from './burgerData.js';
import { createPlate, BurgerStackView, createIngredientMesh } from './burgerVisuals.js';
import { CustomerManager } from './customerManager.js';
import { SlingshotController } from './slingshot.js';
import { GameSession, START_TIME_SECONDS } from './gameCore.js';
import { FloatingBonusLayer } from './floatingBonusText.js';
import { ScreenShake, CoinFlyoutLayer, AmbientCameraDrift } from './juiceSystems.js';
import { GameAudio } from './audioSystem.js';
import { buildRestaurantRoom, applyAtmosphere, createRestaurantLights } from './environment.js';
import { configureForDevice, getRenderProfile } from './renderQuality.js';
import { BurgerDebrisSystem } from './burgerDebris.js';
import { WorldPickables } from './worldPickables.js';
import { MeatGrill } from './meatGrill.js';

const STAGE_SELECTOR = '#canvas-stage';
const CAMERA_REST = new THREE.Vector3(0, 7.35, 8.85);
const TUTORIAL_FIRST_ORDER = ['bun_bottom', 'meat', 'cheese', 'bun_top'];

function init() {
  configureForDevice();

  const stage = document.querySelector(STAGE_SELECTOR);
  if (!stage) {
    console.error(`Missing container: ${STAGE_SELECTOR}`);
    return;
  }

  const scene = new THREE.Scene();
  applyAtmosphere(scene);

  const camera = new THREE.PerspectiveCamera(50, 9 / 16, 0.1, 100);
  camera.position.copy(CAMERA_REST);
  camera.lookAt(0, 0, 0);

  const gameAudio = new GameAudio();
  gameAudio.init(camera);

  const unlockAudioOnce = () => {
    gameAudio.tryUnlock().then(() => gameAudio.restartMusic());
  };
  window.addEventListener('pointerdown', unlockAudioOnce, { once: true, passive: true });

  THREE.ColorManagement.enabled = true;

  const { pixelRatioMax, mobileCoarse } = getRenderProfile();
  const renderer = new THREE.WebGLRenderer({
    antialias: !mobileCoarse,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioMax));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  stage.appendChild(renderer.domElement);

  createRestaurantLights(scene);

  const { group: roomGroup, backDoor, tableAabbs, tableGroups } = buildRestaurantRoom();
  scene.add(roomGroup);

  const customerManager = new CustomerManager(scene, backDoor, gameAudio);

  const burger = new Burger();
  const playArea = new THREE.Group();
  playArea.name = 'PlayArea';
  playArea.position.set(0, 0, 2.42);
  scene.add(playArea);

  const plateY = 1.1;
  const plateZ = 1;
  const plate = createPlate();
  plate.position.set(0, plateY, plateZ);
  playArea.add(plate);

  const stackAnchor = new THREE.Group();
  stackAnchor.position.set(0, plateY + 0.13, plateZ);
  playArea.add(stackAnchor);

  const stackView = new BurgerStackView(stackAnchor);
  stackView.rebuildFromStack(burger.getStack(), { animateLast: false });

  const worldPickables = new WorldPickables(playArea, scene);
  const meatGrill = new MeatGrill(playArea, plateY, plateZ);
  worldPickables.registerRaycastTargets(meatGrill.raycastTargets);

  const clock = new THREE.Clock();
  const coinsDisplayEl = document.getElementById('coins-display');
  const coinsValueEl = document.getElementById('coins-value');
  const customersValueEl = document.getElementById('customers-value');
  const timerFillEl = document.getElementById('game-timer-fill');
  const timerBlockEl = document.getElementById('game-timer-block');
  const timerBonusEl = document.getElementById('game-timer-bonus');
  const gameOverOverlay = document.getElementById('game-over-overlay');
  const gameOverCoinsEl = document.getElementById('game-over-coins');
  const playAgainBtn = document.getElementById('play-again-btn');
  const startCookingBtn = document.getElementById('start-cooking-btn');
  const tutorialGuideEl = document.getElementById('tutorial-guide');
  const hudInfoBtn = document.getElementById('hud-info-btn');
  const hudInfoModal = document.getElementById('hud-info-modal');
  const hudInfoClose = document.getElementById('hud-info-close');
  const gameOverSplash = document.querySelector('.game-over-splash');
  const soundBtn = document.getElementById('hud-sound-btn');
  const soundIconOn = document.getElementById('sound-icon-on');
  const soundIconOff = document.getElementById('sound-icon-off');
  let startButtonLaunchTimer = 0;
  let startButtonPressTimer = 0;

  const gameSession = new GameSession();
  let prevCoins = gameSession.totalCoins;
  let prevCustomers = gameSession.customersServed;
  let gameOverOverlayShown = false;
  let lastTickTockTime = 0;
  const TICK_TOCK_THRESHOLD = 10;
  let tutorialStep = 'start_button';
  let tutorialRoundStarted = false;
  const tutorialWorldPos = new THREE.Vector3();
  const tutorialScreenPos = new THREE.Vector3();

  function isTutorialActive() {
    return tutorialStep !== 'off';
  }

  function hideTutorialGuide() {
    if (!tutorialGuideEl) return;
    tutorialGuideEl.hidden = true;
    tutorialGuideEl.classList.remove('tutorial-guide--visible');
    tutorialGuideEl.classList.remove('tutorial-guide--drag');
  }

  function endTutorial() {
    tutorialStep = 'off';
    hideTutorialGuide();
  }

  function positionTutorialAtStage(x, y) {
    if (!tutorialGuideEl) return;
    tutorialGuideEl.hidden = false;
    tutorialGuideEl.classList.add('tutorial-guide--visible');
    tutorialGuideEl.classList.toggle('tutorial-guide--drag', tutorialStep === 'throw_drag');
    tutorialGuideEl.style.left = `${x.toFixed(1)}px`;
    tutorialGuideEl.style.top = `${y.toFixed(1)}px`;
  }

  function positionTutorialAtElement(el, anchorX = 0.78, anchorY = 0.72) {
    if (!el) return;
    const stageRect = stage.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    positionTutorialAtStage(
      rect.left - stageRect.left + rect.width * anchorX,
      rect.top - stageRect.top + rect.height * anchorY,
    );
  }

  function positionTutorialAtWorld(worldPos) {
    tutorialScreenPos.copy(worldPos).project(camera);
    const x = ((tutorialScreenPos.x + 1) * 0.5) * stage.clientWidth;
    const y = ((1 - tutorialScreenPos.y) * 0.5) * stage.clientHeight;
    positionTutorialAtStage(x, y);
  }

  function syncTutorialAfterIngredientAdded(type) {
    if (!isTutorialActive()) return;
    if (tutorialStep === 'bun_bottom' && type === 'bun_bottom') {
      tutorialStep = 'meat_start';
    } else if (tutorialStep === 'meat_stack_wait' && type === 'meat') {
      tutorialStep = 'cheese';
    } else if (tutorialStep === 'cheese' && type === 'cheese') {
      tutorialStep = 'bun_top';
    } else if (tutorialStep === 'bun_top' && type === 'bun_top') {
      tutorialStep = 'throw_drag';
    }
  }

  function tutorialBlocksPick(pick) {
    if (!isTutorialActive() || !gameSession.shopIsOpen) return false;
    switch (tutorialStep) {
      case 'bun_bottom':
        return pick.ingredient !== 'bun';
      case 'meat_start':
        return pick.ingredient !== 'meat';
      case 'meat_flip_wait':
        return true;
      case 'meat_flip':
        return !pick.grillPatty;
      case 'meat_collect_wait':
        return true;
      case 'meat_collect':
        return !pick.grillPatty;
      case 'meat_stack_wait':
        return true;
      case 'cheese':
        return pick.ingredient !== 'cheese';
      case 'bun_top':
        return pick.ingredient !== 'bun';
      default:
        return false;
    }
  }

  function updateTutorialGuide() {
    if (!tutorialGuideEl) return;
    if (!isTutorialActive() || gameSession.gameOver) {
      hideTutorialGuide();
      return;
    }

    if (tutorialStep === 'start_button') {
      hideTutorialGuide();
      return;
    }

    if (!gameSession.shopIsOpen) {
      hideTutorialGuide();
      return;
    }

    if (tutorialStep === 'meat_flip_wait') {
      if (meatGrill.getPrimarySlotState() === 'readyToFlip') tutorialStep = 'meat_flip';
      else {
        hideTutorialGuide();
        return;
      }
    }

    if (tutorialStep === 'meat_collect_wait') {
      if (meatGrill.hasServedPatty) tutorialStep = 'meat_collect';
      else {
        hideTutorialGuide();
        return;
      }
    }

    if (tutorialStep === 'meat_stack_wait') {
      hideTutorialGuide();
      return;
    }

    switch (tutorialStep) {
      case 'bun_bottom':
      case 'bun_top':
        positionTutorialAtWorld(worldPickables.getIngredientWorldPosition('bun', tutorialWorldPos).add(new THREE.Vector3(0.2, 0, 0)));
        break;
      case 'meat_start':
        positionTutorialAtWorld(worldPickables.getIngredientWorldPosition('meat', tutorialWorldPos).add(new THREE.Vector3(0.1, 0, 0)));
        break;
      case 'meat_flip':
        positionTutorialAtWorld(meatGrill.getPrimarySlotWorldPosition(tutorialWorldPos).add(new THREE.Vector3(0.1, -0.6, 0)));
        break;
      case 'meat_collect':
        positionTutorialAtWorld(meatGrill.getServePlateWorldPosition(tutorialWorldPos).add(new THREE.Vector3(0.1, -0.6, 0)));
        break;
      case 'cheese':
        positionTutorialAtWorld(worldPickables.getIngredientWorldPosition('cheese', tutorialWorldPos));
        break;
      case 'throw_drag':
        stackAnchor.getWorldPosition(tutorialWorldPos);
        tutorialWorldPos.y += 0.28;
        positionTutorialAtWorld(tutorialWorldPos);
        break;
      default:
        hideTutorialGuide();
        break;
    }
  }

  function refreshClockAndEconomy() {
    const total = gameSession.totalCoins;
    if (coinsValueEl) {
      if (total > prevCoins) {
        coinsValueEl.classList.remove('game-hud__coins-value--pop');
        void coinsValueEl.offsetWidth;
        coinsValueEl.classList.add('game-hud__coins-value--pop');
      }
      prevCoins = total;
      coinsValueEl.textContent = String(total);
    }

    const served = gameSession.customersServed;
    if (customersValueEl) {
      if (served > prevCustomers) {
        customersValueEl.classList.remove('game-hud__customers-value--pop');
        void customersValueEl.offsetWidth;
        customersValueEl.classList.add('game-hud__customers-value--pop');
      }
      prevCustomers = served;
      customersValueEl.textContent = String(served);
    }

    const ratio = Math.max(0, Math.min(1, gameSession.timeLeft / START_TIME_SECONDS));
    if (timerFillEl) {
      timerFillEl.style.width = `${(ratio * 100).toFixed(1)}%`;
      let barColor;
      if (ratio > 0.5) barColor = '#00e5ff';
      else if (ratio > 0.25) barColor = '#ffc107';
      else if (ratio > 0.10) barColor = '#ff9800';
      else barColor = '#f44336';
      timerFillEl.style.backgroundColor = barColor;

      const glowMap = { '#00e5ff': 'rgba(0,229,255,0.35)', '#ffc107': 'rgba(255,193,7,0.35)', '#ff9800': 'rgba(255,152,0,0.4)', '#f44336': 'rgba(244,67,54,0.5)' };
      timerFillEl.style.boxShadow = `0 0 8px ${glowMap[barColor]}`;
    }
    if (timerBlockEl) {
      const s = Math.max(0, Math.ceil(gameSession.timeLeft));
      const live = !gameSession.gameOver && s > 0;
      timerBlockEl.classList.toggle('game-hud__timer--critical', live && s <= 5);
      timerBlockEl.classList.toggle('game-hud__timer--low', live && s <= 10 && s > 5);
    }

    if (!gameSession.gameOver && gameSession.timeLeft > 0 && gameSession.timeLeft <= TICK_TOCK_THRESHOLD) {
      const currentSec = Math.ceil(gameSession.timeLeft);
      if (currentSec !== lastTickTockTime) {
        lastTickTockTime = currentSec;
        gameAudio.playTickTock();
      }
    }
  }

  function setHudInfoVisible(show) {
    if (show) {
      gameSession.setHudInfoOpen(true);
      slingshotRef?.cancelAimOnly();
      hudInfoModal?.classList.add('hud-info-modal--visible');
      hudInfoModal?.setAttribute('aria-hidden', 'false');
    } else {
      gameSession.setHudInfoOpen(false);
      hudInfoModal?.classList.remove('hud-info-modal--visible');
      hudInfoModal?.setAttribute('aria-hidden', 'true');
    }
    refreshHud();
  }

  hudInfoBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (gameSession.gameOver) return;
    setHudInfoVisible(true);
  });
  hudInfoClose?.addEventListener('click', (e) => {
    e.stopPropagation();
    setHudInfoVisible(false);
  });
  hudInfoModal?.addEventListener('click', (e) => {
    if (e.target === hudInfoModal) setHudInfoVisible(false);
  });

  function updateSoundIcon() {
    if (!soundIconOn || !soundIconOff) return;
    const muted = gameAudio.isMuted;
    soundIconOn.style.display = muted ? 'none' : '';
    soundIconOff.style.display = muted ? '' : 'none';
  }

  soundBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    gameAudio.toggleMute();
    updateSoundIcon();
  });

  function refreshHud() {
    refreshClockAndEconomy();
    if (startCookingBtn) startCookingBtn.hidden = gameSession.shopIsOpen || gameSession.gameOver;
  }
  refreshHud();

  function startGameplay() {
    if (gameSession.shopIsOpen || gameSession.gameOver) return;
    if (startButtonLaunchTimer) {
      window.clearTimeout(startButtonLaunchTimer);
      startButtonLaunchTimer = 0;
    }
    if (startButtonPressTimer) {
      window.clearTimeout(startButtonPressTimer);
      startButtonPressTimer = 0;
    }
    if (tutorialStep === 'start_button') {
      customerManager.setNextCustomerOrder(TUTORIAL_FIRST_ORDER);
      tutorialRoundStarted = true;
    }
    gameSession.openShop();
    customerManager.beginGameplay();
    worldPickables.setShopOpened(true);
    const shopSplash = document.getElementById('shop-open-splash');
    if (shopSplash) {
      shopSplash.classList.remove('shop-open-splash--show');
      void shopSplash.offsetWidth;
      shopSplash.classList.add('shop-open-splash--show');
      window.setTimeout(() => shopSplash.classList.remove('shop-open-splash--show'), 900);
    }
    if (tutorialStep === 'start_button') tutorialStep = 'bun_bottom';
    refreshHud();
  }

  function triggerStartCookingCTA() {
    if (!startCookingBtn || gameSession.shopIsOpen || gameSession.gameOver) return;
    startCookingBtn.classList.remove('start-cooking-btn--press');
    void startCookingBtn.offsetWidth;
    startCookingBtn.classList.add('start-cooking-btn--press');
    if (startButtonPressTimer) window.clearTimeout(startButtonPressTimer);
    startButtonPressTimer = window.setTimeout(() => {
      startButtonPressTimer = 0;
      startCookingBtn.classList.remove('start-cooking-btn--press');
    }, 220);
    gameAudio.playTap();
    if (startButtonLaunchTimer) window.clearTimeout(startButtonLaunchTimer);
    startButtonLaunchTimer = window.setTimeout(() => {
      startButtonLaunchTimer = 0;
      startGameplay();
    }, 120);
  }

  startCookingBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    triggerStartCookingCTA();
  });

  const floatingLayer = new FloatingBonusLayer(stage, camera);
  const screenShake = new ScreenShake(camera, CAMERA_REST.clone());
  const cameraDrift = new AmbientCameraDrift(screenShake, CAMERA_REST);
  const coinFlyout = new CoinFlyoutLayer(stage);
  const debrisSystem = new BurgerDebrisSystem(scene);

  /** @type {import('./slingshot.js').SlingshotController | null} */
  let slingshotRef = null;
  /** @type {{ mesh: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3, t: number, dur: number, ingredient: string }[]} */
  const ingredientZips = [];

  let timeBonusHideTimer = 0;
  function showTimeBonusHud(seconds) {
    refreshClockAndEconomy();
    const s = Math.max(0, Number(seconds));
    if (s <= 0) return;
    if (timerBonusEl) {
      window.clearTimeout(timeBonusHideTimer);
      timerBonusEl.textContent = `+${s.toFixed(1)}s`;
      timerBonusEl.classList.remove('game-hud__timer-bonus--show');
      void timerBonusEl.offsetWidth;
      timerBonusEl.classList.add('game-hud__timer-bonus--show');
      timeBonusHideTimer = window.setTimeout(() => {
        timerBonusEl.classList.remove('game-hud__timer-bonus--show');
        timerBonusEl.textContent = '';
      }, 950);
    }
    if (timerBlockEl) {
      timerBlockEl.classList.remove('game-hud__timer--gain-pop');
      void timerBlockEl.offsetWidth;
      timerBlockEl.classList.add('game-hud__timer--gain-pop');
      window.setTimeout(() => timerBlockEl.classList.remove('game-hud__timer--gain-pop'), 220);
    }
  }

  function pickInterceptor(e) {
    if (gameSession.gameOver) return false;
    const pick = worldPickables.tryPick(e.clientX, e.clientY, camera, renderer.domElement);
    if (!pick) return false;
    if (pick.openShop) {
      if (gameSession.shopIsOpen) return true;
      startGameplay();
      return true;
    }
    if (!gameSession.canPlay()) {
      return true;
    }
    if (tutorialBlocksPick(pick)) {
      return true;
    }
    if (pick.trash) {
      if (slingshotRef?.isBusy()) return true;
      const hadStack = burger.getStack().length > 0;
      gameAudio.playTrash();
      if (hadStack) worldPickables.triggerTrashShake();
      gameSession.resetCombo();
      gameSession.clearBurgerTiming();
      burger.reset();
      stackView.clearFeedbacks();
      stackView.rebuildFromStack(burger.getStack(), { animateLast: false });
      refreshHud();
      return true;
    }
    if (pick.grillPatty) {
      if (slingshotRef?.isBusy()) return true;
      const result = meatGrill.onPattyClick(pick.grillPattyMesh);
      if (result === 'served') {
        const canAdd = burger.canAddIngredient('meat');
        if (canAdd.ok) {
          meatGrill.completeServe();
          const resolved = canAdd.resolved ?? 'meat';
          const mesh = createIngredientMesh('meat_cooked');
          const grillWorldPos = new THREE.Vector3();
          meatGrill._pattyPivot.getWorldPosition(grillWorldPos);
          mesh.position.copy(grillWorldPos);
          mesh.scale.setScalar(0.74);
          scene.add(mesh);
          const end = new THREE.Vector3();
          stackAnchor.getWorldPosition(end);
          end.y += 0.22;
          ingredientZips.push({ mesh, start: grillWorldPos.clone(), end, t: 0, dur: 0.22, ingredient: resolved });
          worldPickables.registerRaycastTargets(meatGrill.raycastTargets);
          if (tutorialStep === 'meat_collect') tutorialStep = 'meat_stack_wait';
        }
      } else if (result === 'flipped' && tutorialStep === 'meat_flip') {
        tutorialStep = 'meat_collect_wait';
      }
      refreshHud();
      return true;
    }
    if (pick.ingredient) {
      if (slingshotRef?.isBusy()) return true;
      if (pick.ingredient === 'meat') {
        if (meatGrill.isBusy) {
          refreshHud();
          return true;
        }
        meatGrill.startFromPile();
        worldPickables.registerRaycastTargets(meatGrill.raycastTargets);
        if (tutorialStep === 'meat_start') tutorialStep = 'meat_flip_wait';
        refreshHud();
        return true;
      }
      const canAdd = burger.canAddIngredient(pick.ingredient);
      if (canAdd.ok && pick.origin) {
        const mesh = createIngredientMesh(canAdd.resolved ?? pick.ingredient);
        const start = pick.origin.clone();
        start.y += 0.18;
        mesh.position.copy(start);
        mesh.scale.setScalar(0.74);
        scene.add(mesh);
        const end = new THREE.Vector3();
        stackAnchor.getWorldPosition(end);
        end.y += 0.22;
        ingredientZips.push({
          mesh,
          start,
          end,
          t: 0,
          dur: 0.2,
          ingredient: canAdd.resolved ?? pick.ingredient,
        });
      } else if (canAdd.ok) {
        const apply = burger.addIngredient(pick.ingredient);
        if (apply.ok) {
          gameAudio.playTap();
          stackView.rebuildFromStack(burger.getStack(), { animateLast: true });
          if (burger.getStack().length === 1) gameSession.notifyFirstIngredientPlaced();
          syncTutorialAfterIngredientAdded(canAdd.resolved ?? pick.ingredient);
        }
      }
      refreshHud();
      return true;
    }
    return false;
  }

  slingshotRef = new SlingshotController({
    camera,
    domElement: renderer.domElement,
    scene,
    burger,
    stackView,
    stackAnchor,
    customerManager,
    gameSession,
    floatingLayer,
    juice: {
      screenShake,
      coinFlyout,
      coinsHudEl: coinsDisplayEl,
      coinsValueEl,
      onTimeBonusHud: (sec) => showTimeBonusHud(sec),
    },
    gameAudio,
    debrisSystem,
    pickInterceptor,
    canStartAim: () => !isTutorialActive() || tutorialStep === 'throw_drag',
    tableAabbs,
    tableGroups,
    onAimStart: () => {
      if (tutorialStep === 'throw_drag') endTutorial();
    },
    onSettled: refreshHud,
  });

  function showGameOverUI() {
    if (gameOverOverlayShown || !gameOverOverlay) return;
    gameOverOverlayShown = true;
    gameAudio.stopSizzle();
    gameAudio.playTimeUp();
    gameAudio.playBell();
    gameAudio.dimMusic();
    if (gameOverCoinsEl) {
      gameOverCoinsEl.textContent = `${gameSession.totalCoins} coins · ${gameSession.customersServed} served`;
    }
    gameOverOverlay.classList.add('game-over-overlay--visible');
    gameOverOverlay.setAttribute('aria-hidden', 'false');
    if (gameOverSplash) {
      gameOverSplash.classList.remove('game-over-splash--animate');
      void gameOverSplash.offsetWidth;
      gameOverSplash.classList.add('game-over-splash--animate');
    }
  }

  function resetFullGame() {
    if (tutorialRoundStarted) {
      tutorialRoundStarted = false;
      endTutorial();
    }
    gameSession.resetForNewGame();
    prevCoins = gameSession.totalCoins;
    prevCustomers = 0;
    gameOverOverlayShown = false;
    lastTickTockTime = 0;
    if (gameOverOverlay) {
      gameOverOverlay.classList.remove('game-over-overlay--visible');
      gameOverOverlay.setAttribute('aria-hidden', 'true');
    }
    gameOverSplash?.classList.remove('game-over-splash--animate');
    burger.reset();
    stackView.clearFeedbacks();
    stackView.rebuildFromStack(burger.getStack(), { animateLast: false });
    stackView.stackRoot.visible = true;
    debrisSystem.clear();
    slingshotRef?.resetFlightState();
    while (ingredientZips.length) {
      const z = ingredientZips.pop();
      z?.mesh.removeFromParent();
    }
    customerManager.resetGame();
    meatGrill.reset();
    gameAudio.stopSizzle();
    gameAudio.restoreMusicVolume();
    gameAudio.restartMusic();
    worldPickables.registerRaycastTargets(meatGrill.raycastTargets);
    worldPickables.setShopOpened(true);
    worldPickables.resetTransientState();
    hudInfoModal?.classList.remove('hud-info-modal--visible');
    hudInfoModal?.setAttribute('aria-hidden', 'true');
    startGameplay();
  }

  playAgainBtn?.addEventListener('click', () => {
    resetFullGame();
  });

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  window.addEventListener('resize', resize);
  resize();

  function tick() {
    requestAnimationFrame(tick);
    const dt = clock.getDelta();
    const wasLive = !gameSession.gameOver;

    if (!gameSession.gameOver) {
      gameSession.tick(dt);
    }

    if (wasLive && gameSession.gameOver) {
      showGameOverUI();
    }

    refreshClockAndEconomy();

    const simFrozen = gameSession.hudInfoOpen && !gameSession.gameOver;
    const simDt = simFrozen ? 0 : dt;

    if (!gameSession.gameOver) {
      stackView.update(simDt);
      customerManager.update(simDt);
      slingshotRef?.update(simDt);
      worldPickables.update(simDt);
      const grillDinged = meatGrill.update(simDt);
      if (grillDinged) gameAudio.playGrillDing();
      if (meatGrill.isAnyCooking) gameAudio.startSizzle();
      else gameAudio.stopSizzle();
      floatingLayer.update(simDt);
      cameraDrift.update(simDt);
      screenShake.update(simDt);
    }
    coinFlyout.update(dt);

    for (let i = ingredientZips.length - 1; i >= 0; i--) {
      const z = ingredientZips[i];
      z.t += dt;
      const u = Math.min(1, z.t / z.dur);
      const e = 1 - (1 - u) ** 3;
      const p = z.start.clone().lerp(z.end, e);
      p.y += Math.sin(u * Math.PI) * 0.18;
      z.mesh.position.copy(p);
      z.mesh.rotation.y += dt * 18;
      if (u >= 1) {
        z.mesh.removeFromParent();
        const apply = burger.addIngredient(z.ingredient);
        if (apply.ok) {
          gameAudio.playTap();
          stackView.rebuildFromStack(burger.getStack(), { animateLast: true });
          if (burger.getStack().length === 1) gameSession.notifyFirstIngredientPlaced();
          syncTutorialAfterIngredientAdded(z.ingredient);
        }
        ingredientZips.splice(i, 1);
        refreshHud();
      }
    }

    debrisSystem.update(dt);
    updateTutorialGuide();
    renderer.render(scene, camera);
  }

  requestAnimationFrame(tick);
}

init();
