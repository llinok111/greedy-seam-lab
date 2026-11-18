import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { makeTerrain } from '../src/core.mjs';

const dims = { nx: 64, ny: 28, nz: 64 };
const seed = 20261118;
const t = makeTerrain(dims.nx, dims.ny, dims.nz, seed);
const grid = Array.from(t.grid, (v) => String(v)).join('');
const doc = { format: 'greedy-seam-lab/terrain-v1', dims, seed, grid };
const text = JSON.stringify(doc);
mkdirSync('data', { recursive: true });
writeFileSync('data/terrain.json', text);
const sha = createHash('sha256').update(text).digest('hex');
let solid = 0;
for (const v of t.grid) if (v) solid++;
console.log(`terrain ${dims.nx}x${dims.ny}x${dims.nz} voxels=${t.grid.length} solid=${solid} sha256=${sha}`);
