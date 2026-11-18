import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  exposedFaces, greedyMerge, greedyMesh, stitchQuads, meshAudit, detectMeshTJunctions,
} from './src/core.mjs';

const app = document.querySelector('#app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.fog = new THREE.Fog(0x0b1020, 120, 260);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 500);
camera.position.set(96, 74, 96);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(32, 9, 32);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x1a2410, 1.15));
const sun = new THREE.DirectionalLight(0xffe2b0, 2.2);
sun.position.set(70, 120, 40);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x89b6ff, 0.55);
fill.position.set(-60, 40, -70);
scene.add(fill);

const doc = await fetch('./data/terrain.json').then((r) => r.json());
const dims = doc.dims;
const grid = Uint8Array.from(doc.grid, (c) => c.charCodeAt(0) - 48);
const faces = exposedFaces(grid, dims);
const quads = greedyMerge(faces, dims);
const naive = greedyMesh(faces.map((f) => ({ ...f, u0: f.u, v0: f.v, w: 1, h: 1 })));
const greedy = greedyMesh(quads);
const stitched = stitchQuads(quads);
const naiveAudit = meshAudit(naive.positions, naive.indices);
const greedyAudit = meshAudit(greedy.positions, greedy.indices);
const stitchedAudit = meshAudit(stitched.positions, stitched.indices);
const tjGreedy = detectMeshTJunctions(greedy.positions, greedy.indices);
const tjStitched = detectMeshTJunctions(stitched.positions, stitched.indices);

function colorForY(y) {
  const c = new THREE.Color();
  if (y < 4) c.setHSL(0.60, 0.12, 0.28);
  else if (y < 7) c.setHSL(0.09, 0.42, 0.32);
  else c.setHSL(0.30, 0.46, 0.34 + Math.min(0.12, y * 0.004));
  return c;
}
function toGeometry(mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.positions), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.indices), 1));
  const colors = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const c = colorForY(mesh.positions[i + 1]);
    colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}
const material = new THREE.MeshStandardMaterial({
  vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0.02,
});
const meshes = {
  naive: new THREE.Mesh(toGeometry(naive), material),
  greedy: new THREE.Mesh(toGeometry(greedy), material),
  stitched: new THREE.Mesh(toGeometry(stitched), material),
};
for (const key of Object.keys(meshes)) {
  meshes[key].visible = key === 'stitched';
  scene.add(meshes[key]);
}
const gridHelper = new THREE.GridHelper(64, 16, 0x24365c, 0x1a2742);
gridHelper.position.set(32, 0.02, 32);
scene.add(gridHelper);

const $ = (id) => document.querySelector(id);
$('#vox').textContent = grid.length.toLocaleString();
$('#faces').textContent = faces.length.toLocaleString();
$('#trisNaive').textContent = naiveAudit.triangles.toLocaleString();
$('#greedy').textContent = `${quads.length.toLocaleString()} → ${greedyAudit.triangles.toLocaleString()}`;
$('#tjG').textContent = tjGreedy.count.toLocaleString();
$('#beG').textContent = greedyAudit.boundaryEdges.toLocaleString();
$('#trisS').textContent = stitchedAudit.triangles.toLocaleString();
$('#tjS').textContent = tjStitched.count.toLocaleString();
$('#beS').textContent = stitchedAudit.boundaryEdges.toLocaleString();

document.querySelectorAll('#views button').forEach((b) => {
  b.addEventListener('click', () => {
    for (const key of Object.keys(meshes)) meshes[key].visible = key === b.dataset.view;
    document.querySelectorAll('#views button').forEach((x) => x.classList.toggle('on', x === b));
  });
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
