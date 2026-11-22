// The player: Zara Vale on foot and behind the wheel. On foot she walks and sprints,
// swings a punch, and — once the first job pays for it — fires a sidearm along the mouse's
// aim. E is the verb for the city: into a parked car (a theft, if anyone sees), onto a
// traffic car's driver (a carjacking, and the driver runs), out of a car again. Driving
// borrows the shared car step; hard arrivals hurt the car, and her too.

import { PLAYER } from './config.js';
import { damageCar, driveCar } from './vehicles.js';
import { createFleeingDriver, knockDown, scarePedestrian } from './pedestrians.js';
import { reportCrime } from './police.js';
import { angleDelta, distance } from './util.js';

export function createPlayer(x, y) {
  return {
    x, y, r: PLAYER.radius,
    angle: Math.PI,
    vx: 0, vy: 0,
    health: PLAYER.maxHealth,
    hurtT: 0,
    punchT: 0, gunT: 0,
    car: null,
    stepPhase: 0,
  };
}

export function placePlayer(state, x, y) {
  const player = state.player;
  player.x = x;
  player.y = y;
  player.vx = 0;
  player.vy = 0;
  player.car = null;
}

/** Hurt Zara; at zero the game above decides between the hospital and the cell. */
export function damagePlayer(state, amount) {
  const player = state.player;
  player.health = Math.max(0, player.health - amount);
  player.hurtT = 5;
}

function nearestCar(state, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.driver === 'player') continue;
    const d = distance(x, y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function tryEnterCar(state) {
  const player = state.player;
  const car = nearestCar(state, player.x, player.y, 54);
  if (!car || Math.abs(car.speed) > 95) return;
  if (car.driver === 'ai') {
    // Carjacking: the driver comes out and runs, and everyone nearby sees it.
    const driver = createFleeingDriver(state.rng, car.x + 30, car.y + 10, player.x, player.y);
    state.peds.push(driver);
    reportCrime(state, 'carjack', car.x, car.y);
    state.events.push({ type: 'crash', strength: 0.25, x: car.x, y: car.y });
  } else if (car.kind === 'parked') {
    state.stats.thefts += 1;
    if (car.alarm) {
      state.events.push({ type: 'alarm', x: car.x, y: car.y });
      reportCrime(state, 'carTheft', car.x, car.y);
    } else {
      reportCrime(state, 'carTheft', car.x, car.y);
    }
  }
  car.driver = 'player';
  car.alarm = false;
  player.car = car;
  state.events.push({ type: 'door', x: car.x, y: car.y });
}

function exitCar(state) {
  const player = state.player;
  const car = player.car;
  if (!car) return;
  car.driver = null;
  if (car.kind === 'traffic') car.kind = 'parked';
  const side = car.angle + Math.PI / 2;
  player.x = car.x + Math.cos(side) * 36;
  player.y = car.y + Math.sin(side) * 36;
  const probe = { x: player.x, y: player.y, r: player.r };
  state.city.collideCircle(probe);
  player.x = probe.x;
  player.y = probe.y;
  player.car = null;
  state.events.push({ type: 'door', x: car.x, y: car.y });
}

function punch(state) {
  const player = state.player;
  player.punchT = PLAYER.punchCooldown;
  state.events.push({ type: 'punch', x: player.x, y: player.y });
  const reach = PLAYER.punchRange;
  let hitSomething = false;
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    const d = distance(player.x, player.y, ped.x, ped.y);
    if (d > reach + ped.r) continue;
    const ang = Math.atan2(ped.y - player.y, ped.x - player.x);
    if (Math.abs(angleDelta(player.angle, ang)) > 1.0) continue;
    hitSomething = true;
    ped.hp -= 55;
    if (ped.hp <= 0) {
      knockDown(ped);
      reportCrime(state, 'knockOut', ped.x, ped.y);
    } else {
      scarePedestrian(ped, player.x, player.y);
      reportCrime(state, 'assault', ped.x, ped.y);
    }
    break;
  }
  if (!hitSomething) {
    for (const car of state.cars) {
      if (distance(player.x, player.y, car.x, car.y) < reach + car.r) {
        damageCar(car, 5);
        state.events.push({ type: 'spark', x: car.x, y: car.y });
        reportCrime(state, 'vandalism', car.x, car.y);
        break;
      }
    }
  }
}

/** Raycast in small steps: the first walker, car or wall along the aim takes the bullet. */
function shoot(state) {
  const player = state.player;
  player.gunT = PLAYER.gunCooldown;
  state.events.push({ type: 'shot', x: player.x, y: player.y, angle: player.angle });
  reportCrime(state, 'shotsFired', player.x, player.y);
  const dx = Math.cos(player.angle);
  const dy = Math.sin(player.angle);
  const stepLen = 14;
  const steps = Math.floor(PLAYER.gunRange / stepLen);
  for (let i = 1; i <= steps; i += 1) {
    const x = player.x + dx * stepLen * i;
    const y = player.y + dy * stepLen * i;
    let struck = false;
    for (const ped of state.peds) {
      if (ped.state !== 'down' && distance(x, y, ped.x, ped.y) < ped.r + 4) {
        ped.hp -= 65;
        if (ped.hp <= 0) {
          knockDown(ped);
          reportCrime(state, 'knockOut', ped.x, ped.y);
        } else {
          scarePedestrian(ped, player.x, player.y);
          reportCrime(state, 'assault', ped.x, ped.y);
        }
        struck = true;
        break;
      }
    }
    if (struck) return;
    for (const car of state.cars) {
      if (car !== player.car && distance(x, y, car.x, car.y) < car.r + 2) {
        damageCar(car, 16);
        state.events.push({ type: 'spark', x, y });
        if (car.dead) state.events.push({ type: 'smokeBurst', x: car.x, y: car.y });
        return;
      }
    }
    for (const cop of state.cops) {
      if (distance(x, y, cop.x, cop.y) < cop.r + 2) {
        damageCar(cop, 10);
        state.events.push({ type: 'spark', x, y });
        return;
      }
    }
    if (state.city.isWater(x, y)) return;
    for (const b of state.city.buildings) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        state.events.push({ type: 'spark', x, y });
        return;
      }
    }
  }
}

/**
 * One step of the player. `aimAngle` is where the mouse points her, in world terms; while
 * driving the same frame's axes become throttle and steering instead.
 */
export function updatePlayer(state, dt, input, aimAngle) {
  const player = state.player;
  player.punchT = Math.max(0, player.punchT - dt);
  player.gunT = Math.max(0, player.gunT - dt);
  if (player.hurtT > 0) player.hurtT -= dt;
  else if (player.health > 0 && player.health < PLAYER.maxHealth && !player.car) {
    player.health = Math.min(PLAYER.maxHealth, player.health + PLAYER.regenPerSecond * dt);
  }

  if (input.interact) {
    if (player.car) exitCar(state);
    else tryEnterCar(state);
  }
  if (player.car) {
    const car = player.car;
    const crash = driveCar(car, -input.my, input.mx, dt, state.city);
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    player.vx = Math.cos(car.angle) * car.speed;
    player.vy = Math.sin(car.angle) * car.speed;
    if (crash > 0) {
      state.events.push({ type: 'crash', strength: crash, x: car.x, y: car.y });
      damageCar(car, crash * 26);
      if (crash > 0.42) {
        damagePlayer(state, crash * 13);
        reportCrime(state, 'wreck', car.x, car.y);
      }
    }
    return;
  }

  // On foot.
  const mag = Math.hypot(input.mx, input.my);
  const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  if (mag > 0.01) {
    const nx = input.mx / Math.max(1, mag);
    const ny = input.my / Math.max(1, mag);
    player.vx = nx * speed;
    player.vy = ny * speed;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.stepPhase += dt * (input.sprint ? 11 : 8);
    if (!input.fire) player.angle = Math.atan2(player.vy, player.vx);
  } else {
    player.vx = 0;
    player.vy = 0;
  }
  if (input.fire || input.punch) player.angle = aimAngle;
  const probe = { x: player.x, y: player.y, r: player.r };
  if (state.city.collideCircle(probe)) {
    player.x = probe.x;
    player.y = probe.y;
  }

  if ((input.punch || (input.fire && !state.hasGun)) && player.punchT <= 0) punch(state);
  else if (input.fire && state.hasGun && player.gunT <= 0) shoot(state);
}
