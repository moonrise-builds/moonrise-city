// Small geometry and formatting helpers shared by every system. Nothing here knows about
// the game; it is angles, rectangles and strings all the way down.

export const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Smooth 0-to-1 ramp between two edges, for the day cycle's light changes. */
export function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function distance(x0, y0, x1, y1) {
  return Math.hypot(x1 - x0, y1 - y0);
}

export function distanceSq(x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  return dx * dx + dy * dy;
}

/** The shortest signed turn from one angle to another, in (-PI, PI]. */
export function angleDelta(from, to) {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}

export function angleLerp(from, to, t) {
  return from + angleDelta(from, to) * t;
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

/**
 * Push a circle out of a rectangle along the smallest exit. Returns true when the circle was
 * touching; the circle's x/y are moved in place. Buildings and the shoreline are resolved
 * with this one routine by the player and by every car.
 */
export function resolveCircleRect(circle, rect) {
  const nearX = clamp(circle.x, rect.x, rect.x + rect.w);
  const nearY = clamp(circle.y, rect.y, rect.y + rect.h);
  const dx = circle.x - nearX;
  const dy = circle.y - nearY;
  const d2 = dx * dx + dy * dy;
  if (d2 > circle.r * circle.r) return false;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    circle.x = nearX + (dx / d) * circle.r;
    circle.y = nearY + (dy / d) * circle.r;
    return true;
  }
  // The centre is inside the rect: leave by the nearest face.
  const left = circle.x - rect.x;
  const right = rect.x + rect.w - circle.x;
  const top = circle.y - rect.y;
  const bottom = rect.y + rect.h - circle.y;
  const min = Math.min(left, right, top, bottom);
  if (min === left) circle.x = rect.x - circle.r;
  else if (min === right) circle.x = rect.x + rect.w + circle.r;
  else if (min === top) circle.y = rect.y - circle.r;
  else circle.y = rect.y + rect.h + circle.r;
  return true;
}

/** "$1,250" — the HUD's money format. */
export function formatMoney(value) {
  return '$' + Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Minutes since midnight as "21:40". */
export function formatClock(minutes) {
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}
