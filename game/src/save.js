// The career save: one JSON record in localStorage — money, reputation, story progress and
// lifetime stats. Every access is guarded: with storage off (private windows, some embeds)
// the game simply runs unsaved rather than failing.

import { SAVE_KEY } from './config.js';

export function loadCareer() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || typeof data.money !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function storeCareer(career) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(career));
  } catch {
    // Storage can be off: the career then lasts this visit only.
  }
}

export function wipeCareer() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to wipe with storage off.
  }
}
