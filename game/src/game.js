// The game itself: the state of Moonrise City and the one fixed step that advances it.
// Systems live in their own modules — the city, the cars, the walkers, the police, the
// player, the jobs — and this file wires them together: collisions between cars, cars
// meeting walkers, the wanted machine, the phone, the camera, and the sounds each event
// earns. Screens (title, play, paused, busted, wasted, finale) are states of this machine.

import { STEP, TIME, WORLD } from './config.js';
import { createRandom } from './random.js';
import { generateCity } from './city.js';
import { CAR_MODELS, PAINTS, createCar, damageCar, placeOnGrid, spawnParkedCars, updateTrafficCar } from './vehicles.js';
import { knockDown, scarePedestrian, spawnPedestrians, updatePedestrian } from './pedestrians.js';
import { clearHeat, createWanted, maintainPolice, reportCrime, updateBust, updatePoliceUnit, updateWanted } from './police.js';
import { createPlayer, damagePlayer, placePlayer, updatePlayer } from './player.js';
import { updateMissions } from './missions.js';
import { createAudio } from './audio.js';
import { loadCareer, storeCareer } from './save.js';
import { clamp, clamp01, distance } from './util.js';

const START_POS = { x: 2935, y: 1252 };

export function createGame(seed) {
  const rng = createRandom(seed);
  const city = generateCity(createRandom((seed ^ 0x51ab37) >>> 0));
  const audio = createAudio();

  const state = {
    seed,
    rng,
    city,
    audio,
    screen: 'title',
    elapsed: 0,
    timeMin: TIME.startMinutes,
    player: createPlayer(START_POS.x, START_POS.y),
    cars: [],
    peds: [],
    cops: [],
    wanted: createWanted(),
    money: 120,
    rep: 0,
    hasGun: false,
    carrying: false,
    storyIndex: 0,
    mission: null,
    missionCooldown: 2,
    phone: [],
    prompt: '',
    particles: [],
    events: [],
    stats: freshStats(),
    camX: 0,
    camY: 0,
    over: null,
    hasSave: !!loadCareer(),
    trafficT: 0,
    smokeT: 0,
  };

  function freshStats() {
    return { earned: 0, missionsDone: 0, thefts: 0, busts: 0, wasteds: 0, crimes: 0 };
  }

  function persistCareer() {
    storeCareer({
      money: state.money,
      rep: state.rep,
      storyIndex: state.storyIndex,
      hasGun: state.hasGun,
      stats: state.stats,
    });
    state.hasSave = true;
  }

  function resetEntities() {
    state.cars = spawnParkedCars(city, rng, 24);
    state.peds = spawnPedestrians(city, rng, 26);
    state.cops = [];
    state.particles = [];
    state.phone = [];
    state.mission = null;
    state.carrying = false;
    state.wanted = createWanted();
    state.over = null;
    for (let i = 0; i < 12; i += 1) addTraffic(true);
  }

  function addTraffic(anywhere = false) {
    const car = createCar(0, 0, 0, rng.int(0, 4), rng.pick(PAINTS), 'traffic');
    car.driver = 'ai';
    placeOnGrid(car, rng);
    if (!anywhere) {
      // Fresh traffic materialises away from the player, never on top of them.
      let guard = 0;
      while (distance(car.x, car.y, state.player.x, state.player.y) < 780 && guard < 12) {
        placeOnGrid(car, rng);
        guard += 1;
      }
    }
    state.cars.push(car);
    return car;
  }

  function startCareer(continueSave, viewW = 1280, viewH = 800) {
    resetEntities();
    const save = continueSave ? loadCareer() : null;
    if (save) {
      state.money = save.money;
      state.rep = save.rep;
      state.storyIndex = save.storyIndex;
      state.hasGun = !!save.hasGun;
      state.stats = { ...freshStats(), ...save.stats };
    } else {
      state.money = 120;
      state.rep = 0;
      state.storyIndex = 0;
      state.hasGun = false;
      state.stats = freshStats();
    }
    state.player = createPlayer(START_POS.x, START_POS.y);
    state.timeMin = TIME.startMinutes;
    state.missionCooldown = 2.2;
    state.screen = 'play';
    snapCamera(viewW, viewH);
    state.phone.push({
      from: 'DISPATCH',
      text: save
        ? 'Welcome back, Zara. The city kept your name warm.'
        : 'Zara Vale, courier. WASD to move, E takes a car, the mouse aims. First job lands in a moment.',
      t: 8,
    });
  }

  function snapCamera(viewW, viewH) {
    state.camX = clamp(state.player.x - viewW / 2, 0, Math.max(0, WORLD.width - viewW));
    state.camY = clamp(state.player.y - viewH / 2, 0, Math.max(0, WORLD.height - viewH));
  }

  function doBusted() {
    const fine = Math.min(state.money, 60 + state.wanted.stars * 45);
    state.money -= fine;
    state.stats.busts += 1;
    state.over = { kind: 'busted', fine };
    state.screen = 'busted';
    clearHeat(state);
    audio.engine(false, 0);
    audio.siren(0);
  }

  function doWasted() {
    const fine = Math.min(state.money, 90);
    state.money -= fine;
    state.stats.wasteds += 1;
    state.over = { kind: 'wasted', fine };
    state.screen = 'wasted';
    clearHeat(state);
    audio.engine(false, 0);
    audio.siren(0);
  }

  function respawn() {
    const poi = state.over?.kind === 'busted' ? city.pois.police : city.pois.hospital;
    if (state.player.car) {
      state.player.car.driver = null;
      state.player.car = null;
    }
    placePlayer(state, poi.x, poi.y);
    state.player.health = 100;
    state.cops = [];
    state.screen = 'play';
    state.over = null;
    persistCareer();
  }

  // ---------- collisions between the moving pieces ----------

  function collideCars(list) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.r + b.r - 3;
        if (d === 0 || d >= min) continue;
        const nx = dx / d;
        const ny = dy / d;
        const push = (min - d) / 2;
        const aFixed = a.driver === null && a.speed === 0;
        const bFixed = b.driver === null && b.speed === 0;
        if (!aFixed) { a.x -= nx * push; a.y -= ny * push; }
        if (!bFixed) { b.x += nx * push; b.y += ny * push; }
        const closing = Math.abs((Math.cos(a.angle) * a.speed - Math.cos(b.angle) * b.speed) * nx +
          (Math.sin(a.angle) * a.speed - Math.sin(b.angle) * b.speed) * ny);
        if (closing > 150) {
          const dmg = (closing - 150) / 13;
          damageCar(a, dmg);
          damageCar(b, dmg);
          state.events.push({ type: 'crash', strength: clamp01(closing / 620), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
          if (a === state.player.car || b === state.player.car) {
            if (closing > 250) reportCrime(state, 'wreck', state.player.x, state.player.y);
            damagePlayer(state, closing * 0.016);
          }
        }
        // Trade a little speed so the pair separates instead of sticking.
        const swap = (a.speed + b.speed) / 2;
        if (!aFixed) a.speed = a.speed * 0.55 + swap * 0.3;
        if (!bFixed) b.speed = b.speed * 0.55 + swap * 0.3;
      }
    }
  }

  function collideCarsWithPeds() {
    // The player's car lives in state.cars like every other, so one list covers all.
    const movers = [...state.cars, ...state.cops];
    for (const car of movers) {
      if (Math.abs(car.speed) < 55) continue;
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        if (distance(car.x, car.y, ped.x, ped.y) < car.r + ped.r - 2) {
          knockDown(ped);
          state.events.push({ type: 'crash', strength: 0.4, x: ped.x, y: ped.y });
          if (car === state.player.car) reportCrime(state, 'hitAndRun', ped.x, ped.y);
          else scarePedestrian(ped, car.x, car.y);
        }
      }
      // The player on foot can be clipped by anyone's driving, traffic included.
      // An interceptor pulling up to make an arrest only shoves her; a fast one hurts.
      const player = state.player;
      if (!player.car && car !== player.car && distance(car.x, car.y, player.x, player.y) < car.r + player.r - 2) {
        if (!(car.isCop && Math.abs(car.speed) < 150)) {
          damagePlayer(state, Math.min(36, Math.abs(car.speed) * 0.07));
        }
        player.x += Math.cos(car.angle) * 26;
        player.y += Math.sin(car.angle) * 26;
        state.events.push({ type: 'crash', strength: 0.5, x: player.x, y: player.y });
      }
    }
  }

  // ---------- events become sound and sparks ----------

  function spawnParticles(type, x, y, count, spread = 60) {
    for (let i = 0; i < count; i += 1) {
      state.particles.push({
        type,
        x: x + rng.range(-6, 6),
        y: y + rng.range(-6, 6),
        vx: rng.range(-spread, spread),
        vy: type === 'smoke' ? rng.range(-46, -22) : rng.range(-spread, spread),
        life: type === 'smoke' ? rng.range(0.7, 1.4) : rng.range(0.25, 0.5),
        maxLife: 1.4,
        size: type === 'smoke' ? rng.range(7, 13) : 3,
      });
      const p = state.particles[state.particles.length - 1];
      p.maxLife = p.life;
    }
  }

  function processEvents() {
    for (const event of state.events) {
      switch (event.type) {
        case 'shot': {
          audio.shot();
          const p = state.player;
          spawnParticles('flash', p.x + Math.cos(p.angle) * 24, p.y + Math.sin(p.angle) * 24, 1);
          break;
        }
        case 'punch': audio.punch(); break;
        case 'crash':
          audio.crash(event.strength);
          spawnParticles('spark', event.x, event.y, 4);
          for (const ped of state.peds) {
            if (distance(ped.x, ped.y, event.x, event.y) < 150) scarePedestrian(ped, event.x, event.y);
          }
          break;
        case 'spark': spawnParticles('spark', event.x, event.y, 3); break;
        case 'smokeBurst': spawnParticles('smoke', event.x, event.y, 8, 30); break;
        case 'pickup': audio.pickup(); break;
        case 'cash': audio.cash(); break;
        case 'sting': audio.sting(); break;
        case 'phone': audio.phone(); break;
        case 'alarm':
          audio.alarm();
          state.phone.push({ from: 'MOONRISE', text: 'That alarm is screaming. Move, Zara.', t: 4 });
          break;
        case 'career': persistCareer(); break;
        case 'storyComplete':
          state.screen = 'finale';
          persistCareer();
          break;
        default: break;
      }
    }
    state.events.length = 0;
  }

  // ---------- the step ----------

  function simulate(dt, input, viewW, viewH) {
    state.timeMin = (state.timeMin + dt * TIME.minutesPerSecond) % 1440;
    const player = state.player;

    // Aim: the mouse in screen space, against last frame's camera.
    let aimAngle = player.angle;
    if (typeof input.aimAngle === 'number') aimAngle = input.aimAngle;
    else if (!player.car) {
      aimAngle = Math.atan2(input.mouseY - (player.y - state.camY), input.mouseX - (player.x - state.camX));
    }

    updatePlayer(state, dt, input, aimAngle);

    // Traffic keeps its count and its distance.
    state.trafficT -= dt;
    const aiCars = state.cars.filter((car) => car.driver === 'ai');
    if (state.trafficT <= 0) {
      state.trafficT = 0.6;
      if (aiCars.length < 13) addTraffic();
      for (let i = state.cars.length - 1; i >= 0; i -= 1) {
        const car = state.cars[i];
        if (car.driver === 'ai' && distance(car.x, car.y, player.x, player.y) > 1850) state.cars.splice(i, 1);
      }
    }
    const obstacles = [...state.cars, ...state.cops];
    if (!player.car) obstacles.push({ x: player.x, y: player.y, speed: 0 });
    for (const car of state.cars) {
      if (car.driver === 'ai') updateTrafficCar(car, dt, obstacles, rng);
      if (car.driver === null || car.driver === 'ai') {
        const probe = { x: car.x, y: car.y, r: car.r };
        if (city.collideCircle(probe)) {
          car.x = probe.x;
          car.y = probe.y;
        }
      }
      car.vx = Math.cos(car.angle) * car.speed;
      car.vy = Math.sin(car.angle) * car.speed;
    }

    // Walkers, with this step's dangers fresh in their ears.
    const threats = [];
    for (const car of obstacles) {
      if (Math.abs(car.speed ?? 0) > 330) threats.push({ x: car.x, y: car.y, r: 96 });
    }
    for (const event of state.events) {
      if (event.type === 'shot') threats.push({ x: event.x, y: event.y, r: 300 });
    }
    for (const ped of state.peds) updatePedestrian(ped, dt, city, threats, rng);

    // The law.
    updateWanted(state, dt);
    maintainPolice(state, rng);
    for (const cop of state.cops) {
      updatePoliceUnit(state, cop, dt, city);
      cop.vx = Math.cos(cop.angle) * cop.speed;
      cop.vy = Math.sin(cop.angle) * cop.speed;
    }

    collideCars([...state.cars, ...state.cops]);
    collideCarsWithPeds();
    processEvents();

    if (updateBust(state, dt)) {
      doBusted();
      return;
    }
    if (player.health <= 0) {
      doWasted();
      return;
    }

    updateMissions(state, dt);
    processEvents();

    // Phone messages age out; smoke and sparks live and die.
    for (let i = state.phone.length - 1; i >= 0; i -= 1) {
      state.phone[i].t -= dt;
      if (state.phone[i].t <= 0) state.phone.splice(i, 1);
    }
    state.smokeT -= dt;
    if (state.smokeT <= 0) {
      state.smokeT = 0.1;
      for (const car of [...state.cars, ...state.cops]) {
        if (car.dead) spawnParticles('smoke', car.x, car.y - 6, 1, 14);
        else if (car.hp < 42) spawnParticles('smoke', car.x, car.y - 6, 1, 10);
      }
    }
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const fx = state.particles[i];
      fx.life -= dt;
      if (fx.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      fx.x += fx.vx * dt;
      fx.y += fx.vy * dt;
      if (fx.type === 'smoke') fx.vy -= 9 * dt;
    }

    // The prompt: what E would do here.
    if (player.car) state.prompt = 'E — Step out';
    else {
      state.prompt = '';
      for (const car of state.cars) {
        if (Math.abs(car.speed) < 95 && distance(player.x, player.y, car.x, car.y) < 54) {
          state.prompt = car.driver === 'ai'
            ? `E — Carjack the ${CAR_MODELS[car.model].name}`
            : `E — Take the ${CAR_MODELS[car.model].name}`;
          break;
        }
      }
    }

    // Sound follows the action: the engine under her, the sirens around her.
    if (player.car) {
      const model = CAR_MODELS[player.car.model];
      audio.engine(true, clamp01(Math.abs(player.car.speed) / model.top));
    } else audio.engine(false, 0);
    let sirenLevel = 0;
    if (state.wanted.stars > 0 && state.cops.length > 0) {
      let nearest = Infinity;
      for (const cop of state.cops) nearest = Math.min(nearest, distance(cop.x, cop.y, player.x, player.y));
      sirenLevel = clamp01(1 - nearest / 720);
    }
    audio.siren(sirenLevel);

    // The camera leans into her motion and stays inside the world.
    const lead = player.car ? 0.34 : 0.12;
    const tx = player.x + (player.vx ?? 0) * lead - viewW / 2;
    const ty = player.y + (player.vy ?? 0) * lead - viewH / 2;
    const k = 1 - Math.exp(-5.2 * dt);
    state.camX += (clamp(tx, 0, Math.max(0, WORLD.width - viewW)) - state.camX) * k;
    state.camY += (clamp(ty, 0, Math.max(0, WORLD.height - viewH)) - state.camY) * k;
    if (viewW >= WORLD.width) state.camX = (WORLD.width - viewW) / 2;
    if (viewH >= WORLD.height) state.camY = (WORLD.height - viewH) / 2;
  }

  function update(dt, input, viewW, viewH) {
    state.elapsed += dt;
    if (input.mute) audio.toggleMute();
    switch (state.screen) {
      case 'title':
        if (input.cont && state.hasSave) startCareer(true, viewW, viewH);
        else if (input.confirm || input.fresh) startCareer(false, viewW, viewH);
        break;
      case 'play':
        if (input.pause) {
          state.screen = 'paused';
          audio.engine(false, 0);
          audio.siren(0);
        } else simulate(dt, input, viewW, viewH);
        break;
      case 'paused':
        if (input.pause || input.confirm) state.screen = 'play';
        break;
      case 'busted':
      case 'wasted':
        if (input.confirm) respawn();
        break;
      case 'finale':
        if (input.confirm) state.screen = 'play';
        break;
      default:
        break;
    }
  }

  return { state, update, startCareer, audio, STEP };
}
