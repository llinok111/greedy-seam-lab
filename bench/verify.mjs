import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  makeTerrain, exposedFaces, greedyMerge, faceSetDiff, greedyMesh, stitchQuads,
  meshAudit, detectMeshTJunctions, hashMesh,
} from '../src/core.mjs';

let passed = 0, failed = 0;
const check = (name, ok, actual, expected) => {
  if (ok) { passed++; console.log(`PASS ${name}: ${actual}`); }
  else { failed++; console.log(`FAIL ${name}: actual=${actual} expected=${expected}`); }
};
const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));

const doc = JSON.parse(readFileSync('data/terrain.json', 'utf8'));
check('sample format', doc.format === 'greedy-seam-lab/terrain-v1', doc.format, 'greedy-seam-lab/terrain-v1');
check('sample dims', doc.dims.nx === 64 && doc.dims.ny === 28 && doc.dims.nz === 64, JSON.stringify(doc.dims), '64x28x64');
check('sample grid length', doc.grid.length === 64 * 28 * 64, doc.grid.length, 64 * 28 * 64);
const grid = Uint8Array.from(doc.grid, (c) => c.charCodeAt(0) - 48);
const dims = doc.dims;

const t0 = performance.now();
const terrain = makeTerrain(dims.nx, dims.ny, dims.nz, doc.seed);
const sameTerrain = createHash('sha256').update(Array.from(terrain.grid).join('')).digest('hex')
  === createHash('sha256').update(Array.from(grid).join('')).digest('hex');
check('generator determinism', sameTerrain, sameTerrain ? 'identical' : 'different', 'identical');

const faces = exposedFaces(grid, dims);
const quads = greedyMerge(faces, dims);
const diff = faceSetDiff(faces, quads);
check('exposed faces', faces.length > 10000, faces.length, '> 10000');
check('face-set missing', diff.missing === 0, diff.missing, 0);
check('face-set extra', diff.extra === 0, diff.extra, 0);
check('face-set counts equal', diff.aCount === diff.bCount, `${diff.aCount}=${diff.bCount}`, 'equal');

const naive = greedyMesh(faces.map((f) => ({ ...f, u0: f.u, v0: f.v, w: 1, h: 1 })));
const greedy = greedyMesh(quads);
const stitched = stitchQuads(quads);
const naiveAudit = meshAudit(naive.positions, naive.indices);
const greedyAudit = meshAudit(greedy.positions, greedy.indices);
const stitchAudit = meshAudit(stitched.positions, stitched.indices);
const tjNaive = detectMeshTJunctions(naive.positions, naive.indices);
const tjGreedy = detectMeshTJunctions(greedy.positions, greedy.indices);
const tjStitched = detectMeshTJunctions(stitched.positions, stitched.indices);

check('naive T-junctions', tjNaive.count === 0, tjNaive.count, 0);
check('greedy has T-junctions', tjGreedy.count > 1000, tjGreedy.count, '> 1000');
check('greedy boundary edges', greedyAudit.boundaryEdges > 1000, greedyAudit.boundaryEdges, '> 1000');
check('stitched T-junctions', tjStitched.count === 0, tjStitched.count, 0);
check('stitched boundary edges', stitchAudit.boundaryEdges === 0, stitchAudit.boundaryEdges, 0);
check('stitched non-manifold edges', stitchAudit.nonManifoldEdges === 0, stitchAudit.nonManifoldEdges, 0);
check('stitched degenerate triangles', stitchAudit.degenerate === 0, stitchAudit.degenerate, 0);
check('stitched winding flips', stitched.flipped === 0, stitched.flipped, 0);
check('stitched triangles', stitchAudit.triangles < naiveAudit.triangles * 0.7,
  `${stitchAudit.triangles} vs ${naiveAudit.triangles} (${(100 * (1 - stitchAudit.triangles / naiveAudit.triangles)).toFixed(2)}% fewer)`, '< 70%');
check('area conservation', rel(stitchAudit.area, faces.length) < 1e-9,
  `${stitchAudit.area} vs ${faces.length} (rel ${rel(stitchAudit.area, faces.length).toExponential(2)})`, '< 1e-9');
check('greedy vs stitched triangle cost', stitchAudit.triangles > greedyAudit.triangles,
  `${greedyAudit.triangles} -> ${stitchAudit.triangles}`, 'stitching adds triangles');
check('greedy T-junction sample', tjGreedy.samples.length > 0, JSON.stringify(tjGreedy.samples[0] || null), 'a witness');

const p2 = { nx: dims.nx, ny: dims.ny, nz: dims.nz };
const run2 = (() => {
  const g = makeTerrain(p2.nx, p2.ny, p2.nz, doc.seed).grid;
  const f = exposedFaces(g, p2);
  const q = greedyMerge(f, p2);
  const s = stitchQuads(q);
  return hashMesh(s.positions, s.indices);
})();
check('mesh hash determinism', run2 === hashMesh(stitched.positions, stitched.indices),
  `${run2} vs ${hashMesh(stitched.positions, stitched.indices)}`, 'equal');
check('stitched vertex count', stitched.positions.length / 3 < 20000, stitched.positions.length / 3, '< 20000');

const ms = performance.now() - t0;
console.log(`\n${passed} passed, ${failed} failed in ${ms.toFixed(1)} ms`);
console.log(`SUMMARY faces=${faces.length} quads=${quads.length} tGreedy=${tjGreedy.count} tStitched=${tjStitched.count} trisNaive=${naiveAudit.triangles} trisGreedy=${greedyAudit.triangles} trisStitched=${stitchAudit.triangles} hash=${hashMesh(stitched.positions, stitched.indices)}`);
process.exit(failed === 0 ? 0 : 1);
