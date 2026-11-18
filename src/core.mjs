// Pure ESM geometry core. No three.js, no DOM, no I/O, no globals.
// Unit voxel lattice: every face cell is 1x1; all thresholds are relative.

export const MATERIAL_NAMES = ['empty', 'grass', 'dirt', 'stone'];

export function makeTerrain(nx = 48, ny = 20, nz = 48, seed = 20261118) {
  const grid = new Uint8Array(nx * ny * nz);
  const heights = new Int16Array(nx * nz);
  const at = (x, y, z) => (y * nz + z) * nx + x;
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      const s = seed * 0.0001;
      const n = Math.sin(x * 0.23 + s) + Math.cos(z * 0.19 - s)
        + 0.5 * Math.sin((x + z) * 0.13) + 0.35 * Math.sin((x - z) * 0.31);
      let h = Math.floor(ny * 0.35 + n * 2.2);
      h = Math.max(3, Math.min(ny - 4, h));
      heights[z * nx + x] = h;
      for (let y = 0; y <= h; y++) {
        let mat = y === h ? 1 : (y >= h - 2 ? 2 : 3);
        if (y > 2 && y < h - 1) {
          const c = Math.sin(x * 0.37 + s) + Math.sin(y * 0.61 + z * 0.29)
            + Math.sin((x + z) * 0.17);
          if (c > 2.2) mat = 0;
        }
        if (mat) grid[at(x, y, z)] = mat;
      }
    }
  }
  // Remove diagonal-only voxel contacts that would make the surface edge-non-manifold.
  const at2 = (x, y, z) => (y * nz + z) * nx + x;
  for (let pass = 0; pass < 4; pass++) {
    let changed = 0;
    for (let y = 0; y + 1 < ny; y++) for (let z = 0; z + 1 < nz; z++) for (let x = 0; x < nx; x++) {
      const a = grid[at2(x, y, z)], b = grid[at2(x, y + 1, z)];
      const c = grid[at2(x, y, z + 1)], d = grid[at2(x, y + 1, z + 1)];
      if (a && d && !b && !c) { grid[at2(x, y + 1, z)] = a; changed++; }
      else if (b && c && !a && !d) { grid[at2(x, y, z)] = b; changed++; }
    }
    for (let y = 0; y + 1 < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x + 1 < nx; x++) {
      const a = grid[at2(x, y, z)], b = grid[at2(x + 1, y, z)];
      const c = grid[at2(x, y + 1, z)], d = grid[at2(x + 1, y + 1, z)];
      if (a && d && !b && !c) { grid[at2(x + 1, y, z)] = a; changed++; }
      else if (b && c && !a && !d) { grid[at2(x, y, z)] = b; changed++; }
    }
    for (let y = 0; y < ny; y++) for (let z = 0; z + 1 < nz; z++) for (let x = 0; x + 1 < nx; x++) {
      const a = grid[at2(x, y, z)], b = grid[at2(x + 1, y, z)];
      const c = grid[at2(x, y, z + 1)], d = grid[at2(x + 1, y, z + 1)];
      if (a && d && !b && !c) { grid[at2(x + 1, y, z)] = a; changed++; }
      else if (b && c && !a && !d) { grid[at2(x, y, z)] = b; changed++; }
    }
    if (!changed) break;
  }
  return { dims: { nx, ny, nz }, grid, heights };
}

const AXIS_EXTENT = (axis, dims) => axis === 0
  ? [dims.ny, dims.nz]
  : axis === 1 ? [dims.nx, dims.nz] : [dims.nx, dims.ny];

const pointAt = (axis, plane, u, v) => axis === 0
  ? [plane, u, v] : axis === 1 ? [u, plane, v] : [u, v, plane];

export function faceKey(f) {
  return `${f.axis}|${f.sign}|${f.plane}|${f.u}|${f.v}|${f.mat}`;
}

export function exposedFaces(grid, dims) {
  const { nx, ny, nz } = dims;
  const at = (x, y, z) => (y * nz + z) * nx + x;
  const inside = (x, y, z) => x >= 0 && x < nx && y >= 0 && y < ny && z >= 0 && z < nz;
  const solid = (x, y, z) => inside(x, y, z) ? grid[at(x, y, z)] : 0;
  const faces = [];
  const push = (axis, sign, plane, u, v, mat) => faces.push({ axis, sign, plane, u, v, mat });
  for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const mat = grid[at(x, y, z)];
    if (!mat) continue;
    if (!solid(x + 1, y, z)) push(0, 1, x + 1, y, z, mat);
    if (!solid(x - 1, y, z)) push(0, -1, x, y, z, mat);
    if (!solid(x, y + 1, z)) push(1, 1, y + 1, x, z, mat);
    if (!solid(x, y - 1, z)) push(1, -1, y, x, z, mat);
    if (!solid(x, y, z + 1)) push(2, 1, z + 1, x, y, mat);
    if (!solid(x, y, z - 1)) push(2, -1, z, x, y, mat);
  }
  return faces;
}

export function greedyMerge(faces, dims) {
  const groups = new Map();
  for (const f of faces) {
    const gk = `${f.axis}|${f.sign}|${f.plane}|${f.mat}`;
    let g = groups.get(gk);
    if (!g) { g = []; groups.set(gk, g); }
    g.push(f);
  }
  const quads = [];
  for (const [gk, list] of groups) {
    const [axis, signS, planeS, matS] = gk.split('|');
    const axisN = Number(axis), sign = Number(signS), plane = Number(planeS), mat = Number(matS);
    const [uDim, vDim] = AXIS_EXTENT(axisN, dims);
    const mask = new Uint8Array(uDim * vDim);
    for (const f of list) mask[f.v * uDim + f.u] = 1;
    for (let v = 0; v < vDim; v++) {
      for (let u = 0; u < uDim; u++) {
        if (!mask[v * uDim + u]) continue;
        let w = 1;
        while (u + w < uDim && mask[v * uDim + u + w]) w++;
        let h = 1;
        outer: while (v + h < vDim) {
          for (let k = 0; k < w; k++) if (!mask[(v + h) * uDim + u + k]) break outer;
          h++;
        }
        for (let dv = 0; dv < h; dv++) for (let du = 0; du < w; du++) {
          mask[(v + dv) * uDim + u + du] = 0;
        }
        quads.push({ axis: axisN, sign, plane, u0: u, v0: v, w, h, mat });
      }
    }
  }
  return quads;
}

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function quadCorners(q) {
  const { axis, sign, plane, u0, v0, w, h } = q;
  const p = (u, v) => pointAt(axis, plane, u, v);
  const pts = [p(u0, v0), p(u0 + w, v0), p(u0 + w, v0 + h), p(u0, v0 + h)];
  const want = [0, 0, 0];
  want[axis] = sign;
  const n = cross(
    [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]],
    [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]],
  );
  if (dot(n, want) < 0) pts.reverse();
  return pts;
}

export function expandFaceSet(quads) {
  const keys = [];
  for (const q of quads) {
    for (let dv = 0; dv < q.h; dv++) for (let du = 0; du < q.w; du++) {
      keys.push(`${q.axis}|${q.sign}|${q.plane}|${q.u0 + du}|${q.v0 + dv}|${q.mat}`);
    }
  }
  return keys.sort();
}

export function faceSetDiff(faces, quads) {
  const a = faces.map(faceKey).sort();
  const b = expandFaceSet(quads);
  let missing = 0, extra = 0;
  for (let i = 0, j = 0; i < a.length || j < b.length;) {
    if (i >= a.length) { extra++; j++; }
    else if (j >= b.length) { missing++; i++; }
    else if (a[i] === b[j]) { i++; j++; }
    else if (a[i] < b[j]) { missing++; i++; }
    else { extra++; j++; }
  }
  return { missing, extra, aCount: a.length, bCount: b.length };
}

function edgeLatticePoints(a, b) {
  const diff = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const axis = diff.findIndex((d) => d !== 0);
  const len = Math.abs(diff[axis]);
  const step = Math.sign(diff[axis]);
  const out = [];
  for (let k = 1; k < len; k++) {
    const p = [a[0], a[1], a[2]];
    p[axis] += k * step;
    out.push(p);
  }
  return out;
}

export function detectTJunctions(quads, vertexKeys) {
  const corners = new Set();
  for (const q of quads) for (const p of quadCorners(q)) corners.add(p.join(','));
  const vset = vertexKeys || corners;
  const seen = new Set();
  const samples = [];
  for (const q of quads) {
    const pts = quadCorners(q);
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4];
      for (const p of edgeLatticePoints(a, b)) {
        if (!vset.has(p.join(','))) continue;
        const ek = `${a.join(',')}->${b.join(',')}@${p.join(',')}`;
        if (seen.has(ek)) continue;
        seen.add(ek);
        if (samples.length < 5) samples.push({ a, b, p });
      }
    }
  }
  return { count: seen.size, samples };
}

export function detectMeshTJunctions(positions, indices) {
  const n = positions.length / 3;
  const vkeys = new Set();
  const cells = new Map();
  const ck = (x, y, z) => `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  for (let i = 0; i < n; i++) {
    const p = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    vkeys.add(p.join(','));
    const k = ck(p[0], p[1], p[2]);
    let arr = cells.get(k);
    if (!arr) { arr = []; cells.set(k, arr); }
    arr.push(i);
  }
  const edges = new Set();
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) edges.add(u < v ? `${u},${v}` : `${v},${u}`);
  }
  let count = 0;
  const samples = [];
  for (const ek of edges) {
    const [ia, ib] = ek.split(',').map(Number);
    const a = [positions[ia * 3], positions[ia * 3 + 1], positions[ia * 3 + 2]];
    const b = [positions[ib * 3], positions[ib * 3 + 1], positions[ib * 3 + 2]];
    const min = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
    const max = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
    const seen = new Set();
    for (let gx = Math.floor(min[0]); gx <= Math.floor(max[0]); gx++)
      for (let gy = Math.floor(min[1]); gy <= Math.floor(max[1]); gy++)
        for (let gz = Math.floor(min[2]); gz <= Math.floor(max[2]); gz++) {
          const arr = cells.get(`${gx},${gy},${gz}`);
          if (!arr) continue;
          for (const ic of arr) {
            if (ic === ia || ic === ib || seen.has(ic)) continue;
            const p = [positions[ic * 3], positions[ic * 3 + 1], positions[ic * 3 + 2]];
            const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
            const cr = cross(ab, ap);
            const len2 = dot(ab, ab);
            const t = dot(ap, ab) / len2;
            if (dot(cr, cr) / len2 <= 1e-18 && t > 1e-12 && t < 1 - 1e-12) {
              seen.add(ic);
              count++;
              if (samples.length < 5) samples.push({ a, b, p });
            }
          }
        }
  }
  return { count, samples, vertices: n, edges: edges.size };
}

export function greedyMesh(quads) {
  const positions = [], indices = [], map = new Map();
  const add = (p) => {
    const k = `${p[0]},${p[1]},${p[2]}`;
    let i = map.get(k);
    if (i === undefined) { i = positions.length / 3; positions.push(p[0], p[1], p[2]); map.set(k, i); }
    return i;
  };
  for (const q of quads) {
    const pts = quadCorners(q);
    const ids = pts.map(add);
    indices.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }
  return { positions: new Float64Array(positions), indices: new Uint32Array(indices) };
}

export function stitchQuads(quads) {
  const vertexMap = new Map();
  const positions = [], indices = [];
  const boundaryKeys = new Set();
  const cornerSet = new Set();
  for (const q of quads) for (const p of quadCorners(q)) cornerSet.add(p.join(','));
  const addVertex = (p) => {
    const k = `${p[0]},${p[1]},${p[2]}`;
    let i = vertexMap.get(k);
    if (i === undefined) {
      i = positions.length / 3;
      positions.push(p[0], p[1], p[2]);
      vertexMap.set(k, i);
    }
    return i;
  };
  let flipped = 0;
  for (const q of quads) {
    const pts = quadCorners(q);
    const boundary = [];
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4];
      boundary.push(a);
      boundaryKeys.add(a.join(','));
      for (const p of edgeLatticePoints(a, b)) {
        if (cornerSet.has(p.join(','))) {
          boundary.push(p);
          boundaryKeys.add(p.join(','));
        }
      }
    }
    // Deduplicate consecutive boundary points (corners are pushed by next edge).
    const poly = [];
    for (const p of boundary) {
      const prev = poly[poly.length - 1];
      if (!prev || prev[0] !== p[0] || prev[1] !== p[1] || prev[2] !== p[2]) poly.push(p);
    }
    if (poly.length > 1) {
      const first = poly[0], last = poly[poly.length - 1];
      if (first[0] === last[0] && first[1] === last[1] && first[2] === last[2]) poly.pop();
    }
    const c = [0, 0, 0];
    for (const p of poly) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
    c[0] /= poly.length; c[1] /= poly.length; c[2] /= poly.length;
    const ci = addVertex(c);
    const want = [0, 0, 0];
    want[q.axis] = q.sign;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ai = addVertex(a), bi = addVertex(b);
      const n = cross(
        [a[0] - c[0], a[1] - c[1], a[2] - c[2]],
        [b[0] - c[0], b[1] - c[1], b[2] - c[2]],
      );
      if (dot(n, want) >= 0) indices.push(ci, ai, bi);
      else { indices.push(ci, bi, ai); flipped++; }
    }
  }
  return {
    positions: new Float64Array(positions),
    indices: new Uint32Array(indices),
    boundaryKeys,
    flipped,
    triangles: indices.length / 3,
  };
}

export function meshAudit(positions, indices) {
  const edgeCount = new Map();
  let degenerate = 0;
  let area = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t], ib = indices[t + 1], ic = indices[t + 2];
    const a = [positions[ia * 3], positions[ia * 3 + 1], positions[ia * 3 + 2]];
    const b = [positions[ib * 3], positions[ib * 3 + 1], positions[ib * 3 + 2]];
    const c = [positions[ic * 3], positions[ic * 3 + 1], positions[ic * 3 + 2]];
    const n = cross(
      [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
    );
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len === 0) degenerate++;
    area += len / 2;
    for (const [u, v] of [[ia, ib], [ib, ic], [ic, ia]]) {
      const k = u < v ? `${u},${v}` : `${v},${u}`;
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
    }
  }
  let boundaryEdges = 0, nonManifoldEdges = 0;
  for (const n of edgeCount.values()) {
    if (n === 1) boundaryEdges++;
    else if (n > 2) nonManifoldEdges++;
  }
  return {
    triangles: indices.length / 3,
    degenerate,
    area,
    boundaryEdges,
    nonManifoldEdges,
    uniqueEdges: edgeCount.size,
  };
}

export function hashMesh(positions, indices) {
  // FNV-1a over quantized integer coordinates and indices; deterministic.
  let h = 2166136261 >>> 0;
  const mix = (x) => {
    h ^= x & 0xff; h = Math.imul(h, 16777619) >>> 0;
  };
  for (let i = 0; i < positions.length; i++) {
    const q = Math.round(positions[i] * 1e6) | 0;
    mix(q); mix(q >>> 8); mix(q >>> 16); mix(q >>> 24);
  }
  for (let i = 0; i < indices.length; i++) {
    const q = indices[i] | 0;
    mix(q); mix(q >>> 8); mix(q >>> 16); mix(q >>> 24);
  }
  return h.toString(16).padStart(8, '0');
}

export function runPipeline(dims = { nx: 48, ny: 20, nz: 48 }, seed = 20261118) {
  const t = makeTerrain(dims.nx, dims.ny, dims.nz, seed);
  const faces = exposedFaces(t.grid, t.dims);
  const quads = greedyMerge(faces, t.dims);
  const diff = faceSetDiff(faces, quads);
  const naive = greedyMesh(faces.map((f) => ({ ...f, u0: f.u, v0: f.v, w: 1, h: 1 })));
  const greedy = greedyMesh(quads);
  const stitched = stitchQuads(quads);
  const tGreedy = detectMeshTJunctions(greedy.positions, greedy.indices);
  const tStitched = detectMeshTJunctions(stitched.positions, stitched.indices);
  const naiveAudit = meshAudit(naive.positions, naive.indices);
  const stitchAudit = meshAudit(stitched.positions, stitched.indices);
  const greedyAudit = meshAudit(greedy.positions, greedy.indices);
  return {
    terrain: t, faces, quads, diff, tGreedy, tStitched, naive, greedy, stitched,
    naiveAudit, greedyAudit, stitchAudit,
    hashNaive: hashMesh(naive.positions, naive.indices),
    hashStitched: hashMesh(stitched.positions, stitched.indices),
  };
}
