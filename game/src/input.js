// Keyboard and mouse input, gathered into one frame object the simulation reads. Held keys
// and the pointer give continuous values (move axes, aim point, fire); taps give one-shot
// flags that are queued and taken exactly once, so a press between two frames is never lost
// and never counted twice.

const KEYMAP = {
  up: new Set(['KeyW', 'ArrowUp']),
  down: new Set(['KeyS', 'ArrowDown']),
  left: new Set(['KeyA', 'ArrowLeft']),
  right: new Set(['KeyD', 'ArrowRight']),
  sprint: new Set(['ShiftLeft', 'ShiftRight']),
  interact: new Set(['KeyE']),
  punch: new Set(['KeyF']),
  confirm: new Set(['Enter', 'Space']),
  pause: new Set(['KeyP', 'Escape']),
  mute: new Set(['KeyM']),
  cont: new Set(['KeyC']),
  fresh: new Set(['KeyN']),
};

function inSet(set, code) {
  return set.has(code);
}

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, sprint: false };
  const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 3, down: false };
  let queued = { punch: false, interact: false, confirm: false, pause: false, mute: false, cont: false, fresh: false };
  let gestured = false;

  window.addEventListener('keydown', (event) => {
    gestured = true;
    if (inSet(KEYMAP.up, event.code)) held.up = true;
    else if (inSet(KEYMAP.down, event.code)) held.down = true;
    else if (inSet(KEYMAP.left, event.code)) held.left = true;
    else if (inSet(KEYMAP.right, event.code)) held.right = true;
    else if (inSet(KEYMAP.sprint, event.code)) held.sprint = true;
    else if (!event.repeat && inSet(KEYMAP.punch, event.code)) queued.punch = true;
    else if (!event.repeat && inSet(KEYMAP.interact, event.code)) queued.interact = true;
    else if (!event.repeat && inSet(KEYMAP.confirm, event.code)) queued.confirm = true;
    else if (!event.repeat && inSet(KEYMAP.pause, event.code)) queued.pause = true;
    else if (!event.repeat && inSet(KEYMAP.mute, event.code)) queued.mute = true;
    else if (!event.repeat && inSet(KEYMAP.cont, event.code)) queued.cont = true;
    else if (!event.repeat && inSet(KEYMAP.fresh, event.code)) queued.fresh = true;
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (inSet(KEYMAP.up, event.code)) held.up = false;
    else if (inSet(KEYMAP.down, event.code)) held.down = false;
    else if (inSet(KEYMAP.left, event.code)) held.left = false;
    else if (inSet(KEYMAP.right, event.code)) held.right = false;
    else if (inSet(KEYMAP.sprint, event.code)) held.sprint = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.up = held.down = held.left = held.right = held.sprint = false;
    mouse.down = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });
  canvas.addEventListener('pointerdown', (event) => {
    gestured = true;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.down = true;
    queued.confirm = true;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });

  return {
    /** True once the player has pressed or clicked anything: the moment sound may start. */
    hasGestured() {
      return gestured;
    },
    /**
     * The frame's input: mx/my are the held move axes (-1..1), mouse is the pointer in CSS
     * pixels, fire is the held pointer button, and the rest are one-shot taps, cleared by
     * this call.
     */
    frame() {
      const taken = {
        mx: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        my: (held.down ? 1 : 0) - (held.up ? 1 : 0),
        sprint: held.sprint,
        fire: mouse.down,
        mouseX: mouse.x,
        mouseY: mouse.y,
        punch: queued.punch,
        interact: queued.interact,
        confirm: queued.confirm,
        pause: queued.pause,
        mute: queued.mute,
        cont: queued.cont,
        fresh: queued.fresh,
      };
      queued = { punch: false, interact: false, confirm: false, pause: false, mute: false, cont: false, fresh: false };
      return taken;
    },
    /** A silent frame for the screenshot scenes, which steer themselves. */
    emptyFrame() {
      return {
        mx: 0, my: 0, sprint: false, fire: false, mouseX: 0, mouseY: 0,
        punch: false, interact: false, confirm: false, pause: false, mute: false,
        cont: false, fresh: false,
      };
    },
  };
}
