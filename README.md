# greedy-seam-lab

**One sentence:** greedy voxel meshing cuts 14,146 exposed unit faces to **7,314 triangles (−74.15%)**, but leaves **2,452 T-junctions and 5,124 crack edges**; a minimal seam stitch removes both (**2,452 → 0**, **5,124 → 0**) while still using **39.63% fewer triangles than the per-face baseline**, with area conserved to **2.49e-14** relative.

Upstream: none

This is an original, dependency-free geometry lab. It is **not** a fork or a mirror.

## What it is

A reference implementation + executable audit for a real voxel-engine problem: greedy meshing merges coplanar unit faces into large rectangles, which creates **T-junctions** where a long quad edge meets the corner of a shorter neighbour. Rasterizers tolerate this; shadow maps, normal interpolation and watertight workflows do not. Most greedy-meshing articles report only the triangle reduction.

This repo reports both, then repairs the seam:

- `naive` — one quad per exposed voxel face (the baseline).
- `greedy` — maximal same-material rectangles (the usual optimisation).
- `stitched` — every long edge is split **only at real quad corners** that lie on it; each polygon is fanned from its centroid. No vertex is moved, no face cell is added or removed.

`src/core.mjs` is pure ESM: no `three`, no DOM, no I/O. `main.js` renders the three meshes with the **same core** and prints the same counts in the HUD; `bench/verify.mjs` recomputes them in node.

## Run it

```bash
node tools/gen-sample.mjs        # deterministic data/terrain.json (sha256 printed)
node bench/verify.mjs            # 22 assertions, exits 0 only if all pass
node bench/bench.mjs             # 9 samples + cold start -> bench/result.json
python3 -m http.server 4173      # then open http://localhost:4173
```

No `npm install`. The page pins three.js **0.169.0** via a CDN import map. Node **v24.19.0** was used for the numbers below.

## Evidence (real run, `bench/result.json`)

Corpus: `64 × 28 × 64` = **114,688** voxels, seed `20261118`; generator output sha256 `068742e989cb1c02ae1d3e2fbad41f09524547e6b3e98547713cf54526bc5cb2`.

| Metric | naive baseline | greedy | stitched |
|---|---:|---:|---:|
| triangles | 28,292 | 7,314 (−74.15%) | **17,080 (−39.63%)** |
| T-junctions (vertex strictly inside an edge) | 0 | **2,452** | **0** |
| crack / boundary edges | 0 | **5,124** | **0** |
| non-manifold edges | 0 | 0 | **0** |
| degenerate triangles | 0 | 0 | **0** |
| surface area | 14,146 | 14,146 | 14,146.000000000353 (rel **2.49e-14**) |
| face-set difference vs source | 0 missing / 0 extra | 0 / 0 | 0 / 0 |

- Greedy quads: **3,657**. Stitched vertices: **8,559**. Winding flips during stitch: **0**.
- Stitched mesh hash (FNV-1a over quantised coords + indices): `dd9cfc0f`, identical on a second independent pipeline run.
- Timing (full generate → faces → greedy → stitch → audit → T-junction scan): cold **269.647 ms**, median **111.329 ms**, p95 **186.030 ms**, min **99.966 ms**, stddev **26.458 ms**, **RSD 22.41%** over 9 samples. The spread is real: the scan allocates a fresh vertex/edge hash map per run and V8 occasionally pays a major GC (p95 186 ms). We report it rather than trimming samples.
- Determinism: `node tools/gen-sample.mjs` twice produces the same 115 KB `data/terrain.json`; counts and mesh hash are identical across runs.

Run the baseline yourself:

```bash
node baseline/naive.mjs
```

## 本轮创新

**B 档 — 把 greedy meshing 的接缝做成可执行证书，而不是又一张三角形减少表。** 现有 greedy meshing 教程/实现通常只报面数下降，不检查 T-junction；本仓库把「顶点落在另一条边内部」和「边界裂缝边」变成 node 可复算的计数（2,452 / 5,124），并给出**只在真实角点处切边**的缝合：拼接后在 3,657 个合并矩形上得到 0 T-junction、0 裂缝边、0 非流形边，同时保留 39.63% 的三角形节省。与已有的 voxel-seal / iso-tetra / greedy 教程的区别是：它证明的是**合并后表面仍然共形**，而不是体素化或等值面提取。页面与 node 共用同一 `src/core.mjs`，HUD 数字与 `bench/result.json` 逐项一致。

## Known limitations (honest)

- **Unit integer lattice only.** Inputs are voxel coordinates in a discrete grid; the tool does not define behaviour for arbitrary scaled meshes. The T-junction collinearity test uses an **absolute** squared-cross tolerance `1e-18`; it is valid for coordinates in roughly `[-1e3, 1e3]`. The area check is **relative** (`1e-9`). There is no continuous-scale invariance claim.
- The stitch is a centroid fan: it adds one centre vertex per quad and `k` triangles for a polygon with `k` boundary vertices. It is conforming and crack-free, but **not** a minimal triangulation (ear clipping would save about one triangle per quad).
- Greedy merging is per material; material boundaries are never crossed, so mixed-material terrain limits the reduction.
- T-junction count is an incidence count (vertex-on-edge pairs); one geometric crack can contribute several incidences.
- The corpus is a deterministic synthetic terrain, not a production game map. No GPU timing, screenshot or pixel-difference evidence is claimed; browser evidence is the live counts computed by the same core plus HTTP 200.
- Non-manifold voxel authoring is removed by a deterministic 2×2 despeckle pass before meshing; that pass is part of the sample generator, not of the stitch algorithm.

## License

MIT © 2026 llinok111. See `LICENSE`.
