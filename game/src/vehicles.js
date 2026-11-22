// Vehicles: the models on Moonrise City's streets, the parked cars waiting to be borrowed,
// the traffic that drives the road grid on its own, and the one physics step every car —
// player's, traffic, police — shares. A car is a centre point, a heading and a speed; the
// body is drawn around it by the renderer and collisions treat it as a circle, which keeps
// forty cars a frame cheap.

import { H_ROADS, V_ROADS } from './city.js';
import { angleDelta, clamp, distance } from './util.js';

export const CAR_MODELS = [
  { name: 'Palms Runner', top: 470, accel: 295, w: 40, l: 78 },
  { name: 'Darya Solace', top: 545, accel: 325, w: 42, l: 86 },
  { name: 'Darya Hauler', top: 500, accel: 300, w: 46, l: 92 },
  { name: 'Crescent GT', top: 685, accel: 435, w: 43, l: 88 },
  { name: 'Meridian Luxe', top: 620, accel: 385, w: 44, l: 94 },
  { name: 'MCPD Interceptor', top: 705, accel: 455, w: 43, l: 90 },
];
export const MODEL_POLICE = 5;

export const PAINTS = ['#c0c6d4', '#2b3a67', '#7a1f2b', '#14171f', '#d8d3c3', '#20584f', '#8a6d2f', '#4a4f63', '#e8e8ec'];

const LANE = 27;

export function createCar(x, y, angle, modelIndex, color, kind) {
  const model = CAR_MODELS[modelIndex];
  return {
    x, y, angle, speed: 0,
    model: modelIndex, color, kind,
    w: model.w, l: model.l, r: 25,
    hp: 100, dead: false,
    driver: null,
    alarm: false, alarmT: 0,
    nodeFrom: null, nodeTo: null,
    cruise: 0,
    honkT: 0,
  };
}

/** The lane offset for travelling from node a to node b: the right-hand side of the road. */
function laneOffset(a, b) {
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  // Right of the direction of travel: east -> south, south -> west, west -> north, north -> east.
  return { ox: dy === 1 ? -LANE : dy === -1 ? LANE : 0, oy: dx === 1 ? LANE : dx === -1 ? -LANE : 0 };
}

function nodeNeighbours(node) {
  const out = [];
  const xi = V_ROADS.indexOf(node.x);
  const yi = H_ROADS.indexOf(node.y);
  if (xi > 0) out.push({ x: V_ROADS[xi - 1], y: node.y });
  if (xi < V_ROADS.length - 1) out.push({ x: V_ROADS[xi + 1], y: node.y });
  if (yi > 0) out.push({ x: node.x, y: H_ROADS[yi - 1] });
  if (yi < H_ROADS.length - 1) out.push({ x: node.x, y: H_ROADS[yi + 1] });
  return out;
}

/** Put a traffic car on the grid between two neighbouring intersections. */
export function placeOnGrid(car, rng) {
  const from = { x: rng.pick(V_ROADS), y: rng.pick(H_ROADS) };
  const to = rng.pick(nodeNeighbours(from));
  car.nodeFrom = from;
  car.nodeTo = to;
  const { ox, oy } = laneOffset(from, to);
  const t = rng.range(0.15, 0.85);
  car.x = from.x + (to.x - from.x) * t + ox;
  car.y = from.y + (to.y - from.y) * t + oy;
  car.angle = Math.atan2(to.y - from.y, to.x - from.x);
  car.cruise = rng.range(215, 300);
  car.speed = car.cruise * rng.range(0.6, 1);
}

/** Fill the lots and kerbs: about two dozen parked cars, a few of them alarmed. */
export function spawnParkedCars(city, rng, count) {
  const spots = [...city.parkSpots];
  const cars = [];
  for (let i = 0; i < count && spots.length > 0; i += 1) {
    const index = rng.int(0, spots.length - 1);
    const spot = spots.splice(index, 1)[0];
    const car = createCar(spot.x, spot.y, spot.angle + (rng.chance(0.5) ? 0 : Math.PI), rng.int(0, 4), rng.pick(PAINTS), 'parked');
    car.alarm = rng.chance(0.3);
    cars.push(car);
  }
  return cars;
}

/**
 * One traffic car's step: follow its lane to the next intersection, brake for whatever is
 * ahead in the obstacle list, and pick the next leg (rarely a U-turn) on arrival.
 * `blocked` ahead also covers the player's car and the player on foot.
 */
export function updateTrafficCar(car, dt, obstacles, rng) {
  if (car.dead || !car.nodeTo) return;
  const { ox, oy } = laneOffset(car.nodeFrom, car.nodeTo);
  const tx = car.nodeTo.x + ox;
  const ty = car.nodeTo.y + oy;
  const distToNode = distance(car.x, car.y, tx, ty);

  let wanted = car.cruise;
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  for (const other of obstacles) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * hx + dy * hy;
    if (ahead < 4 || ahead > 105) continue;
    const side = Math.abs(dx * -hy + dy * hx);
    if (side > 30) continue;
    // Something is in the lane ahead: match its pace, or stop short of it.
    const gap = ahead - 52;
    wanted = Math.min(wanted, gap < 12 ? 0 : (other.speed ?? 0) + gap * 1.4);
  }

  const accel = wanted > car.speed ? 190 : 420;
  car.speed += clamp(wanted - car.speed, -accel * dt, accel * dt);
  if (car.speed < 0) car.speed = 0;

  const targetAngle = Math.atan2(ty - car.y, tx - car.x);
  car.angle += clamp(angleDelta(car.angle, targetAngle), -2.6 * dt, 2.6 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  if (distToNode < 34) {
    const options = nodeNeighbours(car.nodeTo).filter(
      (n) => !(n.x === car.nodeFrom.x && n.y === car.nodeFrom.y),
    );
    const next = options.length > 0 && rng.chance(0.92) ? rng.pick(options) : car.nodeFrom;
    car.nodeFrom = car.nodeTo;
    car.nodeTo = next;
  }
}

/**
 * The shared driving step for a steered car (the player's, a police unit's). throttle is
 * -1..1, steer -1..1. Returns the crash strength 0..1 when the car struck the world hard.
 */
export function driveCar(car, throttle, steer, dt, city) {
  const model = CAR_MODELS[car.model];
  if (car.dead) throttle = 0;
  if (throttle > 0) car.speed += model.accel * throttle * dt;
  else if (throttle < 0) car.speed += model.accel * 0.62 * throttle * dt;
  // Rolling drag and brakes: coast down gently, brake hard when reversing the input.
  const drag = throttle === 0 ? 0.85 : 0.12;
  car.speed -= car.speed * drag * dt;
  if (throttle > 0 && car.speed < 0) car.speed += 620 * dt;
  if (throttle < 0 && car.speed > 0) car.speed -= 620 * dt;
  car.speed = clamp(car.speed, -175, model.top);

  const speedRatio = clamp(Math.abs(car.speed) / 240, 0, 1);
  if (car.speed !== 0) car.angle += steer * 2.35 * speedRatio * dt * Math.sign(car.speed);

  const before = Math.abs(car.speed);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const probe = { x: car.x, y: car.y, r: car.r };
  if (city.collideCircle(probe)) {
    car.x = probe.x;
    car.y = probe.y;
    if (before > 150) {
      car.speed = -car.speed * 0.22;
      return clamp(before / model.top, 0.2, 1);
    }
    car.speed *= 0.35;
  }
  return 0;
}

/** Wear a car down; at zero its engine dies and it will not move again. */
export function damageCar(car, amount) {
  if (car.dead) return;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    car.dead = true;
  }
}
