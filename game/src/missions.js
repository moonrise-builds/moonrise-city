// The work: Zara Vale's courier jobs. Five story missions arrive by phone — a bank deposit,
// a dusk run to the yacht club, a hot parcel the whole bay wants, a three-drop evening, and
// the Moonrise Tower finale — and when the story is told the phone keeps ringing with
// free-roam drops that pay by distance. Every job is the same shape: reach the pickup,
// carry the parcel, beat the clock to the door. Reputation turns pay into titles.

import { addHeat } from './police.js';
import { distance } from './util.js';

export const TITLES = [
  { rep: 0, name: 'Nobody' },
  { rep: 40, name: 'Runner' },
  { rep: 120, name: 'Courier' },
  { rep: 260, name: 'Fixer' },
  { rep: 450, name: 'Wheelman' },
  { rep: 700, name: 'Ghost of the Bay' },
  { rep: 1000, name: 'Moonrise Legend' },
];

export function titleFor(rep) {
  let current = TITLES[0].name;
  for (const title of TITLES) if (rep >= title.rep) current = title.name;
  return current;
}

const STORY = [
  {
    name: 'First Run',
    pickup: 'bank', deliver: 'darya', pay: 450, timer: null, unlockGun: true,
    brief: 'Zara. First job, simple one: a deposit case at Crescent Bank. Take it to the Grand Darya. Drive like you belong here.',
  },
  {
    name: 'Yacht Club Social',
    pickup: 'marina', deliver: 'yachtClub', pay: 620, timer: 200, setTime: 18 * 60 + 40,
    brief: 'Documents for the yacht club, pickup at the marina office. Dusk is when the bay behaves. Do not keep them waiting.',
  },
  {
    name: 'Hot Cargo',
    pickup: 'depot', deliver: 'northMarket', pay: 950, timer: 260, presetHeat: 42,
    brief: 'South Depot. The parcel is warm and the MCPD will notice the moment you lift it. Lose them or outrun them — just deliver.',
  },
  {
    name: 'Three Drops',
    pickup: 'darya', drops: ['bank', 'marina', 'tower'], pay: 1250, timer: 330,
    brief: 'An evening of doors: Grand Darya first, then the bank, the marina, and Moonrise Tower. Three drops, one tank of nerve.',
  },
  {
    name: 'Moonrise Finale',
    pickup: 'bank', deliver: 'tower', pay: 2100, timer: 230, setTime: 21 * 60 + 30, presetHeat: 78,
    brief: 'Last one, Zara. Bank to Moonrise Tower, under the moon, with half the city watching. Bring it home and the bay is yours.',
  },
];

const JOB_NAMES = ['Quick Drop', 'Bay Run', 'Cash Carry', 'Suite Service', 'Harbour Errand', 'Night Parcel'];
const JOB_BRIEFS = [
  'Small parcel, honest money. {from} to {to}.',
  'A client who pays on the door. {from} to {to}.',
  'No questions in the bag, none asked. {from} to {to}.',
];

function poi(state, key) {
  return state.city.pois[key];
}

function phone(state, text) {
  state.phone.push({ from: 'DISPATCH', text, t: 7 });
  state.events.push({ type: 'phone' });
}

function beginMission(state, def, isStory) {
  if (def.setTime !== undefined && def.setTime !== null) state.timeMin = def.setTime;
  const start = poi(state, def.pickup);
  state.mission = {
    name: def.name,
    isStory,
    stage: 'pickup',
    target: { x: start.x, y: start.y, label: start.label },
    targetLabel: `Pick up at ${start.label}`,
    timer: null,
    timerMax: null,
    pay: def.pay,
    def,
    dropsLeft: def.drops ? [...def.drops] : [],
  };
  phone(state, def.brief);
}

function generateJob(state) {
  const keys = Object.keys(state.city.pois);
  const fromKey = state.rng.pick(keys);
  let toKey = state.rng.pick(keys);
  if (toKey === fromKey) toKey = keys[(keys.indexOf(fromKey) + 2) % keys.length];
  const from = poi(state, fromKey);
  const to = poi(state, toKey);
  const dist = distance(from.x, from.y, to.x, to.y);
  const pay = Math.round(240 + dist * 0.32);
  const brief = state.rng.pick(JOB_BRIEFS).replace('{from}', from.label).replace('{to}', to.label);
  return {
    name: state.rng.pick(JOB_NAMES),
    pickup: fromKey, deliver: toKey, pay,
    timer: Math.round(dist / 265 + 55),
    brief,
  };
}

function completeMission(state) {
  const mission = state.mission;
  state.money += mission.pay;
  state.rep += Math.ceil(mission.pay / 25);
  state.stats.earned += mission.pay;
  state.stats.missionsDone += 1;
  state.carrying = false;
  state.events.push({ type: 'cash' }, { type: 'sting' }, { type: 'career' });
  phone(state, `Delivered. ${mission.pay} dollars, clean. — Dispatch`);
  if (mission.def.unlockGun && !state.hasGun) {
    state.hasGun = true;
    phone(state, 'You earned a sidearm. Mouse aims, click fires. Spend it wisely.');
  }
  const wasFinale = mission.isStory && state.storyIndex === STORY.length - 1;
  if (mission.isStory) state.storyIndex += 1;
  state.mission = null;
  state.missionCooldown = 7;
  if (wasFinale) state.events.push({ type: 'storyComplete' });
}

function failMission(state) {
  phone(state, 'Too slow — the client walked. Stay sharp, the phone will ring again.');
  state.carrying = false;
  state.mission = null;
  state.missionCooldown = 6;
}

/** The job machine: offers, pickups, drops, timers, payouts. Runs once per step. */
export function updateMissions(state, dt) {
  if (!state.mission) {
    state.missionCooldown -= dt;
    if (state.missionCooldown <= 0) {
      if (state.storyIndex < STORY.length) beginMission(state, STORY[state.storyIndex], true);
      else beginMission(state, generateJob(state), false);
    }
    return;
  }
  const mission = state.mission;
  const player = state.player;
  if (mission.stage === 'deliver' && mission.timer !== null) {
    mission.timer -= dt;
    if (mission.timer <= 0) {
      failMission(state);
      return;
    }
  }
  const reach = player.car ? 62 : 44;
  if (distance(player.x, player.y, mission.target.x, mission.target.y) > reach) return;

  if (mission.stage === 'pickup') {
    state.carrying = true;
    state.events.push({ type: 'pickup' });
    if (mission.def.presetHeat) addHeat(state, mission.def.presetHeat);
    mission.stage = 'deliver';
    if (mission.def.timer) {
      mission.timer = mission.def.timer;
      mission.timerMax = mission.def.timer;
    }
    advanceTarget(state);
  } else if (mission.dropsLeft.length > 0) {
    state.money += 120;
    state.events.push({ type: 'cash' });
    phone(state, 'Drop made. Keep moving.');
    advanceTarget(state);
  } else {
    completeMission(state);
  }
}

function advanceTarget(state) {
  const mission = state.mission;
  const key = mission.dropsLeft.length > 0 ? mission.dropsLeft.shift() : mission.def.deliver;
  const dest = poi(state, key);
  mission.target = { x: dest.x, y: dest.y, label: dest.label };
  mission.targetLabel = `Deliver to ${dest.label}`;
}

/** The one-line objective the HUD banner shows for the current job. */
export function objectiveText(state) {
  if (!state.mission) return 'Free roam — the phone will ring';
  return state.mission.targetLabel;
}
