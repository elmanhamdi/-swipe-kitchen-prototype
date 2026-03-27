/**
 * Three.js restaurant room prototype — vanilla ES modules, GitHub Pages friendly.
 * Entry: index.html loads this file as type="module".
 */

import * as THREE from 'three';
import { Burger } from './burgerData.js';
import { createPlate, BurgerStackView } from './burgerVisuals.js';
import { CustomerManager } from './customerManager.js';
import { SlingshotController } from './slingshot.js';
import { GameSession } from './gameCore.js';
import { FloatingBonusLayer } from './floatingBonusText.js';
import { ScreenShake, CoinFlyoutLayer, AmbientCameraDrift } from './juiceSystems.js';
import { GameAudio } from './audioSystem.js';
import { buildRestaurantRoom, applyAtmosphere, createRestaurantLights } from './environment.js';
import { configureForDevice, getRenderProfile } from './renderQuality.js';

/** Container query selector (9:16 stage inside letterboxed frame). */
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

  scene.add(buildRestaurantRoom());

  const customerManager = new CustomerManager(scene);
  customerManager.fillToMax();

  // --- Player area: plate + burger stack (data vs visuals separated) ---
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

  const clock = new THREE.Clock();
  const statusEl = document.getElementById('burger-status');
  const coinsDisplayEl = document.getElementById('coins-display');
  const coinsValueEl = document.getElementById('coins-value');
  const timerEl = document.getElementById('game-timer');
  const timerBlockEl = document.getElementById('game-timer-block');
  const comboEl = document.getElementById('game-combo');

  const gameSession = new GameSession();
  let prevCoins = gameSession.totalCoins;

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
    if (comboEl) comboEl.textContent = `${gameSession.combo}×`;
  }

  function refreshHud() {
    refreshClockAndEconomy();
    if (!statusEl) return;
    if (gameSession.gameOver) {
      statusEl.textContent = `Time's up! Final: ${gameSession.totalCoins} coins.`;
      return;
    }
    const n = burger.getStack().length;
    if (n === 0) {
      statusEl.textContent = 'Tap Bottom to start (max 6 layers).';
    } else if (burger.isComplete()) {
      statusEl.textContent = 'Order complete — drag from burger to aim, release to throw.';
    } else if (n >= 6) {
      statusEl.textContent = 'Stack full without Top — trash to restart.';
    } else {
      statusEl.textContent = `${n}/6 layers — finish with Top.`;
    }
  }
  refreshHud();

  const floatingLayer = new FloatingBonusLayer(stage, camera);
  const screenShake = new ScreenShake(camera, CAMERA_REST.clone());
  const cameraDrift = new AmbientCameraDrift(screenShake, CAMERA_REST);
  const coinFlyout = new CoinFlyoutLayer(stage);

  const slingshot = new SlingshotController({
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
    },
    gameAudio,
    onSettled: refreshHud,
  });

  function punchButton(el) {
    if (!el) return;
    el.classList.remove('burger-ui__btn--punch');
    void el.offsetWidth;
    el.classList.add('burger-ui__btn--punch');
    el.addEventListener(
      'animationend',
      () => el.classList.remove('burger-ui__btn--punch'),
      { once: true },
    );
  }

  stage.querySelectorAll('[data-ingredient]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!gameSession.canPlay() || slingshot.isBusy()) return;
      const type = btn.getAttribute('data-ingredient');
      const result = burger.addIngredient(type);
      if (result.ok) {
        punchButton(btn);
        gameAudio.playTap();
        stackView.rebuildFromStack(burger.getStack(), { animateLast: true });
        if (burger.getStack().length === 1) {
          gameSession.notifyFirstIngredientPlaced();
        }
      }
      refreshHud();
    });
  });

  const trashBtn = document.getElementById('burger-trash');
  trashBtn?.addEventListener('click', () => {
    if (!gameSession.canPlay() || slingshot.isBusy()) return;
    punchButton(trashBtn);
    gameAudio.playTrash();
    gameSession.resetCombo();
    gameSession.clearBurgerTiming();
    burger.reset();
    stackView.clearFeedbacks();
    stackView.rebuildFromStack(burger.getStack(), { animateLast: false });
    refreshHud();
  });

  document.getElementById('serve-btn')?.addEventListener('click', () => {
    if (!gameSession.canPlay() || slingshot.isBusy()) return;
    if (!burger.isComplete()) {
      refreshHud();
      return;
    }
    const served = customerManager.tryServe(burger.getStack());
    if (served === null) {
      if (statusEl) statusEl.textContent = 'No customer wants that order — check stacks above them.';
      return;
    }
    const { earned, comboAfter } = gameSession.applyCorrectDelivery(served.baseReward, 0, {});
    gameSession.clearBurgerTiming();
    coinFlyout.spawnBurst(served.coinWorld, camera, coinsDisplayEl, earned);
    if (comboAfter >= 2) {
      const w = served.coinWorld.clone();
      w.y += 0.55;
      floatingLayer.spawn(w, `COMBO ×${comboAfter}!`, '#ffd84a', {
        className: 'floating-bonus-text--combo',
        riseSpeed: 1.4,
        duration: 1.5,
      });
    }
    screenShake.trigger(0.045);
    gameAudio.playCorrect();
    burger.reset();
    stackView.clearFeedbacks();
    stackView.rebuildFromStack(burger.getStack(), { animateLast: false });
    refreshHud();
  });

  /**
   * Resize renderer and camera to match the 9:16 stage element (CSS handles letterboxing).
   */
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

  /**
   * Main loop.
   */
  function tick() {
    requestAnimationFrame(tick);
    const dt = clock.getDelta();
    const wasLive = !gameSession.gameOver;
    gameSession.tick(dt);
    if (wasLive && gameSession.gameOver && statusEl) {
      statusEl.textContent = `Time's up! Final: ${gameSession.totalCoins} coins.`;
    }
    refreshClockAndEconomy();
    stackView.update(dt);
    customerManager.update(dt);
    slingshot.update(dt);
    floatingLayer.update(dt);
    coinFlyout.update(dt);
    cameraDrift.update(dt);
    screenShake.update(dt);
    renderer.render(scene, camera);
  }

  requestAnimationFrame(tick);
}

init();
