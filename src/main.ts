import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './styles.css';

type Metadata = {
  frameCount: number; particleCount: number; particleIds: number[]; timeMyr: number[];
  counts: number[]; centerIds: number[]; centerMassMsun: number[];
};
const FIELDS = 11;
const SNAPSHOT_SECONDS = 0.1;
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<header class="topbar">
  <a class="brand"><span class="brand-mark">P</span><span>PeTar <b>FIELD NOTES</b></span></a>
  <div class="top-meta"><span class="live-dot"></span> SIMULATION ARCHIVE <i></i> FIXED-WIND RUN</div>
  <a class="about" href="${import.meta.env.BASE_URL}data/metadata.json" target="_blank" rel="noreferrer">DATA NOTES <span>↗</span></a>
</header>
<main>
  <section class="heading">
    <div><div class="eyebrow">STELLAR DYNAMICS <span>/</span> N-BODY SIMULATION</div><h1>A star system, <em>in motion.</em></h1><p class="lede">Explore the recorded evolution of a 200-companion PeTar system.</p></div>
    <div class="run-tag"><span>ARCHIVE 01</span><b>VMS + 200 companions</b><small>0—78,930 years</small></div>
  </section>
  <section class="workspace">
    <div class="scene-panel panel">
      <div class="panel-top"><div class="scene-label"><span class="status-pip"></span><div><b>THE SYSTEM</b><small>VMS-CENTRED · 3D PHASE SPACE</small></div></div>
        <div class="scene-actions"><span class="gpu-badge" id="renderer-mode">STARTING GPU</span><label for="view-range">RANGE</label><select id="view-range"><option value="0.01">0.01 pc</option><option value="0.035" selected>0.035 pc</option><option value="0.1">0.1 pc</option><option value="0.5">0.5 pc</option><option value="1">1 pc</option><option value="auto">Auto</option></select><button class="icon-btn" id="reset-camera" title="Reset view">↺</button></div>
      </div>
      <div id="scene"></div>
      <div class="scene-caption"><span class="caption-vms"></span> CENTRAL VMS <i></i><span id="color-mode-label">BLACKBODY COLOUR</span><span class="caption-note">DISPLAY SIZES ARE EXAGGERATED</span></div>
      <div class="axis-note">X · Y · Z <span>/</span> pc</div>
      <div class="loading" id="loading"><div class="loader"></div><b>Loading the simulation record</b><span>793 saved snapshots · ID-aligned particle cache</span></div>
    </div>
    <aside class="side">
      <div class="stats panel"><div class="section-kicker">AT THIS MOMENT <span id="snapshot-value">LOADING</span></div>
        <div class="time-stat"><span>SIMULATION TIME</span><b id="time-value">—</b><small id="date-progress">SNAPSHOT 0 OF 792</small></div>
        <div class="stat-grid"><div><span>PARTICLES</span><b id="particle-count">—</b></div><div><span>VMS MASS</span><b id="vms-mass">—</b><small>M☉</small></div></div>
        <div class="stat-footer"><span class="status-pip"></span> MOST MASSIVE PARTICLE <span class="footer-right" id="center-id">—</span></div>
      </div>
      <div class="controls panel"><div class="control-head"><div class="section-kicker">TIME CONTROL</div><span class="frame-count" id="frame-count">793 SNAPSHOTS</span></div>
        <div class="play-row"><button id="play" class="play-button"><span id="play-icon">▶</span><span id="play-label">Play</span></button><select id="speed" aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select><button id="prev" class="step-button" aria-label="Previous snapshot">‹</button><button id="next" class="step-button" aria-label="Next snapshot">›</button></div>
        <div class="range-wrap"><input id="timeline" type="range" min="0" value="0" step="1" aria-label="Simulation timeline"><div class="range-labels"><span>0 yr</span><span id="end-time">78,930 yr</span></div></div>
        <div class="play-hint">All snapshots, in order <i>·</i> 10 snapshots/s at 1×</div>
      </div>
      <div class="appearance panel"><div class="section-kicker">LIGHT & COLOUR</div><div class="appearance-row"><label for="colour-mode">STAR COLOUR</label><select id="colour-mode"><option value="temperature" selected>Effective temperature</option><option value="velocity">Relative velocity</option><option value="uniform">Soft white</option></select></div><label class="toggle-row" for="diffraction"><span><b>Diffraction spikes</b><small>Subtle 4-point telescope aperture effect</small></span><input id="diffraction" type="checkbox" checked><span class="switch"></span></label><div class="appearance-note">Temperature colour uses valid BSE luminosity and radius. The VMS keeps a separate display accent.</div></div>
      <div class="interaction panel"><div class="section-kicker">NAVIGATE THE SYSTEM</div><div class="interaction-keys"><span><b>DRAG</b> rotate</span><span><b>SCROLL</b> zoom</span><span><b>RIGHT-DRAG</b> pan</span></div></div>
    </aside>
  </section>
  <footer><span>PeTar <i>·</i> INTERACTIVE N-BODY EXPLORER</span><span id="frame-summary">FULL RECORDED SIMULATION · 793 SNAPSHOTS</span><span>POSITIONS & VELOCITIES RELATIVE TO THE MOST MASSIVE PARTICLE</span></footer>
</main>`;

const [meta, buffer] = await Promise.all([
  fetch(`${import.meta.env.BASE_URL}data/metadata.json`).then(r => { if (!r.ok) throw new Error('metadata.json unavailable'); return r.json() as Promise<Metadata>; }),
  fetch(`${import.meta.env.BASE_URL}data/snapshots.bin`).then(r => { if (!r.ok) throw new Error('snapshots.bin unavailable'); return r.arrayBuffer(); })
]);
if (buffer.byteLength !== meta.frameCount * meta.particleCount * FIELDS * 4) throw new Error('Snapshot cache size does not match metadata');
const data = new Float32Array(buffer), ids = meta.particleIds, idToIndex = new Map(ids.map((id, i) => [id, i]));
const host = document.querySelector<HTMLDivElement>('#scene')!;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#090d13');
const camera = new THREE.PerspectiveCamera(42, 1, 0.0001, 20); camera.position.set(0.055, 0.044, 0.071);
const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace;
await renderer.init();
host.append(renderer.domElement);
const backend = (renderer as unknown as { backend: { isWebGPUBackend?: boolean } }).backend;
document.querySelector('#renderer-mode')!.textContent = backend?.isWebGPUBackend ? 'WEBGPU ACTIVE' : 'WEBGL2 FALLBACK';
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.075; controls.screenSpacePanning = true;
const grid = new THREE.GridHelper(0.07, 14, '#273444', '#18222e'); grid.rotation.x = Math.PI / 2; grid.position.z = -0.0001;
(grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.24; scene.add(grid);
const rings = [0.01, 0.02, 0.035].map(radius => {
  const points = new THREE.Path().absarc(0, 0, radius, 0, Math.PI * 2, false).getPoints(100);
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#516071', transparent: true, opacity: radius === 0.035 ? 0.36 : 0.2 }));
  line.position.z = 0.00003; scene.add(line); return line;
});
const sphere = new THREE.SphereGeometry(1, 12, 8);
const shellMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, toneMapped: false });
const haloMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.075, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const stars = new THREE.InstancedMesh(sphere, shellMaterial, meta.particleCount); stars.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(stars);
const halos = new THREE.InstancedMesh(sphere, haloMaterial, meta.particleCount); halos.instanceMatrix.setUsage(THREE.DynamicDrawUsage); halos.renderOrder = 1; scene.add(halos);
const centerCore = new THREE.Mesh(new THREE.SphereGeometry(0.00032, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff0c9', toneMapped: false })); scene.add(centerCore);
const centerHalo = new THREE.Mesh(new THREE.SphereGeometry(0.0011, 20, 14), new THREE.MeshBasicMaterial({ color: '#e2aa60', transparent: true, opacity: 0.075, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); centerHalo.renderOrder = 2; scene.add(centerHalo);
const dummy = new THREE.Object3D(), tempColor = new THREE.Color();
const diffractionCanvas = document.createElement('canvas'); diffractionCanvas.width = diffractionCanvas.height = 128;
const cx = diffractionCanvas.getContext('2d')!; const gradient = cx.createRadialGradient(64, 64, 0, 64, 64, 9);
gradient.addColorStop(0, 'rgba(255,255,255,0.9)'); gradient.addColorStop(0.18, 'rgba(255,255,255,0.58)'); gradient.addColorStop(0.48, 'rgba(255,255,255,0.08)'); gradient.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gradient; cx.fillRect(0, 0, 128, 128);
for (const angle of [0, Math.PI / 2]) { cx.save(); cx.translate(64, 64); cx.rotate(angle); const beam = cx.createLinearGradient(0, -62, 0, 62); beam.addColorStop(0, 'rgba(255,255,255,0)'); beam.addColorStop(.38, 'rgba(255,255,255,0.08)'); beam.addColorStop(.49, 'rgba(255,255,255,0.36)'); beam.addColorStop(.5, 'rgba(255,255,255,0.7)'); beam.addColorStop(.51, 'rgba(255,255,255,0.36)'); beam.addColorStop(.62, 'rgba(255,255,255,0.08)'); beam.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = beam; cx.fillRect(-2.2, -62, 4.4, 124); cx.restore(); }
const diffractionTexture = new THREE.CanvasTexture(diffractionCanvas); diffractionTexture.colorSpace = THREE.SRGBColorSpace;
const diffractionMaterial = new THREE.MeshBasicMaterial({ map: diffractionTexture, color: 0xffffff, transparent: true, opacity: 0.48, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const diffraction = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), diffractionMaterial, meta.particleCount); diffraction.instanceMatrix.setUsage(THREE.DynamicDrawUsage); diffraction.renderOrder = 3; scene.add(diffraction);
const speedColor = (v: number) => { const x = Math.min(1, Math.max(0, (v - 5) / 180)); const stops = [[0.32, 0.69, 0.72], [0.52, 0.72, 0.78], [0.79, 0.67, 0.56], [0.9, 0.51, 0.43]]; const q = x * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(q)), u = q - i; return stops[i].map((c, k) => c * (1 - u) + stops[i + 1][k] * u); };
const blackbodyColor = (kelvin: number): [number, number, number] => {
  const t = THREE.MathUtils.clamp(kelvin, 1000, 40000) / 100;
  let r: number, g: number, b: number;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
  else { r = 329.698727446 * ((t - 60) ** -0.1332047592); g = 288.1221695283 * ((t - 60) ** -0.0755148492); b = 255; }
  return [r, g, b].map(c => Math.pow(THREE.MathUtils.clamp(c / 255, 0, 1), 2.2)) as [number, number, number];
};
let frame = 0, playing = false, last = performance.now(), accumulator = 0;
let cameraQuaternion = new THREE.Quaternion();
const lastDiffractionOrientation = new THREE.Quaternion(0, 0, 0, 0);
function setMatrix(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, scale: number, quaternion = dummy.quaternion) {
  dummy.position.set(x, y, z); dummy.quaternion.copy(quaternion); dummy.scale.setScalar(scale); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
}
function putFrame(index: number) {
  frame = Math.max(0, Math.min(meta.frameCount - 1, index));
  const base = frame * meta.particleCount * FIELDS, centerIndex = idToIndex.get(meta.centerIds[frame]);
  const colorMode = (document.querySelector<HTMLSelectElement>('#colour-mode')!).value;
  for (let i = 0; i < meta.particleCount; i++) {
    const o = base + i * FIELDS, present = data[o + 10] > 0.5, x = present ? data[o] : 0, y = present ? data[o + 1] : 0, z = present ? data[o + 2] : 0;
    const isCenter = i === centerIndex, mass = Math.max(0, data[o + 6]), lum = data[o + 9], radius = data[o + 8];
    const visualRadius = isCenter ? 0 : present ? 0.00011 + Math.min(0.00009, Math.log10(Math.max(1, mass)) * 0.000035) : 0;
    setMatrix(stars, i, x, y, z, visualRadius);
    setMatrix(halos, i, x, y, z, visualRadius * 2.35);
    const tempValid = Number.isFinite(lum) && Number.isFinite(radius) && lum > 0 && radius > 0;
    const teff = tempValid ? 5772 * Math.pow(lum, 0.25) / Math.sqrt(radius) : Number.NaN;
    const colour = isCenter ? [0, 0, 0] : colorMode === 'uniform' ? [0.78, 0.84, 0.91] : colorMode === 'velocity' ? speedColor(Math.hypot(data[o + 3], data[o + 4], data[o + 5]) * 0.977792) : tempValid && Number.isFinite(teff) && teff > 0 ? blackbodyColor(teff) : [0.34, 0.39, 0.47];
    tempColor.setRGB(colour[0], colour[1], colour[2]); stars.setColorAt(i, tempColor);
    tempColor.setRGB(colour[0], colour[1], colour[2]); halos.setColorAt(i, tempColor);
    const logLum = tempValid ? THREE.MathUtils.clamp(Math.log10(lum + 1) / 5, 0.12, 1) : 0;
    const diffractionSize = present && !isCenter ? visualRadius * (14 + logLum * 10) : 0;
    setMatrix(diffraction, i, x, y, z, diffractionSize, cameraQuaternion);
  }
  stars.instanceMatrix.needsUpdate = true; halos.instanceMatrix.needsUpdate = true; diffraction.instanceMatrix.needsUpdate = true;
  if (stars.instanceColor) stars.instanceColor.needsUpdate = true; if (halos.instanceColor) halos.instanceColor.needsUpdate = true;
  const visible = (document.querySelector<HTMLInputElement>('#diffraction')!).checked; diffraction.visible = visible;
  centerCore.position.set(0, 0, 0); centerHalo.position.set(0, 0, 0);
  document.querySelector('#color-mode-label')!.textContent = colorMode === 'temperature' ? 'BLACKBODY COLOUR · BSE L / R' : colorMode === 'velocity' ? 'RELATIVE SPEED · km/s' : 'UNIFORM STAR COLOUR';
  const time = meta.timeMyr[frame] * 1e6;
  document.querySelector('#time-value')!.textContent = `${time.toLocaleString('en-US', { maximumFractionDigits: 1 })} yr`;
  document.querySelector('#snapshot-value')!.textContent = `SNAPSHOT ${String(frame).padStart(3, '0')} / ${meta.frameCount - 1}`;
  document.querySelector('#date-progress')!.textContent = `SNAPSHOT ${frame + 1} OF ${meta.frameCount}`;
  document.querySelector('#particle-count')!.textContent = meta.counts[frame].toLocaleString('en-US');
  document.querySelector('#vms-mass')!.textContent = Math.round(meta.centerMassMsun[frame]).toLocaleString('en-US');
  document.querySelector('#center-id')!.textContent = `ID ${meta.centerIds[frame]}`;
  (document.querySelector('#timeline') as HTMLInputElement).value = String(frame);
  document.querySelector('#frame-summary')!.textContent = `SNAPSHOT ${frame + 1} OF ${meta.frameCount} · ${time.toLocaleString('en-US', { maximumFractionDigits: 1 })} YR`;
}
function resize() { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(host); resize();
renderer.setAnimationLoop((now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (playing) {
    accumulator += dt * Number((document.querySelector<HTMLSelectElement>('#speed')!).value);
    while (accumulator >= SNAPSHOT_SECONDS && frame < meta.frameCount - 1) { accumulator -= SNAPSHOT_SECONDS; putFrame(frame + 1); }
    if (frame === meta.frameCount - 1) setPlaying(false);
  }
  controls.update(); cameraQuaternion.copy(camera.quaternion);
  if (1 - Math.abs(lastDiffractionOrientation.dot(cameraQuaternion)) > 1e-7) {
    const base = frame * meta.particleCount * FIELDS, centerIndex = idToIndex.get(meta.centerIds[frame]);
    for (let i = 0; i < meta.particleCount; i++) {
      const o = base + i * FIELDS, present = data[o + 10] > 0.5, mass = Math.max(0, data[o + 6]);
      const radius = present && i !== centerIndex ? 0.00011 + Math.min(0.00009, Math.log10(Math.max(1, mass)) * 0.000035) : 0;
      const logLum = data[o + 9] > 0 ? THREE.MathUtils.clamp(Math.log10(data[o + 9] + 1) / 5, 0.12, 1) : 0;
      setMatrix(diffraction, i, present ? data[o] : 0, present ? data[o + 1] : 0, present ? data[o + 2] : 0, radius * (14 + logLum * 10), cameraQuaternion);
    }
    diffraction.instanceMatrix.needsUpdate = true; lastDiffractionOrientation.copy(cameraQuaternion);
  }
  renderer.render(scene, camera);
});
function setPlaying(value: boolean) { playing = value; document.querySelector('#play-icon')!.textContent = value ? 'Ⅱ' : '▶'; document.querySelector('#play-label')!.textContent = value ? 'Pause' : 'Play'; }
(document.querySelector('#timeline') as HTMLInputElement).max = String(meta.frameCount - 1);
document.querySelector('#end-time')!.textContent = `${Math.round(meta.timeMyr.at(-1)! * 1e6).toLocaleString('en-US')} yr`;
putFrame(0);
document.querySelector('#play')!.addEventListener('click', () => setPlaying(!playing));
document.querySelector('#prev')!.addEventListener('click', () => putFrame(frame - 1));
document.querySelector('#next')!.addEventListener('click', () => putFrame(frame + 1));
document.querySelector('#timeline')!.addEventListener('input', event => putFrame(Number((event.target as HTMLInputElement).value)));
document.querySelector('#colour-mode')!.addEventListener('change', () => putFrame(frame));
document.querySelector('#diffraction')!.addEventListener('change', () => { diffraction.visible = (document.querySelector<HTMLInputElement>('#diffraction')!).checked; });
document.querySelector('#view-range')!.addEventListener('change', event => {
  const value = (event.target as HTMLSelectElement).value, half = value === 'auto' ? 0.25 : Number(value);
  const direction = camera.position.clone().sub(controls.target).normalize(); camera.position.copy(direction.multiplyScalar(half * 2.8)); controls.target.set(0, 0, 0);
  grid.scale.setScalar(half / 0.035); grid.position.z = -half * 0.003;
  rings.forEach((ring, i) => { const radius = [0.01, 0.02, 0.035][i]; ring.visible = radius <= half * 1.02; });
});
document.querySelector('#reset-camera')!.addEventListener('click', () => { camera.position.set(0.055, 0.044, 0.071); controls.target.set(0, 0, 0); controls.update(); });
document.querySelector('#loading')!.classList.add('hidden');
