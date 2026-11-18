// Baseline: emit one 1x1 quad per exposed voxel face (no greedy merging, no stitching).
import { makeTerrain, exposedFaces, greedyMesh, meshAudit, detectMeshTJunctions } from '../src/core.mjs';

const dims = { nx: 64, ny: 28, nz: 64 };
const t = makeTerrain(dims.nx, dims.ny, dims.nz, 20261118);
const faces = exposedFaces(t.grid, t.dims);
const mesh = greedyMesh(faces.map((f) => ({ ...f, u0: f.u, v0: f.v, w: 1, h: 1 })));
const audit = meshAudit(mesh.positions, mesh.indices);
const tj = detectMeshTJunctions(mesh.positions, mesh.indices);
console.log(JSON.stringify({
  source: 'baseline/naive.mjs',
  faces: faces.length,
  triangles: audit.triangles,
  boundaryEdges: audit.boundaryEdges,
  nonManifoldEdges: audit.nonManifoldEdges,
  tJunctions: tj.count,
  area: audit.area,
}, null, 2));
