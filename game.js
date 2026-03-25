(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: true });

  const ui = {
    score: document.getElementById('score'),
    streak: document.getElementById('streak'),
    best: document.getElementById('best'),
    timeLeft: document.getElementById('timeLeft'),
    startBtn: document.getElementById('startBtn'),
    restartBtn: document.getElementById('restartBtn'),
    endScreen: document.getElementById('endScreen'),
    finalScore: document.getElementById('finalScore'),
    centerHelp: document.getElementById('centerHelp'),
    touchToast: document.getElementById('touchToast'),
  };

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const INGREDIENTS = [
    // Icon-only (no letters). Colors map to food ingredients.
    { id: 'tomato', top: '#FF3B4D', side: '#C9152A', accent: '#FFE7EC' },
    { id: 'lettuce', top: '#44FF8A', side: '#1CA85A', accent: '#E6FFD1' }, // salad
    { id: 'cucumber', top: '#2EE6D0', side: '#0A9D86', accent: '#E0FFFA' }, // pickles
    { id: 'cheese', top: '#FFD24A', side: '#C18A00', accent: '#FFF1A8' },
    { id: 'bun', top: '#F6D7A6', side: '#C6935D', accent: '#FFF1DA' }, // bread
    { id: 'meat', top: '#B86A4B', side: '#6C2F1B', accent: '#FFD0BA' }, // burger patty
    { id: 'ham', top: '#FF7BB0', side: '#C43B74', accent: '#FFE1EF' },
  ];

  const ingredientById = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));
  const randomIngredient = () => INGREDIENTS[(Math.random() * INGREDIENTS.length) | 0].id;

  const ORDER_LEN_BASE = 3;
  const ORDER_LEN_EXTRA_PER_LEVEL = 1;
  const MAX_LEVEL = 7;

  const SWIPE = {
    // Start→end distance at or below this is a tap (reroll). Above it is a swipe (angle).
    tapMaxMoveRatio: 0.038,
    maxCenterStartRatio: 0.155, // swipe start must be within center radius
  };

  const INGREDIENT_LABELS = {
    tomato: 'Tomato',
    lettuce: 'Salad',
    cucumber: 'Pickles',
    cheese: 'Cheese',
    bun: 'Bread',
    meat: 'Burger',
    ham: 'Ham',
  };

  const customerAngles = (() => {
    // 0..7 starting from Up (-90deg), clockwise with 45deg step.
    const up = -Math.PI / 2; // normalized to atan2 range
    return Array.from({ length: 8 }, (_, i) => up + i * (Math.PI / 4));
  })();

  function dirIndexFromVector(dx, dy) {
    // Angle routing from swipe start->end.
    // Convert to a math-like frame (y up) so top-right is +45deg.
    const angle = Math.atan2(-dy, dx); // -PI..PI
    const fromUpClockwise = (Math.PI / 2 - angle + TAU) % TAU;
    const sector = TAU / 8;
    return Math.floor((fromUpClockwise + sector / 2) / sector) % 8; // 0..7
  }

  function makeOrder(len) {
    const a = [];
    for (let i = 0; i < len; i++) a.push(randomIngredient());
    return a;
  }

  function formatScore(n) {
    return String(n | 0);
  }

  function drawRoundedRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawIngredient(ingId, x, y, s, opts = {}) {
    const ing = ingredientById[ingId] || ingredientById.tomato;
    const t = opts.time || 0;

    ctx.save();
    ctx.translate(x, y);
    const rot = (opts.rotate || 0) + (opts.bob ? Math.sin(t * 7) * 0.05 : 0);
    ctx.rotate(rot);

    const unit = 46 * s;
    const R = unit * 0.52;

    // Ingredient silhouettes (no letters)
    if (ingId === 'tomato') {
      // Tomato slice
      const g = ctx.createRadialGradient(-R * 0.25, -R * 0.25, R * 0.15, 0, 0, R * 1.2);
      g.addColorStop(0, '#FF8A9A');
      g.addColorStop(0.55, ing.top);
      g.addColorStop(1, ing.side);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.fill();

      // Inner flesh
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.74, 0, TAU);
      ctx.fill();

      // Seeds pockets
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + 0.2;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * R * 0.35, Math.sin(a) * R * 0.30, R * 0.18, R * 0.14, a, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = ing.accent;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + 0.1;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * R * 0.38, Math.sin(a) * R * 0.33, R * 0.05, 0, TAU);
        ctx.fill();
      }
    } else if (ingId === 'cheese') {
      // Cheese wedge
      const w = unit * 0.95;
      const h = unit * 0.75;
      ctx.fillStyle = ing.side;
      ctx.beginPath();
      ctx.moveTo(-w * 0.35 + unit * 0.08, h * 0.10);
      ctx.lineTo(w * 0.40 + unit * 0.08, h * 0.22);
      ctx.lineTo(-w * 0.10 + unit * 0.08, -h * 0.40);
      ctx.closePath();
      ctx.fill();

      const g = ctx.createLinearGradient(0, -h, 0, h);
      g.addColorStop(0, '#FFF3B7');
      g.addColorStop(0.5, ing.top);
      g.addColorStop(1, '#E9A800');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-w * 0.45, h * 0.18);
      ctx.lineTo(w * 0.35, h * 0.30);
      ctx.lineTo(-w * 0.15, -h * 0.35);
      ctx.closePath();
      ctx.fill();

      // Holes
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      const holes = [
        [-0.05, 0.10, 0.10],
        [0.12, 0.05, 0.08],
        [-0.18, -0.02, 0.07],
        [0.00, -0.12, 0.06],
      ];
      for (const [hx, hy, hr] of holes) {
        ctx.beginPath();
        ctx.ellipse(hx * unit, hy * unit, hr * unit, hr * unit * 0.78, 0, 0, TAU);
        ctx.fill();
      }
    } else if (ingId === 'bun') {
      // Bun top + bottom
      const topG = ctx.createRadialGradient(-R * 0.25, -R * 0.55, R * 0.18, 0, 0, R * 1.35);
      topG.addColorStop(0, '#FFF8E8');
      topG.addColorStop(0.50, ing.top);
      topG.addColorStop(1, '#B98244');
      ctx.fillStyle = topG;
      ctx.beginPath();
      ctx.ellipse(0, -unit * 0.10, R * 1.05, R * 0.78, 0, Math.PI, TAU);
      ctx.lineTo(R * 1.02, unit * 0.02);
      ctx.ellipse(0, unit * 0.02, R * 1.05, R * 0.70, 0, 0, Math.PI);
      ctx.closePath();
      ctx.fill();

      // Bottom bun
      ctx.fillStyle = '#9A6837';
      ctx.beginPath();
      ctx.ellipse(0, unit * 0.34, R * 0.98, R * 0.38, 0, 0, TAU);
      ctx.fill();

      // Outline for stronger contrast
      ctx.strokeStyle = 'rgba(70,38,10,0.48)';
      ctx.lineWidth = Math.max(2, unit * 0.035);
      ctx.beginPath();
      ctx.ellipse(0, -unit * 0.02, R * 1.04, R * 0.72, 0, 0, TAU);
      ctx.stroke();

      // Sesame
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.4;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * R * 0.45, -unit * 0.20 + Math.sin(a) * R * 0.20, R * 0.10, R * 0.06, a, 0, TAU);
        ctx.fill();
      }
    } else if (ingId === 'meat') {
      // Burger patty
      const g = ctx.createRadialGradient(-R * 0.25, -R * 0.25, R * 0.15, 0, 0, R * 1.2);
      g.addColorStop(0, '#E9A284');
      g.addColorStop(0.55, ing.top);
      g.addColorStop(1, ing.side);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, unit * 0.05, R * 1.05, R * 0.75, 0, 0, TAU);
      ctx.fill();

      // Grill lines
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = Math.max(2, unit * 0.04);
      for (let i = -2; i <= 2; i++) {
        const yy = unit * 0.05 + i * unit * 0.10;
        ctx.beginPath();
        ctx.moveTo(-R * 0.75, yy);
        ctx.quadraticCurveTo(0, yy - unit * 0.04, R * 0.75, yy + unit * 0.02);
        ctx.stroke();
      }
    } else if (ingId === 'lettuce') {
      // Salad leaf
      const g = ctx.createRadialGradient(-R * 0.25, -R * 0.45, R * 0.12, 0, 0, R * 1.35);
      g.addColorStop(0, '#D9FF9E');
      g.addColorStop(0.55, ing.top);
      g.addColorStop(1, ing.side);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-R * 0.95, unit * 0.05);
      ctx.quadraticCurveTo(-R * 0.60, -R * 0.95, 0, -R * 0.80);
      ctx.quadraticCurveTo(R * 0.75, -R * 0.95, R * 0.92, unit * 0.05);
      ctx.quadraticCurveTo(R * 0.55, R * 0.65, 0, R * 0.85);
      ctx.quadraticCurveTo(-R * 0.55, R * 0.65, -R * 0.95, unit * 0.05);
      ctx.closePath();
      ctx.fill();

      // Veins
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = Math.max(2, unit * 0.03);
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.72);
      ctx.quadraticCurveTo(-unit * 0.06, 0, 0, R * 0.70);
      ctx.stroke();
      for (let i = -2; i <= 2; i++) {
        if (i === 0) continue;
        ctx.beginPath();
        ctx.moveTo(0, -R * 0.20);
        ctx.quadraticCurveTo(i * unit * 0.20, -R * 0.10, i * unit * 0.26, R * 0.25);
        ctx.stroke();
      }
    } else if (ingId === 'cucumber') {
      // Pickles: overlapping discs
      const discs = [
        { x: -unit * 0.18, y: unit * 0.02, r: R * 0.70, rot: -0.15 },
        { x: unit * 0.10, y: -unit * 0.10, r: R * 0.62, rot: 0.10 },
        { x: unit * 0.22, y: unit * 0.10, r: R * 0.55, rot: 0.24 },
      ];
      for (const d of discs) {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        const g = ctx.createRadialGradient(-d.r * 0.25, -d.r * 0.25, d.r * 0.12, 0, 0, d.r * 1.25);
        g.addColorStop(0, '#B6FFE8');
        g.addColorStop(0.55, ing.top);
        g.addColorStop(1, ing.side);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, d.r, d.r * 0.82, 0, 0, TAU);
        ctx.fill();
        // Seed ring
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = Math.max(2, unit * 0.03);
        ctx.beginPath();
        ctx.ellipse(0, 0, d.r * 0.62, d.r * 0.52, 0, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * d.r * 0.30, Math.sin(a) * d.r * 0.24, d.r * 0.05, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    } else if (ingId === 'ham') {
      // Ham: two layered squared-ish slices
      const drawHamSlice = (offX, offY, scale, edgeAlpha) => {
        const g = ctx.createRadialGradient(-R * 0.30 + offX, -R * 0.45 + offY, R * 0.14, 0, 0, R * 1.35);
        g.addColorStop(0, '#FFE7F2');
        g.addColorStop(0.55, ing.top);
        g.addColorStop(1, ing.side);
        ctx.fillStyle = g;
        const w = R * 1.78 * scale;
        const h = R * 1.34 * scale;
        drawRoundedRect(offX - w / 2, unit * 0.02 + offY - h / 2, w, h, R * 0.26 * scale);
        ctx.fill();

        // Fold highlight
        ctx.strokeStyle = `rgba(255,255,255,${0.26 * edgeAlpha})`;
        ctx.lineWidth = Math.max(2, unit * 0.035 * scale);
        drawRoundedRect(
          offX - w * 0.36,
          unit * 0.02 + offY - h * 0.30,
          w * 0.72,
          h * 0.60,
          R * 0.18 * scale
        );
        ctx.stroke();

        // Fat edge
        ctx.strokeStyle = `rgba(255,255,255,${0.34 * edgeAlpha})`;
        ctx.lineWidth = Math.max(2, unit * 0.04 * scale);
        drawRoundedRect(
          offX - w * 0.45 + unit * 0.02,
          unit * 0.02 + offY - h * 0.36 + unit * 0.04,
          w * 0.90,
          h * 0.72,
          R * 0.22 * scale
        );
        ctx.stroke();
      };

      // Back slice
      drawHamSlice(-unit * 0.05, unit * 0.04, 1.0, 0.95);
      // Front slice
      drawHamSlice(unit * 0.06, -unit * 0.02, 0.98, 1.0);
    } else {
      // Generic fallback: simple 2.5D ingredient blob
      const g = ctx.createRadialGradient(-R * 0.25, -R * 0.35, R * 0.12, 0, 0, R * 1.35);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(0.55, ing.top);
      g.addColorStop(1, ing.side);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, unit * 0.02, R * 1.05, R * 0.80, -0.08, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawCustomer(cust, x, y, r, t, pulse = 0) {
    const face = cust.face; // 0..2
    const prog = cust.progressIndex;

    ctx.save();
    ctx.translate(x, y);

    // Body: 2.5D bubble
    const bob = Math.sin(t * 1.6 + cust.phase) * r * 0.03;
    ctx.translate(0, bob + pulse);

    const sideX = r * 0.10;
    const sideY = r * 0.09;

    // Side
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(sideX * 0.6, sideY * 1.15, r * 0.95, r * 0.72, 0, 0, TAU);
    ctx.fill();

    // Main body gradient
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.35, r * 0.25, 0, 0, r * 1.25);
    const c0 = cust.baseColor0;
    const c1 = cust.baseColor1;
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);

    // Side face
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    drawRoundedRect(-r + sideX, -r + sideY, r * 2, r * 2, r * 0.38);
    ctx.fill();

    // Front
    ctx.fillStyle = g;
    drawRoundedRect(-r, -r, r * 2, r * 2, r * 0.40);
    ctx.fill();

    // Outline
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = Math.max(2, r * 0.05);
    drawRoundedRect(-r, -r, r * 2, r * 2, r * 0.40);
    ctx.stroke();

    // Order icons: side-by-side, below the customer face
    const next = cust.order[cust.progressIndex];
    const remaining = cust.order.slice(cust.progressIndex, cust.progressIndex + 3);
    const iconCount = remaining.length;

    const iconPx = r * 1.05; // readable, bigger than face
    const iconScale = iconPx / 46;
    const yRow = r * 0.92; // below face
    const iconSpacing = r * 0.34; // spread farther apart

    // Draw queued ingredients first.
    for (let i = 1; i < iconCount; i++) {
      const ingId = remaining[i];
      const isNext = false;
      const xRow = (i - (iconCount - 1) / 2) * iconSpacing;
      drawIngredient(ingId, xRow, yRow, iconScale * (isNext ? 1.08 : 1.0), {
        time: t,
        rotate: isNext ? Math.sin(t * 6 + cust.phase) * 0.06 : 0,
        bob: isNext,
      });
    }

    // Draw current requested ingredient last so it appears in front.
    if (iconCount > 0) {
      const i = 0;
      const ingId = remaining[0];
      const isNext = true;
      const xRow = (i - (iconCount - 1) / 2) * iconSpacing;
      drawIngredient(ingId, xRow, yRow, iconScale * 1.08, {
        time: t,
        rotate: Math.sin(t * 6 + cust.phase) * 0.06,
        bob: true,
      });

      if (isNext) {
        ctx.strokeStyle = 'rgba(255,255,255,0.70)';
        ctx.lineWidth = Math.max(3, r * 0.06);
        ctx.beginPath();
        ctx.arc(xRow, yRow, iconPx * 0.56, 0, TAU);
        ctx.stroke();
      }
    }

    // Face
    const eyeY = -r * 0.15;
    const eyeX = r * 0.26;
    const eyeW = r * 0.10;
    const eyeH = r * 0.14;

    // Eyes
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(-eyeX, eyeY, eyeW, eyeH, 0, 0, TAU);
    ctx.ellipse(eyeX, eyeY, eyeW, eyeH, 0, 0, TAU);
    ctx.fill();

    // Mouth expression
    ctx.strokeStyle = 'rgba(0,0,0,0.38)';
    ctx.lineWidth = Math.max(3, r * 0.06);
    ctx.lineCap = 'round';

    if (face === 2) {
      // happy: smile arc
      ctx.beginPath();
      ctx.arc(0, r * 0.18, r * 0.30, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    } else if (face === 1) {
      // angry: frown + brows
      ctx.beginPath();
      ctx.arc(0, r * 0.25, r * 0.28, 1.1 * Math.PI, 1.9 * Math.PI);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath();
      ctx.moveTo(-eyeX - r * 0.02, eyeY - r * 0.18);
      ctx.quadraticCurveTo(-eyeX, eyeY - r * 0.30, -eyeX + r * 0.10, eyeY - r * 0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(eyeX + r * 0.02, eyeY - r * 0.18);
      ctx.quadraticCurveTo(eyeX, eyeY - r * 0.30, eyeX - r * 0.10, eyeY - r * 0.22);
      ctx.stroke();
    } else {
      // neutral: small line
      ctx.beginPath();
      ctx.moveTo(-r * 0.20, r * 0.25);
      ctx.lineTo(r * 0.20, r * 0.25);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBackground(board, t) {
    const { cx, cy, size } = board;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Convert to device pixels already handled by scaling in resize().
    // Draw platform
    const outerR = size * 0.46;
    const ringR = outerR * 0.86;
    const innerR = outerR * 0.22;

    // Outer glow
    const glow = ctx.createRadialGradient(cx, cy, innerR * 0.6, cx, cy, outerR * 1.12);
    glow.addColorStop(0, 'rgba(255,160,210,0.12)');
    glow.addColorStop(0.55, 'rgba(86,225,255,0.08)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR * 1.12, 0, TAU);
    ctx.fill();

    // Ring
    const ringG = ctx.createRadialGradient(cx, cy, ringR * 0.55, cx, cy, ringR * 1.05);
    ringG.addColorStop(0, 'rgba(255,255,255,0.07)');
    ringG.addColorStop(1, 'rgba(255,255,255,0.01)');
    ctx.fillStyle = ringG;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR * 1.03, 0, TAU);
    ctx.arc(cx, cy, ringR * 0.73, 0, TAU, true);
    ctx.closePath();
    ctx.fill();

    // Center pad
    const padG = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerR * 1.15);
    padG.addColorStop(0, 'rgba(255,255,255,0.10)');
    padG.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = padG;
    ctx.beginPath();
    ctx.arc(cx, cy, innerR * 1.08, 0, TAU);
    ctx.fill();

    // Direction hints (subtle)
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < 8; i++) {
      const a = customerAngles[i];
      const x0 = cx + Math.cos(a) * ringR * 0.62;
      const y0 = cy + Math.sin(a) * ringR * 0.62;
      const x1 = cx + Math.cos(a) * ringR * 0.92;
      const y1 = cy + Math.sin(a) * ringR * 0.92;
      ctx.strokeStyle = `rgba(120,220,255,${0.3 - i * 0.02})`;
      ctx.lineWidth = Math.max(2, size * 0.0025);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function makeCustomer(index) {
    const palettes = [
      ['#FF6A88', '#FF2E5E'],
      ['#6A7DFF', '#3E4BFF'],
      ['#3EF0A0', '#18C979'],
      ['#FFD35C', '#FFB703'],
      ['#7B6BFF', '#4D2CFF'],
      ['#2EE6D0', '#0BAE96'],
      ['#FF9A4A', '#FF5B2E'],
      ['#9B6BFF', '#6E3CFF'],
    ];
    const p = palettes[index % palettes.length];
    return {
      index,
      baseColor0: p[0],
      baseColor1: p[1],
      order: makeOrder(ORDER_LEN_BASE),
      progressIndex: 0,
      face: 0, // 0 neutral, 1 angry, 2 happy
      faceTimer: 0,
      leaving: false,
      leaveTimer: 0,
      phase: Math.random() * 1000,
    };
  }

  function makeProjectile(kind, ingId, fromX, fromY, toX, toY, durationMs) {
    return {
      kind, // 'deliver' | 'fail'
      ingId,
      fromX,
      fromY,
      toX,
      toY,
      durationMs,
      startMs: performance.now(),
      done: false,
      wobble: Math.random() * TAU,
    };
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function nowMs() {
    return performance.now();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const cssSize = Math.min(rect.width, rect.height);
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    canvas.width = Math.floor(cssSize * dpr);
    canvas.height = Math.floor(cssSize * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
    board.size = cssSize;
    board.cx = cssSize / 2;
    board.cy = cssSize / 2;
    board.rCustomers = cssSize * 0.42 * 0.9; // 10% closer to center
    board.rCenter = cssSize * 0.14;
    board.projectileRadius = cssSize * 0.08;
    board.tapMaxDistance = cssSize * SWIPE.tapMaxMoveRatio;
    board.centerStartMax = cssSize * SWIPE.maxCenterStartRatio;
  }

  const board = {
    size: 0,
    cx: 0,
    cy: 0,
    rCustomers: 0,
    rCenter: 0,
    tapMaxDistance: 0,
    centerStartMax: 0,
    projectileRadius: 0,
  };

  const game = {
    running: false,
    timeLimitSec: 60,
    startMs: 0,
    endMs: 0,
    score: 0,
    streak: 0,
    best: 0,
    level: 1,
    customers: [],
    activeIngredient: null, // {id, spawnMs}
    spawnDelayMs: 0,
    spawnRequestedAt: 0,
    inFlight: [],
    particles: [],
    swipeLock: false,
    swipeStart: null,
    swipeCurrent: null,
    changeCooldownUntil: 0,
    touchToastUntil: 0,
  };

  function reset() {
    game.running = false;
    game.score = 0;
    game.streak = 0;
    game.level = 1;
    game.customers = Array.from({ length: 8 }, (_, i) => makeCustomer(i));
    game.activeIngredient = null;
    game.spawnDelayMs = 0;
    game.spawnRequestedAt = 0;
    game.inFlight = [];
    game.particles = [];
    game.startMs = 0;
    game.endMs = 0;
    game.swipeLock = false;
    game.swipeStart = null;
    game.swipeCurrent = null;
    game.changeCooldownUntil = 0;
    ui.score.textContent = formatScore(game.score);
    ui.streak.textContent = formatScore(game.streak);
    ui.best.textContent = formatScore(game.best);
    ui.timeLeft.textContent = formatScore(game.timeLimitSec);
  }

  function getRemainingTimeSec(atMs = nowMs()) {
    if (!game.running) return game.timeLimitSec;
    return Math.max(0, Math.ceil((game.endMs - atMs) / 1000));
  }

  function updateHUD() {
    ui.score.textContent = formatScore(game.score);
    ui.streak.textContent = formatScore(game.streak);
    ui.best.textContent = formatScore(game.best);
    ui.timeLeft.textContent = formatScore(getRemainingTimeSec());
  }

  function spawnIngredient() {
    game.activeIngredient = {
      id: randomIngredient(),
      spawnMs: nowMs(),
    };
  }

  function rerollIngredient() {
    if (!game.activeIngredient) return false;
    const currentId = game.activeIngredient.id;
    let nextId = currentId;
    // Try a few times to avoid replacing with the same ingredient.
    for (let i = 0; i < 8 && nextId === currentId; i++) {
      nextId = randomIngredient();
    }
    if (nextId === currentId) return false;
    game.activeIngredient = { id: nextId, spawnMs: nowMs() };
    return true;
  }

  function setCustomerOrder(cust) {
    const len = clamp(ORDER_LEN_BASE + (game.level - 1) * ORDER_LEN_EXTRA_PER_LEVEL, ORDER_LEN_BASE, ORDER_LEN_BASE + ORDER_LEN_EXTRA_PER_LEVEL * MAX_LEVEL);
    cust.order = makeOrder(len);
    cust.progressIndex = 0;
    cust.face = 0;
    cust.faceTimer = 0;
    cust.leaving = false;
    cust.leaveTimer = 0;
  }

  function showTouchToast(ms = 900) {
    ui.touchToast.hidden = false;
    game.touchToastUntil = nowMs() + ms;
  }

  function startGame() {
    reset();
    resize();
    game.running = true;
    game.startMs = nowMs();
    game.endMs = game.startMs + game.timeLimitSec * 1000;
    setCustomerOrder(game.customers[0]);
    setCustomerOrder(game.customers[1]);
    setCustomerOrder(game.customers[2]);
    setCustomerOrder(game.customers[3]);
    setCustomerOrder(game.customers[4]);
    setCustomerOrder(game.customers[5]);
    setCustomerOrder(game.customers[6]);
    setCustomerOrder(game.customers[7]);
    game.spawnDelayMs = 150;
    game.spawnRequestedAt = nowMs();
    ui.centerHelp.style.opacity = '1';
    ui.endScreen.hidden = true;
    ui.startBtn.hidden = true;
    updateHUD();
  }

  function endGame() {
    game.running = false;
    ui.endScreen.hidden = false;
    ui.finalScore.textContent = formatScore(game.score);
    ui.startBtn.hidden = false;
    ui.centerHelp.style.opacity = '0';
    ui.timeLeft.textContent = '0';
  }

  function attemptSwipe(endX, endY) {
    if (!game.running) return;
    if (!game.activeIngredient) return;
    if (!game.swipeStart) return;
    if (game.swipeLock) return;

    const startX = game.swipeStart.x;
    const startY = game.swipeStart.y;
    const dx = endX - startX;
    const dy = endY - startY;

    const startDistFromCenter = Math.hypot(startX - board.cx, startY - board.cy);
    if (startDistFromCenter > board.centerStartMax) {
      return;
    }

    // Direction is based purely on start->end angle.
    const dirIndex = dirIndexFromVector(dx, dy); // 0..7
    const cust = game.customers[dirIndex];
    const ingId = game.activeIngredient.id;
    const expected = cust.order[cust.progressIndex];
    const success = ingId === expected;

    // Consume ingredient immediately for chaining.
    game.activeIngredient = null;
    game.spawnDelayMs = 110;
    game.spawnRequestedAt = nowMs();

    if (success) {
      game.streak += 1;
      game.best = Math.max(game.best, game.streak);
      const stepScore = 10 + (game.streak >= 10 ? 2 : 0) + Math.max(0, game.level - 1) * 2;
      game.score += stepScore;
      cust.progressIndex += 1;
      cust.face = 2;
      cust.faceTimer = 0.45;

      // Projectile to customer
      const fromX = board.cx;
      const fromY = board.cy;
      const toX = board.cx + Math.cos(customerAngles[dirIndex]) * board.rCustomers;
      const toY = board.cy + Math.sin(customerAngles[dirIndex]) * board.rCustomers;
      game.inFlight.push(makeProjectile('deliver', ingId, fromX, fromY, toX, toY, 220));

      // Completion effects
      if (cust.progressIndex >= cust.order.length) {
        cust.leaving = true;
        cust.leaveTimer = 0.65;
        game.score += 18 + Math.min(12, cust.order.length * 2);
        game.streak += 1;
        // Bonus time for completing full order
        game.endMs += 15000;
      }
    } else {
      // Miss: streak breaks
      game.streak = 0;
      game.score = Math.max(0, game.score - 3);
      cust.face = 1;
      cust.faceTimer = 0.40;

      // Failure projectile: pop back / to random wobble
      const fromX = board.cx;
      const fromY = board.cy;
      const wobble = (Math.random() - 0.5) * board.size * 0.20;
      const toX = fromX + wobble;
      const toY = fromY + (Math.random() - 0.5) * board.size * 0.18;
      game.inFlight.push(makeProjectile('fail', ingId, fromX, fromY, toX, toY, 180));
    }

    updateHUD();
  }

  function update(dtSec) {
    if (!game.running) return;
    const t = nowMs();
    updateHUD();

    // End timer
    if (t >= game.endMs) {
      endGame();
      return;
    }

    // Fade help after start
    if (ui.centerHelp && t - game.startMs > 800) {
      ui.centerHelp.style.opacity = String(clamp(1 - (t - game.startMs - 800) / 3500, 0, 1));
    }

    // Spawn ingredient
    if (!game.activeIngredient && game.spawnDelayMs > 0) {
      if (t - game.spawnRequestedAt >= game.spawnDelayMs) {
        spawnIngredient();
        game.spawnDelayMs = 0;
      }
    }

    // Customers animations
    for (const cust of game.customers) {
      if (cust.faceTimer > 0) cust.faceTimer = Math.max(0, cust.faceTimer - dtSec);
      if (cust.faceTimer === 0 && cust.face !== 0 && !cust.leaving) cust.face = 0;

      if (cust.leaving) {
        cust.leaveTimer = Math.max(0, cust.leaveTimer - dtSec);
        if (cust.leaveTimer === 0) {
          cust.leaving = false;
          setCustomerOrder(cust);
        }
      }
    }

    // Projectiles
    for (const p of game.inFlight) {
      if (p.done) continue;
      const age = t - p.startMs;
      const k = clamp(age / p.durationMs, 0, 1);
      const e = easeOutCubic(k);
      const x = lerp(p.fromX, p.toX, e);
      const y = lerp(p.fromY, p.toY, e);
      p.x = x;
      p.y = y;
      p.z = e; // cheap scale driver
      if (k >= 1) p.done = true;
    }
    game.inFlight = game.inFlight.filter((p) => !p.done);

    // Touch toast auto-hide
    if (ui.touchToast && game.touchToastUntil > 0 && t > game.touchToastUntil) {
      ui.touchToast.hidden = true;
      game.touchToastUntil = 0;
    }

    // Level up lightly based on score
    const newLevel = clamp(1 + Math.floor(game.score / 160), 1, MAX_LEVEL);
    if (newLevel !== game.level) {
      game.level = newLevel;
      // Slightly upgrade all current orders for readability.
      for (const cust of game.customers) setCustomerOrder(cust);
    }
  }

  function draw() {
    if (!board.size) return;
    const t = nowMs() / 1000;

    drawBackground(board, t);

    // Customers
    for (let i = 0; i < 8; i++) {
      const cust = game.customers[i];
      const ang = customerAngles[i];
      const x = board.cx + Math.cos(ang) * board.rCustomers;
      const y = board.cy + Math.sin(ang) * board.rCustomers;

      const baseR = board.size * 0.060;
      const leavePulse = cust.leaving ? (0.6 + 0.4 * Math.sin(t * 12 + cust.phase)) : 0;
      const scale = cust.leaving ? (1 - (1 - (cust.leaveTimer || 0)) * 0.7) : 1;
      const r = baseR * scale;
      drawCustomer(cust, x, y, r, t, leavePulse);
    }

    // Active ingredient in center
    if (game.activeIngredient) {
      const bounce = Math.sin(t * 6.5) * board.size * 0.01;
      const centerScale = board.size * 0.0039; // ~1.3-1.6 on typical phones
      drawIngredient(game.activeIngredient.id, board.cx, board.cy + bounce, centerScale, {
        time: nowMs(),
        bob: true,
        rotate: Math.sin(t * 4) * 0.08,
      });

      // Center ingredient name
      const label = INGREDIENT_LABELS[game.activeIngredient.id] || game.activeIngredient.id;
      ctx.save();
      ctx.fillStyle = 'rgba(234,242,255,0.96)';
      ctx.font = `${Math.max(14, Math.floor(board.size * 0.035))}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 8;
      ctx.fillText(label, board.cx, board.cy + board.rCenter * 1.15);
      ctx.restore();
    }

    // Projectiles
    for (const p of game.inFlight) {
      const k = (nowMs() - p.startMs) / p.durationMs;
      const k2 = clamp(k, 0, 1);
      const scale = p.kind === 'deliver' ? lerp(0.72, 1.02, k2) : lerp(0.86, 1.00, k2);
      const rot = (p.kind === 'deliver' ? 1 : -1) * Math.sin((k2 * 8 + p.wobble) * TAU) * 0.16;

      const x = p.x ?? p.fromX;
      const y = p.y ?? p.fromY;

      drawIngredient(p.ingId, x, y, 0.72 * scale, {
        time: nowMs(),
        rotate: rot,
        bob: false,
      });
    }

    // Border vignette
    ctx.save();
    const vign = ctx.createRadialGradient(board.cx, board.cy, board.size * 0.15, board.cx, board.cy, board.size * 0.65);
    vign.addColorStop(0, 'rgba(0,0,0,0)');
    vign.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Input (8-direction swipe from center)
  function pointerToCanvas(e) {
    const rect = canvas.getBoundingClientRect();
    const xCss = e.clientX - rect.left;
    const yCss = e.clientY - rect.top;
    return { x: xCss, y: yCss };
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse') {
      // Allow mouse testing: still uses swipe direction.
    }
    if (!game.running) return;

    // Only one pointer at a time (mobile-friendly).
    if (game.swipeStart) return;

    canvas.setPointerCapture?.(e.pointerId);
    const { x, y } = pointerToCanvas(e);
    game.swipeStart = { id: e.pointerId, x, y, t: nowMs() };
    game.swipeCurrent = { id: e.pointerId, x, y, t: game.swipeStart.t };
  }

  function onPointerMove(e) {
    // Keep mostly for touch responsiveness; no heavy work.
    if (!game.running) return;
    if (!game.swipeStart) return;
    if (e.pointerId !== game.swipeStart.id) return;
    const { x, y } = pointerToCanvas(e);
    game.swipeCurrent = { id: e.pointerId, x, y, t: nowMs() };
  }

  function onPointerUp(e) {
    if (!game.running) return;
    if (!game.swipeStart) return;
    if (e.pointerId !== game.swipeStart.id) return;

    const startX = game.swipeStart.x;
    const startY = game.swipeStart.y;

    // Use pointerup as authoritative endpoint for direction accuracy.
    const { x, y } = pointerToCanvas(e);

    const dx = x - startX;
    const dy = y - startY;
    const dist = Math.hypot(dx, dy);

    // Tap only when movement is small; larger movement is always a swipe by angle.
    if (dist <= board.tapMaxDistance) {
      const t = nowMs();
      const startDistFromCenter = Math.hypot(startX - board.cx, startY - board.cy);
      const endDistFromCenter = Math.hypot(x - board.cx, y - board.cy);
      const inCenter = startDistFromCenter <= board.rCenter * 1.25 && endDistFromCenter <= board.rCenter * 1.25;

      if (inCenter && t >= game.changeCooldownUntil) {
        if (rerollIngredient()) game.changeCooldownUntil = t + 700;
      } else {
        showTouchToast(700);
      }

      game.swipeStart = null;
      game.swipeCurrent = null;
      game.swipeLock = true;
      setTimeout(() => {
        game.swipeLock = false;
      }, 35);
      return;
    }

    // Determine direction and attempt.
    attemptSwipe(x, y);

    // Clear swipe start after processing so attemptSwipe can read it.
    game.swipeStart = null;
    game.swipeCurrent = null;

    // Small lock to avoid accidental double triggers if user lifts twice.
    game.swipeLock = true;
    setTimeout(() => {
      game.swipeLock = false;
    }, 35);
  }

  function bindUI() {
    ui.startBtn.addEventListener('click', startGame);
    ui.restartBtn.addEventListener('click', startGame);

    window.addEventListener('resize', () => {
      resize();
    });

    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerup', onPointerUp, { passive: true });
    canvas.addEventListener(
      'pointercancel',
      () => {
        game.swipeStart = null;
        game.swipeCurrent = null;
      },
      { passive: true }
    );
  }

  function loop(last) {
    const t = nowMs();
    const dtSec = Math.min(0.033, (t - last) / 1000);
    update(dtSec);
    draw();
    requestAnimationFrame(() => loop(t));
  }

  // Start
  reset();
  bindUI();
  resize();
  requestAnimationFrame(() => loop(nowMs()));
})();

