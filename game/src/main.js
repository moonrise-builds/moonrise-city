// Boot and the one loop. The world advances in fixed 1/60 s steps — several in a slow
// frame, none in a fast one — and the renderer paints what is there. One-shot presses
// (taking a car, pausing, confirming a screen) ride only the first step of a frame, so a
// single tap can never fire twice through a catch-up burst.
//
// ?seed=N fixes the city. ?shot=start|play|chase|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady.

import { STEP } from './config.js';
import { createGame } from './game.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 2147483646) + 1;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);

function heldOnly(frame) {
  return {
    ...frame,
    punch: false, interact: false, confirm: false, pause: false,
    mute: false, cont: false, fresh: false,
  };
}

if (shot) {
  const game = stageShot(shot, seed);
  window.__game = game;
  let painted = 0;
  const paint = () => {
    renderer.draw(game.state);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else {
  const game = createGame(seed);
  window.__game = game;
  const input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();
  let announced = '';

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state.screen === 'play') game.state.screen = 'paused';
  });

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (input.hasGestured()) game.audio.unlock();
    const frameInput = input.frame();
    let first = true;
    while (accumulator >= STEP) {
      game.update(STEP, first ? frameInput : heldOnly(frameInput), renderer.viewW, renderer.viewH);
      first = false;
      accumulator -= STEP;
    }
    renderer.draw(game.state);
    if (game.state.screen !== announced) {
      announced = game.state.screen;
      status.textContent = `Moonrise City — ${announced} screen.`;
    }
  }
  requestAnimationFrame(frame);
}
