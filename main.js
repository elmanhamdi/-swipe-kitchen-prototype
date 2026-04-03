/**
 * Three.js restaurant room prototype — vanilla ES modules, GitHub Pages friendly.
 */

import * as THREE from 'three';
import { Burger } from './burgerData.js';
import { createPlate, BurgerStackView, createIngredientMesh, buildFlyingBurgerGroup } from './burgerVisuals.js';
import { CustomerManager } from './customerManager.js';
import { SlingshotController } from './slingshot.js';
import { GameSession, START_TIME_SECONDS } from './gameCore.js';
import { FloatingBonusLayer } from './floatingBonusText.js';
import { ScreenShake, CoinFlyoutLayer, AmbientCameraDrift } from './juiceSystems.js';
import { GameAudio } from './audioSystem.js';
import { buildRestaurantRoom, applyAtmosphere, createRestaurantLights, applyShopTheme } from './environment.js';
import {
  SHOP_CATALOG, loadShopState, saveShopState, getShopState, syncCoins,
  isOwned, isEquipped, canAfford, buyItem, equipItem, getEquippedItem,
  toggleAccessory, isAccessoryActive, getActiveAccessories,
} from './shopState.js';
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

  const roomResult = buildRestaurantRoom();
  const { group: roomGroup, backDoor, tableAabbs, tableGroups, pendantGroups } = roomResult;
  scene.add(roomGroup);

  applyShopTheme(roomResult, {
    walls: getEquippedItem('walls'),
    floor: getEquippedItem('floor'),
    tables: getEquippedItem('tables'),
    activeAccessories: getActiveAccessories(),
  });

  const customerManager = new CustomerManager(scene, backDoor, gameAudio);

  const burger = new Burger();
  const playArea = new THREE.Group();
  playArea.name = 'PlayArea';
  playArea.position.set(0, 0.5,3.2);
  scene.add(playArea);

  const plateY = 1.1;
  const plateZ = 1;
  const servePlateZ = plateZ + 0.35;
  const plate = createPlate();
  plate.position.set(0, plateY, servePlateZ);
  playArea.add(plate);

  const stackAnchor = new THREE.Group();
  stackAnchor.position.set(0, plateY + 0.13, servePlateZ);
  playArea.add(stackAnchor);

  const stackView = new BurgerStackView(stackAnchor);
  stackView.rebuildFromStack(burger.getStack(), { animateLast: false });

  const worldPickables = new WorldPickables(playArea, scene);
  worldPickables._onDogBark = () => gameAudio.playDogBark();
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
  const shopData = loadShopState();
  gameSession.totalCoins = shopData.coins;
  let prevCoins = gameSession.totalCoins;
  let prevCustomers = gameSession.customersServed;
  let gameOverOverlayShown = false;
  let lastTickTockTime = 0;
  const TICK_TOCK_THRESHOLD = 10;
  let tutorialStep = 'start_button';
  let tutorialRoundStarted = false;
  const tutorialWorldPos = new THREE.Vector3();
  const tutorialScreenPos = new THREE.Vector3();

  let dogHintEverShown = false;
  let dogHintActive = false;
  let dogHintTimer = 0;
  const DOG_HINT_DURATION = 3.5;

  function checkDogHintAfterPlace() {
    if (dogHintEverShown || isTutorialActive()) return;
    const stack = burger.getStack();
    if (stack.length < 2) return;
    const pos = stack.length - 1;
    const placed = stack[pos];
    let matchesAny = false;
    for (const entry of customerManager.entries) {
      if (entry.phase !== 'seated') continue;
      const order = entry.customer.order;
      if (pos < order.length && order[pos] === placed) {
        matchesAny = true;
        break;
      }
    }
    if (!matchesAny) {
      dogHintEverShown = true;
      dogHintActive = true;
      dogHintTimer = DOG_HINT_DURATION;
    }
  }

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
      if (dogHintActive && !gameSession.gameOver) {
        dogHintTimer -= 1 / 60;
        if (dogHintTimer <= 0) {
          dogHintActive = false;
          hideTutorialGuide();
        } else {
          worldPickables.getDogMouthWorldPos(tutorialWorldPos);
          tutorialWorldPos.y -= 0.8;
          positionTutorialAtWorld(tutorialWorldPos);
        }
      } else {
        hideTutorialGuide();
      }
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
    worldPickables.setShopOpened(true, () => gameAudio.playIngredientPlace());
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
  /** @type {{ mesh: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3, t: number, dur: number }[]} */
  const dogFeedZips = [];

  let timeBonusHideTimer = 0;
  function showTimeBonusHud(seconds) {
    refreshClockAndEconomy();
    const s = Math.max(0, Number(seconds));
    if (s <= 0) return;
    if (timerBonusEl) {
      window.clearTimeout(timeBonusHideTimer);
      timerBonusEl.textContent = `+${Number.isInteger(s) ? s : s.toFixed(1)}s`;
      timerBonusEl.classList.remove('game-hud__timer-bonus--show');
      void timerBonusEl.offsetWidth;
      timerBonusEl.classList.add('game-hud__timer-bonus--show');
      timeBonusHideTimer = window.setTimeout(() => {
        timerBonusEl.classList.remove('game-hud__timer-bonus--show');
        timerBonusEl.textContent = '';
      }, 1200);
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
    if (pick.dog) {
      if (slingshotRef?.isBusy()) return true;
      if (dogHintActive) {
        dogHintActive = false;
        hideTutorialGuide();
      }
      const hadStack = burger.getStack().length > 0;
      gameAudio.playDogChomp();
      if (hadStack) {
        worldPickables.triggerDogEat();
        const flyStack = burger.getStack().slice();
        const flyMesh = buildFlyingBurgerGroup(flyStack);
        const start = new THREE.Vector3();
        stackAnchor.getWorldPosition(start);
        start.y += 0.22;
        flyMesh.position.copy(start);
        flyMesh.scale.setScalar(0.7);
        scene.add(flyMesh);
        const end = worldPickables.getDogMouthWorldPos();
        dogFeedZips.push({ mesh: flyMesh, start: start.clone(), end, t: 0, dur: 0.35 });
      }
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
      const pattyMesh = meatGrill.choosePattyMeshForRayOrder(pick.grillPattyMeshesInOrder);
      if (!pattyMesh) return true;
      const result = meatGrill.onPattyClick(pattyMesh);
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
        const sourcePos = pick.origin.clone();
        sourcePos.y += 0.18;
        meatGrill.startFromPileAnimated(sourcePos);
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
          checkDogHintAfterPlace();
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
    pendantGroups,
    onAimStart: () => {
      if (tutorialStep === 'throw_drag') endTutorial();
    },
    onSettled: refreshHud,
  });

  customerManager._tableAabbs = tableAabbs;
  customerManager._onKnockbackTableHit = (tableIndex, impactPos) => {
    slingshotRef?._scatterTable(tableIndex, impactPos);
    gameAudio.playTableCrash();
    screenShake.trigger(0.12);
  };

  function showGameOverUI() {
    if (gameOverOverlayShown || !gameOverOverlay) return;
    gameOverOverlayShown = true;
    syncCoins(gameSession.totalCoins);
    gameAudio.stopSizzle();
    gameAudio.playTimeUp();
    gameAudio.playBell();
    gameAudio.dimMusic();
    if (gameOverCoinsEl) {
      gameOverCoinsEl.textContent = `${gameSession.totalCoins}`;
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
    closeShopUI();
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
    while (dogFeedZips.length) {
      const z = dogFeedZips.pop();
      z?.mesh.removeFromParent();
    }
    customerManager.resetGame();
    meatGrill.reset();
    gameAudio.stopSizzle();
    gameAudio.restoreMusicVolume();
    gameAudio.restartMusic();
    worldPickables.registerRaycastTargets(meatGrill.raycastTargets);
    worldPickables.resetTransientState();
    worldPickables.setShopOpened(true, () => gameAudio.playIngredientPlace());
    hudInfoModal?.classList.remove('hud-info-modal--visible');
    hudInfoModal?.setAttribute('aria-hidden', 'true');
    startGameplay();
  }

  playAgainBtn?.addEventListener('click', () => {
    gameAudio.playUIClick();
    resetFullGame();
  });

  /* ── Shop UI ─────────────────────────────────────────────────────── */
  const shopOverlay = document.getElementById('shop-overlay');
  const shopCoinsEl = document.getElementById('shop-coins');
  const shopGrid = document.getElementById('shop-grid');
  const shopTabs = document.getElementById('shop-tabs');
  const shopCloseBtn = document.getElementById('shop-close-btn');
  const shopBtn = document.getElementById('shop-btn');
  let shopActiveCategory = 'walls';

  function hexToCSS(hex) {
    return '#' + hex.toString(16).padStart(6, '0');
  }

  function hexToRGB(hex) {
    return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
  }

  function drawBrickSwatch(canvas, brickHex) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const [r, g, b] = hexToRGB(brickHex);
    const base = `rgb(${r},${g},${b})`;
    const mortar = `rgb(${Math.min(255, r + 60)},${Math.min(255, g + 55)},${Math.min(255, b + 45)})`;
    ctx.fillStyle = mortar;
    ctx.fillRect(0, 0, w, h);
    const bw = 18, bh = 9, gap = 2;
    for (let row = 0; row < Math.ceil(h / (bh + gap)); row++) {
      const off = (row % 2) * (bw / 2 + gap / 2);
      for (let col = -1; col < Math.ceil(w / (bw + gap)) + 1; col++) {
        const x = col * (bw + gap) + off;
        const v = ((row * 7 + col * 3) % 5 - 2) * 8;
        ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, r + v))},${Math.max(0, Math.min(255, g + v))},${Math.max(0, Math.min(255, b + v))})`;
        const rx = Math.max(0, x), ry = row * (bh + gap);
        const rw = Math.min(bw, w - rx), rh = bh;
        if (rw > 0 && ry + rh <= h + bh) {
          ctx.beginPath();
          ctx.roundRect(rx, ry, rw, rh, 1.5);
          ctx.fill();
        }
      }
    }
  }

  function drawTileSwatch(canvas, tileHexes) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const cols = 3, rows = 3;
    const tw = w / cols, th = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const hex = tileHexes[(r + c) % tileHexes.length];
        const [rr, gg, bb] = hexToRGB(hex);
        const v = ((r * 5 + c * 3) % 3 - 1) * 6;
        ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, rr + v))},${Math.max(0, Math.min(255, gg + v))},${Math.max(0, Math.min(255, bb + v))})`;
        ctx.fillRect(c * tw + 0.5, r * th + 0.5, tw - 1, th - 1);
        ctx.strokeStyle = `rgba(0,0,0,0.15)`;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(c * tw + 0.5, r * th + 0.5, tw - 1, th - 1);
      }
    }
  }

  function drawTableSwatch(canvas, item) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2a2220';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = hexToCSS(item.color);
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.38, w * 0.38, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = hexToCSS(item.chairColor);
    ctx.fillRect(w * 0.08, h * 0.6, w * 0.2, h * 0.12);
    ctx.fillRect(w * 0.72, h * 0.6, w * 0.2, h * 0.12);
    ctx.fillStyle = hexToCSS(item.cushionColor);
    ctx.beginPath();
    ctx.arc(w * 0.18, h * 0.66, w * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w * 0.82, h * 0.66, w * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hexToCSS(item.chairColor);
    ctx.fillRect(w * 0.42, h * 0.52, w * 0.04, h * 0.38);
    ctx.fillRect(w * 0.54, h * 0.52, w * 0.04, h * 0.38);
  }

  const _swatchCache = new Map();

  const ACC_ICONS = {
    acc_mat:       { bg: '#6a5040', shapes: [{ t: 'rect', x: 15, y: 28, w: 50, h: 24, c: '#8a6a3a' }] },
    acc_carpet:    { bg: '#3a1a1a', shapes: [{ t: 'rect', x: 20, y: 10, w: 40, h: 60, c: '#8b1a1a' }, { t: 'rect', x: 22, y: 8, w: 36, h: 4, c: '#c8a030' }, { t: 'rect', x: 22, y: 68, w: 36, h: 4, c: '#c8a030' }] },
    acc_clock:     { bg: '#2a2220', shapes: [{ t: 'circle', x: 40, y: 40, r: 26, c: '#f0e8d8' }, { t: 'circle', x: 40, y: 40, r: 28, c: '#3a2a1c', fill: false, lw: 3 }, { t: 'line', x1: 40, y1: 40, x2: 40, y2: 20, c: '#1a1a1a', lw: 2 }, { t: 'line', x1: 40, y1: 40, x2: 55, y2: 35, c: '#1a1a1a', lw: 2 }] },
    acc_plants:    { bg: '#2a3a2a', shapes: [{ t: 'circle', x: 28, y: 50, r: 10, c: '#4a8a3a' }, { t: 'circle', x: 52, y: 50, r: 10, c: '#4a8a3a' }, { t: 'circle', x: 40, y: 38, r: 10, c: '#5a9a4a' }, { t: 'rect', x: 25, y: 55, w: 12, h: 14, c: '#8a5a3a' }, { t: 'rect', x: 43, y: 55, w: 12, h: 14, c: '#8a5a3a' }] },
    acc_vases:     { bg: '#2a2220', shapes: [{ t: 'rect', x: 33, y: 40, w: 14, h: 22, c: '#c8b898' }, { t: 'circle', x: 36, y: 34, r: 6, c: '#e05050' }, { t: 'circle', x: 44, y: 32, r: 6, c: '#e0c040' }, { t: 'circle', x: 40, y: 38, r: 5, c: '#d070a0' }] },
  };

  function drawAccSwatch(canvas, item) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const spec = ACC_ICONS[item.id];
    if (!spec) { ctx.fillStyle = '#333'; ctx.fillRect(0, 0, w, h); return; }
    ctx.fillStyle = spec.bg;
    ctx.fillRect(0, 0, w, h);
    for (const s of spec.shapes) {
      if (s.t === 'rect') {
        ctx.fillStyle = s.c;
        ctx.fillRect(s.x, s.y, s.w, s.h);
      } else if (s.t === 'circle') {
        if (s.fill === false) {
          ctx.strokeStyle = s.c;
          ctx.lineWidth = s.lw || 2;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = s.c;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (s.t === 'line') {
        ctx.strokeStyle = s.c;
        ctx.lineWidth = s.lw || 2;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
      } else if (s.t === 'arc') {
        ctx.strokeStyle = s.c;
        ctx.lineWidth = s.lw || 3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, s.sa, s.ea);
        ctx.stroke();
      }
    }
  }

  function getSwatchDataURL(cat, item) {
    if (_swatchCache.has(item.id)) return _swatchCache.get(item.id);
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 80;
    if (cat === 'walls') drawBrickSwatch(canvas, item.brickHex);
    else if (cat === 'floor') drawTileSwatch(canvas, item.tileHexes);
    else if (cat === 'tables') drawTableSwatch(canvas, item);
    else if (cat === 'accessories') drawAccSwatch(canvas, item);
    const url = canvas.toDataURL();
    _swatchCache.set(item.id, url);
    return url;
  }

  function renderShopGrid(cat) {
    if (!shopGrid) return;
    const items = SHOP_CATALOG[cat];
    const state = getShopState();
    const isAcc = cat === 'accessories';
    shopGrid.innerHTML = items.map(item => {
      const owned = isOwned(item.id);
      const affordable = canAfford(item.price);
      let badge = '';
      let btn = '';
      let cardExtra = '';
      if (isAcc) {
        const active = isAccessoryActive(item.id);
        if (owned) {
          const cls = active ? 'shop-card__btn--toggle-on' : 'shop-card__btn--toggle-off';
          btn = `<button class="shop-card__btn ${cls}" data-action="toggle" data-id="${item.id}">${active ? 'ON' : 'OFF'}</button>`;
          if (active) cardExtra = ' shop-card--equipped';
        } else {
          badge = `<span class="shop-card__price">${item.price} coins</span>`;
          btn = `<button class="shop-card__btn shop-card__btn--buy" data-action="buy" data-id="${item.id}" ${!affordable ? 'disabled' : ''}>${affordable ? 'Buy' : 'Need ' + item.price}</button>`;
        }
      } else {
        const equipped = isEquipped(cat, item.id);
        if (equipped) {
          badge = '<span class="shop-card__badge shop-card__badge--equipped">Equipped</span>';
          cardExtra = ' shop-card--equipped';
        } else if (owned) {
          badge = '<span class="shop-card__badge shop-card__badge--owned">Owned</span>';
          btn = `<button class="shop-card__btn shop-card__btn--equip" data-action="equip" data-id="${item.id}" data-cat="${cat}">Equip</button>`;
        } else {
          badge = `<span class="shop-card__price">${item.price} coins</span>`;
          btn = `<button class="shop-card__btn shop-card__btn--buy" data-action="buy" data-id="${item.id}" ${!affordable ? 'disabled' : ''}>${affordable ? 'Buy' : 'Need ' + item.price}</button>`;
        }
      }
      const cardClass = `shop-card${cardExtra}${!owned && !affordable ? ' shop-card--locked' : ''}`;
      const swatchURL = getSwatchDataURL(cat, item);
      return `<div class="${cardClass}">
        <img class="shop-card__swatch" src="${swatchURL}" alt="${item.name}" draggable="false"/>
        <div class="shop-card__name">${item.name}</div>
        ${badge}${btn}
      </div>`;
    }).join('');

    if (shopCoinsEl) shopCoinsEl.textContent = `${state.coins} coins`;
  }

  function openShopUI() {
    syncCoins(gameSession.totalCoins);
    renderShopGrid(shopActiveCategory);
    shopOverlay?.classList.add('shop-overlay--visible');
    shopOverlay?.setAttribute('aria-hidden', 'false');
  }

  function closeShopUI() {
    shopOverlay?.classList.remove('shop-overlay--visible');
    shopOverlay?.setAttribute('aria-hidden', 'true');
  }

  function applyCurrentTheme() {
    applyShopTheme(roomResult, {
      walls: getEquippedItem('walls'),
      floor: getEquippedItem('floor'),
      tables: getEquippedItem('tables'),
      activeAccessories: getActiveAccessories(),
    });
  }

  shopBtn?.addEventListener('click', () => {
    gameAudio.playUIClick();
    openShopUI();
  });
  shopCloseBtn?.addEventListener('click', () => {
    gameAudio.playUIClick();
    closeShopUI();
  });

  shopTabs?.addEventListener('click', (e) => {
    const tab = e.target.closest('.shop-tab');
    if (!tab) return;
    gameAudio.playUIClick();
    shopActiveCategory = tab.dataset.cat;
    shopTabs.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('shop-tab--active'));
    tab.classList.add('shop-tab--active');
    renderShopGrid(shopActiveCategory);
  });

  shopGrid?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'buy') {
      const result = buyItem(id);
      if (result.success) {
        gameSession.totalCoins = result.newBalance;
        prevCoins = result.newBalance;
        applyCurrentTheme();
        gameAudio.playUIClick();
      }
    } else if (action === 'equip') {
      const cat = btn.dataset.cat;
      equipItem(cat, id);
      applyCurrentTheme();
      gameAudio.playUIClick();
    } else if (action === 'toggle') {
      toggleAccessory(id);
      applyCurrentTheme();
      gameAudio.playUIClick();
    }
    renderShopGrid(shopActiveCategory);
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
      worldPickables.registerRaycastTargets(meatGrill.raycastTargets);
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
          checkDogHintAfterPlace();
          syncTutorialAfterIngredientAdded(z.ingredient);
        }
        ingredientZips.splice(i, 1);
        refreshHud();
      }
    }

    for (let i = dogFeedZips.length - 1; i >= 0; i--) {
      const z = dogFeedZips[i];
      z.t += dt;
      const u = Math.min(1, z.t / z.dur);
      const e = 1 - (1 - u) ** 3;
      const p = z.start.clone().lerp(z.end, e);
      p.y += Math.sin(u * Math.PI) * 0.4;
      z.mesh.position.copy(p);
      z.mesh.rotation.y += dt * 14;
      const shrink = 0.7 * (1 - u * 0.85);
      z.mesh.scale.setScalar(shrink);
      if (u >= 1) {
        z.mesh.removeFromParent();
        dogFeedZips.splice(i, 1);
      }
    }

    debrisSystem.update(dt);
    updateTutorialGuide();
    renderer.render(scene, camera);
  }

  requestAnimationFrame(tick);
}

init();
