// Drawing only: the city's state in, pixels out. The world is painted through a camera —
// ground, water, roads, then the extruded towers with their lit windows, then everything
// that moves — and the day cycle is a light laid over the top: an indigo dusk, lamp and
// headlight glows, and the moon's path glittering on the bay. The title and finale screens
// leave the streets entirely for a painted vista of the same skyline under the same moon.

import { BUILDING_SKINS, FONT, PALETTE, WORLD } from './config.js';
import { H_ROADS, V_ROADS } from './city.js';
import { createRandom } from './random.js';
import { drawHUD } from './hud.js';
import { clamp01, formatMoney, lerp, smoothstep } from './util.js';
import { titleFor } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_FINALE = 'finale';

/** How dark the world is at a given minute: 0 at noon, 1 in the deep of the night. */
export function darknessAt(minutes) {
  const h = ((minutes % 1440) + 1440) % 1440 / 60;
  if (h < 4.8) return 1;
  if (h < 6.8) return 1 - smoothstep(4.8, 6.8, h);
  if (h < 18.6) return 0;
  if (h < 20.4) return smoothstep(18.6, 20.4, h);
  return 1;
}

/** The golden wash of dusk and dawn, strongest just after half past six in the evening. */
function warmthAt(minutes) {
  const h = ((minutes % 1440) + 1440) % 1440 / 60;
  const dusk = smoothstep(17.4, 18.7, h) * (1 - smoothstep(19.4, 20.6, h));
  const dawn = smoothstep(5.4, 6.2, h) * (1 - smoothstep(6.8, 7.8, h)) * 0.7;
  return Math.max(dusk, dawn);
}

function makeGlowSprite(r, g, b) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g2 = c.getContext('2d');
  const grad = g2.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.85)`);
  grad.addColorStop(0.4, `rgba(${r},${g},${b},0.28)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  g2.fillStyle = grad;
  g2.fillRect(0, 0, 128, 128);
  return c;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const glowWarm = makeGlowSprite(255, 209, 140);
  const glowWhite = makeGlowSprite(230, 238, 255);
  const glowRed = makeGlowSprite(255, 84, 72);
  const glowBlue = makeGlowSprite(84, 140, 255);
  let viewW = 0;
  let viewH = 0;
  let sortedBuildings = null;
  const vistaRng = createRandom(7101);
  const vistaTowers = [];
  for (let i = 0; i < 42; i += 1) {
    vistaTowers.push({ w: vistaRng.range(34, 92), h: vistaRng.range(60, 300), seed: vistaRng.int(1, 99999) });
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  const fonts = new Map();
  function text(value, x, y, size, color, align = 'left', weight = 400) {
    const key = `${weight}:${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(value, x, y);
  }

  function glow(sprite, x, y, size, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha = 1;
  }

  // ---------- the world ----------

  function drawGround(state, dark) {
    const city = state.city;
    const { camX, camY } = state;
    const x0 = Math.max(0, camX - 40);
    const y0 = Math.max(0, camY - 40);
    const x1 = Math.min(WORLD.width, camX + viewW + 40);
    const y1 = Math.min(WORLD.height, camY + viewH + 40);
    // Water under everything, land over it, promenade along the shore.
    ctx.fillStyle = dark > 0.5 ? PALETTE.waterNight : PALETTE.waterDay;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = PALETTE.land;
    ctx.fillRect(x0, y0, Math.max(0, Math.min(x1, WORLD.shoreX) - x0), y1 - y0);
    ctx.fillStyle = PALETTE.promenade;
    ctx.fillRect(Math.max(x0, WORLD.promenadeX), y0, Math.max(0, Math.min(x1, WORLD.shoreX) - Math.max(x0, WORLD.promenadeX)), y1 - y0);

    for (const park of city.parks) {
      if (park.x > x1 || park.x + park.w < x0 || park.y > y1 || park.y + park.h < y0) continue;
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(park.x, park.y, park.w, park.h);
      ctx.strokeStyle = PALETTE.parkPath;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(park.x, park.y + park.h / 2);
      ctx.lineTo(park.x + park.w, park.y + park.h / 2);
      ctx.moveTo(park.x + park.w / 2, park.y);
      ctx.lineTo(park.x + park.w / 2, park.y + park.h);
      ctx.stroke();
    }
    for (const lot of city.lots) {
      if (lot.x > x1 || lot.x + lot.w < x0 || lot.y > y1 || lot.y + lot.h < y0) continue;
      ctx.fillStyle = PALETTE.lotAsphalt;
      ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
      ctx.strokeStyle = 'rgba(207,212,226,0.35)';
      ctx.lineWidth = 2;
      for (let x = lot.x + 26; x + 30 < lot.x + lot.w - 10; x += 44) {
        ctx.strokeRect(x, lot.y + 12, 30, 44);
        ctx.strokeRect(x, lot.y + lot.h - 56, 30, 44);
      }
    }
    // Roads: pavement first (the wide rect), asphalt over it, leaving the sidewalks.
    for (const vx of V_ROADS) {
      if (vx + 60 < x0 || vx - 60 > x1) continue;
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(vx - 60, y0, 120, y1 - y0);
      ctx.fillStyle = PALETTE.asphalt;
      ctx.fillRect(vx - 44, y0, 88, y1 - y0);
      ctx.fillStyle = 'rgba(207,212,226,0.5)';
      for (let y = Math.floor(y0 / 52) * 52; y < y1; y += 52) ctx.fillRect(vx - 1.5, y, 3, 24);
    }
    for (const hy of H_ROADS) {
      if (hy + 60 < y0 || hy - 60 > y1) continue;
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(x0, hy - 60, Math.min(x1, WORLD.shoreX) - x0, 120);
      ctx.fillStyle = PALETTE.asphalt;
      ctx.fillRect(x0, hy - 44, Math.min(x1, WORLD.shoreX) - x0, 88);
      ctx.fillStyle = 'rgba(207,212,226,0.5)';
      for (let x = Math.floor(x0 / 52) * 52; x < Math.min(x1, WORLD.shoreX); x += 52) ctx.fillRect(x, hy - 1.5, 24, 3);
    }
    // Piers over the bay.
    for (const pier of city.piers) {
      ctx.fillStyle = '#4d4237';
      ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
      ctx.fillStyle = '#5d5044';
      ctx.fillRect(pier.x, pier.y, pier.w, 5);
      ctx.fillRect(pier.x, pier.y + pier.h - 5, pier.w, 5);
    }
    // The moon's path on the water, and the bay's own glitter.
    if (dark > 0.15) {
      const bandX = camX + viewW * 0.64;
      for (let y = Math.floor(y0 / 46) * 46; y < y1; y += 46) {
        for (let x = Math.max(Math.floor(x0 / 46) * 46, WORLD.shoreX); x < x1; x += 46) {
          const hash = Math.sin(x * 12.9898 + y * 78.233 + Math.floor(state.elapsed * 1.6) * 0.7) * 43758.5453;
          const frac = hash - Math.floor(hash);
          const nearBand = Math.abs(x - bandX) < 120 ? 0.24 : 0.05;
          if (frac < 0.16 + nearBand) {
            ctx.fillStyle = `rgba(214,226,255,${(0.05 + frac * 0.5) * dark})`;
            ctx.fillRect(x + frac * 26, y + 8, 15 + frac * 22, 2.4);
          }
        }
      }
    }
    // Palms: a bent trunk and a star of fronds.
    for (const palm of city.palms) {
      if (palm.x < x0 || palm.x > x1 || palm.y < y0 || palm.y > y1) continue;
      const s = palm.s;
      ctx.strokeStyle = '#4a3a28';
      ctx.lineWidth = 3.4 * s;
      ctx.beginPath();
      ctx.moveTo(palm.x, palm.y);
      ctx.quadraticCurveTo(palm.x + 3 * s, palm.y - 9 * s, palm.x + 6 * s, palm.y - 15 * s);
      ctx.stroke();
      ctx.strokeStyle = dark > 0.5 ? '#1d4d33' : '#2a6b45';
      ctx.lineWidth = 2.4 * s;
      for (let f = 0; f < 6; f += 1) {
        const a = (f / 6) * Math.PI * 2 + palm.x * 0.01;
        ctx.beginPath();
        ctx.moveTo(palm.x + 6 * s, palm.y - 15 * s);
        ctx.quadraticCurveTo(
          palm.x + 6 * s + Math.cos(a) * 10 * s, palm.y - 15 * s + Math.sin(a) * 5 * s - 3,
          palm.x + 6 * s + Math.cos(a) * 15 * s, palm.y - 15 * s + Math.sin(a) * 8 * s + 3,
        );
        ctx.stroke();
      }
    }
  }

  function drawBuilding(b, dark, time) {
    const skin = BUILDING_SKINS[b.skin];
    const ox = -b.hgt * 0.16;
    const oy = -b.hgt * 0.30;
    const lightF = 1 - dark * 0.45;
    // Shadow, then the two visible faces, then the roof.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(b.x + 12, b.y + 16, b.w, b.h);
    ctx.fillStyle = shade(skin.side, lightF * 0.82);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.h);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.lineTo(b.x + b.w + ox, b.y + b.h + oy);
    ctx.lineTo(b.x + ox, b.y + b.h + oy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(skin.side, lightF * 0.62);
    ctx.beginPath();
    ctx.moveTo(b.x + b.w, b.y);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.lineTo(b.x + b.w + ox, b.y + b.h + oy);
    ctx.lineTo(b.x + b.w + ox, b.y + oy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(skin.top, lightF);
    ctx.fillRect(b.x + ox, b.y + oy, b.w, b.h);
    ctx.strokeStyle = 'rgba(10,12,24,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + ox, b.y + oy, b.w, b.h);
    // Rooftop furniture: a parapet line and the plant boxes every tower carries, placed by
    // the building's own seed so the roofscape is varied but stable.
    if (b.w > 52 && b.h > 52) {
      ctx.strokeStyle = 'rgba(10,12,24,0.22)';
      ctx.strokeRect(b.x + ox + 7, b.y + oy + 7, b.w - 14, b.h - 14);
      const boxes = 1 + Math.floor((Math.sin(b.seed * 0.77) * 0.5 + 0.5) * 3);
      ctx.fillStyle = shade(skin.top, lightF * 0.78);
      for (let i = 0; i < boxes; i += 1) {
        const hx = Math.sin(b.seed * (1.3 + i * 0.9)) * 0.5 + 0.5;
        const hy = Math.sin(b.seed * (2.1 + i * 1.7)) * 0.5 + 0.5;
        const bw = 13 + hx * 20;
        const bh = 11 + hy * 15;
        ctx.fillRect(b.x + ox + 12 + hx * (b.w - 24 - bw), b.y + oy + 12 + hy * (b.h - 24 - bh), bw, bh);
      }
    }
    // Windows on the south face: lit from within once the city darkens.
    const cols = Math.max(2, Math.floor(b.w / 17));
    const rows = Math.max(1, Math.min(9, Math.floor(b.hgt / 24)));
    for (let cx = 0; cx < cols; cx += 1) {
      for (let ry = 0; ry < rows; ry += 1) {
        const hash = Math.sin((cx * 37 + ry * 91 + b.seed) * 0.618) * 10000;
        const frac = hash - Math.floor(hash);
        const wx = b.x + 6 + cx * ((b.w - 12) / cols) + ox * (ry / rows) * 0.4;
        const wy = b.y + b.h - 8 - ry * (Math.abs(oy) / Math.max(1, rows)) + oy * 0.12;
        if (dark > 0.2 && frac < 0.42) {
          ctx.fillStyle = `rgba(255,217,160,${0.35 + dark * 0.6})`;
          ctx.fillRect(wx, wy, 5.4, 3.6);
        } else if (dark <= 0.2) {
          ctx.fillStyle = 'rgba(220,230,248,0.20)';
          ctx.fillRect(wx, wy, 5.4, 3.6);
        }
      }
    }
    if (b.landmark) {
      // A gold crescent crowns Moonrise Tower; every landmark signs its name.
      if (b.name === 'Moonrise Tower') {
        const cxp = b.x + ox + b.w / 2;
        const cyp = b.y + oy + b.h / 2;
        ctx.fillStyle = PALETTE.gold;
        ctx.beginPath();
        ctx.arc(cxp, cyp, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = shade(skin.top, lightF);
        ctx.beginPath();
        ctx.arc(cxp + 7, cyp - 3, 14, 0, Math.PI * 2);
        ctx.fill();
      }
      text(b.name.toUpperCase(), b.x + b.w / 2, b.y + b.h + 8, 12, 'rgba(238,241,248,0.75)', 'center', 600);
    }
    void time;
  }

  function drawCar(car, state, dark) {
    ctx.save();
    ctx.translate(car.x, car.y);
    // Headlight cones first, under the body.
    if (dark > 0.25 && !car.dead) {
      ctx.save();
      ctx.rotate(car.angle);
      ctx.globalCompositeOperation = 'lighter';
      glow(glowWarm, car.l / 2 + 52, -11, 150, 0.16 * dark);
      glow(glowWarm, car.l / 2 + 52, 11, 150, 0.16 * dark);
      ctx.restore();
    }
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRectPath(-car.l / 2 + 3, -car.w / 2 + 5, car.l, car.w, 9);
    ctx.fill();
    ctx.fillStyle = car.dead ? shade(car.color, 0.45) : car.color;
    if (car.kind === 'police') ctx.fillStyle = car.dead ? '#5a5e68' : '#e9ebf2';
    roundRectPath(-car.l / 2, -car.w / 2, car.l, car.w, 9);
    ctx.fill();
    // Cabin and glass.
    ctx.fillStyle = 'rgba(16,20,34,0.88)';
    roundRectPath(-car.l * 0.08, -car.w / 2 + 5, car.l * 0.34, car.w - 10, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,150,200,0.5)';
    roundRectPath(car.l * 0.27, -car.w / 2 + 6, car.l * 0.1, car.w - 12, 4);
    ctx.fill();
    if (car.kind === 'police') {
      ctx.fillStyle = '#14171f';
      roundRectPath(-car.l * 0.3, -car.w / 2, car.l * 0.2, car.w, 4);
      ctx.fill();
      // The light bar: red and blue, alternating with the clock.
      const flash = Math.floor(state.elapsed * 5) % 2 === 0;
      ctx.fillStyle = flash ? '#ff5040' : '#7a1610';
      ctx.fillRect(-4, -car.w / 2 + 4, 8, car.w / 2 - 4);
      ctx.fillStyle = flash ? '#123a8a' : '#4a7de0';
      ctx.fillRect(-4, 0, 8, car.w / 2 - 4);
    }
    // Wheels.
    ctx.fillStyle = '#0c0e14';
    const wx = car.l / 2 - 13;
    const wy = car.w / 2 - 2;
    ctx.fillRect(wx - 8, -wy - 3, 16, 6);
    ctx.fillRect(wx - 8, wy - 3, 16, 6);
    ctx.fillRect(-wx - 8, -wy - 3, 16, 6);
    ctx.fillRect(-wx - 8, wy - 3, 16, 6);
    ctx.restore();
  }

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPed(ped, dark) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(ped.x, ped.y + 5, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (ped.state === 'down') {
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 13, 6, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(ped.x + 13, ped.y - 3, 5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y - 1, 5.2, 0, Math.PI * 2);
    ctx.fill();
    void dark;
  }

  function drawPlayerFigure(state, dark) {
    const p = state.player;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 6, 10, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Indigo jacket, gold trim: Zara, readable at a glance.
    ctx.fillStyle = '#2b3a67';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10.5, p.angle - 0.7, p.angle + 0.7);
    ctx.stroke();
    ctx.fillStyle = '#c98d5f';
    ctx.beginPath();
    ctx.arc(p.x, p.y - 1, 5.6, 0, Math.PI * 2);
    ctx.fill();
    if (state.hasGun) {
      ctx.strokeStyle = '#14171f';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.angle) * 8, p.y + Math.sin(p.angle) * 8);
      ctx.lineTo(p.x + Math.cos(p.angle) * 19, p.y + Math.sin(p.angle) * 19);
      ctx.stroke();
    }
    void dark;
  }

  function drawWorld(state) {
    const dark = darknessAt(state.timeMin);
    const warm = warmthAt(state.timeMin);
    const city = state.city;
    if (!sortedBuildings) {
      sortedBuildings = [...city.buildings].sort((a, b) => (a.y + a.h) - (b.y + b.h));
    }
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.save();
    ctx.translate(-state.camX, -state.camY);

    drawGround(state, dark);
    // Yachts ride above the water but below everything ashore.
    for (const yacht of city.yachts) {
      ctx.save();
      ctx.translate(yacht.x, yacht.y);
      ctx.rotate(yacht.angle);
      ctx.fillStyle = '#dfe4ee';
      roundRectPath(-yacht.len / 2, -13, yacht.len, 26, 12);
      ctx.fill();
      ctx.fillStyle = '#9fb2cc';
      roundRectPath(-yacht.len * 0.18, -8, yacht.len * 0.36, 16, 6);
      ctx.fill();
      ctx.strokeStyle = '#6b7688';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(6, -34);
      ctx.stroke();
      ctx.restore();
    }
    const x0 = state.camX - 60;
    const y0 = state.camY - 60;
    const x1 = state.camX + viewW + 60;
    const y1 = state.camY + viewH + 60;
    for (const b of sortedBuildings) {
      if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
      drawBuilding(b, dark, state.elapsed);
    }
    // The job's door wears a pillar of gold light.
    if (state.mission && state.screen === SCREEN_PLAY) {
      const t = state.mission.target;
      const pulse = 0.55 + Math.sin(state.elapsed * 4) * 0.2;
      const grad = ctx.createLinearGradient(0, t.y - 190, 0, t.y);
      grad.addColorStop(0, 'rgba(242,193,78,0)');
      grad.addColorStop(1, `rgba(242,193,78,${0.5 * pulse})`);
      ctx.fillStyle = grad;
      ctx.fillRect(t.x - 9, t.y - 190, 18, 190);
      ctx.strokeStyle = `rgba(242,193,78,${pulse})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 20 + Math.sin(state.elapsed * 4) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const car of state.cars) drawCar(car, state, dark);
    for (const cop of state.cops) drawCar(cop, state, dark);
    for (const ped of state.peds) drawPed(ped, dark);
    if (state.player.car) drawCar(state.player.car, state, dark);
    else drawPlayerFigure(state, dark);
    // A gold chevron floats over Zara's car so it is never lost in traffic.
    if (state.player.car) {
      const car = state.player.car;
      ctx.fillStyle = PALETTE.gold;
      const bob = Math.sin(state.elapsed * 3.4) * 3;
      ctx.beginPath();
      ctx.moveTo(car.x, car.y - 44 + bob);
      ctx.lineTo(car.x - 8, car.y - 54 + bob);
      ctx.lineTo(car.x + 8, car.y - 54 + bob);
      ctx.closePath();
      ctx.fill();
    }
    // Particles: smoke climbs, sparks fall, muzzle flashes bloom and die.
    for (const fx of state.particles) {
      const life = clamp01(fx.life / fx.maxLife);
      if (fx.type === 'smoke') {
        ctx.fillStyle = `rgba(120,124,140,${0.34 * life})`;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.size * (1.6 - life * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else if (fx.type === 'spark') {
        ctx.fillStyle = `rgba(255,205,110,${life})`;
        ctx.fillRect(fx.x - 1.6, fx.y - 1.6, 3.2, 3.2);
      } else if (fx.type === 'flash') {
        glow(glowWarm, fx.x, fx.y, 64 * life + 12, 0.7 * life);
      }
    }
    ctx.restore();

    // The light of the hour, laid over the world; glows are punched back through it.
    if (dark > 0.02) {
      ctx.fillStyle = `rgba(9,13,36,${dark * 0.40})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
    if (warm > 0.02) {
      ctx.fillStyle = `rgba(255,140,60,${warm * 0.10})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
    if (dark > 0.2) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const lamp of city.lamps) {
        const sx = lamp.x - state.camX;
        const sy = lamp.y - state.camY;
        if (sx < -70 || sy < -70 || sx > viewW + 70 || sy > viewH + 70) continue;
        glow(glowWarm, sx, sy, 74, 0.13 * dark);
      }
      for (const cop of state.cops) {
        const sx = cop.x - state.camX;
        const sy = cop.y - state.camY;
        if (sx < -90 || sy < -90 || sx > viewW + 90 || sy > viewH + 90) continue;
        const flash = Math.floor(state.elapsed * 5) % 2 === 0;
        glow(flash ? glowRed : glowBlue, sx, sy, 120, 0.20 * dark);
      }
      ctx.restore();
    }
    // Low health throbs red at the edges.
    if (state.player.health < 32 && state.screen === SCREEN_PLAY) {
      const a = 0.16 + Math.sin(state.elapsed * 6) * 0.06;
      const grad = ctx.createRadialGradient(viewW / 2, viewH / 2, viewH * 0.32, viewW / 2, viewH / 2, viewH * 0.72);
      grad.addColorStop(0, 'rgba(160,20,16,0)');
      grad.addColorStop(1, `rgba(160,20,16,${a})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  // ---------- the vista (title and finale) ----------

  function drawVista(state, finale) {
    const w = viewW;
    const h = viewH;
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.74);
    sky.addColorStop(0, '#070d26');
    sky.addColorStop(0.55, '#16264e');
    sky.addColorStop(1, '#33507e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.74);
    // Stars.
    const starRng = createRandom(4242);
    ctx.fillStyle = '#dfe8ff';
    for (let i = 0; i < 130; i += 1) {
      const sx = starRng() * w;
      const sy = starRng() * h * 0.5;
      ctx.globalAlpha = 0.25 + starRng() * 0.6;
      ctx.fillRect(sx, sy, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
    // The moon, high over the skyline, the way it should be.
    const moonX = w * 0.66;
    const moonY = h * 0.17;
    const moonR = Math.min(w, h) * 0.085;
    glow(glowWhite, moonX, moonY, moonR * 7, 0.5);
    ctx.fillStyle = '#f5f0dc';
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(190,190,170,0.35)';
    for (const [cx, cy, cr] of [[-0.3, -0.1, 0.16], [0.22, 0.28, 0.12], [0.05, -0.38, 0.09], [-0.12, 0.42, 0.07]]) {
      ctx.beginPath();
      ctx.arc(moonX + cx * moonR, moonY + cy * moonR, cr * moonR, 0, Math.PI * 2);
      ctx.fill();
    }
    // Two rows of towers, the far row paler; Moonrise Tower tallest, crowned.
    const horizon = h * 0.74;
    const drawRow = (rowH, color, base) => {
      let x = -20;
      let idx = 0;
      for (const t of vistaTowers) {
        const th = t.h * rowH;
        ctx.fillStyle = color;
        ctx.fillRect(x, horizon - th, t.w, th);
        if (base && idx === 27) {
          // The Tower itself.
          ctx.fillStyle = PALETTE.gold;
          ctx.beginPath();
          ctx.arc(x + t.w / 2, horizon - th - 12, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x + t.w / 2 + 4, horizon - th - 14, 8, 0, Math.PI * 2);
          ctx.fill();
        }
        // Lit windows, sparse and warm.
        for (let wy = horizon - th + 10; wy < horizon - 12; wy += 15) {
          for (let wx = x + 6; wx < x + t.w - 6; wx += 12) {
            const hash = Math.sin((wx * 13 + wy * 7 + t.seed) * 0.37) * 10000;
            if (hash - Math.floor(hash) < 0.3) {
              ctx.fillStyle = 'rgba(255,217,160,0.75)';
              ctx.fillRect(wx, wy, 3.4, 4.6);
            }
          }
        }
        x += t.w + 6;
        idx += 1;
        if (x > w + 40) break;
      }
    };
    drawRow(0.55, '#1a2748', false);
    drawRow(1.0, '#0c1428', true);
    // The bay: a dark sheet with the moonpath running down it.
    const water = ctx.createLinearGradient(0, horizon, 0, h);
    water.addColorStop(0, '#10283f');
    water.addColorStop(1, '#060f1e');
    ctx.fillStyle = water;
    ctx.fillRect(0, horizon, w, h - horizon);
    for (let i = 0; i < 90; i += 1) {
      const yy = horizon + 6 + (i / 90) * (h - horizon - 10);
      const spread = 8 + (i / 90) * moonR * 2.6;
      const hash = Math.sin(i * 91.7 + Math.floor(state.elapsed * 2) * 3.1) * 10000;
      const frac = hash - Math.floor(hash);
      const xx = moonX + (frac - 0.5) * 2 * spread;
      ctx.fillStyle = `rgba(220,232,255,${0.10 + frac * 0.3})`;
      ctx.fillRect(xx, yy, 8 + frac * 26 * (i / 90 + 0.4), 1.8);
    }
    // The promenade lamps along the shore line.
    for (let x = 26; x < w; x += 74) glow(glowWarm, x, horizon - 3, 44, 0.5);

    if (!finale) {
      text('MOONRISE CITY', w / 2, h * 0.30, Math.min(76, w * 0.075), '#f5f0dc', 'center', 800);
      text('A courier crime story on the bay', w / 2, h * 0.30 + Math.min(76, w * 0.075) + 14, 19, PALETTE.warmLight ?? '#ffd9a0', 'center', 400);
      const menuY = h * 0.56;
      if (state.hasSave) text('ENTER — New career      C — Continue', w / 2, menuY, 19, PALETTE.text, 'center', 600);
      else text('ENTER — Start your career', w / 2, menuY, 19, PALETTE.text, 'center', 600);
      text('WASD drive & walk · Mouse aims · Click punches, or fires the sidearm', w / 2, menuY + 34, 14.5, PALETTE.muted, 'center');
      text('E takes a car · Shift sprints · P pauses · M mutes', w / 2, menuY + 56, 14.5, PALETTE.muted, 'center');
      if (Math.floor(state.elapsed * 1.4) % 2 === 0) {
        text('The city pays couriers. The MCPD disagrees.', w / 2, h - 42, 14, PALETTE.gold, 'center', 600);
      }
    } else {
      ctx.fillStyle = PALETTE.panel;
      const pw = Math.min(520, w - 60);
      const ph = 300;
      const px = (w - pw) / 2;
      const py = h * 0.30;
      ctx.beginPath();
      ctx.roundRect(px, py, pw, ph, 14);
      ctx.fill();
      ctx.strokeStyle = PALETTE.panelEdge;
      ctx.stroke();
      text('THE BAY IS YOURS', w / 2, py + 26, 30, PALETTE.gold, 'center', 800);
      const s = state.stats;
      const lines = [
        `Zara Vale — ${titleFor(state.rep)} of Moonrise City`,
        `Career earnings  ${formatMoney(s.earned)}`,
        `Jobs delivered  ${s.missionsDone}`,
        `Cars borrowed  ${s.thefts} · Busted ${s.busts} · Wrecked ${s.wasteds}`,
        `Cash on hand  ${formatMoney(state.money)}`,
      ];
      lines.forEach((line, i) => text(line, w / 2, py + 84 + i * 30, 16.5, PALETTE.text, 'center'));
      text('ENTER — Back to the streets (free roam)', w / 2, py + ph - 44, 16, PALETTE.warmLight ?? '#ffd9a0', 'center', 600);
    }
  }

  function drawEndPanel(state) {
    const busted = state.screen === SCREEN_BUSTED;
    ctx.fillStyle = 'rgba(4,6,14,0.55)';
    ctx.fillRect(0, 0, viewW, viewH);
    const pw = Math.min(480, viewW - 50);
    const ph = 210;
    const px = (viewW - pw) / 2;
    const py = (viewH - ph) / 2;
    ctx.fillStyle = PALETTE.panel;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 14);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.stroke();
    text(busted ? 'BUSTED' : 'WASTED', viewW / 2, py + 26, 42, busted ? '#7ea6ef' : PALETTE.danger, 'center', 800);
    const fine = state.over?.fine ?? 0;
    text(
      busted ? `The MCPD takes ${formatMoney(fine)} for its trouble.` : `The bill from Moonrise General: ${formatMoney(fine)}.`,
      viewW / 2, py + 92, 16.5, PALETTE.text, 'center',
    );
    text(
      busted ? 'You walk out of MCPD Central with clean heat and lighter pockets.' : 'You walk out under the palms, sore, alive, and unarrested.',
      viewW / 2, py + 120, 14, PALETTE.muted, 'center',
    );
    text('ENTER — Back to the streets', viewW / 2, py + ph - 42, 16, PALETTE.gold, 'center', 600);
  }

  function draw(state) {
    if (state.screen === SCREEN_TITLE) {
      drawVista(state, false);
      return;
    }
    if (state.screen === SCREEN_FINALE) {
      drawVista(state, true);
      return;
    }
    drawWorld(state);
    drawHUD(ctx, state, viewW, viewH);
    if (state.screen === SCREEN_PAUSED) {
      ctx.fillStyle = 'rgba(4,6,14,0.5)';
      ctx.fillRect(0, 0, viewW, viewH);
      text('PAUSED', viewW / 2, viewH / 2 - 30, 40, PALETTE.text, 'center', 800);
      text('P — Resume', viewW / 2, viewH / 2 + 26, 17, PALETTE.muted, 'center');
    } else if (state.screen === SCREEN_BUSTED || state.screen === SCREEN_WASTED) {
      drawEndPanel(state);
    }
  }

  return {
    draw,
    get viewW() { return viewW; },
    get viewH() { return viewH; },
  };
}
