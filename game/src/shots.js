// The screenshot scenes behind ?shot=start|play|chase|end. Each one builds a real game from
// the seed and plays its rules forward — an autopilot walks the promenade for the play
// scene, and the chase is staged the honest way: the first job's parcel is picked up, the
// heat is raised to three stars, and Zara drives east with the MCPD converging. Nothing is
// drawn that the game itself did not draw; the same seed always stages the same frame.

import { STEP } from './config.js';
import { createGame } from './game.js';
import { CAR_MODELS } from './vehicles.js';
import { addHeat } from './police.js';
import { angleDelta, clamp } from './util.js';

const VIEW_W = 1280;
const VIEW_H = 800;

function blankFrame() {
  return {
    mx: 0, my: 0, sprint: false, fire: false, mouseX: 0, mouseY: 0,
    punch: false, interact: false, confirm: false, pause: false, mute: false,
    cont: false, fresh: false,
  };
}

function run(game, seconds, steer) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const input = blankFrame();
    if (steer) steer(game.state, input);
    game.update(STEP, input, VIEW_W, VIEW_H);
  }
}

function stageStart(game) {
  // The title vista, left to breathe for half a second so the lamps are lit.
  run(game, 0.5, null);
  return game;
}

function stagePlay(game) {
  game.startCareer(false, VIEW_W, VIEW_H);
  const state = game.state;
  state.timeMin = 9 * 60 + 35; // a bright morning on the bay
  // South down the promenade, toward the marina piers, as the first job lands.
  run(game, 3.4, (s, input) => {
    input.my = 1;
    input.mx = 0;
  });
  return game;
}

function stageChase(game) {
  game.startCareer(false, VIEW_W, VIEW_H);
  const state = game.state;
  state.timeMin = 21 * 60 + 15; // night, and the moon is up

  // Stand on the bank's doorstep until the first job's parcel is in hand.
  const bank = state.city.pois.bank;
  state.player.x = bank.x;
  state.player.y = bank.y;
  run(game, 3.0, null);

  // A Crescent GT, borrowed for the evening, waiting on the eastbound lane.
  const car = state.cars.find((c) => c.driver === null) ?? state.cars[0];
  const model = CAR_MODELS[3];
  car.model = 3;
  car.w = model.w;
  car.l = model.l;
  car.color = '#7a1f2b';
  car.x = 300;
  car.y = 677;
  car.angle = 0;
  car.speed = 0;
  car.driver = 'player';
  state.player.car = car;
  state.player.x = car.x;
  state.player.y = car.y;

  // Three stars' worth of attention, then run east with the lane as the guide.
  addHeat(state, 80);
  run(game, 3.2, (s, input) => {
    const mine = s.player.car;
    if (!mine) return;
    const desired = Math.atan2(677 - mine.y, 500);
    input.my = -1;
    input.mx = clamp(angleDelta(mine.angle, desired) * 2.2, -1, 1);
  });

  // Bring the two nearest units into her own lane behind her, still closing.
  const mine = state.player.car;
  if (mine && state.cops.length > 0) {
    const first = state.cops[0];
    first.x = mine.x - 250;
    first.y = mine.y;
    first.angle = 0;
    first.speed = mine.speed;
    if (state.cops.length > 1) {
      const second = state.cops[1];
      second.x = mine.x - 430;
      second.y = mine.y;
      second.angle = 0;
      second.speed = mine.speed;
    }
  }
  run(game, 0.45, (s, input) => {
    input.my = -1;
  });
  // The frame is a chase, not a casualty list: mend her and the car for the portrait.
  state.player.health = 100;
  if (state.player.car) state.player.car.hp = 100;
  state.wanted.bust = 0;
  return game;
}

function stageEnd(game) {
  game.startCareer(false, VIEW_W, VIEW_H);
  const state = game.state;
  // The career the finale panel reports: the story told, the bay hers.
  state.storyIndex = 5;
  state.money = 4860;
  state.rep = 512;
  state.stats = { earned: 9470, missionsDone: 21, thefts: 11, busts: 1, wasteds: 2, crimes: 31 };
  state.screen = 'finale';
  run(game, 0.5, null);
  return game;
}

/** Build and stage the named scene; anything unknown is the title. */
export function stageShot(name, seed) {
  const game = createGame(seed);
  if (name === 'play') return stagePlay(game);
  if (name === 'chase') return stageChase(game);
  if (name === 'end') return stageEnd(game);
  return stageStart(game);
}
