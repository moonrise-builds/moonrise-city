// The heads-up display, drawn over the world in screen space: money and reputation at the
// top left, the clock and wanted stars at the top right, the job banner across the top
// centre, phone messages rising at the bottom left, the interact prompt at the bottom
// centre, and the live minimap at the bottom right with the patrols on it.

import { FONT, PALETTE, WORLD } from './config.js';
import { H_ROADS, V_ROADS } from './city.js';
import { objectiveText, titleFor } from './missions.js';
import { clamp01, formatClock, formatMoney } from './util.js';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function wrapText(text, chars) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > chars && line) {
      lines.push(line);
      line = word;
    } else {
      line = (line + ' ' + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function drawStars(ctx, x, y, stars, time) {
  ctx.font = `26px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  // Five stars in a row ending at the right edge; the leftmost light first.
  for (let k = 0; k < 5; k += 1) {
    const active = k < stars;
    ctx.fillStyle = active ? (Math.floor(time * 2) % 2 === 0 ? PALETTE.gold : '#ffdf8a') : 'rgba(255,255,255,0.16)';
    ctx.fillText('★', x - (4 - k) * 30, y);
  }
}

function drawMinimap(ctx, state, x, y, w, h) {
  panel(ctx, x - 6, y - 6, w + 12, h + 12);
  const scale = Math.min(w / WORLD.width, h / WORLD.height);
  const ox = x + (w - WORLD.width * scale) / 2;
  const oy = y + (h - WORLD.height * scale) / 2;
  const px = (wx) => ox + wx * scale;
  const py = (wy) => oy + wy * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#131a2e';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#1d5069';
  ctx.fillRect(px(WORLD.shoreX), y, w - (px(WORLD.shoreX) - x), h);
  ctx.strokeStyle = 'rgba(207,212,226,0.4)';
  ctx.lineWidth = 1;
  for (const vx of V_ROADS) {
    ctx.beginPath();
    ctx.moveTo(px(vx), py(0));
    ctx.lineTo(px(vx), py(WORLD.height));
    ctx.stroke();
  }
  for (const hy of H_ROADS) {
    ctx.beginPath();
    ctx.moveTo(px(0), py(hy));
    ctx.lineTo(px(WORLD.shoreX), py(hy));
    ctx.stroke();
  }
  // The job's door, gold and patient.
  if (state.mission) {
    const t = state.mission.target;
    ctx.fillStyle = PALETTE.gold;
    ctx.beginPath();
    ctx.arc(px(t.x), py(t.y), 3.4 + Math.sin(state.elapsed * 5) * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // Patrols flash red and blue, the way their light bars do.
  const flash = Math.floor(state.elapsed * 2.4) % 2 === 0;
  for (const cop of state.cops) {
    ctx.fillStyle = flash ? PALETTE.policeRed : PALETTE.policeBlue;
    ctx.beginPath();
    ctx.arc(px(cop.x), py(cop.y), 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // The player: a white arrow on their heading.
  const pos = state.player.car ?? state.player;
  ctx.translate(px(pos.x), py(pos.y));
  ctx.rotate(pos.angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4.4, -3.6);
  ctx.lineTo(-4.4, 3.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawHUD(ctx, state, viewW, viewH) {
  const time = state.elapsed;
  ctx.textBaseline = 'top';

  // Top left: the money, the name she is making, and the state of her health.
  panel(ctx, 14, 14, 218, state.hasGun ? 108 : 88);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `700 27px ${FONT}`;
  ctx.fillText(formatMoney(state.money), 28, 22);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText(`${titleFor(state.rep)} · Rep ${state.rep}`, 28, 56);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(28, 78, 150, 9);
  ctx.fillStyle = state.player.health > 30 ? PALETTE.health : PALETTE.danger;
  ctx.fillRect(28, 78, 150 * clamp01(state.player.health / 100), 9);
  if (state.hasGun) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `12px ${FONT}`;
    ctx.fillText(state.carrying ? 'Sidearm ready · carrying a parcel' : 'Sidearm ready', 28, 96);
  } else if (state.carrying) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `12px ${FONT}`;
    ctx.fillText('Carrying a parcel', 28, 96);
  }

  // Top right: the clock, the stars, and the bust meter when the net is closing.
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 21px ${FONT}`;
  ctx.fillText(formatClock(state.timeMin), viewW - 24, 18);
  drawStars(ctx, viewW - 24, 44, state.wanted.stars, time);
  if (state.wanted.bust > 0.02) {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(viewW - 174, 78, 150, 9);
    ctx.fillStyle = PALETTE.danger;
    ctx.fillRect(viewW - 174, 78, 150 * clamp01(state.wanted.bust), 9);
    ctx.fillStyle = PALETTE.danger;
    ctx.font = `700 11px ${FONT}`;
    ctx.fillText('BUST', viewW - 24, 90);
  }

  // Top centre: the job.
  if (state.mission) {
    const mission = state.mission;
    const bw = Math.min(520, viewW - 520 > 0 ? 520 : viewW - 40);
    const bx = (viewW - bw) / 2;
    panel(ctx, bx, 14, bw, mission.timer !== null ? 74 : 58);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `700 15px ${FONT}`;
    ctx.fillText(mission.name.toUpperCase(), viewW / 2, 21);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `14px ${FONT}`;
    ctx.fillText(objectiveText(state), viewW / 2, 42);
    if (mission.timer !== null && mission.timerMax) {
      const frac = clamp01(mission.timer / mission.timerMax);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(bx + 16, 66, bw - 32, 6);
      ctx.fillStyle = mission.timer < 25 ? PALETTE.danger : PALETTE.gold;
      ctx.fillRect(bx + 16, 66, (bw - 32) * frac, 6);
    }
  }

  // Bottom left: the phone. Newest at the bottom, fading as its time runs out.
  const visible = state.phone.slice(-3);
  let py = viewH - 30;
  for (let i = visible.length - 1; i >= 0; i -= 1) {
    const msg = visible[i];
    const lines = wrapText(msg.text, 40);
    const h = 30 + lines.length * 16;
    py -= h;
    ctx.globalAlpha = clamp01(msg.t / 1.2);
    panel(ctx, 14, py, 308, h);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `700 11px ${FONT}`;
    ctx.fillText(msg.from, 26, py + 8);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `12.5px ${FONT}`;
    for (let li = 0; li < lines.length; li += 1) ctx.fillText(lines[li], 26, py + 24 + li * 16);
    py -= 8;
  }

  // Bottom centre: what E would do right now.
  if (state.prompt) {
    ctx.font = `600 15px ${FONT}`;
    const w = ctx.measureText(state.prompt).width + 30;
    panel(ctx, (viewW - w) / 2, viewH - 52, w, 34);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(state.prompt, viewW / 2, viewH - 43);
  }

  drawMinimap(ctx, state, viewW - 208, viewH - 164, 190, 146);
}
