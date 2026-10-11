import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './styles.css';

type Metadata = {
  frameCount: number; particleCount: number; particleIds: number[]; timeMyr: number[];
  counts: number[]; centerIds: number[]; centerMassMsun: number[]; stellarTypeCodes?: number[];
};
type MergerEvent = { preIndex:number; postIndex:number; timeStartMyr:number; timeEndMyr:number; eventTimeMyr?:number; incomingId:number; survivorId:number; participantIds?:number[]; survivorMassGainMsun:number|null; centralMergerCandidate:boolean; source?:string; label:string };
const FIELDS = 11;
const MASS_CHART_LAYOUT = { left: 44, right: 6, top: 31, bottom: 16 };
const TRAIL_SAMPLES_PER_SNAPSHOT = 8;
const MERGER_SLOWDOWN_FACTOR = 0.15;
// Begin a visible warning four saved outputs before the BSE merger time.
const MERGER_WARNING_SNAPSHOTS = 4;
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
      <div class="event-forecast" id="event-forecast">NEXT MERGER · LOADING EVENT DATA</div>
      <div class="merger-inset" id="merger-inset" hidden><div class="merger-inset-label" id="merger-inset-label">MERGER CLOSE-UP</div></div>
      <div class="scene-legend"><span><i class="legend-participants"></i>MERGER PARTICIPANTS</span><span><i class="legend-next"></i>NEXT EVENT INCOMING STAR</span></div>
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
        <div class="play-row"><button id="play" class="play-button"><span id="play-icon">▶</span><span id="play-label">Play</span></button><button id="prev" class="step-button" aria-label="Previous snapshot">‹</button><button id="next" class="step-button" aria-label="Next snapshot">›</button><button id="reset-time" class="step-button reset-time" aria-label="Return to start">↶</button></div>
        <div class="rate-row"><label for="speed">SIMULATION TIME / REAL SECOND</label><select id="speed" aria-label="Simulation years per real second"><option value="10">10 yr/s</option><option value="25">25 yr/s</option><option value="50">50 yr/s</option><option value="100" selected>100 yr/s</option><option value="250">250 yr/s</option><option value="500">500 yr/s</option><option value="1000">1,000 yr/s</option></select></div>
        <div class="range-wrap"><div class="timeline-event-marks" id="timeline-event-marks" aria-hidden="true"></div><input id="timeline" type="range" min="0" value="0" step="0.0000001" aria-label="Simulation timeline" aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight"><div class="range-labels"><span id="start-time">0 yr</span><span id="end-time">78,930 yr</span></div></div>
        <div class="event-jump-row"><label for="event-select">JUMP TO MERGER</label><select id="event-select" aria-label="Jump to merger event"><option value="">Select an event…</option></select></div>
        <div class="next-event" id="next-event"><span>NEXT MERGER CANDIDATE</span><b>Scanning events…</b></div>
        <div class="interp-row"><label for="interpolation">BETWEEN SNAPSHOTS</label><select id="interpolation"><option value="hermite" selected>Cubic Hermite</option><option value="linear">Linear</option><option value="raw">Raw snapshots</option></select></div>
        <label class="toggle-row" for="merger-cinematic"><span><b>Merger close-up</b><small>Separate inset + 0.15× slow motion</small></span><input id="merger-cinematic" type="checkbox" checked><span class="switch"></span></label><div class="play-hint" id="play-hint">←/→ anywhere: one snapshot · Shift+←/→: ten</div>
      </div>
      <div class="history panel"><div class="section-kicker">CENTRAL STAR MASS <span>M☉ · LOG TIME →</span></div><canvas id="mass-chart" aria-label="Central star mass over logarithmic time in years; numbered markers identify mergers in the event menu"></canvas><div class="chart-labels"><span id="mass-chart-start">0 yr</span><span id="mass-chart-current">—</span><span id="mass-chart-end">—</span></div><div class="chart-key"><i class="chart-vms-key"></i>VMS merger <i class="chart-other-key"></i>other merger · numbers match merger menu</div></div>
      <div class="monitor panel"><div class="section-kicker">TARGET MONITOR <span id="target-status">CLICK A STAR</span></div><div id="target-details" class="target-details"><span>Select a particle in the 3D view to follow its motion and BSE properties.</span></div></div>
      <div class="appearance panel"><div class="section-kicker">LIGHT & COLOUR</div><div class="appearance-row"><label for="colour-mode">STAR COLOUR</label><select id="colour-mode"><option value="temperature" selected>Effective temperature</option><option value="velocity">Relative velocity</option><option value="type">BSE type code</option><option value="uniform">Soft white</option></select></div><label class="toggle-row" for="diffraction"><span><b>Diffraction spikes</b><small>Subtle 4-point telescope aperture effect</small></span><input id="diffraction" type="checkbox" checked><span class="switch"></span></label><div class="appearance-note" id="bse-note">BSE type is shown as a categorical code; temperature uses BSE luminosity and radius.</div></div>
      <div class="interaction panel"><div class="section-kicker">NAVIGATE THE SYSTEM</div><div class="interaction-keys"><span><b>DRAG</b> rotate</span><span><b>SCROLL</b> zoom</span><span><b>RIGHT-DRAG</b> pan</span><span><b>CLICK</b> inspect star</span></div></div>
    </aside>
  </section>
  <footer><span>PeTar <i>·</i> INTERACTIVE N-BODY EXPLORER</span><span id="frame-summary">FULL RECORDED SIMULATION · 793 SNAPSHOTS</span><span>POSITIONS & VELOCITIES RELATIVE TO THE MOST MASSIVE PARTICLE</span></footer>
</main>`;

const [meta, buffer, mergerEvents] = await Promise.all([
  fetch(`${import.meta.env.BASE_URL}data/metadata.json`).then(r => { if (!r.ok) throw new Error('metadata.json unavailable'); return r.json() as Promise<Metadata>; }),
  fetch(`${import.meta.env.BASE_URL}data/snapshots.bin`).then(r => { if (!r.ok) throw new Error('snapshots.bin unavailable'); return r.arrayBuffer(); }),
  fetch(`${import.meta.env.BASE_URL}data/events.json`).then(r => r.ok ? r.json() as Promise<MergerEvent[]> : [])
]);
if (buffer.byteLength !== meta.frameCount * meta.particleCount * FIELDS * 4) throw new Error('Snapshot cache size does not match metadata');
const data = new Float32Array(buffer), ids = meta.particleIds, idToIndex = new Map(ids.map((id, i) => [id, i]));
const host = document.querySelector<HTMLDivElement>('#scene')!;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#090d13');
const camera = new THREE.PerspectiveCamera(42, 1, 0.0001, 20); camera.position.set(0.055, 0.044, 0.071);
const mergerCamera = new THREE.PerspectiveCamera(34, 1, 0.000001, 2);
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
const renderedPositions = new Float32Array(meta.particleCount * 3), renderedDiffractionSizes = new Float32Array(meta.particleCount);
const particleStates = Array.from({length:meta.particleCount},()=>({x:0,y:0,z:0,vx:0,vy:0,vz:0,mass:0,type:0,radius:0,lum:0,present:false}));
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
const typePalette:[[number,number,number],...[number,number,number][]]=[[.52,.65,.76],[.45,.73,.88],[.56,.82,.72],[.92,.78,.42],[.95,.54,.36],[.76,.55,.88],[.92,.4,.48],[.7,.75,.82],[.52,.58,.68],[.8,.7,.9],[.66,.78,.94],[.86,.76,.58],[.92,.57,.45],[.7,.82,.75],[.85,.72,.7],[.9,.82,.6]];
let framePosition = 0, playing = false, last = performance.now();
let selectedIndex = -1, lastUiUpdate = 0, lastChartSize = '';
let cameraQuaternion = new THREE.Quaternion();
const lastDiffractionOrientation = new THREE.Quaternion(0, 0, 0, 0);
const selectionRing = new THREE.Mesh(new THREE.TorusGeometry(.00066,.000045,8,40),new THREE.MeshBasicMaterial({color:'#8ff5e8',toneMapped:false,depthTest:false})); selectionRing.visible=false; selectionRing.renderOrder=7; scene.add(selectionRing);
const selectionGlow = new THREE.Mesh(new THREE.SphereGeometry(.00022,18,12),new THREE.MeshBasicMaterial({color:'#65f5df',transparent:true,opacity:.25,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,depthTest:false}));selectionGlow.visible=false;selectionGlow.renderOrder=6;scene.add(selectionGlow);
const trailGeometry=new THREE.BufferGeometry(),trailPositions=new Float32Array((meta.frameCount*TRAIL_SAMPLES_PER_SNAPSHOT+8)*3),trailAttribute=new THREE.BufferAttribute(trailPositions,3);trailAttribute.setUsage(THREE.DynamicDrawUsage);trailGeometry.setAttribute('position',trailAttribute);trailGeometry.setDrawRange(0,0);
const eventTrail=new THREE.Line(trailGeometry,new THREE.LineBasicMaterial({color:'#ff3025',transparent:true,opacity:.88}));eventTrail.visible=false;eventTrail.renderOrder=5;scene.add(eventTrail);
let activeTrailEvent=-1,trailPointCount=0,trailLastPosition=-1,trailNextSample=0;
let cinematicEventIndex=-1,cinematicViewDirection=new THREE.Vector3(),cinematicCameraDistance=0;
const mergerFocus=new THREE.Vector3();
const mergerInset=document.querySelector<HTMLDivElement>('#merger-inset')!,mergerInsetLabel=document.querySelector<HTMLDivElement>('#merger-inset-label')!;
function setMatrix(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, scale: number, quaternion = dummy.quaternion) {
  dummy.position.set(x, y, z); dummy.quaternion.copy(quaternion); dummy.scale.setScalar(scale); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
}
function putFrame(position: number, updateUi = true) {
  framePosition = THREE.MathUtils.clamp(position, 0, meta.frameCount - 1);
  const lower = Math.floor(framePosition), upper = Math.min(lower + 1, meta.frameCount - 1), alpha = framePosition - lower;
  const mode = (document.querySelector<HTMLSelectElement>('#interpolation')!).value;
  const continuous = lower !== upper && mode !== 'raw';
  const displayFrame = continuous ? (alpha < 0.5 ? lower : upper) : mode === 'raw' ? Math.round(framePosition) : (alpha < 0.5 ? lower : upper);
  const centerIndex = idToIndex.get(meta.centerIds[displayFrame]);
  const centerChanged=meta.centerIds[lower]!==meta.centerIds[upper],lowerCenterIndex=idToIndex.get(meta.centerIds[lower]),upperCenterIndex=idToIndex.get(meta.centerIds[upper]);
  const colorMode = (document.querySelector<HTMLSelectElement>('#colour-mode')!).value;
  const t0 = meta.timeMyr[lower], t1 = meta.timeMyr[upper], dt = t1 - t0;
  const timeMyr = mode === 'raw' ? meta.timeMyr[Math.round(framePosition)] : THREE.MathUtils.lerp(t0, t1, alpha);
  const nextEventForView=mergerEvents.find(e=>(e.eventTimeMyr??e.timeEndMyr)>timeMyr);
  const u = continuous ? alpha : 0, u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  for (let i = 0; i < meta.particleCount; i++) {
    const o0 = lower * meta.particleCount * FIELDS + i * FIELDS;
    const o1 = upper * meta.particleCount * FIELDS + i * FIELDS;
    const chosen = continuous ? (alpha < 0.5 ? o0 : o1) : displayFrame * meta.particleCount * FIELDS + i * FIELDS;
    const present0 = data[o0 + 10] > 0.5, present1 = data[o1 + 10] > 0.5;
    const interpolateParticle = continuous && present0 && present1;
    const fadingAppearance=continuous&&!present0&&present1;
    let present = interpolateParticle || data[chosen + 10] > 0.5;
    let x = present ? data[chosen] : 0, y = present ? data[chosen + 1] : 0, z = present ? data[chosen + 2] : 0;
    if (interpolateParticle) {
      if (mode === 'hermite') {
        x = h00 * data[o0] + h10 * dt * data[o0 + 3] + h01 * data[o1] + h11 * dt * data[o1 + 3];
        y = h00 * data[o0 + 1] + h10 * dt * data[o0 + 4] + h01 * data[o1 + 1] + h11 * dt * data[o1 + 4];
        z = h00 * data[o0 + 2] + h10 * dt * data[o0 + 5] + h01 * data[o1 + 2] + h11 * dt * data[o1 + 5];
      } else {
        x = THREE.MathUtils.lerp(data[o0], data[o1], alpha); y = THREE.MathUtils.lerp(data[o0 + 1], data[o1 + 1], alpha); z = THREE.MathUtils.lerp(data[o0 + 2], data[o1 + 2], alpha);
      }
    }
    const isCenter = !centerChanged&&i === centerIndex;
    const centerFade=centerChanged?(i===lowerCenterIndex?alpha:i===upperCenterIndex?1-alpha:1):isCenter?0:1;
    const mass = interpolateParticle ? THREE.MathUtils.lerp(data[o0 + 6], data[o1 + 6], alpha) : fadingAppearance?data[o1+6]:data[chosen + 6];
    const lum = interpolateParticle ? THREE.MathUtils.lerp(data[o0 + 9], data[o1 + 9], alpha) : fadingAppearance?data[o1+9]:data[chosen + 9];
    const radius = interpolateParticle ? THREE.MathUtils.lerp(data[o0 + 8], data[o1 + 8], alpha) : fadingAppearance?data[o1+8]:data[chosen + 8];
    const eventForParticle=mergerEvents.find(e=>e.incomingId===ids[i]&&e.preIndex===lower&&e.postIndex===upper);
    const fadingIncoming=Boolean(eventForParticle&&present0&&!present1&&timeMyr<t1);
    let eventFade=fadingAppearance?alpha:1;
    if(fadingIncoming&&eventForParticle){present=true;eventFade=1-THREE.MathUtils.clamp((timeMyr-t0)/Math.max(t1-t0,1e-12),0,1);const elapsed=Math.max(0,timeMyr-t0);x=data[o0]+data[o0+3]*elapsed;y=data[o0+1]+data[o0+4]*elapsed;z=data[o0+2]+data[o0+5]*elapsed;}
    if(fadingAppearance){present=alpha>0;const elapsed=Math.max(0,t1-timeMyr);x=data[o1]-data[o1+3]*elapsed;y=data[o1+1]-data[o1+4]*elapsed;z=data[o1+2]-data[o1+5]*elapsed;}
    const visualRadius = present ? (0.00011 + Math.min(0.00009, Math.log10(Math.max(1, mass)) * 0.000035))*eventFade*centerFade : 0;
    setMatrix(stars, i, x, y, z, visualRadius);
    setMatrix(halos, i, x, y, z, visualRadius * 2.35);
    const tempValid = Number.isFinite(lum) && Number.isFinite(radius) && lum > 0 && radius > 0;
    const teff = tempValid ? 5772 * Math.pow(lum, 0.25) / Math.sqrt(radius) : Number.NaN;
    const vx = interpolateParticle ? THREE.MathUtils.lerp(data[o0 + 3], data[o1 + 3], alpha) : data[chosen + 3];
    const vy = interpolateParticle ? THREE.MathUtils.lerp(data[o0 + 4], data[o1 + 4], alpha) : data[chosen + 4];
    const vz = interpolateParticle ? THREE.MathUtils.lerp(data[o0 + 5], data[o1 + 5], alpha) : data[chosen + 5];
    const stellarType = data[chosen + 7];
    const typeColor = typePalette[THREE.MathUtils.clamp(Math.round(stellarType)||0,0,typePalette.length-1)];
    const colour = isCenter ? [0, 0, 0] : colorMode === 'uniform' ? [0.78, 0.84, 0.91] : colorMode === 'type' ? typeColor : colorMode === 'velocity' ? speedColor(Math.hypot(vx, vy, vz) * 0.977792) : tempValid && Number.isFinite(teff) && teff > 0 ? blackbodyColor(teff) : [0.34, 0.39, 0.47];
    const state=particleStates[i]; Object.assign(state,{x,y,z,vx,vy,vz,mass,type:stellarType,radius,lum,present});
    const mergerParticipant=mergerEvents.some(e=>e.incomingId===ids[i]&&timeMyr<=meta.timeMyr[e.postIndex]);
    const nextIncoming=nextEventForView?.incomingId===ids[i];
    tempColor.setRGB(colour[0], colour[1], colour[2]); stars.setColorAt(i, tempColor);
    tempColor.setRGB(colour[0], colour[1], colour[2]); halos.setColorAt(i, tempColor);
    if(mergerParticipant||nextIncoming){tempColor.setRGB(...(nextIncoming?[1,.055,.035]:[1,.58,.16]) as [number,number,number]);stars.setColorAt(i,tempColor);halos.setColorAt(i,tempColor);}
    const logLum = tempValid ? THREE.MathUtils.clamp(Math.log10(lum + 1) / 5, 0.12, 1) : 0;
    const diffractionSize = present && !isCenter ? visualRadius * (14 + logLum * 10) : 0;
    renderedPositions[i * 3] = x; renderedPositions[i * 3 + 1] = y; renderedPositions[i * 3 + 2] = z; renderedDiffractionSizes[i] = diffractionSize;
    setMatrix(diffraction, i, x, y, z, diffractionSize, cameraQuaternion);
  }
  stars.instanceMatrix.needsUpdate = true; halos.instanceMatrix.needsUpdate = true; diffraction.instanceMatrix.needsUpdate = true;
  if (stars.instanceColor) stars.instanceColor.needsUpdate = true; if (halos.instanceColor) halos.instanceColor.needsUpdate = true;
  diffraction.visible = (document.querySelector<HTMLInputElement>('#diffraction')!).checked;
  centerCore.position.set(0, 0, 0); centerHalo.position.set(0, 0, 0);
  document.querySelector('#color-mode-label')!.textContent = colorMode === 'temperature' ? 'BLACKBODY COLOUR · BSE L / R' : colorMode === 'velocity' ? 'RELATIVE SPEED · km/s' : colorMode === 'type' ? 'BSE STELLAR TYPE CODE' : 'UNIFORM STAR COLOUR';
  const time = timeMyr * 1e6;
  const snapshotLabel = continuous && alpha > 0.005 ? `BETWEEN ${lower}–${upper} · ${mode.toUpperCase()}` : `SNAPSHOT ${String(displayFrame).padStart(3, '0')} / ${meta.frameCount - 1}`;
  updateSelectionIndicator();
  updateEventTrail(framePosition,nextEventForView);
  if (!updateUi) return;
  document.querySelector('#time-value')!.textContent = `${time.toLocaleString('en-US', { maximumFractionDigits: 1 })} yr`;
  document.querySelector('#snapshot-value')!.textContent = snapshotLabel;
  document.querySelector('#date-progress')!.textContent = `SNAPSHOT ${displayFrame + 1} OF ${meta.frameCount}`;
  const particleCount = continuous ? Math.round(THREE.MathUtils.lerp(meta.counts[lower], meta.counts[upper], alpha)) : meta.counts[displayFrame];
  const vmsMass = continuous ? THREE.MathUtils.lerp(meta.centerMassMsun[lower], meta.centerMassMsun[upper], alpha) : meta.centerMassMsun[displayFrame];
  const centerId = continuous ? meta.centerIds[lower] : meta.centerIds[displayFrame];
  document.querySelector('#particle-count')!.textContent = particleCount.toLocaleString('en-US');
  document.querySelector('#vms-mass')!.textContent = Math.round(vmsMass).toLocaleString('en-US');
  document.querySelector('#center-id')!.textContent = `ID ${centerId}`;
  (document.querySelector('#timeline') as HTMLInputElement).value = String(timeMyr);
  document.querySelector('#frame-summary')!.textContent = `${snapshotLabel} · ${time.toLocaleString('en-US', { maximumFractionDigits: 1 })} YR`;
  document.querySelector('#mass-chart-current')!.textContent=`${time.toLocaleString('en-US',{maximumFractionDigits:0})} yr`;
  updateTargetMonitor(); drawMassChart(framePosition);
  const eventNow=mode==='raw'?mergerEvents.find(e=>displayFrame===e.postIndex&&timeMyr>=(e.eventTimeMyr??e.timeEndMyr)):mergerEvents.find(e=>lower===e.preIndex&&upper===e.postIndex&&timeMyr>=(e.eventTimeMyr??e.timeEndMyr));
  const futureEvent=mergerEvents.find(e=>(e.eventTimeMyr!==undefined?e.eventTimeMyr*1e6:meta.timeMyr[e.postIndex]*1e6)>time);
  const warningEvent=futureEvent&&timeToFramePosition(futureEvent.eventTimeMyr??futureEvent.timeEndMyr)-framePosition<=MERGER_WARNING_SNAPSHOTS?futureEvent:undefined;
  const warningSnapshots=warningEvent?Math.max(0,Math.ceil(timeToFramePosition(warningEvent.eventTimeMyr??warningEvent.timeEndMyr)-framePosition)):0;
  const nextEvent=document.querySelector('#next-event')!;
  const participantLabel=futureEvent?.participantIds?`IDs ${futureEvent.participantIds.join(' + ')}`:`ID ${futureEvent?.incomingId}`;
  nextEvent.innerHTML=futureEvent?`<span>NEXT ${futureEvent.source==='BSE Coalescence'?'BSE COALESCENCE':'MERGER CANDIDATE'} · ${participantLabel}</span><b>~${Math.max(0,Math.round((futureEvent.eventTimeMyr??futureEvent.timeEndMyr)*1e6-time)).toLocaleString('en-US')} yr · ${Math.round(futureEvent.timeStartMyr*1e6).toLocaleString('en-US')}–${Math.round(futureEvent.timeEndMyr*1e6).toLocaleString('en-US')} yr snapshot bracket</b>`:'<span>MERGER EVENTS</span><b>No later merger event in the supplied record</b>';
  const forecast=document.querySelector('#event-forecast')!;
  forecast.classList.toggle('active',Boolean(eventNow));
  forecast.classList.toggle('warning',Boolean(warningEvent&&!eventNow));
  forecast.innerHTML=eventNow?`<span>MERGER EVENT · ${eventNow.source==='BSE Coalescence'?'BSE COALESCENCE':'CANDIDATE'}</span><b>ID ${eventNow.incomingId} → ID ${eventNow.survivorId}</b><small>${Math.round((eventNow.eventTimeMyr??eventNow.timeEndMyr)*1e6).toLocaleString('en-US')} yr · snapshot bracket ${Math.round(eventNow.timeStartMyr*1e6).toLocaleString('en-US')}–${Math.round(eventNow.timeEndMyr*1e6).toLocaleString('en-US')} yr</small>`:warningEvent?`<span>MERGER WARNING · ${warningEvent.source==='BSE Coalescence'?'BSE COALESCENCE':'CANDIDATE'}</span><b>ID ${warningEvent.incomingId} → ID ${warningEvent.survivorId}</b><small>~${warningSnapshots} snapshots · T−${Math.max(0,Math.round((warningEvent.eventTimeMyr??warningEvent.timeEndMyr)*1e6-time)).toLocaleString('en-US')} yr</small>`:futureEvent?`<span>NEXT MERGER · ${futureEvent.source==='BSE Coalescence'?'BSE EVENT':'CANDIDATE'}</span><b>ID ${futureEvent.incomingId} → ID ${futureEvent.survivorId}</b><small>T−${Math.max(0,Math.round((futureEvent.eventTimeMyr??futureEvent.timeEndMyr)*1e6-time)).toLocaleString('en-US')} yr · ${Math.round((futureEvent.eventTimeMyr??futureEvent.timeEndMyr)*1e6).toLocaleString('en-US')} yr</small>`:'<span>MERGER FORECAST</span><b>No further merger events in this record</b>';
  updatePlayButton();
}
function resize() { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(host); resize();
renderer.setAnimationLoop((now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  let cinematicEvent=syncMergerCinematic();
  if (playing) {
    const baseRate=Number((document.querySelector<HTMLSelectElement>('#speed')!).value),rate=baseRate*(cinematicEvent?MERGER_SLOWDOWN_FACTOR:1);
    const intervalYears=(meta.timeMyr[Math.min(Math.floor(framePosition),meta.frameCount-2)+1]-meta.timeMyr[Math.min(Math.floor(framePosition),meta.frameCount-2)])*1e6;
    framePosition = Math.min(meta.frameCount - 1, framePosition + dt * rate / intervalYears);
    const refreshUi=now-lastUiUpdate>120; putFrame(framePosition,refreshUi); if(refreshUi)lastUiUpdate=now;
    if (framePosition >= meta.frameCount - 1) { playing = false; updatePlayButton(); }
  }
  cinematicEvent=syncMergerCinematic();
  updateMergerInsetCamera(cinematicEvent);
  controls.update(); cameraQuaternion.copy(camera.quaternion);
  // Keep the selected-star torus face-on to the current view, even while
  // playback is paused and the user is orbiting the camera.
  if (selectionRing.visible) selectionRing.quaternion.copy(cameraQuaternion);
  if (1 - Math.abs(lastDiffractionOrientation.dot(cameraQuaternion)) > 1e-7) {
    for (let i = 0; i < meta.particleCount; i++) {
      setMatrix(diffraction, i, renderedPositions[i * 3], renderedPositions[i * 3 + 1], renderedPositions[i * 3 + 2], renderedDiffractionSizes[i], cameraQuaternion);
    }
    diffraction.instanceMatrix.needsUpdate = true; lastDiffractionOrientation.copy(cameraQuaternion);
  }
  renderer.setScissorTest(false);renderer.setViewport(0,0,host.clientWidth,host.clientHeight);renderer.render(scene, camera);
  if(cinematicEvent){
    const bounds=host.getBoundingClientRect(),rect=mergerInset.getBoundingClientRect(),x=rect.left-bounds.left,y=bounds.bottom-rect.bottom,w=rect.width,h=rect.height;
    mergerCamera.aspect=w/h;mergerCamera.updateProjectionMatrix();renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);renderer.setScissorTest(true);renderer.clearDepth();renderer.render(scene,mergerCamera);renderer.setScissorTest(false);
  }
});
function updatePlayButton() {
  const atEnd = framePosition >= meta.frameCount - 1;
  const icon = playing ? 'Ⅱ' : atEnd ? '↺' : '▶';
  const label = playing ? 'Pause' : atEnd ? 'Replay' : 'Play';
  const iconElement = document.querySelector('#play-icon')!;
  const labelElement = document.querySelector('#play-label')!;
  if (iconElement.textContent !== icon) iconElement.textContent = icon;
  if (labelElement.textContent !== label) labelElement.textContent = label;
}
function syncMergerCinematic(){
  const enabled=(document.querySelector<HTMLInputElement>('#merger-cinematic')!).checked;
  if(!enabled)cinematicEventIndex=-1;
  if(cinematicEventIndex>=0&&framePosition>mergerEvents[cinematicEventIndex].postIndex+1e-4)cinematicEventIndex=-1;
  if(enabled&&playing&&cinematicEventIndex<0){
    cinematicEventIndex=mergerEvents.findIndex(event=>{const eventPosition=timeToFramePosition(event.eventTimeMyr??event.timeEndMyr);return framePosition>=eventPosition-1&&framePosition<=event.postIndex;});
    if(cinematicEventIndex>=0){cinematicViewDirection.copy(camera.position).sub(controls.target).normalize();cinematicCameraDistance=camera.position.distanceTo(controls.target);}
  }
  const event=cinematicEventIndex>=0?mergerEvents[cinematicEventIndex]:undefined;
  mergerInset.hidden=!event;
  if(event)mergerInsetLabel.textContent=`MERGER ${cinematicEventIndex+1} / ${mergerEvents.length} · ID ${event.incomingId} · SLOW ×${MERGER_SLOWDOWN_FACTOR}`;
  return event;
}
function updateMergerInsetCamera(event?:MergerEvent){
  if(!event)return;
  const slot=idToIndex.get(event.incomingId);if(slot===undefined)return;
  const state=particleStates[slot],focus=state.present?mergerFocus.set(state.x,state.y,state.z):mergerFocus.set(0,0,0);
  const closeupDistance=THREE.MathUtils.clamp(cinematicCameraDistance*.12,.0012,.0035);
  mergerCamera.position.copy(focus).addScaledVector(cinematicViewDirection,closeupDistance);mergerCamera.up.copy(camera.up);mergerCamera.lookAt(focus);
}
function setPlaying(value: boolean) { playing = value; last = performance.now(); updatePlayButton(); }
(document.querySelector('#timeline') as HTMLInputElement).max = String(meta.timeMyr.at(-1)!);
document.querySelector('#start-time')!.textContent = `${Math.round(meta.timeMyr[0] * 1e6).toLocaleString('en-US')} yr`;
document.querySelector('#end-time')!.textContent = `${Math.round(meta.timeMyr.at(-1)! * 1e6).toLocaleString('en-US')} yr`;
document.querySelector('#mass-chart-start')!.textContent = `${Math.round(meta.timeMyr[0] * 1e6).toLocaleString('en-US')} yr`;
document.querySelector('#mass-chart-end')!.textContent = `${Math.round(meta.timeMyr.at(-1)! * 1e6).toLocaleString('en-US')} yr`;
putFrame(0);
document.querySelector('#play')!.addEventListener('click', () => {
  if (playing) { setPlaying(false); return; }
  if (framePosition >= meta.frameCount - 1) putFrame(0);
  setPlaying(true);
});
document.querySelector('#prev')!.addEventListener('click', () => putFrame(Math.max(0, Math.round(framePosition) - 1)));
document.querySelector('#next')!.addEventListener('click', () => putFrame(Math.min(meta.frameCount - 1, Math.round(framePosition) + 1)));
document.querySelector('#reset-time')!.addEventListener('click', () => { putFrame(0); setPlaying(false); });
const timeline=document.querySelector<HTMLInputElement>('#timeline')!;
timeline.addEventListener('input', event => putFrame(timeToFramePosition(Number((event.target as HTMLInputElement).value))));
timeline.addEventListener('keydown',event=>{
  if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
  event.preventDefault();
  const direction=event.key==='ArrowRight'?1:-1;
  putFrame(framePosition+direction*(event.shiftKey?10:1));
});
document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||(event.key!=='ArrowLeft'&&event.key!=='ArrowRight'))return;
  const target=event.target;
  if(target instanceof Element){
    if(target.closest('#timeline,input,select,textarea,button,a,[contenteditable="true"]'))return;
  }
  event.preventDefault();
  event.stopPropagation();
  const direction=event.key==='ArrowRight'?1:-1;
  putFrame(framePosition+direction*(event.shiftKey?10:1));
},true);
document.querySelector('#interpolation')!.addEventListener('change', () => putFrame(framePosition));
document.querySelector('#colour-mode')!.addEventListener('change', () => putFrame(framePosition));
document.querySelector('#diffraction')!.addEventListener('change', () => { diffraction.visible = (document.querySelector<HTMLInputElement>('#diffraction')!).checked; });
document.querySelector('#view-range')!.addEventListener('change', event => {
  const value = (event.target as HTMLSelectElement).value, half = value === 'auto' ? 0.25 : Number(value);
  const direction = camera.position.clone().sub(controls.target).normalize(); camera.position.copy(direction.multiplyScalar(half * 2.8)); controls.target.set(0, 0, 0);
  grid.scale.setScalar(half / 0.035); grid.position.z = -half * 0.003;
  rings.forEach((ring, i) => { const radius = [0.01, 0.02, 0.035][i]; ring.visible = radius <= half * 1.02; });
});
document.querySelector('#reset-camera')!.addEventListener('click', () => { camera.position.set(0.055, 0.044, 0.071); controls.target.set(0, 0, 0); controls.update(); });
document.querySelector('#loading')!.classList.add('hidden');
function timeToFramePosition(timeMyr:number){const times=meta.timeMyr;let lo=0,hi=times.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(times[mid]<=timeMyr)lo=mid;else hi=mid;}const span=times[hi]-times[lo];return lo+(span>0?THREE.MathUtils.clamp((timeMyr-times[lo])/span,0,1):0);}
const markerHost=document.querySelector('#timeline-event-marks')!,eventSelect=document.querySelector<HTMLSelectElement>('#event-select')!;
mergerEvents.forEach((e,i)=>{const exactTime=e.eventTimeMyr??e.timeEndMyr;const mark=document.createElement('i');mark.title=`${e.source??'Merger candidate'} · ${exactTime*1e6} yr · IDs ${e.participantIds?.join(' + ')??e.incomingId}`;mark.style.left=`${100*(exactTime-meta.timeMyr[0])/(meta.timeMyr.at(-1)!-meta.timeMyr[0])}%`;markerHost.append(mark);const option=document.createElement('option');option.value=String(i);option.textContent=`#${i+1} · ${(exactTime*1e6).toLocaleString('en-US',{maximumFractionDigits:1})} yr · IDs ${e.participantIds?.join(' + ')??e.incomingId}`;eventSelect.append(option);});
eventSelect.addEventListener('change',()=>{const index=Number(eventSelect.value);if(eventSelect.value&&mergerEvents[index])putFrame(timeToFramePosition(mergerEvents[index].eventTimeMyr??mergerEvents[index].timeEndMyr));});
const bseCodes=meta.stellarTypeCodes??[];
document.querySelector('#bse-note')!.textContent=`Snapshot BSE type code${bseCodes.length===1?'':'s'}: ${bseCodes.join(', ')||'not present'}${bseCodes.length===1&&bseCodes[0]===1?' (main sequence throughout this archive). ':'. '}Effective temperature uses BSE luminosity and radius.`;

function getEventTrailPoint(slot:number,position:number,event:MergerEvent,mode:string){
  const p=THREE.MathUtils.clamp(position,0,meta.frameCount-1),lo=Math.floor(p),hi=Math.min(lo+1,meta.frameCount-1),alpha=p-lo,o0=(lo*meta.particleCount+slot)*FIELDS,o1=(hi*meta.particleCount+slot)*FIELDS,present0=data[o0+10]>.5,present1=data[o1+10]>.5;
  if(mode==='raw'){const o=(Math.round(p)*meta.particleCount+slot)*FIELDS;return data[o+10]>.5?[data[o],data[o+1],data[o+2]] as [number,number,number]:null;}
  if(lo===event.preIndex&&hi===event.postIndex&&present0&&!present1){const elapsed=THREE.MathUtils.clamp(meta.timeMyr[lo]+(meta.timeMyr[hi]-meta.timeMyr[lo])*alpha-meta.timeMyr[lo],0,meta.timeMyr[hi]-meta.timeMyr[lo]);return [data[o0]+data[o0+3]*elapsed,data[o0+1]+data[o0+4]*elapsed,data[o0+2]+data[o0+5]*elapsed] as [number,number,number];}
  if(present0&&present1){
    if(mode==='hermite'){
      const dt=meta.timeMyr[hi]-meta.timeMyr[lo],u2=alpha*alpha,u3=u2*alpha,h00=2*u3-3*u2+1,h10=u3-2*u2+alpha,h01=-2*u3+3*u2,h11=u3-u2;
      return [0,1,2].map(axis=>h00*data[o0+axis]+h10*dt*data[o0+3+axis]+h01*data[o1+axis]+h11*dt*data[o1+3+axis]) as [number,number,number];
    }
    return [0,1,2].map(axis=>THREE.MathUtils.lerp(data[o0+axis],data[o1+axis],alpha)) as [number,number,number];
  }
  const o=present0?o0:present1?o1:-1;return o<0?null:[data[o],data[o+1],data[o+2]] as [number,number,number];
}
function updateEventTrail(position:number,nextEvent?:MergerEvent){
  const nextIndex=nextEvent?mergerEvents.indexOf(nextEvent):-1,rewind=position<trailLastPosition-1e-6;
  if(nextIndex!==activeTrailEvent||rewind){activeTrailEvent=nextIndex;trailPointCount=0;trailNextSample=(Math.floor(position*TRAIL_SAMPLES_PER_SNAPSHOT)+1)/TRAIL_SAMPLES_PER_SNAPSHOT;trailGeometry.setDrawRange(0,0);eventTrail.visible=false;}
  if(!nextEvent){trailLastPosition=position;return;}
  const slot=idToIndex.get(nextEvent.incomingId);if(slot===undefined){trailLastPosition=position;return;}
  const mode=(document.querySelector<HTMLSelectElement>('#interpolation')!).value,writePoint=(index:number,point:[number,number,number])=>{const offset=index*3;trailPositions[offset]=point[0];trailPositions[offset+1]=point[1];trailPositions[offset+2]=point[2];};
  if(trailPointCount===0){const initial=getEventTrailPoint(slot,position,nextEvent,mode);if(initial)writePoint(trailPointCount++,initial);}
  const sampleStep=1/TRAIL_SAMPLES_PER_SNAPSHOT;
  while(trailNextSample<=position+1e-8&&trailNextSample<=nextEvent.postIndex){const point=getEventTrailPoint(slot,trailNextSample,nextEvent,mode);if(point)writePoint(trailPointCount++,point);trailNextSample+=sampleStep;}
  const endpoint=getEventTrailPoint(slot,position,nextEvent,mode);let drawCount=trailPointCount;
  if(endpoint&&Math.abs(position*TRAIL_SAMPLES_PER_SNAPSHOT-Math.round(position*TRAIL_SAMPLES_PER_SNAPSHOT))>1e-6)writePoint(drawCount++,endpoint);
  trailAttribute.needsUpdate=true;trailGeometry.setDrawRange(0,drawCount);eventTrail.visible=drawCount>1;trailLastPosition=position;
}
function updateTargetMonitor(){
  const status=document.querySelector('#target-status')!,box=document.querySelector('#target-details')!;
  if(selectedIndex<0){status.textContent='CLICK A STAR';box.innerHTML='<span>Select a particle in the 3D view to follow its motion and BSE properties.</span>';return;}
  const s=particleStates[selectedIndex];status.textContent=`ID ${ids[selectedIndex]}${s.present?'':' · ABSENT'}`;
  const speed=Math.hypot(s.vx,s.vy,s.vz)*.977792, dist=Math.hypot(s.x,s.y,s.z);
  const typeNames=['fully convective MS','main sequence','Hertzsprung gap','first giant branch','core helium burning','first AGB','second AGB','naked-helium MS','naked-helium HG','naked-helium giant','helium white dwarf','carbon-oxygen white dwarf','oxygen-neon white dwarf','neutron star','black hole','massless SN remnant'];
  const typeCode=Math.round(s.type),typeName=typeNames[typeCode]??'unknown';
  box.innerHTML=`<div><span>MASS</span><b>${s.mass.toFixed(2)} M☉</b></div><div><span>BSE TYPE</span><b>${typeName} (${typeCode})</b></div><div><span>POSITION · pc</span><b>${s.x.toExponential(2)}, ${s.y.toExponential(2)}, ${s.z.toExponential(2)}</b></div><div><span>VELOCITY · km/s</span><b>${(s.vx*.977792).toFixed(2)}, ${(s.vy*.977792).toFixed(2)}, ${(s.vz*.977792).toFixed(2)}</b></div><div><span>SPEED / RADIUS</span><b>${speed.toFixed(2)} km/s · ${dist.toExponential(2)} pc</b></div><div><span>BSE RADIUS / LUMINOSITY</span><b>${s.radius.toFixed(2)} R☉ · ${s.lum.toExponential(2)} L☉</b></div>`;
}
function updateSelectionIndicator(){
  const visible=selectedIndex>=0&&particleStates[selectedIndex].present;selectionRing.visible=selectionGlow.visible=visible;
  if(!visible)return;
  const s=particleStates[selectedIndex];selectionRing.position.set(s.x,s.y,s.z);selectionGlow.position.copy(selectionRing.position);selectionRing.quaternion.copy(camera.quaternion);
  const scale=Math.max(1.35,Math.min(2.8,1.45+Math.sqrt(Math.max(s.mass,1)/100)));selectionRing.scale.setScalar(scale);selectionGlow.scale.setScalar(scale*1.2);
}
function drawMassChart(position:number){
  const canvas=document.querySelector<HTMLCanvasElement>('#mass-chart')!,rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
  const dpr=Math.min(devicePixelRatio||1,2),key=`${rect.width}x${rect.height}@${dpr}`;
  if(key!==lastChartSize){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);lastChartSize=key;}
  const ctx=canvas.getContext('2d')!;ctx.setTransform(dpr,0,0,dpr,0,0);const w=rect.width,h=rect.height,{left,right,top,bottom}=MASS_CHART_LAYOUT;ctx.clearRect(0,0,w,h);
  const vals=meta.centerMassMsun,rawMin=Math.min(...vals),rawMax=Math.max(...vals),rawSpan=Math.max(rawMax-rawMin,1),roughStep=rawSpan/4,magnitude=10**Math.floor(Math.log10(roughStep)),scaled=roughStep/magnitude,step=(scaled<=1?1:scaled<=2?2:scaled<=5?5:10)*magnitude,min=Math.floor(rawMin/step)*step,max=Math.ceil(rawMax/step)*step||min+step,span=Math.max(max-min,step),plotHeight=h-top-bottom,plotWidth=w-left-right;
  const yFor=(mass:number)=>top+plotHeight-(mass-min)/span*plotHeight;
  ctx.font="8px 'DM Mono', monospace";ctx.textAlign='right';ctx.textBaseline='middle';ctx.lineWidth=1;
  for(let tick=min;tick<=max+step*.01;tick+=step){const y=yFor(tick);ctx.strokeStyle='#34403d';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();ctx.fillStyle='#929d98';ctx.fillText(Math.round(tick).toLocaleString('en-US'),left-5,y);}
  const startTime=meta.timeMyr[0],endTime=meta.timeMyr.at(-1)!,durationYears=(endTime-startTime)*1e6,logDuration=Math.log10(1+durationYears/100),xForTime=(timeMyr:number)=>left+plotWidth*Math.log10(1+Math.max(0,(timeMyr-startTime)*1e6)/100)/logDuration;
  const lanes=[-Infinity,-Infinity,-Infinity,-Infinity];
  mergerEvents.forEach((event,index)=>{
    const eventTime=event.eventTimeMyr??event.timeEndMyr,x=xForTime(eventTime),lane=lanes.findIndex(lastX=>x-lastX>=13),chosenLane=lane>=0?lane:lanes.indexOf(Math.min(...lanes)),labelX=THREE.MathUtils.clamp(Math.max(x,lanes[chosenLane]+13),left+6,w-right-6),labelY=4+chosenLane*7,color=event.centralMergerCandidate?'#ff8070':'#c2a36e';
    lanes[chosenLane]=labelX;ctx.save();ctx.globalAlpha=.46;ctx.strokeStyle=color;ctx.setLineDash([2,2]);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,h-bottom);ctx.stroke();ctx.restore();
    if(Math.abs(labelX-x)>2){ctx.strokeStyle=color;ctx.globalAlpha=.75;ctx.beginPath();ctx.moveTo(x,labelY+3);ctx.lineTo(labelX,labelY+3);ctx.stroke();ctx.globalAlpha=1;}
    ctx.fillStyle=event.centralMergerCandidate?'#4b201c':'#30291d';ctx.fillRect(labelX-6,labelY-4,12,8);ctx.strokeStyle=color;ctx.strokeRect(labelX-6,labelY-4,12,8);ctx.fillStyle=color;ctx.font="7px 'DM Mono', monospace";ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(index+1),labelX,labelY);
  });
  ctx.strokeStyle='#d8bd7e';ctx.lineWidth=1.5;ctx.beginPath();
  vals.forEach((v,i)=>{const x=xForTime(meta.timeMyr[i]),y=yFor(v);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();
  const lo=Math.floor(position),hi=Math.ceil(position),time=THREE.MathUtils.lerp(meta.timeMyr[lo],meta.timeMyr[hi],position-lo),x=xForTime(time);ctx.strokeStyle='#ff7063';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,h-bottom);ctx.stroke();
  const cursorLabel=document.querySelector<HTMLSpanElement>('#mass-chart-current')!;cursorLabel.textContent=`${Math.round(time*1e6).toLocaleString('en-US')} yr`;cursorLabel.style.left=`${THREE.MathUtils.clamp(100*x/w,5,95)}%`;
  const ticks=[0,100,1000,10000,durationYears].filter((value,index,array)=>value<=durationYears&&array.indexOf(value)===index);ctx.font="7px 'DM Mono', monospace";ctx.fillStyle='#929d98';ctx.textBaseline='bottom';
  ticks.forEach((years,index)=>{const tx=left+plotWidth*Math.log10(1+years/100)/logDuration;ctx.strokeStyle='#6d7771';ctx.beginPath();ctx.moveTo(tx,h-bottom);ctx.lineTo(tx,h-bottom+3);ctx.stroke();ctx.textAlign=index===0?'left':index===ticks.length-1?'right':'center';const label=years===0?'0':years===durationYears?`${Math.round(years/1000)}k`:`${years>=1000?`${years/1000}k`:years}`;ctx.fillText(label,tx,h-1);});
}
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const projected=new THREE.Vector3();
renderer.domElement.addEventListener('click',(event:MouseEvent)=>{const rect=renderer.domElement.getBoundingClientRect();pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObject(stars);let best=hits[0]?.instanceId??-1,bestDistance=18;
  if(best<0){for(let i=0;i<meta.particleCount;i++){if(!particleStates[i].present)continue;projected.set(renderedPositions[i*3],renderedPositions[i*3+1],renderedPositions[i*3+2]).project(camera);if(projected.z < -1 || projected.z > 1)continue;const px=rect.left+(projected.x+1)*rect.width/2,py=rect.top+(1-projected.y)*rect.height/2,d=Math.hypot(px-event.clientX,py-event.clientY);if(d<bestDistance){best=i;bestDistance=d;}}}
  if(best>=0){selectedIndex=best===selectedIndex?-1:best;updateSelectionIndicator();updateTargetMonitor();}});
document.querySelector('#mass-chart')!.addEventListener('click',event=>{const mouse=event as MouseEvent,rect=(event.currentTarget as HTMLCanvasElement).getBoundingClientRect(),fraction=THREE.MathUtils.clamp((mouse.clientX-rect.left-MASS_CHART_LAYOUT.left)/(rect.width-MASS_CHART_LAYOUT.left-MASS_CHART_LAYOUT.right),0,1),start=meta.timeMyr[0],duration=(meta.timeMyr.at(-1)!-start)*1e6,time=start+100*(10**(fraction*Math.log10(1+duration/100))-1)/1e6;putFrame(timeToFramePosition(time));});
