// The MCPD and the wanted level. Crimes carry heat; heat makes stars; stars bring
// interceptors. A crime only counts when someone sees it — a walker nearby reports it a
// breath later, a patrol in sight makes it instant — and heat bleeds away while nobody
// can see the player, so breaking line of sight and lying low is a real way out.

import { MODEL_POLICE, createCar, driveCar } from './vehicles.js';
import { witnessesNear } from './pedestrians.js';
import { angleDelta, clamp, distance } from './util.js';

export const CRIMES = {
  carTheft: { heat: 26 },
  carjack: { heat: 34 },
  assault: { heat: 20 },
  knockOut: { heat: 44 },
  shotsFired: { heat: 15 },
  hitAndRun: { heat: 38 },
  wreck: { heat: 11 },
  vandalism: { heat: 8 },
};

const STAR_THRESHOLDS = [10, 35, 70, 120, 180];
const COP_SIGHT = 640;
const REPORT_DELAY = 0.9;

export function starsForHeat(heat) {
  let stars = 0;
  for (const threshold of STAR_THRESHOLDS) if (heat >= threshold) stars += 1;
  return stars;
}

export function createWanted() {
  return { heat: 0, stars: 0, unseenT: 0, reports: [], bust: 0 };
}

function playerPos(state) {
  return state.player.car ?? state.player;
}

/**
 * A crime happened at (x, y). Patrols in sight apply its heat at once; a walker who saw
 * it phones it in after a short delay; unseen, it never happened. Returns how it landed:
 * 'instant', 'reported', or 'unseen' — the game uses it for the phone and the sounds.
 */
export function reportCrime(state, kind, x, y) {
  const crime = CRIMES[kind];
  if (!crime) return 'unseen';
  state.stats.crimes += 1;
  const pos = playerPos(state);
  for (const cop of state.cops) {
    if (distance(cop.x, cop.y, x, y) < COP_SIGHT) {
      addHeat(state, crime.heat);
      state.wanted.unseenT = 0;
      return 'instant';
    }
  }
  if (distance(pos.x, pos.y, x, y) < COP_SIGHT && state.wanted.stars > 0) {
    addHeat(state, crime.heat);
    return 'instant';
  }
  if (witnessesNear(state.peds, x, y, 245) > 0) {
    state.wanted.reports.push({ t: REPORT_DELAY, heat: crime.heat });
    return 'reported';
  }
  return 'unseen';
}

export function addHeat(state, points) {
  const wanted = state.wanted;
  wanted.heat = clamp(wanted.heat + points, 0, 220);
  wanted.stars = starsForHeat(wanted.heat);
}

/** Wipe the slate: a bust, a wreck, or a mission that needs a clean start. */
export function clearHeat(state) {
  state.wanted.heat = 0;
  state.wanted.stars = 0;
  state.wanted.bust = 0;
  state.wanted.reports.length = 0;
}

/** The per-frame wanted bookkeeping: delayed reports land, unseen heat decays. */
export function updateWanted(state, dt) {
  const wanted = state.wanted;
  // Stars always tell the truth about heat, however the heat got there.
  wanted.stars = starsForHeat(wanted.heat);
  for (let i = wanted.reports.length - 1; i >= 0; i -= 1) {
    wanted.reports[i].t -= dt;
    if (wanted.reports[i].t <= 0) {
      addHeat(state, wanted.reports[i].heat);
      wanted.reports.splice(i, 1);
    }
  }
  if (wanted.stars === 0) {
    wanted.unseenT = 0;
    return;
  }
  const pos = playerPos(state);
  let seen = false;
  for (const cop of state.cops) {
    if (distance(cop.x, cop.y, pos.x, pos.y) < COP_SIGHT) {
      seen = true;
      break;
    }
  }
  if (!seen) {
    for (const ped of state.peds) {
      if (ped.state !== 'down' && distance(ped.x, ped.y, pos.x, pos.y) < 190) {
        seen = true;
        break;
      }
    }
  }
  if (seen) wanted.unseenT = 0;
  else {
    wanted.unseenT += dt;
    if (wanted.unseenT > 4.5) {
      wanted.heat = Math.max(0, wanted.heat - 5.2 * dt);
      wanted.stars = starsForHeat(wanted.heat);
      if (wanted.stars === 0) wanted.heat = 0;
    }
  }
}

/** Keep the patrol strength matched to the stars: one interceptor per star, up to five. */
export function maintainPolice(state, rng) {
  const desired = Math.min(state.wanted.stars, 5);
  const pos = playerPos(state);
  // Surplus units far away give up and leave the world.
  for (let i = state.cops.length - 1; i >= 0 && state.cops.length > desired; i -= 1) {
    if (distance(state.cops[i].x, state.cops[i].y, pos.x, pos.y) > 1000) state.cops.splice(i, 1);
  }
  while (state.cops.length < desired) {
    // Arrive on a road, close enough to matter, far enough not to be seen spawning.
    const angle = rng.range(0, Math.PI * 2);
    const tx = pos.x + Math.cos(angle) * 880;
    const ty = pos.y + Math.sin(angle) * 880;
    let best = null;
    let bestD = Infinity;
    for (const node of state.city.nodes) {
      const d = (node.x - tx) ** 2 + (node.y - ty) ** 2;
      if (d < bestD) {
        bestD = d;
        best = node;
      }
    }
    const cop = createCar(best.x, best.y, rng.range(0, Math.PI * 2), MODEL_POLICE, '#e8e8ec', 'police');
    cop.driver = 'police';
    cop.reverseT = 0;
    cop.stuckT = 0;
    state.cops.push(cop);
  }
  if (state.wanted.stars === 0) {
    for (let i = state.cops.length - 1; i >= 0; i -= 1) {
      if (distance(state.cops[i].x, state.cops[i].y, pos.x, pos.y) > 950) state.cops.splice(i, 1);
    }
  }
}

/**
 * One interceptor's step: run the player down and stay on them. A unit that noses into a
 * wall backs out and comes again rather than grinding against it forever.
 */
export function updatePoliceUnit(state, cop, dt, city) {
  const target = playerPos(state);
  const dist = distance(cop.x, cop.y, target.x, target.y);
  // Aim a little ahead of a moving target so the chase cuts corners like a chase should.
  const lead = clamp(dist / 700, 0, 0.55);
  const aimX = target.x + (target.vx ?? 0) * lead;
  const aimY = target.y + (target.vy ?? 0) * lead;
  const targetAngle = Math.atan2(aimY - cop.y, aimX - cop.x);
  const delta = angleDelta(cop.angle, targetAngle);

  if (Math.abs(cop.speed) < 14 && dist > 90) cop.stuckT += dt;
  else cop.stuckT = 0;
  if (cop.stuckT > 1.1) {
    cop.reverseT = 0.65;
    cop.stuckT = 0;
  }

  let throttle;
  let steer = clamp(delta * 2.4, -1, 1);
  if (cop.reverseT > 0) {
    cop.reverseT -= dt;
    throttle = -0.85;
    steer = clamp(-delta * 2.4, -1, 1);
  } else if (Math.abs(delta) > 2.2 && dist < 130) {
    throttle = -0.7;
    steer = clamp(-delta * 2.4, -1, 1);
  } else {
    throttle = dist > 46 ? 1 : 0.25;
    if (!state.player.car) {
      // A suspect on foot is an arrest, not a target: pull up close and hold there,
      // near enough for the bust meter to do its work, instead of running her down.
      if (dist < 55) throttle = cop.speed > 30 ? -0.55 : 0;
      else if (dist < 130) throttle = Math.min(throttle, 0.35);
    }
  }
  const crash = driveCar(cop, throttle, steer, dt, city);
  if (crash > 0) state.events.push({ type: 'crash', strength: crash * 0.7, x: cop.x, y: cop.y });
}

/**
 * The bust meter: it fills while a unit is close and the player is slow or on foot, and
 * drains the moment the player makes distance or speed. True when the player is caught.
 */
export function updateBust(state, dt) {
  const wanted = state.wanted;
  if (wanted.stars === 0 || state.cops.length === 0) {
    wanted.bust = Math.max(0, wanted.bust - dt * 0.7);
    return false;
  }
  const player = state.player;
  const pos = playerPos(state);
  let nearest = Infinity;
  for (const cop of state.cops) nearest = Math.min(nearest, distance(cop.x, cop.y, pos.x, pos.y));
  const playerSpeed = Math.abs(player.car ? player.car.speed : Math.hypot(player.vx ?? 0, player.vy ?? 0));
  const cornered = player.car ? nearest < 92 && playerSpeed < 55 : nearest < 98;
  if (cornered) wanted.bust += dt / (player.car ? 3.0 : 2.1);
  else wanted.bust = Math.max(0, wanted.bust - dt * 0.55);
  if (wanted.bust >= 1) {
    wanted.bust = 0;
    return true;
  }
  return false;
}
