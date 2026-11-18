import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  makeTerrain, exposedFaces, greedyMerge, greedyMesh, stitchQuads, meshAudit,
  detectMeshTJunctions, detectTJunctions, hashMesh,
} from '../src/core.mjs';

const dims = { nx: 64, ny: 28, nz: 64 };
const seed = 20261118;
function once() {
  const t = makeTerrain(dims.nx, dims.ny, dims.nz, seed);
  const f = exposedFaces(t.grid, t.dims);
  const q = greedyMerge(f, t.dims);
  const s = stitchQuads(q);
  const a = meshAudit(s.positions, s.indices);
  const tj = detectMeshTJunctions(s.positions, s.indices);
  return { f, q, s, a, tj };
}
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  const p95 = s[Math.min(n - 1, Math.ceil(0.95 * n) - 1)];
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  return { min: +s[0].toFixed(3), median: +median.toFixed(3), p95: +p95.toFixed(3), max: +s[n - 1].toFixed(3), mean: +mean.toFixed(3), stddev: +sd.toFixed(3), rsdPct: +(100 * sd / mean).toFixed(2), samples: n };
};
function timeIt(fn) {
  const t0 = performance.now();
  const v = fn();
  return { ms: performance.now() - t0, v };
}
const coldStart = timeIt(once).ms;
once();
const runs = [];
const breakdown = { naive: [], greedyMerge: [], stitch: [], audit: [], tJunctionScan: [] };
for (let i = 0; i < 9; i++) {
  const r = timeIt(once);
  runs.push(r.ms);
  const t = makeTerrain(dims.nx, dims.ny, dims.nz, seed);
  const f = exposedFaces(t.grid, t.dims);
  const n = greedyMesh(f.map((x) => ({ ...x, u0: x.u, v0: x.v, w: 1, h: 1 })));
  const q = greedyMerge(f, t.dims);
  const s = stitchQuads(q);
  breakdown.naive.push(meshAudit(n.positions, n.indices).triangles);
  breakdown.greedyMerge.push(q.length);
  breakdown.stitch.push(s.triangles);
  breakdown.audit.push(meshAudit(s.positions, s.indices).boundaryEdges);
  breakdown.tJunctionScan.push(detectMeshTJunctions(s.positions, s.indices).count);
}
const r = once();
const naive = greedyMesh(r.f.map((x) => ({ ...x, u0: x.u, v0: x.v, w: 1, h: 1 })));
const greedy = greedyMesh(r.q);
const naiveAudit = meshAudit(naive.positions, naive.indices);
const greedyAudit = meshAudit(greedy.positions, greedy.indices);
const greedyTj = detectMeshTJunctions(greedy.positions, greedy.indices);
const result = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  corpus: { dims, seed, voxels: dims.nx * dims.ny * dims.nz },
  counts: {
    exposedFaces: r.f.length,
    greedyQuads: r.q.length,
    naiveTriangles: naiveAudit.triangles,
    greedyTriangles: greedyAudit.triangles,
    stitchedTriangles: r.a.triangles,
    triangleReductionVsNaivePct: +(100 * (1 - r.a.triangles / naiveAudit.triangles)).toFixed(2),
    greedyTJs: greedyTj.count,
    greedyBoundaryEdges: greedyAudit.boundaryEdges,
    stitchedTJs: r.tj.count,
    stitchedBoundaryEdges: r.a.boundaryEdges,
    stitchedNonManifoldEdges: r.a.nonManifoldEdges,
    stitchedArea: r.a.area,
    areaRelErr: +(Math.abs(r.a.area - r.f.length) / r.f.length).toExponential(2),
    stitchedVertices: r.s.positions.length / 3,
  },
  timings: {
    coldStartMs: +coldStart.toFixed(3),
    pipelineMs: stats(runs),
    countsStable: {
      quads: breakdown.greedyMerge.every((x) => x === breakdown.greedyMerge[0]),
      stitchedTriangles: breakdown.stitch.every((x) => x === breakdown.stitch[0]),
      stitchedBoundaryEdges: breakdown.audit.every((x) => x === 0),
      stitchedTJs: breakdown.tJunctionScan.every((x) => x === 0),
    },
  },
  hashes: {
    stitchedMesh: hashMesh(r.s.positions, r.s.indices),
    stitchedMeshRepeat: hashMesh(once().s.positions, once().s.indices),
    terrain: hashMesh(new Float64Array(Array.from(makeTerrain(dims.nx, dims.ny, dims.nz, seed).grid)), new Uint32Array(0)),
  },
};
writeFileSync('bench/result.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
