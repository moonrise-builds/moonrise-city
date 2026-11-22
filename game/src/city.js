// The city itself: a seeded waterfront grid grown once at boot — six avenues, six streets,
// the blocks between them filled with towers, parks and parking lots, and the bay to the
// east with its promenade, marina piers and yachts. Everything the other systems need to
// know about the ground lives here: building collision, the waterline, parking spots,
// pedestrian tracks and the named places missions travel between.

import { WORLD } from './config.js';
import { BUILDING_SKINS } from './config.js';
import { clamp, pointInRect, resolveCircleRect } from './util.js';

export const V_ROADS = [200, 700, 1200, 1700, 2200, 2760];
export const H_ROADS = [200, 650, 1100, 1550, 2000, 2420];

/** Block bands between the roads, west-east and north-south: pedestrian rings follow them. */
export const X_BANDS = [[0, 140], [260, 640], [760, 1140], [1260, 1640], [1760, 2140], [2260, 2700]];
export const Y_BANDS = [[0, 140], [260, 590], [710, 1040], [1160, 1490], [1610, 1940], [2060, 2360], [2480, 2600]];

const HOTEL_NAMES = ['Palms Hotel', 'Azure Court', 'Solace Tower', 'Harbour Lights', 'Vista Grand', 'Opal Residences', 'Marina Pearl', 'Sunspire House', 'The Meridian', 'Crescent Suites', 'Darya Exchange', 'The Sable'];

function bandRect(col, row) {
  const [x0, x1] = X_BANDS[col];
  const [y0, y1] = Y_BANDS[row];
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function generateCity(rng) {
  const buildings = [];
  const parks = [];
  const lots = [];
  const palms = [];
  const parkSpots = [];
  const lamps = [];

  function addBuilding(rect, height, name = null, landmark = false) {
    const building = {
      x: rect.x, y: rect.y, w: rect.w, h: rect.h,
      hgt: height,
      skin: rng.int(0, BUILDING_SKINS.length - 1),
      seed: rng.int(1, 0x7fffffff),
      name,
      landmark,
    };
    buildings.push(building);
    return building;
  }

  // The named places, fixed so the story always travels between the same doors.
  const towerBlock = bandRect(5, 2);
  const tower = addBuilding(
    { x: towerBlock.x + 130, y: towerBlock.y + 80, w: 170, h: 170 },
    320, 'Moonrise Tower', true,
  );
  const bankBlock = bandRect(1, 1);
  const bank = addBuilding(
    { x: bankBlock.x + 70, y: bankBlock.y + 70, w: 240, h: 180 },
    170, 'Crescent Bank', true,
  );
  const daryaBlock = bandRect(5, 3);
  const darya = addBuilding(
    { x: daryaBlock.x + 60, y: daryaBlock.y + 70, w: 310, h: 180 },
    130, 'Grand Darya', true,
  );
  const policeBlock = bandRect(1, 4);
  const policeStation = addBuilding(
    { x: policeBlock.x + 80, y: policeBlock.y + 80, w: 220, h: 150 },
    74, 'MCPD Central', true,
  );
  const hospitalBlock = bandRect(3, 0);
  const hospital = addBuilding(
    { x: hospitalBlock.x + 50, y: hospitalBlock.y + 12, w: 280, h: 112 },
    88, 'Moonrise General', true,
  );
  const landmarkBlocks = new Set(['5,2', '1,1', '5,3', '1,4', '3,0']);

  let nameIndex = 0;
  for (let col = 0; col < X_BANDS.length; col += 1) {
    for (let row = 0; row < Y_BANDS.length; row += 1) {
      if (landmarkBlocks.has(`${col},${row}`)) continue;
      const block = bandRect(col, row);
      const roll = rng();
      if (roll < 0.13 && block.w > 200 && block.h > 200) {
        // A park: palms on grass, a crossing path, no collision but the trunks' shade.
        const park = { ...block, palms: [] };
        const count = rng.int(6, 11);
        for (let i = 0; i < count; i += 1) {
          const palm = { x: block.x + rng.range(24, block.w - 24), y: block.y + rng.range(24, block.h - 24), s: rng.range(0.8, 1.25) };
          park.palms.push(palm);
          palms.push(palm);
        }
        parks.push(park);
      } else if (roll < 0.27) {
        // A parking lot: stalls along both long edges, most of them filled at boot.
        lots.push({ ...block });
        const stallW = 30;
        for (let x = block.x + 26; x + stallW < block.x + block.w - 10; x += stallW + 14) {
          parkSpots.push({ x: x + stallW / 2, y: block.y + 34, angle: Math.PI / 2 });
          parkSpots.push({ x: x + stallW / 2, y: block.y + block.h - 34, angle: -Math.PI / 2 });
        }
      } else {
        // Buildings: one statement tower, a pair, or a quad, always inset from the street.
        const layout = rng();
        const inset = 24;
        const inner = { x: block.x + inset, y: block.y + inset, w: block.w - inset * 2, h: block.h - inset * 2 };
        const name = () => (rng.chance(0.4) && nameIndex < HOTEL_NAMES.length ? HOTEL_NAMES[nameIndex++] : null);
        if (layout < 0.42 || inner.w < 190 || inner.h < 190) {
          addBuilding(inner, rng.range(40, 215), name());
        } else if (layout < 0.72) {
          const gap = 18;
          const w = (inner.w - gap) / 2;
          addBuilding({ x: inner.x, y: inner.y, w, h: inner.h }, rng.range(35, 190), name());
          addBuilding({ x: inner.x + w + gap, y: inner.y, w, h: inner.h }, rng.range(35, 190), name());
        } else {
          const gap = 18;
          const w = (inner.w - gap) / 2;
          const h = (inner.h - gap) / 2;
          addBuilding({ x: inner.x, y: inner.y, w, h }, rng.range(30, 150), name());
          addBuilding({ x: inner.x + w + gap, y: inner.y, w, h }, rng.range(30, 150), name());
          addBuilding({ x: inner.x, y: inner.y + h + gap, w, h }, rng.range(30, 150), name());
          addBuilding({ x: inner.x + w + gap, y: inner.y + h + gap, w, h }, rng.range(30, 150), name());
        }
      }
    }
  }

  // (No kerb parking on the avenues: the lots carry the parked cars, and the lanes stay
  // clear for traffic to pass at full width.)

  // Promenade palms and lamps, the marina piers and the yachts at anchor.
  for (let y = 90; y < WORLD.height - 60; y += 118) {
    palms.push({ x: WORLD.shoreX - 18, y, s: rng.range(0.9, 1.2) });
  }
  const piers = [760, 1300, 1840].map((y) => ({ x: WORLD.shoreX, y: y - 28, w: 380, h: 56 }));
  const yachts = [
    { x: 3225, y: 470, angle: 0.2, len: 120 },
    { x: 3340, y: 1010, angle: -0.15, len: 150 },
    { x: 3250, y: 1560, angle: 0.1, len: 105 },
    { x: 3400, y: 2080, angle: -0.25, len: 165 },
    { x: 3180, y: 2330, angle: 0.3, len: 95 },
  ];
  for (const vx of V_ROADS) for (const hy of H_ROADS) lamps.push({ x: vx - 66, y: hy - 66 }, { x: vx + 66, y: hy + 66 });
  for (let y = 130; y < WORLD.height; y += 260) lamps.push({ x: WORLD.shoreX - 8, y });

  const front = (b, dy = 26) => ({ x: b.x + b.w / 2, y: b.y + b.h + dy });
  const pois = {
    bank: { label: 'Crescent Bank', ...front(bank) },
    darya: { label: 'Grand Darya', ...front(darya) },
    tower: { label: 'Moonrise Tower', ...front(tower) },
    police: { label: 'MCPD Central', ...front(policeStation) },
    hospital: { label: 'Moonrise General', x: hospital.x + hospital.w / 2, y: hospital.y + hospital.h + 44 },
    marina: { label: 'Marina Office', x: WORLD.shoreX - 26, y: 1300 },
    yachtClub: { label: 'Yacht Club', x: WORLD.shoreX + 348, y: 1300 },
    depot: { label: 'South Depot', x: 90, y: 2200 },
    northMarket: { label: 'North Market', x: 450, y: 236 },
  };

  const nodes = [];
  for (const vx of V_ROADS) for (const hy of H_ROADS) nodes.push({ x: vx, y: hy });

  function isOnPier(x, y) {
    return piers.some((pier) => pointInRect(x, y, pier));
  }

  function isWater(x, y) {
    return x > WORLD.shoreX && !isOnPier(x, y);
  }

  /**
   * Resolve a circle {x, y, r} against every building, the shoreline and the world edge.
   * Returns true when anything pushed back. Piers are dry land over the bay.
   */
  function collideCircle(circle) {
    let hit = false;
    for (const b of buildings) {
      // Cheap reject before the real test: most buildings are nowhere near.
      if (circle.x + circle.r < b.x - 2 || circle.x - circle.r > b.x + b.w + 2 ||
          circle.y + circle.r < b.y - 2 || circle.y - circle.r > b.y + b.h + 2) continue;
      if (resolveCircleRect(circle, b)) hit = true;
    }
    if (circle.x + circle.r > WORLD.shoreX && !isOnPier(circle.x, circle.y)) {
      // The bay: piers aside, the waterline pushes everything back west.
      if (circle.x - circle.r < WORLD.shoreX) {
        circle.x = WORLD.shoreX - circle.r;
        hit = true;
      } else {
        // Already out in the bay (a pier edge slip): nearest pier face or the shore wins.
        let best = null;
        for (const pier of piers) {
          const candidate = { x: circle.x, y: circle.y, r: circle.r };
          if (resolveCircleRect(candidate, pier)) {
            const moved = Math.abs(candidate.x - circle.x) + Math.abs(candidate.y - circle.y);
            if (!best || moved < best.moved) best = { ...candidate, moved };
          }
        }
        if (best) {
          circle.x = best.x;
          circle.y = best.y;
        } else {
          circle.x = WORLD.shoreX - circle.r;
        }
        hit = true;
      }
    }
    const nx = clamp(circle.x, circle.r, WORLD.width - circle.r);
    const ny = clamp(circle.y, circle.r, WORLD.height - circle.r);
    if (nx !== circle.x || ny !== circle.y) hit = true;
    circle.x = nx;
    circle.y = ny;
    return hit;
  }

  return {
    buildings, parks, lots, palms, piers, yachts, lamps, parkSpots, nodes, pois,
    landmarks: { tower, bank, darya, policeStation, hospital },
    isWater, isOnPier, collideCircle,
  };
}
