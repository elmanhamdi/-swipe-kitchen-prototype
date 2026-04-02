/**
 * Three.js visuals for customers — procedural 3D characters.
 */

import * as THREE from 'three';
import { buildOrderPreviewGroup, disposeObject3D } from './burgerVisuals.js';
import { buildCharacter } from './characterBuilder.js';
import { generateRandomTraits } from './characterTraits.js';

// Mood → subtle skin emissive tinting (keeps natural skin color)
const MOOD_TINT = {
  happy:   { emissive: 0x224422, intensity: 0.14 },
  neutral: { emissive: 0x222222, intensity: 0.04 },
  angry:   { emissive: 0x551010, intensity: 0.20 },
};

// Mood → mouth expression
const MOOD_MOUTH = {
  happy:   { sx: 1.4, py: -0.075 },
  neutral: { sx: 0.85, py: -0.08 },
  angry:   { sx: 1.5, py: -0.09 },
};

/**
 * Procedural character + floating order stack above.
 */
export class CustomerView {
  /** @param {import('./customerData.js').Customer} customer */
  constructor(customer) {
    this.customer = customer;
    this.root = new THREE.Group();
    this.root.name = `Customer_slot${customer.slotIndex}`;

    this._baseX = customer.position.x;
    this._baseZ = customer.position.z;

    // Idle lateral sway state
    this._idlePhase = 'wait';
    this._idleWait = 0.8 + Math.random() * 1.4;
    this._idleTargetX = this._baseX;
    this._swayX = 0;

    this._hitFlash = 0;

    this._squashT = 0;
    this._squashDur = 0;
    this._squashIntensity = 1;

    // Random "hey, I'm here!" waving gesture
    this._waveActive = false;
    this._wavePhase = 0;
    this._waveCooldown = 3 + Math.random() * 5;
    this._waveDuration = 1.2 + Math.random() * 0.8;
    this._waveArm = Math.random() < 0.5 ? 'left' : 'right';
    /** @type {'big'|'small'|'both'} */
    this._waveStyle = 'big';

    this._mumbleArrivalDelay = 0.3 + Math.random() * 0.5;
    this._mumbleCooldown = 9 + Math.random() * 16;
    this._wantsMumble = false;

    // ── Build procedural character ──────────────────────────────────
    const traits = generateRandomTraits();

    // Unique voice based on gender — males deep, females high, wide variety
    const isMale = traits.gender === 'male';
    const vr = Math.random();
    if (isMale) {
      // Male: deep to mid range, occasional very deep outlier
      this.voiceProfile = {
        pitch: vr < 0.2 ? 100 + Math.random() * 40       // very deep
             : vr < 0.6 ? 145 + Math.random() * 55       // normal male
             : 200 + Math.random() * 60,                  // higher male
        formantShift: 0.55 + Math.random() * 0.5,
        breathiness: 0.06 + Math.random() * 0.18,
        speed: 0.75 + Math.random() * 0.4,
        warmth: 0.35 + Math.random() * 0.45,
      };
    } else {
      // Female: mid-high to very high, occasional squeaky outlier
      this.voiceProfile = {
        pitch: vr < 0.15 ? 340 + Math.random() * 60      // mid-range female
             : vr < 0.55 ? 420 + Math.random() * 100     // normal female
             : vr < 0.85 ? 540 + Math.random() * 120     // high female
             : 680 + Math.random() * 140,                 // very squeaky / cute
        formantShift: 0.7 + Math.random() * 0.7,
        breathiness: 0.03 + Math.random() * 0.12,
        speed: 0.85 + Math.random() * 0.5,
        warmth: 0.55 + Math.random() * 0.45,
      };
    }
    const char = buildCharacter(traits);
    this._charRoot = char.root;
    this.root.add(this._charRoot);

    this._headGroup = char.headGroup;
    this._torso = char.torsoMesh;
    this._leftArm = char.leftArm;
    this._rightArm = char.rightArm;
    this._leftElbow = char.leftElbow;
    this._rightElbow = char.rightElbow;
    this._leftLeg = char.leftLeg;
    this._rightLeg = char.rightLeg;
    this._mouthMesh = char.mouthMesh;

    /** @type {THREE.MeshStandardMaterial[]} */
    this._moodMaterials = [...char.skinMaterials];

    // ── Order preview (outside _charRoot so body-scale doesn't affect it) ──
    this._orderBaseY = 2.1 * traits.bodyScale.sy + 1.6;
    this._orderGroup = buildOrderPreviewGroup(customer.order, 1.36);
    this._orderGroup.position.set(0, this._orderBaseY, 0);
    this._orderGroup.visible = false;
    this._orderGroup.scale.setScalar(0);
    this.root.add(this._orderGroup);

    this._orderPopT = -1;
    this._orderPopDur = 0.35;

    // ── Animation state ─────────────────────────────────────────────
    this._idleSeed = Math.random() * Math.PI * 2;
    this._idleAnimT = 0;

    this._celebrating = false;
    this._celebratePhase = 0;
    /** @type {'arms_up'|'clap'|'jump'} */
    this._celebrateStyle = 'arms_up';

    this._walkPhase = 0;

    this.root.position.set(this._baseX, 0, this._baseZ);
  }

  // ── Order pop-in ──────────────────────────────────────────────────

  showOrder() {
    this._orderPopT = 0;
    this._orderGroup.visible = true;
    this._orderGroup.scale.setScalar(0);
    this._orderGroup.position.y = this._orderBaseY - 1.2;
  }

  _updateOrderPop(dt) {
    if (this._orderPopT < 0) return;
    this._orderPopT += dt;
    const p = Math.min(this._orderPopT / this._orderPopDur, 1);
    const ease = 1 - (1 - p) * (1 - p);
    const overshoot = 1 + Math.sin(p * Math.PI) * 0.15;
    const scale = p < 1 ? ease * overshoot : 1;
    this._orderGroup.scale.setScalar(scale);
    this._orderGroup.position.y = this._orderBaseY - 1.2 * (1 - ease);
    if (p >= 1) {
      this._orderPopT = -1;
      this._orderGroup.scale.setScalar(1);
      this._orderGroup.position.y = this._orderBaseY;
    }
  }

  // ── Celebrate ─────────────────────────────────────────────────────

  enterCelebrateMode() {
    this._celebrating = true;
    this._celebratePhase = 0;
    this._orderGroup.visible = false;
    this.root.scale.set(1, 1, 1);
    this._squashDur = 0;
    const styles = ['arms_up', 'clap', 'jump'];
    this._celebrateStyle = styles[Math.floor(Math.random() * styles.length)];
  }

  exitCelebrateMode() {
    this._celebrating = false;
    this.root.position.y = 0;
    this._leftArm.rotation.set(0, 0, 0);
    this._rightArm.rotation.set(0, 0, 0);
    this._leftElbow.rotation.x = -0.12;
    this._rightElbow.rotation.x = -0.12;
    this._leftLeg.rotation.x = 0;
    this._rightLeg.rotation.x = 0;
  }

  /** @param {number} dt */
  updateCelebrate(dt) {
    if (!this._celebrating) return;
    this._celebratePhase += dt;
    const p = this._celebratePhase;

    const bounce = Math.abs(Math.sin(p * Math.PI * 3.4)) * 0.14;
    this.root.position.y = bounce;

    const wobble = Math.sin(p * Math.PI * 5.2) * 0.04;
    this._torso.rotation.z = wobble;
    this._headGroup.rotation.z = wobble * 1.2;

    if (this._celebrateStyle === 'arms_up') {
      const armWave = Math.sin(p * Math.PI * 4) * 0.3;
      this._leftArm.rotation.x = -0.8 + armWave;
      this._rightArm.rotation.x = -0.8 - armWave;
      this._leftArm.rotation.z = -0.3;
      this._rightArm.rotation.z = 0.3;
      const elbowWave = Math.sin(p * Math.PI * 5) * 0.2;
      this._leftElbow.rotation.x = -0.6 + elbowWave;
      this._rightElbow.rotation.x = -0.6 - elbowWave;
    } else if (this._celebrateStyle === 'clap') {
      const clap = Math.sin(p * Math.PI * 6) * 0.4;
      this._leftArm.rotation.x = -0.5;
      this._rightArm.rotation.x = -0.5;
      this._leftArm.rotation.z = clap - 0.1;
      this._rightArm.rotation.z = -clap + 0.1;
      this._leftElbow.rotation.x = -0.7;
      this._rightElbow.rotation.x = -0.7;
    } else {
      this._leftArm.rotation.x = Math.sin(p * Math.PI * 3) * 0.15;
      this._rightArm.rotation.x = Math.sin(p * Math.PI * 3 + Math.PI) * 0.15;
      this._leftArm.rotation.z = -0.05;
      this._rightArm.rotation.z = 0.05;
      this._leftElbow.rotation.x = -0.12;
      this._rightElbow.rotation.x = -0.12;
      this.root.position.y = Math.abs(Math.sin(p * Math.PI * 5)) * 0.22;
    }

    const legBounce = Math.sin(p * Math.PI * 6.8) * 0.08;
    this._leftLeg.rotation.x = legBounce;
    this._rightLeg.rotation.x = -legBounce;
  }

  // ── Mood ──────────────────────────────────────────────────────────

  /** @param {import('./customerData.js').CustomerState} state */
  _applyMoodMaterial(state) {
    const tint = MOOD_TINT[state] ?? MOOD_TINT.neutral;
    for (const m of this._moodMaterials) {
      m.emissive.setHex(tint.emissive);
      m.emissiveIntensity = tint.intensity;
    }
    const mouth = MOOD_MOUTH[state] ?? MOOD_MOUTH.neutral;
    this._mouthMesh.scale.x = mouth.sx;
    this._mouthMesh.position.y = mouth.py;
  }

  syncFromCustomer() {
    if (this._celebrating) {
      this._applyMoodMaterial('happy');
      return;
    }
    if (this._hitFlash > 0.01) return;
    this._applyMoodMaterial(this.customer.state);
  }

  // ── Hit flash ─────────────────────────────────────────────────────

  playHitFlash() {
    this._hitFlash = 0.45;
  }

  /** @param {number} dt */
  updateHitFlash(dt) {
    if (this._hitFlash <= 0) return;
    this._hitFlash = Math.max(0, this._hitFlash - dt);
    const w = Math.min(1, this._hitFlash * 3);
    for (const m of this._moodMaterials) {
      m.emissive.setRGB(0.35 + 0.5 * w, 0.25 + 0.45 * w, 0.15 + 0.35 * w);
      m.emissiveIntensity = 0.35 + 0.55 * w;
    }
    if (this._hitFlash <= 0.001) {
      this._hitFlash = 0;
      this.syncFromCustomer();
    }
  }

  // ── Squash & stretch ──────────────────────────────────────────────

  /** @param {'light' | 'hard'} strength */
  playHitSquash(strength = 'light') {
    this._squashIntensity = strength === 'hard' ? 1.35 : 0.85;
    this._squashDur = strength === 'hard' ? 0.38 : 0.28;
    this._squashT = 0;
  }

  /** @param {number} dt */
  updateSquash(dt) {
    if (this._squashDur <= 0) return;
    this._squashT += dt;
    const u = Math.min(1, this._squashT / this._squashDur);
    if (u < 0.22) {
      const p = u / 0.22;
      const sy = THREE.MathUtils.lerp(1, 0.68, p) * this._squashIntensity;
      const sxz = THREE.MathUtils.lerp(1, 1.12, p);
      this.root.scale.set(sxz, sy, sxz);
    } else if (u < 0.55) {
      const p = (u - 0.22) / (0.55 - 0.22);
      const sy = THREE.MathUtils.lerp(0.68, 1.14, p);
      const sxz = THREE.MathUtils.lerp(1.12, 0.94, p);
      this.root.scale.set(sxz * this._squashIntensity, sy, sxz * this._squashIntensity);
    } else {
      const p = (u - 0.55) / (1 - 0.55);
      const s = THREE.MathUtils.lerp(1.08, 1, p);
      this.root.scale.set(s, s, s);
    }
    if (u >= 1) {
      this.root.scale.set(1, 1, 1);
      this._squashDur = 0;
    }
  }

  // ── Facing direction ──────────────────────────────────────────────

  /** Smoothly rotate the character to face a target Y-rotation. */
  setFacingTarget(yRot) {
    this._facingTarget = yRot;
  }

  /** @param {number} dt */
  updateFacing(dt) {
    if (this._facingTarget === undefined) return;
    const cur = this._charRoot.rotation.y;
    const diff = this._facingTarget - cur;
    if (Math.abs(diff) < 0.01) {
      this._charRoot.rotation.y = this._facingTarget;
      return;
    }
    this._charRoot.rotation.y += diff * Math.min(1, dt * 8);
  }

  // ── Walk animation ────────────────────────────────────────────────

  /** @param {number} dt @param {boolean} isWalking */
  updateWalkAnim(dt, isWalking) {
    if (!isWalking) {
      if (this._walkPhase !== 0) {
        this._walkPhase = 0;
        this._charRoot.position.y = 0;
        this._leftLeg.rotation.x = 0;
        this._rightLeg.rotation.x = 0;
        this._leftArm.rotation.x = 0;
        this._rightArm.rotation.x = 0;
        this._leftElbow.rotation.x = -0.12;
        this._rightElbow.rotation.x = -0.12;
      }
      return;
    }

    this._walkPhase += dt * 9;
    const swing = Math.sin(this._walkPhase) * 0.45;
    this._leftLeg.rotation.x = swing;
    this._rightLeg.rotation.x = -swing;
    this._leftArm.rotation.x = -swing * 0.55;
    this._rightArm.rotation.x = swing * 0.55;

    // Forearm secondary swing (follows shoulder with delay)
    const elbowSwing = Math.sin(this._walkPhase - 0.4) * 0.25;
    this._leftElbow.rotation.x = -0.2 - elbowSwing * 0.5;
    this._rightElbow.rotation.x = -0.2 + elbowSwing * 0.5;

    // Subtle body bounce
    this._charRoot.position.y = Math.abs(Math.sin(this._walkPhase * 2)) * 0.02;
  }

  // ── Wave gesture ("hey, I'm here!") ─────────────────────────────

  /** @param {number} dt */
  _updateWaveGesture(dt) {
    if (this._celebrating) return;

    if (!this._waveActive) {
      this._waveCooldown -= dt;
      if (this._waveCooldown <= 0) {
        this._waveActive = true;
        this._wavePhase = 0;
        this._waveDuration = 1.0 + Math.random() * 1.0;
        this._waveArm = Math.random() < 0.5 ? 'left' : 'right';
        const styles = ['big', 'small', 'both'];
        this._waveStyle = styles[Math.floor(Math.random() * styles.length)];
        if (Math.random() < 0.45) this._wantsMumble = true;
      }
      return;
    }

    this._wavePhase += dt;
    if (this._wavePhase >= this._waveDuration) {
      this._waveActive = false;
      this._waveCooldown = 4 + Math.random() * 8;
      return;
    }

    const u = this._wavePhase / this._waveDuration;
    // Envelope: ramp up fast, hold, ramp down
    const env = u < 0.15 ? u / 0.15
      : u > 0.8 ? (1 - u) / 0.2
      : 1;
    const p = this._wavePhase;

    if (this._waveStyle === 'both') {
      const wave = Math.sin(p * Math.PI * 7) * 0.35 * env;
      this._leftArm.rotation.x = -1.6 * env;
      this._rightArm.rotation.x = -1.6 * env;
      this._leftArm.rotation.z = -0.4 * env + wave;
      this._rightArm.rotation.z = 0.4 * env - wave;
      this._leftElbow.rotation.x = -0.9 * env + Math.sin(p * Math.PI * 8) * 0.25 * env;
      this._rightElbow.rotation.x = -0.9 * env + Math.sin(p * Math.PI * 8 + Math.PI) * 0.25 * env;
    } else if (this._waveStyle === 'big') {
      const wave = Math.sin(p * Math.PI * 6) * 0.4 * env;
      const arm = this._waveArm === 'left' ? this._leftArm : this._rightArm;
      const elbow = this._waveArm === 'left' ? this._leftElbow : this._rightElbow;
      const zSign = this._waveArm === 'left' ? -1 : 1;
      arm.rotation.x = -1.8 * env;
      arm.rotation.z = zSign * 0.35 * env + wave;
      elbow.rotation.x = -0.7 * env + Math.sin(p * Math.PI * 7.5) * 0.3 * env;
    } else {
      const wave = Math.sin(p * Math.PI * 8) * 0.25 * env;
      const arm = this._waveArm === 'left' ? this._leftArm : this._rightArm;
      const elbow = this._waveArm === 'left' ? this._leftElbow : this._rightElbow;
      const zSign = this._waveArm === 'left' ? -1 : 1;
      arm.rotation.x = -1.1 * env;
      arm.rotation.z = zSign * 0.2 * env + wave;
      elbow.rotation.x = -1.2 * env + Math.sin(p * Math.PI * 9) * 0.2 * env;
    }

    // Slight head tilt toward waving side
    const headTilt = this._waveStyle === 'both' ? 0
      : (this._waveArm === 'left' ? 0.08 : -0.08) * env;
    this._headGroup.rotation.z += headTilt;
  }

  // ── Idle ──────────────────────────────────────────────────────────

  /** @param {number} dt */
  updateIdle(dt) {
    if (this._celebrating) return;

    // Lateral drift
    if (this._idlePhase === 'wait') {
      this._idleWait -= dt;
      if (this._idleWait <= 0) {
        this._idlePhase = 'move';
        const span = 0.22;
        this._idleTargetX = this._baseX + (Math.random() * 2 - 1) * span;
      }
    } else {
      const speed = 0.35;
      this._swayX = THREE.MathUtils.lerp(
        this._swayX,
        this._idleTargetX - this._baseX,
        1 - Math.exp(-speed * dt * 10),
      );
      if (Math.abs(this._swayX - (this._idleTargetX - this._baseX)) < 0.012) {
        this._swayX = this._idleTargetX - this._baseX;
        this._idlePhase = 'wait';
        this._idleWait = 0.9 + Math.random() * 2.2;
      }
    }
    this.root.position.x = this._baseX + this._swayX;
    this.root.position.z = this._baseZ + Math.sin(this.customer.patienceTimer * 0.55) * 0.04;

    this._idleAnimT += dt;
    const inSquash = this._squashDur > 0;
    if (!inSquash) {
      const s = this._idleSeed;
      const t = this._idleAnimT;

      // Head
      this._headGroup.rotation.z = Math.sin(t * 1.12 + s) * 0.06;
      this._headGroup.rotation.x = Math.sin(t * 0.86 + s * 1.7) * 0.032;

      // Torso
      this._torso.rotation.z = Math.sin(t * 0.68 + s * 0.5) * 0.024;

      // Arms gentle sway (base idle — wave gesture overrides these when active)
      this._leftArm.rotation.x = Math.sin(t * 0.9 + s * 1.3) * 0.045;
      this._rightArm.rotation.x = Math.sin(t * 0.9 + s * 1.3 + Math.PI) * 0.045;
      this._leftArm.rotation.z = Math.sin(t * 0.7 + s) * 0.03 - 0.05;
      this._rightArm.rotation.z = -Math.sin(t * 0.7 + s) * 0.03 + 0.05;
      this._leftElbow.rotation.x = -0.12 + Math.sin(t * 1.1 + s * 0.8) * 0.04;
      this._rightElbow.rotation.x = -0.12 + Math.sin(t * 1.1 + s * 0.8 + Math.PI) * 0.04;

      // Legs minimal shift
      this._leftLeg.rotation.x = Math.sin(t * 0.5 + s * 0.7) * 0.015;
      this._rightLeg.rotation.x = Math.sin(t * 0.5 + s * 0.7 + Math.PI) * 0.015;

      // Order float
      this._orderGroup.position.y =
        this._orderBaseY + Math.sin(t * 2.05 + s) * 0.045 + Math.sin(t * 3.1 + s * 2) * 0.012;

      // Wave gesture override (runs after base idle so it can overwrite arm rotations)
      this._updateWaveGesture(dt);
    }

    this._updateOrderPop(dt);
    this._updateMumbleTiming(dt);
  }

  // ── Mumble ──────────────────────────────────────────────────────

  /** @param {number} dt */
  _updateMumbleTiming(dt) {
    if (this._celebrating) return;

    if (this._mumbleArrivalDelay > 0) {
      this._mumbleArrivalDelay -= dt;
      if (this._mumbleArrivalDelay <= 0) {
        this._wantsMumble = true;
        return;
      }
    }

    this._mumbleCooldown -= dt;
    if (this._mumbleCooldown <= 0) {
      this._wantsMumble = true;
      this._mumbleCooldown = 10 + Math.random() * 20;
    }
  }

  consumeMumble() {
    if (!this._wantsMumble) return null;
    this._wantsMumble = false;
    return this.voiceProfile;
  }

  // ── Cleanup ───────────────────────────────────────────────────────

  dispose() {
    disposeObject3D(this.root);
  }
}
