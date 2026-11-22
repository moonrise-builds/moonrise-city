// A small seeded random generator (mulberry32) with the helpers the city builder and the
// traffic director reach for. The same seed always grows the same city, which is what makes
// the screenshot scenes repeatable and the playtests honest.

export function createRandom(seed) {
  let a = seed | 0;
  function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** A float in [min, max). */
  random.range = (min, max) => min + random() * (max - min);
  /** An integer in [min, max], both ends included. */
  random.int = (min, max) => min + Math.floor(random() * (max - min + 1));
  /** True with probability p. */
  random.chance = (p) => random() < p;
  /** One element of a non-empty array. */
  random.pick = (list) => list[Math.floor(random() * list.length)];
  return random;
}
