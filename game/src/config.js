// Moonrise City — every shared tuning number and colour in one place. The world is a fixed
// 3600x2600 waterfront city; the camera shows a window of it at 1:1 scale, so nothing below
// depends on the screen size.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const WORLD = {
  width: 3600,
  height: 2600,
  /** East of this line is the bay; west of it, city. */
  shoreX: 3000,
  /** The promenade runs along the shore from this line to the water. */
  promenadeX: 2820,
  roadWidth: 120,
};

export const TIME = {
  /** The career opens at 09:00 on day one. */
  startMinutes: 9 * 60,
  /** Game minutes per real second while playing: a full day lasts twelve real minutes. */
  minutesPerSecond: 2,
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 178,
  sprintSpeed: 268,
  maxHealth: 100,
  /** Health regained per second while out of trouble. */
  regenPerSecond: 2.2,
  punchRange: 46,
  punchCooldown: 0.34,
  gunCooldown: 0.17,
  gunRange: 560,
};

export const SAVE_KEY = 'moonrise-city.career.v1';

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const PALETTE = {
  backdrop: '#0b0e1a',
  waterDay: '#1d5069',
  waterNight: '#0c2237',
  land: '#222635',
  park: '#1d3d2f',
  parkPath: '#3a415a',
  promenade: '#5c564a',
  sidewalk: '#484d63',
  asphalt: '#2d3143',
  lotAsphalt: '#272b3a',
  roadLine: '#cfd4e2',
  crosswalk: '#aab0c2',
  gold: '#f2c14e',
  warmLight: '#ffd9a0',
  text: '#eef1f8',
  muted: '#9aa3ba',
  danger: '#e5534b',
  policeBlue: '#3f7de0',
  policeRed: '#e5534b',
  health: '#57c46a',
  panel: 'rgba(13, 16, 30, 0.88)',
  panelEdge: '#3d4a6b',
};

/** Building top colours: silvers and indigos, the Moonrise look. Roofs are drawn darker. */
export const BUILDING_SKINS = [
  { top: '#8d99ae', side: '#5d6880' },
  { top: '#a7b0c2', side: '#707c96' },
  { top: '#6c7a94', side: '#49536b' },
  { top: '#98a2b8', side: '#66718c' },
  { top: '#7f8ca3', side: '#55617a' },
  { top: '#b0a58e', side: '#7d7460' },
];
