// Pedestrians: Moonrise City's walkers. Each one follows a track — a ring around a city
// block on the pavement, the promenade along the bay, or a marina pier — strolling at their
// own pace, sometimes crossing the road to the next block's ring. They are also the city's
// eyes: crimes near a walker who is on their feet get reported, and walkers run from
// gunfire, crashes and speeding cars, or go down when a car finds them.

import { WORLD } from './config.js';
import { X_BANDS, Y_BANDS } from './city.js';
import { clamp, distance } from './util.js';

const SHIRTS = ['#c96f4a', '#4a7dc9', '#c9b458', '#7dc98a', '#b45a8a', '#e3e6ee', '#5a8a99', '#99553f', '#7186c9', '#c94a4a'];
const SKIN = ['#8a5a3b', '#6e452a', '#a9714b', '#59391f', '#c98d5f'];

/** The point at perimeter distance s around a rectangle ring, and the ring's length. */
function ringPoint(rect, s) {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  const total = 2 * (w + h);
  let d = ((s % total) + total) % total;
  if (d < w) return { x: rect.x0 + d, y: rect.y0 };
  d -= w;
  if (d < h) return { x: rect.x1, y: rect.y0 + d };
  d -= h;
  if (d < w) return { x: rect.x1 - d, y: rect.y1 };
  d -= w;
  return { x: rect.x0, y: rect.y1 - d };
}

function ringLength(rect) {
  return 2 * ((rect.x1 - rect.x0) + (rect.y1 - rect.y0));
}

function blockRing(col, row) {
  const [x0, x1] = X_BANDS[col];
  const [y0, y1] = Y_BANDS[row];
  return { x0: x0 - 10, y0: y0 - 10, x1: x1 + 10, y1: y1 + 10, col, row };
}

export function createPedestrian(rng, city) {
  const roll = rng();
  const ped = {
    x: 0, y: 0, r: 11,
    hp: 100,
    state: 'walk',
    speed: rng.range(46, 76),
    shirt: rng.pick(SHIRTS),
    skin: rng.pick(SKIN),
    fleeT: 0, downT: 0, switchT: rng.range(9, 24),
    fleeX: 0, fleeY: 0,
    track: null, s: 0, dir: rng.chance(0.5) ? 1 : -1,
    targetX: 0, targetY: 0,
  };
  if (roll < 0.16) {
    // The promenade: up and down the bay shore.
    ped.track = { type: 'line', x: WORLD.shoreX - 88, y0: 70, y1: WORLD.height - 70 };
    ped.y = rng.range(ped.track.y0, ped.track.y1);
    ped.x = ped.track.x;
    ped.targetY = rng.range(ped.track.y0, ped.track.y1);
  } else if (roll < 0.24) {
    // A marina pier, out over the water and back.
    const pier = rng.pick(city.piers);
    ped.track = { type: 'pier', y: pier.y + pier.h / 2, x0: pier.x + 16, x1: pier.x + pier.w - 16 };
    ped.x = rng.range(ped.track.x0, ped.track.x1);
    ped.y = ped.track.y;
    ped.targetX = rng.range(ped.track.x0, ped.track.x1);
  } else {
    const col = rng.int(0, X_BANDS.length - 1);
    const row = rng.int(0, Y_BANDS.length - 1);
    ped.track = { type: 'ring', rect: blockRing(col, row) };
    ped.s = rng.range(0, ringLength(ped.track.rect));
    const p = ringPoint(ped.track.rect, ped.s);
    ped.x = p.x;
    ped.y = p.y;
  }
  return ped;
}

export function spawnPedestrians(city, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i += 1) peds.push(createPedestrian(rng, city));
  return peds;
}

/** How many walkers near a point are upright and able to see a crime happen. */
export function witnessesNear(peds, x, y, radius) {
  let count = 0;
  for (const ped of peds) {
    if (ped.state === 'down') continue;
    if (distance(ped.x, ped.y, x, y) <= radius) count += 1;
  }
  return count;
}

/** Send a walker running from a point of danger; called for shots, crashes, near misses. */
export function scarePedestrian(ped, fromX, fromY) {
  if (ped.state === 'down') return;
  const d = Math.max(1, distance(ped.x, ped.y, fromX, fromY));
  ped.fleeX = ped.x + ((ped.x - fromX) / d) * 190;
  ped.fleeY = ped.y + ((ped.y - fromY) / d) * 190;
  ped.state = 'flee';
  ped.fleeT = 2.4;
}

/**
 * One walker's step. `threats` is a list of {x, y, r} dangers fresh this frame — a fired
 * gun, a wreck, a car bearing down — any of which can start a flight.
 */
export function updatePedestrian(ped, dt, city, threats, rng) {
  if (ped.state === 'down') {
    ped.downT -= dt;
    if (ped.downT <= 0) {
      ped.hp = 45;
      ped.state = 'flee';
      ped.fleeT = 1.6;
      ped.fleeX = ped.x + rng.range(-140, 140);
      ped.fleeY = ped.y + rng.range(-140, 140);
    }
    return;
  }
  for (const threat of threats) {
    if (distance(ped.x, ped.y, threat.x, threat.y) < threat.r) {
      scarePedestrian(ped, threat.x, threat.y);
      break;
    }
  }

  if (ped.state === 'flee') {
    ped.fleeT -= dt;
    const d = distance(ped.x, ped.y, ped.fleeX, ped.fleeY);
    if (ped.fleeT <= 0 || d < 8) {
      ped.state = 'walk';
      // Rejoin the nearest ring wherever the flight ended.
      if (ped.track.type === 'ring') {
        const rect = ped.track.rect;
        ped.x = clamp(ped.x, rect.x0, rect.x1);
        ped.y = clamp(ped.y, rect.y0, rect.y1);
      }
    } else {
      const step = 168 * dt;
      ped.x += ((ped.fleeX - ped.x) / d) * Math.min(step, d);
      ped.y += ((ped.fleeY - ped.y) / d) * Math.min(step, d);
      const probe = { x: ped.x, y: ped.y, r: ped.r };
      if (city.collideCircle(probe)) {
        ped.x = probe.x;
        ped.y = probe.y;
      }
    }
    return;
  }

  // Walking the track.
  if (ped.track.type === 'ring') {
    ped.s += ped.dir * ped.speed * dt;
    const p = ringPoint(ped.track.rect, ped.s);
    ped.x = p.x;
    ped.y = p.y;
    ped.switchT -= dt;
    if (ped.switchT <= 0) {
      ped.switchT = rng.range(9, 24);
      if (rng.chance(0.3)) ped.dir *= -1;
    }
  } else if (ped.track.type === 'line') {
    const dy = ped.targetY - ped.y;
    if (Math.abs(dy) < 6) ped.targetY = rng.range(ped.track.y0, ped.track.y1);
    else ped.y += Math.sign(dy) * ped.speed * dt;
  } else if (ped.track.type === 'pier') {
    const dx = ped.targetX - ped.x;
    if (Math.abs(dx) < 6) ped.targetX = rng.range(ped.track.x0, ped.track.x1);
    else ped.x += Math.sign(dx) * ped.speed * dt;
  }
}

/**
 * A driver thrown out of their car by a carjacking: a walker in full flight from the thief,
 * who settles back onto the nearest block's ring once the fright passes.
 */
export function createFleeingDriver(rng, x, y, fromX, fromY) {
  const ped = createPedestrian(rng, { piers: [{ x: WORLD.shoreX, y: 1272, w: 380, h: 56 }] });
  // Re-track onto the ring of whichever block the car was beside.
  let col = 0;
  let row = 0;
  for (let c = 0; c < X_BANDS.length; c += 1) if (x >= X_BANDS[c][0] - 70) col = c;
  for (let r = 0; r < Y_BANDS.length; r += 1) if (y >= Y_BANDS[r][0] - 70) row = r;
  ped.track = { type: 'ring', rect: blockRing(col, row) };
  ped.x = x;
  ped.y = y;
  scarePedestrian(ped, fromX, fromY);
  return ped;
}

/** A walker goes down: hit by a car, or dropped by a punch or a bullet. */
export function knockDown(ped) {
  ped.state = 'down';
  ped.hp = 0;
  ped.downT = 16;
}
