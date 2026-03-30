/**
 * Three.js restaurant room prototype — vanilla ES modules, GitHub Pages friendly.
 */

import * as THREE from 'three';
import { Burger } from './burgerData.js';
import { createPlate, BurgerStackView, createIngredientMesh } from './burgerVisuals.js';
import { CustomerManager } from './customerManager.js';
import { SlingshotController } from './slingshot.js';
import { GameSession } from './gameCore.js';
import { FloatingBonusLayer } from './floatingBonusText.js';
import { ScreenShake, CoinFlyoutLayer, AmbientCameraDrift } from './juiceSystems.js';
import { GameAudio } from './audioSystem.js';
import { buildRestaurantRoom, applyAtmosphere, createRestaurantLights } from './environment.js';
import { configureForDevice, getRenderProfile } from './renderQuality.js';
import { BurgerDebrisSystem } from './burgerDebris.js';
import { WorldPickables } from './worldPickables.js';

const STAGE_SELECTOR = '#canvas-stage';
const CAMERA_REST = new THREE.Vector3(0, 8, 10);

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
    gameAudio.tryUnlock().then(() => gameAudio.startMusicIfNeeded());
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
  renderer.toneMappingExposure = 1.03;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  stage.appendChild(renderer.domElement);

  createRestaurantLights(scene);

  const { group: roomGroup, backDoor } = buildRestaurantRoom();
  scene.add(roomGroup);

  const customerManager = new CustomerManager(scene, backDoor);

  const burger = new Burger();
  const playArea = new THREE.Group();
  playArea.name = 'PlayArea';
  playArea.position.set(0, 0, 2.42);
  scene.add(playArea);

  const plate = createPlate();
  playArea.add(plate);

  const stackAnchor = new THREE.Group();
  stackAnchor.position.set(0, 0.13, 0);
  playArea.add(stackAnchor);

  const stackView = new BurgerStackView(stackAnchor);
  stackView.rebuildFromStack(burger.getStack(), { animateLast: false });

  const debugAxes = new THREE.AxesHelper(0.75);
  debugAxes.position.set(0, 0.52, 0);
  debugAxes.name = 'DebugAxes';
  playArea.add(debugAxes);

  const worldPickables = new WorldPickables(playArea, scene);

  const clock = new THREE.Clock();
  const statusEl = document.getElementById('burger-status');
  const coinsDisplayEl = document.getElementById('coins-display');
  const coinsValueEl = document.getElementById('coins-value');
  const timerEl = document.getElementById('game-timer');
  const timerBlockEl = document.getElementById('game-timer-block');
  const timerBonusEl = document.getElementById('game-timer-bonus');
  const gameOverOverlay = document.getElementById('game-over-overlay');
  const gameOverCoinsEl = document.getElementById('game-over-coins');
  const playAgainBtn = document.getElementById('play-again-btn');
  const hudInfoBtn = document.getElementById('hud-info-btn');
  const hudInfoModal = document.getElementById('hud-info-modal');
  const hudInfoClose = document.getElementById('hud-info-close');
  const gameOverSplash = document.querySelector('.game-over-splash');

  const gameSession = new GameSession();
  let prevCoins = gameSession.totalCoins;
  let gameOverOverlayShown = false;

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
    if (timerEl) {
      const s = Math.max(0, Math.ceil(gameSession.timeLeft));
      timerEl.textContent = String(s);
    }
    if (timerBlockEl) {
      const s = Math.max(0, Math.ceil(gameSession.timeLeft));
      const live = !gameSession.gameOver && s > 0;
      timerBlockEl.classList.toggle('game-hud__timer--critical', live && s <= 5);
      timerBlockEl.classList.toggle('game-hud__timer--low', live && s <= 10 && s > 5);
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

  function refreshHud() {
    refreshClockAndEconomy();
    if (!statusEl) return;
    if (gameSession.gameOver) {
      statusEl.textContent = '';
      return;
    }
    const n = burger.getStack().length;
    if (!gameSession.shopIsOpen) {
      statusEl.textContent = 'Tap the yellow Open sign by the door to begin.';
    } else if (n === 0) {
      statusEl.textContent = '';
    } else if (burger.isComplete()) {
      statusEl.textContent = 'Order complete — drag from burger to aim, release to throw.';
    } else if (n >= 6) {
      statusEl.textContent = 'Stack full — add top bun or trash.';
    } else {
      statusEl.textContent = `${n}/6 layers — tap piles or bun for top.`;
    }
  }
  refreshHud();

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
  /** Inline "+0.8s" next to countdown + quick digit pulse (time already applied in GameSession). */
  function showTimeBonusHud(seconds) {
    refreshClockAndEconomy();
    if (!timerEl) return;
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
    timerEl.classList.remove('game-hud__timer-digits--bonus-pop');
    void timerEl.offsetWidth;
    timerEl.classList.add('game-hud__timer-digits--bonus-pop');
    window.setTimeout(() => timerEl.classList.remove('game-hud__timer-digits--bonus-pop'), 480);
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
      refreshHud();
      return true;
    }
    if (!gameSession.canPlay()) {
      return true;
    }
    if (pick.trash) {
      if (slingshotRef?.isBusy()) return true;
      gameAudio.playTrash();
      gameSession.resetCombo();
      gameSession.clearBurgerTiming();
      burger.reset();
      stackView.clearFeedbacks();
      stackView.rebuildFromStack(burger.getStack(), { animateLast: false });
      refreshHud();
      return true;
    }
    if (pick.ingredient) {
      if (slingshotRef?.isBusy()) return true;
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
    onSettled: refreshHud,
  });

  function showGameOverUI() {
    if (gameOverOverlayShown || !gameOverOverlay) return;
    gameOverOverlayShown = true;
    gameAudio.playTimeUp();
    if (gameOverCoinsEl) {
      gameOverCoinsEl.textContent = `${gameSession.totalCoins} coins`;
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
    gameSession.resetForNewGame();
    prevCoins = 0;
    gameOverOverlayShown = false;
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
    worldPickables.setShopOpened(false);
    hudInfoModal?.classList.remove('hud-info-modal--visible');
    hudInfoModal?.setAttribute('aria-hidden', 'true');
    refreshHud();
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
        }
        ingredientZips.splice(i, 1);
        refreshHud();
      }
    }

    debrisSystem.update(dt);
    renderer.render(scene, camera);
  }

  requestAnimationFrame(tick);
}

init();
