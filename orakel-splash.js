import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js/+esm';
import { RenderPass }     from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js/+esm';
import { UnrealBloomPass }from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js/+esm';
import { ShaderPass }     from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js/+esm';
import { FXAAShader }     from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/shaders/FXAAShader.js/+esm';
import { RGBShiftShader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/shaders/RGBShiftShader.js/+esm';

console.log('[orakel] Three.js modules loaded:', { THREE: !!THREE, EffectComposer: !!EffectComposer });

// ─────────── palette ───────────
const PALETTES = {
  migraine:{ accent:new THREE.Color('#ff2d55'), rim:new THREE.Color('#ffb37a'), fog:'#1a0610', key:new THREE.Color('#ffb37a') },
  ego:     { accent:new THREE.Color('#f3c15d'), rim:new THREE.Color('#ffe29a'), fog:'#1a140a', key:new THREE.Color('#ffe29a') },
  funk:    { accent:new THREE.Color('#b967ff'), rim:new THREE.Color('#01cdfe'), fog:'#0d0820', key:new THREE.Color('#01cdfe') },
  storm:   { accent:new THREE.Color('#4aa8ff'), rim:new THREE.Color('#9fd0ff'), fog:'#08111f', key:new THREE.Color('#9fd0ff') },
};

// ─────────── state ───────────
const state = { ...window.TWEAK_DEFAULTS };
const SCENE_DURATIONS = { descent:6.5, strike:5.0, orbit:5.8, ascend:5.4 };
const SCENE_LABELS   = { descent:"01 · descent", strike:"02 · strike", orbit:"03 · orbit", ascend:"04 · ascension" };
const TIMES = {
  descent: { kicker:3.6, title:4.1, tag:4.7, cta:5.0 },
  strike:  { kicker:1.2, title:1.85, tag:2.5, cta:2.85 },
  orbit:   { kicker:1.4, title:1.9, tag:2.5, cta:2.85 },
  ascend:  { kicker:1.5, title:2.3, tag:2.9, cta:3.2 },
};

// ─────────── Three.js setup ───────────
const canvas = document.getElementById('c3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(new THREE.Color('#1a0610'), 0.035);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
camera.position.set(0, 1.8, 8);

// lights
const ambient = new THREE.HemisphereLight(0xffeedd, 0x150a0a, 0.35);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffd6a8, 2.2);
keyLight.position.set(4, 7, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024,1024);
keyLight.shadow.camera.near = 1; keyLight.shadow.camera.far = 30;
keyLight.shadow.camera.left=-8; keyLight.shadow.camera.right=8;
keyLight.shadow.camera.top=8; keyLight.shadow.camera.bottom=-8;
keyLight.shadow.bias = -0.0005;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xff6070, 2.6);
rimLight.position.set(-5, 3, -4);
scene.add(rimLight);

const fillLight = new THREE.PointLight(0xffa35c, 1.2, 20, 2);
fillLight.position.set(0, 2, 4);
scene.add(fillLight);

// accent/ring pulse light (added near ground)
const pulseLight = new THREE.PointLight(0xff2d55, 0, 20, 2);
pulseLight.position.set(0, 0.2, 0);
scene.add(pulseLight);

// ─────────── environment ───────────
// ground (checkered stone w/ gradient)
function makeFloorTex(){
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  // base
  g.fillStyle = '#0a0a10'; g.fillRect(0,0,512,512);
  // radial gradient
  const rg = g.createRadialGradient(256,256,40,256,256,280);
  rg.addColorStop(0,'rgba(255,90,70,.25)'); rg.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0,0,512,512);
  // tiles
  g.strokeStyle = 'rgba(255,255,255,.04)'; g.lineWidth = 1;
  for (let i=0;i<=512;i+=64){ g.beginPath(); g.moveTo(i,0); g.lineTo(i,512); g.stroke(); g.beginPath(); g.moveTo(0,i); g.lineTo(512,i); g.stroke(); }
  // cracks/noise
  g.fillStyle = 'rgba(255,255,255,.02)';
  for (let i=0;i<1400;i++){ g.fillRect(Math.random()*512, Math.random()*512, 1, 1); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4,4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const floorTex = makeFloorTex();
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(50, 72),
  new THREE.MeshStandardMaterial({ map:floorTex, roughness:.9, metalness:.05, color:0xffffff })
);
floor.rotation.x = -Math.PI/2;
floor.position.y = -1.6;
floor.receiveShadow = true;
scene.add(floor);

// horizon glow ring
const haloGeom = new THREE.RingGeometry(8, 22, 96);
const haloMat = new THREE.MeshBasicMaterial({ color:0xff2d55, transparent:true, opacity:.15, side:THREE.DoubleSide, depthWrite:false });
const halo = new THREE.Mesh(haloGeom, haloMat);
halo.rotation.x = -Math.PI/2; halo.position.y = -1.58;
scene.add(halo);

// distant pillars / mountains silhouette
const pillarsGroup = new THREE.Group();
for (let i=0;i<14;i++){
  const w = 1.4 + Math.random()*2.2;
  const h = 6 + Math.random()*12;
  const geom = new THREE.BoxGeometry(w, h, 2 + Math.random()*2);
  const mat = new THREE.MeshStandardMaterial({ color:0x070308, roughness:1 });
  const m = new THREE.Mesh(geom, mat);
  const angle = (i/14)*Math.PI*2;
  const r = 26 + Math.random()*6;
  m.position.set(Math.sin(angle)*r, h/2 - 1.6, Math.cos(angle)*r);
  pillarsGroup.add(m);
}
scene.add(pillarsGroup);

// particles (dust/embers)
const emberCount = 420;
const emberGeom = new THREE.BufferGeometry();
const emberPos = new Float32Array(emberCount*3);
const emberVel = new Float32Array(emberCount*3);
const emberSeed = new Float32Array(emberCount);
for (let i=0;i<emberCount;i++){
  emberPos[i*3]   = (Math.random()-.5)*30;
  emberPos[i*3+1] = Math.random()*10 - 1;
  emberPos[i*3+2] = (Math.random()-.5)*24 - 2;
  emberVel[i*3]   = (Math.random()-.5)*.04;
  emberVel[i*3+1] = .02 + Math.random()*.06;
  emberVel[i*3+2] = (Math.random()-.5)*.04;
  emberSeed[i] = Math.random()*1000;
}
emberGeom.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
const emberMat = new THREE.PointsMaterial({
  size:.06, color:0xffb37a, transparent:true, opacity:.85,
  blending:THREE.AdditiveBlending, depthWrite:false
});
const embers = new THREE.Points(emberGeom, emberMat);
scene.add(embers);

// shockwave ring
const shockGeom = new THREE.RingGeometry(0.2, 0.25, 96);
const shockMat = new THREE.MeshBasicMaterial({ color:0xff2d55, transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false, blending:THREE.AdditiveBlending });
const shock = new THREE.Mesh(shockGeom, shockMat);
shock.rotation.x = -Math.PI/2; shock.position.y = -1.55;
scene.add(shock);
const shock2 = new THREE.Mesh(shockGeom.clone(), shockMat.clone());
shock2.rotation.x = -Math.PI/2; shock2.position.y = -1.55; shock2.material.color.setHex(0xffb37a);
scene.add(shock2);

// flash sprite on impact
const flashMat = new THREE.SpriteMaterial({ color:0xffffff, transparent:true, opacity:0, blending:THREE.AdditiveBlending, depthWrite:false });
const flash = new THREE.Sprite(flashMat);
flash.scale.set(6,6,1); flash.position.set(0,0.2,0);
scene.add(flash);

// ─────────── the Übermensch-Philosopher ───────────
const hero = new THREE.Group();
scene.add(hero);

// materials
const skinMat  = new THREE.MeshStandardMaterial({ color:0x2a2028, roughness:.55, metalness:.0 });
const suitMat  = new THREE.MeshStandardMaterial({ color:0x111318, roughness:.5, metalness:.2 });
const capeMat  = new THREE.MeshStandardMaterial({ color:0xaa1020, roughness:.45, metalness:.05, side:THREE.DoubleSide, emissive:0x220308, emissiveIntensity:.4 });
const beltMat  = new THREE.MeshStandardMaterial({ color:0x704018, roughness:.55, metalness:.3 });
const emblemMat= new THREE.MeshStandardMaterial({ color:0xf3c15d, emissive:0xf3c15d, emissiveIntensity:.9, roughness:.25, metalness:.5 });
const handleMat= new THREE.MeshStandardMaterial({ color:0x3a2513, roughness:.7, metalness:.1 });
const handleWrap= new THREE.MeshStandardMaterial({ color:0x1a100a, roughness:.95, metalness:.05 });
const headMetal= new THREE.MeshStandardMaterial({ color:0x9ca0a8, roughness:.35, metalness:.85 });
const headMetalDark= new THREE.MeshStandardMaterial({ color:0x46494f, roughness:.55, metalness:.8 });

// body: heroic proportions, smoother silhouette
const torsoGroup = new THREE.Group();
hero.add(torsoGroup);

// pelvis
const pelvis = new THREE.Mesh(new THREE.SphereGeometry(.44, 24, 18), suitMat);
pelvis.scale.set(1, .6, .85);
pelvis.position.y = .12;
pelvis.castShadow = true;
torsoGroup.add(pelvis);

// torso: tapered V-shape (broad shoulders, narrow waist) via lathe
const torsoPts = [];
for (let i=0;i<=14;i++){
  const u = i/14;
  // narrow at waist (u=0), flare at chest (u=.55), shoulder bulge
  let r = .46 + .24*Math.sin(u*Math.PI*0.9) + .08*Math.sin(u*Math.PI*2.2);
  if (u > .85) r *= (1-(u-.85)*3.5);
  torsoPts.push(new THREE.Vector2(Math.max(r,.1), u*1.35));
}
const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoPts, 24), suitMat);
torso.castShadow = true; torso.receiveShadow = true;
torso.position.y = .35;
torso.scale.set(1, 1, .75); // flatter front-back
torsoGroup.add(torso);

// chest plate overlay (muscular pectoral suggestion)
const pecMat = new THREE.MeshStandardMaterial({ color:0x0a0c10, roughness:.35, metalness:.45 });
const chestPlate = new THREE.Mesh(new THREE.SphereGeometry(.5, 20, 14, 0, Math.PI*2, 0, Math.PI*0.5), pecMat);
chestPlate.scale.set(1, .55, .45);
chestPlate.position.set(0, 1.25, .15);
chestPlate.castShadow = true;
torsoGroup.add(chestPlate);

// chest emblem (H-shaped diamond)
const emblemGroup = new THREE.Group();
emblemGroup.position.set(0, 1.2, .38);
torsoGroup.add(emblemGroup);
{
  const shape = new THREE.Shape();
  // diamond outline
  shape.moveTo(0,  .28);
  shape.lineTo(.22, 0);
  shape.lineTo(0, -.28);
  shape.lineTo(-.22, 0);
  shape.lineTo(0,  .28);
  const hole = new THREE.Path();
  // H carved in
  hole.moveTo(-.08, .14); hole.lineTo(-.04, .14); hole.lineTo(-.04, .02); hole.lineTo(.04, .02);
  hole.lineTo(.04, .14);  hole.lineTo(.08, .14);  hole.lineTo(.08, -.14); hole.lineTo(.04, -.14);
  hole.lineTo(.04,-.02);  hole.lineTo(-.04,-.02); hole.lineTo(-.04,-.14); hole.lineTo(-.08,-.14); hole.lineTo(-.08,.14);
  shape.holes.push(hole);
  const emblem = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {depth:.04, bevelEnabled:true, bevelThickness:.008, bevelSize:.008, bevelSegments:2}), emblemMat);
  emblem.castShadow = true;
  emblemGroup.add(emblem);
}

// neck — trapezius suggestion
const trapMat = new THREE.MeshStandardMaterial({ color:0x0c0e14, roughness:.45, metalness:.3 });
const trap = new THREE.Mesh(new THREE.SphereGeometry(.3, 16, 10, 0, Math.PI*2, 0, Math.PI*0.5), trapMat);
trap.scale.set(1.3, .5, .8);
trap.position.y = 1.58;
torsoGroup.add(trap);
const neck = new THREE.Mesh(new THREE.CylinderGeometry(.13,.17,.22,14), skinMat);
neck.position.y = 1.68; torsoGroup.add(neck);

// HEAD — egg-shaped with jaw definition
const headGroup = new THREE.Group();
headGroup.position.y = 1.9;
torsoGroup.add(headGroup);

// skull
const skullGeom = new THREE.SphereGeometry(.27, 32, 28);
// subtly flatten/extend for jaw
const sp = skullGeom.attributes.position;
for (let i=0;i<sp.count;i++){
  const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
  // jaw taper: narrow bottom-front
  if (y < 0){
    const t = -y/.27;
    const squeeze = 1 - t*0.25;
    sp.setX(i, x*squeeze);
    sp.setZ(i, z* (z > 0 ? 1 - t*0.15 : 1));
  }
  // brow ridge forward
  if (y > .08 && y < .18 && z > 0.1){
    sp.setZ(i, z + 0.02);
  }
}
sp.needsUpdate = true; skullGeom.computeVertexNormals();
const head = new THREE.Mesh(skullGeom, skinMat);
head.scale.set(1, 1.08, 1.02);
head.castShadow = true;
headGroup.add(head);

// EARS
const earMat = skinMat;
const earL = new THREE.Mesh(new THREE.SphereGeometry(.055, 10, 8), earMat);
earL.scale.set(.6, 1.2, .5); earL.position.set(-.26, .0, .02);
headGroup.add(earL);
const earR = earL.clone(); earR.position.x = .26; headGroup.add(earR);

// CHEEKBONES (subtle)
const cheekMat = new THREE.MeshStandardMaterial({ color:0x2d2026, roughness:.55 });
const cheekL = new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), cheekMat);
cheekL.position.set(-.14, -.02, .22); cheekL.scale.set(.8,.6,.4);
headGroup.add(cheekL);
const cheekR = cheekL.clone(); cheekR.position.x = .14; headGroup.add(cheekR);

// NOSE (bridge + tip)
const noseMat = skinMat;
const nose = new THREE.Mesh(new THREE.ConeGeometry(.05, .14, 8), noseMat);
nose.position.set(0, .02, .28); nose.rotation.x = Math.PI*0.5; nose.scale.set(1,1,.6);
headGroup.add(nose);
const noseTip = new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 8), noseMat);
noseTip.position.set(0, -.04, .3);
headGroup.add(noseTip);

// MOUTH line (subtle dark slit)
const mouthMat = new THREE.MeshBasicMaterial({ color:0x1a0608 });
const mouth = new THREE.Mesh(new THREE.BoxGeometry(.09,.01,.01), mouthMat);
mouth.position.set(0, -.1, .26);
headGroup.add(mouth);

// BROW RIDGE — stern philosopher
const browMat = new THREE.MeshStandardMaterial({ color:0x080608, roughness:.9 });
const browL = new THREE.Mesh(new THREE.BoxGeometry(.09,.015,.03), browMat);
browL.position.set(-.09, .12, .25); browL.rotation.z = -.12;
headGroup.add(browL);
const browR = browL.clone(); browR.position.x = .09; browR.rotation.z = .12;
headGroup.add(browR);

// HAIR — swept back, windblown (multiple tufts)
const hairMat = new THREE.MeshStandardMaterial({ color:0x1a1612, roughness:.75, metalness:.0 });
const hairCap = new THREE.Mesh(new THREE.SphereGeometry(.29, 28, 22, 0, Math.PI*2, 0, Math.PI*0.55), hairMat);
hairCap.scale.set(1.02,.95,1.12);
hairCap.position.y = 0.02; hairCap.position.z = -.02;
headGroup.add(hairCap);
// windswept back tufts
for (let i=0;i<7;i++){
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(.05 + Math.random()*.03, .22 + Math.random()*.14, 6), hairMat);
  tuft.position.set((i-3)*.055, .14 - Math.random()*.08, -.22 - Math.random()*.08);
  tuft.rotation.x = 1.6 + Math.random()*.3;
  tuft.rotation.z = (Math.random()-.5)*.3;
  headGroup.add(tuft);
}

// BEARD — sculpted, pointed at chin
const beardMat = new THREE.MeshStandardMaterial({ color:0x120c0e, roughness:.88 });
const beard = new THREE.Mesh(new THREE.SphereGeometry(.22, 20, 16, 0, Math.PI*2, Math.PI*0.55, Math.PI*0.45), beardMat);
beard.position.set(0, -.08, .02); beard.scale.set(1.1, 1.1, 1.05);
headGroup.add(beard);
// chin point
const chinTuft = new THREE.Mesh(new THREE.ConeGeometry(.07, .14, 8), beardMat);
chinTuft.position.set(0,-.22,.06); chinTuft.rotation.x = Math.PI;
headGroup.add(chinTuft);
// mustache
const mustMat = beardMat;
const mustL = new THREE.Mesh(new THREE.BoxGeometry(.11,.02,.04), mustMat);
mustL.position.set(-.06, -.07, .25); mustL.rotation.z = -.05;
headGroup.add(mustL);
const mustR = mustL.clone(); mustR.position.x = .06; mustR.rotation.z = .05;
headGroup.add(mustR);

// GLASSES — small round frames
{
  const frame = new THREE.MeshStandardMaterial({ color:0x0a0a0f, metalness:.75, roughness:.25 });
  const g1 = new THREE.Mesh(new THREE.TorusGeometry(.065, .009, 10, 24), frame);
  const g2 = new THREE.Mesh(new THREE.TorusGeometry(.065, .009, 10, 24), frame);
  g1.position.set(-.1, .04, .245); g2.position.set(.1, .04, .245);
  headGroup.add(g1); headGroup.add(g2);
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(.006,.006,.07,6), frame);
  bridge.rotation.z = Math.PI/2; bridge.position.set(0, .04, .25);
  headGroup.add(bridge);
  // temples
  const temL = new THREE.Mesh(new THREE.CylinderGeometry(.005,.005,.2,6), frame);
  temL.position.set(-.18,.04,.17); temL.rotation.y = Math.PI*0.12; temL.rotation.z = Math.PI/2;
  headGroup.add(temL);
  const temR = temL.clone(); temR.position.x = .18; temR.rotation.y = -Math.PI*0.12;
  headGroup.add(temR);
  // lens glow — piercing eyes
  const lensMat = new THREE.MeshBasicMaterial({ color:0xff2d55, transparent:true, opacity:.65, blending:THREE.AdditiveBlending });
  const l1 = new THREE.Mesh(new THREE.CircleGeometry(.058, 20), lensMat);
  const l2 = new THREE.Mesh(new THREE.CircleGeometry(.058, 20), lensMat);
  l1.position.set(-.1, .04, .25); l2.position.set(.1, .04, .25);
  headGroup.add(l1); headGroup.add(l2);
  // keep ref for palette
  window._lensGlow = [l1.material, l2.material];
}

// shoulders (deltoids) + arms
const shoulderMat = new THREE.MeshStandardMaterial({ color:0x0d0f14, roughness:.4, metalness:.35 });
const shL = new THREE.Mesh(new THREE.SphereGeometry(.22, 20, 16), shoulderMat);
shL.position.set(-.55, 1.42, 0); shL.castShadow = true;
torsoGroup.add(shL);
const shR = shL.clone(); shR.position.x = .55; torsoGroup.add(shR);

const leftArm = new THREE.Group(); torsoGroup.add(leftArm);
const rightArm = new THREE.Group(); torsoGroup.add(rightArm);
leftArm.position.set(-.55, 1.36, 0);
rightArm.position.set(.55, 1.36, 0);

function makeArm(group){
  // bicep (tapered)
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(.13,.12,.6,16), suitMat);
  upper.position.set(0, -.3, 0); upper.castShadow = true;
  group.add(upper);
  // elbow
  const elbow = new THREE.Mesh(new THREE.SphereGeometry(.11, 14, 12), suitMat);
  elbow.position.set(0, -.6, 0);
  group.add(elbow);
  const forearm = new THREE.Group();
  forearm.position.set(0, -.6, 0);
  group.add(forearm);
  const fm = new THREE.Mesh(new THREE.CylinderGeometry(.1,.09,.52,14), suitMat);
  fm.position.set(0,-.28,0); fm.castShadow = true;
  forearm.add(fm);
  // gauntlet ring
  const gaunt = new THREE.Mesh(new THREE.CylinderGeometry(.12,.11,.1,14), beltMat);
  gaunt.position.set(0,-.5,0); forearm.add(gaunt);
  // hand (knuckle + thumb)
  const fist = new THREE.Mesh(new THREE.SphereGeometry(.13, 16, 14), skinMat);
  fist.position.set(0,-.58,0); fist.castShadow = true; fist.scale.set(1,.9,1.1);
  forearm.add(fist);
  const thumb = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), skinMat);
  thumb.position.set(.1,-.56,.05); forearm.add(thumb);
  group.userData = { upper, forearm, fist };
  return group;
}
makeArm(leftArm);
makeArm(rightArm);

// LEGS — thigh, knee, shin, boot
const legs = new THREE.Group(); torsoGroup.add(legs);
const bootMat = new THREE.MeshStandardMaterial({ color:0x2a0a08, roughness:.45, metalness:.3 });
function makeLeg(x){
  const g = new THREE.Group(); g.position.set(x, -.02, 0);
  const thigh = new THREE.Mesh(new THREE.CylinderGeometry(.2,.16,.65,14), suitMat);
  thigh.position.y = -.32; thigh.castShadow = true; g.add(thigh);
  const knee = new THREE.Mesh(new THREE.SphereGeometry(.16, 14, 12), suitMat);
  knee.position.y = -.64; g.add(knee);
  const shin = new THREE.Mesh(new THREE.CylinderGeometry(.15,.13,.58,14), suitMat);
  shin.position.y = -.94; shin.castShadow = true; g.add(shin);
  const boot = new THREE.Mesh(new THREE.BoxGeometry(.36,.22,.5), bootMat);
  boot.position.set(0,-1.28,.08); boot.castShadow = true; g.add(boot);
  // boot cuff band
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(.19,.04,8,20), beltMat);
  cuff.position.y = -1.15; cuff.rotation.x = Math.PI/2; g.add(cuff);
  legs.add(g);
  return g;
}
makeLeg(-.23);
makeLeg(.23);

// BELT — chunky with buckle
const belt = new THREE.Mesh(new THREE.TorusGeometry(.5,.08, 12, 32), beltMat);
belt.rotation.x = Math.PI/2; belt.position.y = .18;
belt.castShadow = true;
torsoGroup.add(belt);
const buckle = new THREE.Mesh(new THREE.BoxGeometry(.24,.18,.06), emblemMat);
buckle.position.set(0,.18,.5); torsoGroup.add(buckle);
const buckleGem = new THREE.Mesh(new THREE.OctahedronGeometry(.05), emblemMat);
buckleGem.position.set(0,.18,.56); torsoGroup.add(buckleGem);

// CAPE (plane with many segments; animated like cloth)
const CAPE_W = 26, CAPE_H = 32;
const capeGeom = new THREE.PlaneGeometry(1.8, 2.8, CAPE_W, CAPE_H);
const cape = new THREE.Mesh(capeGeom, capeMat);
cape.position.set(0, 1.58, -.32);
cape.castShadow = true; cape.receiveShadow = true;
torsoGroup.add(cape);
// cape collar (hides top seam)
const collar = new THREE.Mesh(new THREE.TorusGeometry(.36,.08,10,24, Math.PI), capeMat);
collar.position.set(0,1.58,-.05); collar.rotation.x = Math.PI*1.1;
torsoGroup.add(collar);
// cape interior base positions
const basePos = capeGeom.attributes.position.array.slice();

// HAMMER — thor-style with rune
const hammerGroup = new THREE.Group();
scene.add(hammerGroup);

// handle
const handle = new THREE.Mesh(new THREE.CylinderGeometry(.065,.075, 1.1, 16), handleMat);
handle.castShadow = true;
hammerGroup.add(handle);
// grip wrap
const grip = new THREE.Mesh(new THREE.CylinderGeometry(.085,.085,.45, 16), handleWrap);
grip.position.y = -.35; grip.castShadow = true;
hammerGroup.add(grip);
// pommel (leather strap bead)
const pommel = new THREE.Mesh(new THREE.SphereGeometry(.1, 12, 10), handleWrap);
pommel.position.y = -.62; hammerGroup.add(pommel);

// head — big chunky block, bevelled
const hHead = new THREE.Group();
hHead.position.y = .7;
hammerGroup.add(hHead);
{
  const block = new THREE.Mesh(new THREE.BoxGeometry(.95, .52, .52), headMetal);
  block.castShadow = true;
  hHead.add(block);
  // end caps darker
  const capL = new THREE.Mesh(new THREE.BoxGeometry(.06, .55, .55), headMetalDark);
  capL.position.x = -.50; hHead.add(capL);
  const capR = capL.clone(); capR.position.x = .50; hHead.add(capR);
  // bevels as edges
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(block.geometry, 30),
    new THREE.LineBasicMaterial({ color:0x0a0a0f, transparent:true, opacity:.6 }));
  hHead.add(edges);
  // rune canvas on faces
  const runeTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#6a6f77'; g.fillRect(0,0,256,256);
    // scratches
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
    for (let i=0;i<80;i++){ g.beginPath(); const y = Math.random()*256; g.moveTo(Math.random()*256, y); g.lineTo(Math.random()*256, y + (Math.random()-.5)*20); g.stroke(); }
    // rune circle
    g.strokeStyle = '#ffb37a'; g.lineWidth = 6;
    g.beginPath(); g.arc(128,128,60,0,Math.PI*2); g.stroke();
    g.lineWidth = 3;
    // H-rune inside
    g.beginPath(); g.moveTo(100,82); g.lineTo(100,174); g.moveTo(156,82); g.lineTo(156,174); g.moveTo(100,128); g.lineTo(156,128); g.stroke();
    // dots
    g.fillStyle = '#ffb37a';
    [[80,60],[180,60],[80,200],[180,200]].forEach(([x,y])=>{ g.beginPath(); g.arc(x,y,3,0,Math.PI*2); g.fill(); });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  // overlay runes on large faces
  const runeFaceMat = new THREE.MeshStandardMaterial({
    map:runeTex, roughness:.4, metalness:.6,
    emissive:new THREE.Color(0xff2d55), emissiveIntensity:.35, emissiveMap:runeTex
  });
  const faceFront = new THREE.Mesh(new THREE.PlaneGeometry(.92, .5), runeFaceMat);
  faceFront.position.z = .261; hHead.add(faceFront);
  const faceBack = faceFront.clone(); faceBack.position.z = -.261; faceBack.rotation.y = Math.PI; hHead.add(faceBack);
}

// glow ring around hammer head (runes alight)
const runeGlow = new THREE.PointLight(0xff2d55, 0, 6, 2);
hHead.add(runeGlow); runeGlow.position.set(0,0,0);

// ─────────── post ───────────
let composer, bloomPass, rgbPass, fxaaPass;
function setupComposer(){
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(1,1), 0.9, 0.7, 0.75);
  composer.addPass(bloomPass);
  rgbPass = new ShaderPass(RGBShiftShader);
  rgbPass.uniforms.amount.value = 0.0008;
  composer.addPass(rgbPass);
  fxaaPass = new ShaderPass(FXAAShader);
  composer.addPass(fxaaPass);
}
setupComposer();

// ─────────── responsive ───────────
function resize(){
  const w = innerWidth, h = innerHeight;
  const dpr = Math.min(window.devicePixelRatio, state.quality==='high'?2: state.quality==='med'?1.25:1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w,h,false);
  const aspect = w/h;
  camera.fov = aspect < 0.7 ? 60 : aspect < 1.0 ? 50 : 42;
  camera.aspect = aspect; camera.updateProjectionMatrix();
  composer.setPixelRatio(dpr); composer.setSize(w,h);
  fxaaPass.uniforms['resolution'].value.set(1/(w*dpr), 1/(h*dpr));
  bloomPass.resolution.set(w,h);
}
resize();
addEventListener('resize', resize);

// ─────────── animation ───────────
const clock = new THREE.Clock();
let t0 = 0;   // scene start time
let currentVariant = state.variant;

// cape sim state
const capeSim = {
  prev: basePos.slice(),
  curr: basePos.slice(),
};

function updateCape(dt, ageRatio){
  const arr = capeGeom.attributes.position.array;
  const strength = (state.cape ?? 1);
  const swing = Math.sin(clock.elapsedTime*1.6)*.08;
  const t = clock.elapsedTime;
  for (let j=0;j<=CAPE_H;j++){
    for (let i=0;i<=CAPE_W;i++){
      const idx = (j*(CAPE_W+1) + i)*3;
      const bx = basePos[idx], by = basePos[idx+1], bz = basePos[idx+2];
      // row factor (top fixed)
      const rowT = j/CAPE_H;
      // wind wave
      const wave = Math.sin(t*2.2 + rowT*3 + i*0.35)*0.12*rowT;
      const lift = Math.sin(t*1.1 + i*.5)*0.08*rowT;
      arr[idx]   = bx + swing*rowT*strength + wave*strength*.5;
      arr[idx+1] = by - (0.25*rowT*rowT)*strength*0;
      arr[idx+2] = bz - rowT*0.9*strength - Math.abs(Math.sin(t*1.3+i*.25))*0.15*rowT*strength + lift*strength;
      // flare with hammer strike
    }
  }
  capeGeom.attributes.position.needsUpdate = true;
  capeGeom.computeVertexNormals();
}

// ─────────── variants ───────────
function resetObjects(){
  hero.position.set(0,0,0);
  hero.rotation.set(0,0,0);
  torsoGroup.rotation.set(0,0,0);
  torsoGroup.position.set(0,0,0);
  legs.rotation.set(0,0,0);
  head.rotation.set(0,0,0);
  // arms
  leftArm.rotation.set(0, 0, Math.PI*.08);
  rightArm.rotation.set(0, 0, -Math.PI*.08);
  leftArm.userData.forearm.rotation.set(0,0,0);
  rightArm.userData.forearm.rotation.set(0,0,0);
  // hammer default: held in right hand
  hammerGroup.scale.set(1,1,1);
  hammerGroup.rotation.set(0,0,0);
  hammerGroup.position.set(0,0,0);
  // shock / flash
  shock.material.opacity = 0; shock.scale.set(1,1,1);
  shock2.material.opacity = 0; shock2.scale.set(1,1,1);
  flash.material.opacity = 0;
  pulseLight.intensity = 0;
  runeGlow.intensity = 0;
  // camera defaults
  camera.position.set(0, 1.8, 8);
  camera.lookAt(0, 1.2, 0);
}

function attachHammerToRightHand(){
  // place at right forearm fist, pointing up
  const fist = rightArm.userData.fist;
  const pos = new THREE.Vector3();
  fist.getWorldPosition(pos);
  hammerGroup.position.copy(pos);
  hammerGroup.rotation.set(0, 0, -0.15);
}

// ────────── Descent: Superman-style flying entrance, landing, hammer raise ──────────
function variantDescent(t){
  // phase timings — slower, more cinematic Superman entry
  const flyIn  = 0;        // high-altitude silhouette visible from afar
  const dive   = 1.2;      // starts diving down, fist-first
  const brake  = 2.4;      // mid-air brake, legs swing forward
  const land   = 2.9;      // feet slam ground
  const rise   = 3.5;      // hero rises from one-knee pose
  const swing  = 4.1;      // hammer windup
  const strike = 4.6;      // hammer comes down

  // hero trajectory — starts HIGH and FAR, visible silhouette against sky
  const skyStart = new THREE.Vector3(-3.5, 11.5, -9);   // closer + lower than before so silhouette reads
  const divePos  = new THREE.Vector3(-1.8, 6.5, -2.5);
  const brakePos = new THREE.Vector3(-0.5, 2.5, 0.4);
  const landPos  = new THREE.Vector3(0, 0, 0);

  if (t < dive){
    // HIGH FLIGHT — distant silhouette, body horizontal, hammer-forward Superman pose
    const p = t/dive;
    const eased = p*p*(3-2*p); // smoothstep
    hero.position.lerpVectors(skyStart, divePos, eased);
    // minimal arc, mostly descent
    hero.position.y += Math.sin(p*Math.PI)*0.8;
    // horizontal flight pose
    torsoGroup.rotation.x = -1.45;                   // fully horizontal
    torsoGroup.rotation.z = 0.1*Math.sin(t*3);       // subtle body roll
    hero.rotation.y = THREE.MathUtils.lerp(-0.5, -0.25, p);
    // SUPERMAN POSE — both arms extended forward (one fist leading, hammer trailing in other)
    leftArm.rotation.x = -Math.PI*0.92;
    leftArm.rotation.z = 0;
    leftArm.userData.forearm.rotation.x = 0;
    rightArm.rotation.x = -Math.PI*0.85;
    rightArm.rotation.z = -Math.PI*0.04;
    rightArm.userData.forearm.rotation.x = 0;
    legs.rotation.x = 1.0;                           // legs trail straight back
    legs.rotation.z = 0;
  } else if (t < brake){
    // DIVE — body tilts more vertical, gaining speed, getting larger on screen
    const p = (t - dive)/(brake - dive);
    const eased = easeIn(p);                         // accelerate into brake
    hero.position.lerpVectors(divePos, brakePos, eased);
    // slight roll for speed
    torsoGroup.rotation.x = THREE.MathUtils.lerp(-1.45, -1.0, p);
    torsoGroup.rotation.z = 0.08*Math.sin(t*5);
    hero.rotation.y = THREE.MathUtils.lerp(-0.25, -0.05, easeOut(p));
    // arms still forward, but starting to flare
    leftArm.rotation.x = THREE.MathUtils.lerp(-Math.PI*0.92, -Math.PI*0.6, p);
    rightArm.rotation.x = THREE.MathUtils.lerp(-Math.PI*0.85, -Math.PI*0.5, p);
    legs.rotation.x = THREE.MathUtils.lerp(1.0, 0.6, easeOut(p));
  } else if (t < land){
    // BRAKE + FEET FORWARD for landing — classic Superman flare
    const p = (t - brake)/(land - brake);
    const eased = easeOut(p);
    hero.position.lerpVectors(brakePos, landPos, eased);
    // small hover before impact
    hero.position.y += (1 - eased) * 0.4;
    // body uprights dramatically
    torsoGroup.rotation.x = THREE.MathUtils.lerp(-1.0, 0.3, eased);
    torsoGroup.rotation.z = 0;
    hero.rotation.y = 0;
    // arms flare out like brakes
    leftArm.rotation.x  = THREE.MathUtils.lerp(-Math.PI*0.6, 0.5, eased);
    leftArm.rotation.z  = THREE.MathUtils.lerp(0, Math.PI*0.45, eased);
    rightArm.rotation.x = THREE.MathUtils.lerp(-Math.PI*0.5, 0.4, eased);
    rightArm.rotation.z = THREE.MathUtils.lerp(-Math.PI*0.04, -Math.PI*0.35, eased);
    leftArm.userData.forearm.rotation.x  = THREE.MathUtils.lerp(0, -0.2, p);
    rightArm.userData.forearm.rotation.x = THREE.MathUtils.lerp(0, -0.1, p);
    // legs come down and forward
    legs.rotation.x = THREE.MathUtils.lerp(0.6, -0.1, eased);
  } else {
    // LANDED — HARD. One-knee superhero pose, held for beat
    hero.position.set(0,0,0);
    hero.rotation.y = 0;
    const sinceLand = t - land;
    // Deep crouch on impact, bounce back slowly
    const crouchT = Math.min(sinceLand/0.35, 1);
    const crouchDepth = Math.sin(crouchT*Math.PI) * 0.55;
    torsoGroup.position.y = -crouchDepth;
    // Forward lean — fist planted on ground (classic pose)
    const forwardLean = Math.sin(Math.min(sinceLand/0.6, 1)*Math.PI) * 0.15;
    torsoGroup.rotation.x = 0.4 * Math.max(0, 1 - sinceLand/0.8) + forwardLean;
    legs.rotation.x = 0;

    if (t < rise){
      // HERO POSE — left fist down on ground, right arm (with hammer) back and out
      // Left arm: planted forward/down (fist to ground)
      leftArm.rotation.x = THREE.MathUtils.lerp(0.5, 1.35, Math.min(sinceLand/0.3, 1));  // arm swings DOWN+FORWARD
      leftArm.rotation.z = THREE.MathUtils.lerp(Math.PI*0.45, Math.PI*0.05, Math.min(sinceLand/0.3, 1));
      leftArm.userData.forearm.rotation.x = -0.4;
      // Right arm: flared out behind with hammer
      rightArm.rotation.x = THREE.MathUtils.lerp(0.4, -0.1, Math.min(sinceLand/0.3, 1));
      rightArm.rotation.z = THREE.MathUtils.lerp(-Math.PI*0.35, -Math.PI*0.45, Math.min(sinceLand/0.3, 1));
      rightArm.userData.forearm.rotation.x = 0.1;
    } else if (t < swing){
      // RISE — stand up slowly, hero shot
      const rp = Math.min((t - rise)/0.6, 1);
      const er = easeOut(rp);
      torsoGroup.position.y = THREE.MathUtils.lerp(torsoGroup.position.y, 0, er);
      torsoGroup.rotation.x = THREE.MathUtils.lerp(torsoGroup.rotation.x, 0, er);
      leftArm.rotation.x  = THREE.MathUtils.lerp(1.35, 0, er);
      leftArm.rotation.z  = THREE.MathUtils.lerp(Math.PI*0.05, Math.PI*0.08, er);
      leftArm.userData.forearm.rotation.x = THREE.MathUtils.lerp(-0.4, 0, er);
      rightArm.rotation.x = THREE.MathUtils.lerp(-0.1, 0, er);
      rightArm.rotation.z = THREE.MathUtils.lerp(-Math.PI*0.45, -Math.PI*0.08, er);
      rightArm.userData.forearm.rotation.x = THREE.MathUtils.lerp(0.1, 0, er);
    } else if (t < strike){
      // HAMMER WINDUP
      const sp = (t - swing)/(strike - swing);
      rightArm.rotation.x = THREE.MathUtils.lerp(0, -2.4, easeOut(sp));
      rightArm.rotation.z = THREE.MathUtils.lerp(-Math.PI*0.08, -Math.PI*0.55, easeOut(sp));
      torsoGroup.rotation.y = -0.25*easeOut(sp);
      leftArm.rotation.z = Math.PI*0.08 + 0.1*easeOut(sp);
    } else {
      // STRIKE DOWN
      const sp = Math.min((t - strike)/0.3, 1);
      rightArm.rotation.x = THREE.MathUtils.lerp(-2.4, 0.6, easeIn(sp));
      rightArm.rotation.z = THREE.MathUtils.lerp(-Math.PI*0.55, -Math.PI*0.12, easeIn(sp));
      torsoGroup.rotation.y = THREE.MathUtils.lerp(-0.25, 0.15, easeIn(sp));
    }
  }

  // hammer stays in right hand throughout
  attachHammerToRightHand();
  if (t < brake){
    // hammer trails slightly behind during flight
    hammerGroup.rotation.z = -0.5;
  } else if (t < swing){
    hammerGroup.rotation.z = -0.2;
  } else if (t < strike){
    const sp = (t - swing)/(strike - swing);
    hammerGroup.rotation.z = THREE.MathUtils.lerp(-0.2, -0.8, easeOut(sp));
  } else {
    const sp = Math.min((t - strike)/0.3, 1);
    hammerGroup.rotation.z = THREE.MathUtils.lerp(-0.8, 2.2, easeIn(sp));
  }

  // CAMERA — wide establishing, then track + punch-in
  if (t < dive){
    // WIDE — see the figure up in the sky, small and far
    const p = t/dive;
    camera.position.set(6, 4.5, 14);                 // wide, slightly elevated
    camera.lookAt(hero.position.x, hero.position.y - 0.5, hero.position.z);
  } else if (t < land){
    // TRACK — follow him down
    const p = (t - dive)/(land - dive);
    const eased = easeOut(p);
    camera.position.set(
      THREE.MathUtils.lerp(6, -2, eased),
      THREE.MathUtils.lerp(4.5, 2.0, eased),
      THREE.MathUtils.lerp(14, 7.2, eased)
    );
    camera.lookAt(hero.position.x*0.4, hero.position.y, hero.position.z*0.4);
  } else if (t < strike){
    // LOW HERO SHOT — ground level, pushing in
    const p = Math.min((t - land)/(strike - land), 1);
    camera.position.set(
      THREE.MathUtils.lerp(-2, -1.8, p),
      THREE.MathUtils.lerp(1.1, 1.5, easeOut(p)),
      THREE.MathUtils.lerp(7.2, 6.0, easeOut(p))
    );
    camera.lookAt(0, THREE.MathUtils.lerp(0.6, 1.2, p), 0);
  } else {
    // HOLD — pull out slightly
    const p = Math.min((t - strike)/1.5, 1);
    camera.position.set(-1.6 + 0.3*p, 1.5 + 0.2*p, 6.0 + 0.5*p);
    camera.lookAt(0, 1.0, 0);
  }

  // LANDING IMPACT — big visible ground-hit burst
  const sinceLand = t - land;
  if (sinceLand >= 0 && sinceLand < 1.8){
    const p = sinceLand/1.8;
    // strong primary shockwave ring
    shock.material.opacity = Math.max(shock.material.opacity, (1-p)*1.0);
    shock.scale.setScalar(Math.max(shock.scale.x, 1 + p*28));
    shock2.material.opacity = Math.max(shock2.material.opacity, (1-p)*0.75);
    shock2.scale.setScalar(Math.max(shock2.scale.x, 1 + p*20));
    pulseLight.intensity = Math.max(pulseLight.intensity, (1-p)*10);
  }
  if (sinceLand >= 0 && sinceLand < 0.5){
    // bright landing flash
    flash.material.opacity = Math.max(flash.material.opacity, (1-sinceLand*2)*0.95);
  }
  if (sinceLand >= 0 && sinceLand < 0.45){
    // hard camera shake on landing
    camera.position.y += Math.sin(sinceLand*70)*0.12*(1-sinceLand*2.2);
    camera.position.x += Math.cos(sinceLand*58)*0.08*(1-sinceLand*2.2);
  }

  // IMPACT — shockwave + flash when hammer strikes
  const sinceStrike = t - strike;
  if (sinceStrike >= 0 && sinceStrike < 1.6){
    const p = sinceStrike/1.6;
    shock.material.opacity = (1-p)*0.95;
    shock.scale.setScalar(1 + p*22);
    shock2.material.opacity = (1-p)*0.65;
    shock2.scale.setScalar(1 + p*16);
    pulseLight.intensity = (1-p)*8;
    flash.material.opacity = Math.max(0, (1-p*2.5))*1.0;
  }
  if (sinceStrike >= 0 && sinceStrike < 0.3){
    camera.position.y += Math.sin(sinceStrike*60)*0.07*(1-sinceStrike*3.3);
    camera.position.x += Math.cos(sinceStrike*54)*0.05*(1-sinceStrike*3.3);
  }

  // runes start glowing on strike
  if (t > strike){
    runeGlow.intensity = Math.min(4, (t - strike)*5);
  } else if (t > swing){
    runeGlow.intensity = (t - swing) * 1.5;
  }
}

// ────────── Strike: full windup and crash ──────────
function variantStrike(t){
  const windup = 1.2;
  const impact = 1.85;
  const after = 2.2;
  // camera low angle, dolly in
  const camP = Math.min(t/2.2, 1);
  camera.position.set(THREE.MathUtils.lerp(-3, -1.2, camP), THREE.MathUtils.lerp(.9, 1.4, camP), THREE.MathUtils.lerp(9, 5.8, camP));
  camera.lookAt(0, 1.4, 0);
  // right arm big windup behind
  let armAngle = 0, hammerSpin = 0, hHeadY = 0;
  if (t < windup){
    const p = t/windup;
    armAngle = THREE.MathUtils.lerp(-0.5, -2.4, easeOut(p));
    rightArm.rotation.x = -2.4*easeOut(p);
    rightArm.rotation.z = -Math.PI*0.15 - 0.4*easeOut(p);
    torsoGroup.rotation.y = -0.5*easeOut(p);
    hammerGroup.rotation.z = -0.6;
  } else if (t < impact){
    const p = (t-windup)/(impact-windup);
    rightArm.rotation.x = THREE.MathUtils.lerp(-2.4, 0.6, easeIn(p));
    rightArm.rotation.z = THREE.MathUtils.lerp(-Math.PI*.55, -Math.PI*0.12, easeIn(p));
    torsoGroup.rotation.y = THREE.MathUtils.lerp(-0.5, 0.4, easeIn(p));
    hammerGroup.rotation.z = THREE.MathUtils.lerp(-0.6, 2.2, easeIn(p));
  } else {
    const p = Math.min((t-impact)/0.8, 1);
    rightArm.rotation.x = THREE.MathUtils.lerp(0.6, 0.9, p);
    rightArm.rotation.z = -Math.PI*0.12 + 0.15*p;
    torsoGroup.rotation.y = THREE.MathUtils.lerp(0.4, 0.2, p);
    hammerGroup.rotation.z = THREE.MathUtils.lerp(2.2, 2.4, p);
  }
  attachHammerToRightHand();

  // impact burst
  const sinceImp = t - impact;
  if (sinceImp >= 0 && sinceImp < 1.4){
    const p = sinceImp/1.4;
    shock.material.opacity = (1-p)*0.95;
    shock.scale.setScalar(1 + p*22);
    shock2.material.opacity = (1-p)*0.7;
    shock2.scale.setScalar(1 + p*16);
    pulseLight.intensity = (1-p)*8;
    flash.material.opacity = Math.max(0, (1-p*2.2))*1.0;
  }
  if (sinceImp >= 0 && sinceImp < 0.35){
    camera.position.x += Math.sin(sinceImp*60)*0.06*(1-sinceImp*3);
    camera.position.y += Math.cos(sinceImp*54)*0.05*(1-sinceImp*3);
  }
  // rune glow ramp after impact
  if (sinceImp > 0){ runeGlow.intensity = Math.min(4, sinceImp*6); }
}

// ────────── Orbit: hero holds hammer aloft, camera orbits ──────────
function variantOrbit(t){
  // camera orbits
  const ang = -0.4 + t*0.55;
  const r = 6.2 - Math.min(t*0.2, 1.4);
  const h = THREE.MathUtils.lerp(3, 1.6, Math.min(t/1.5, 1));
  camera.position.set(Math.sin(ang)*r, h, Math.cos(ang)*r);
  camera.lookAt(0, 1.4, 0);
  // hero pose: right arm up holding hammer high, left arm out
  const p = Math.min(t/1.2, 1);
  rightArm.rotation.z = THREE.MathUtils.lerp(-Math.PI*0.08, -Math.PI*0.95, easeOut(p));
  rightArm.rotation.x = THREE.MathUtils.lerp(0, -0.1, easeOut(p));
  leftArm.rotation.z  = THREE.MathUtils.lerp(Math.PI*0.08, Math.PI*0.55, easeOut(p));
  torsoGroup.rotation.y = Math.sin(t*0.6)*0.08;
  torsoGroup.position.y = Math.sin(t*1.2)*0.04;
  attachHammerToRightHand();
  hammerGroup.rotation.z = -0.25 - 0.05*Math.sin(t*2);
  // rune glow pulsing
  runeGlow.intensity = 1.5 + 1.5*Math.sin(t*3);
  // emblem pulse
  emblemMat.emissiveIntensity = 0.9 + 0.4*Math.sin(t*2);
}

// ────────── Ascension: hero rises, hammer streaks light, camera pulls out ──────────
function variantAscend(t){
  const lift = 0.5;
  camera.position.set(0, THREE.MathUtils.lerp(1.4, 3.8, Math.min(t/3.5, 1)), THREE.MathUtils.lerp(7, 10, Math.min(t/3.5, 1)));
  camera.lookAt(0, THREE.MathUtils.lerp(1.4, 3.4, Math.min(t/3.5, 1)), 0);
  // hero rises off floor
  if (t > lift){
    const p = Math.min((t-lift)/3.0, 1);
    hero.position.y = THREE.MathUtils.lerp(0, 2.6, easeInOut(p));
    torsoGroup.rotation.x = THREE.MathUtils.lerp(0, -0.15, easeInOut(p));
  }
  // arms extend upward (both)
  const a = Math.min(t/1.4, 1);
  rightArm.rotation.z = THREE.MathUtils.lerp(-Math.PI*.08, -Math.PI*0.9, easeOut(a));
  leftArm.rotation.z = THREE.MathUtils.lerp(Math.PI*.08, Math.PI*0.88, easeOut(a));
  attachHammerToRightHand();
  hammerGroup.rotation.z = -0.2 - 0.1*Math.sin(t*3);
  // rune glow brightens
  runeGlow.intensity = Math.min(4, t*1.4);
  // ember surge
  emberMat.opacity = Math.min(1, 0.85 + t*0.05);
}

// ─────────── tick ───────────
function tick(){
  const dt = clock.getDelta();
  const elapsed = clock.elapsedTime;
  const tScene = elapsed - t0;

  // ambient float for chest emblem
  emblemMat.emissiveIntensity = 0.9 + 0.35*Math.sin(elapsed*2);

  // cape
  updateCape(dt);

  // variant-specific animation
  if (currentVariant === 'descent')  variantDescent(tScene);
  if (currentVariant === 'strike')   variantStrike(tScene);
  if (currentVariant === 'orbit')    variantOrbit(tScene);
  if (currentVariant === 'ascend')   variantAscend(tScene);

  // embers drift
  {
    const arr = emberGeom.attributes.position.array;
    for (let i=0;i<emberCount;i++){
      arr[i*3]   += emberVel[i*3]   + Math.sin(elapsed*0.3 + emberSeed[i])*0.002;
      arr[i*3+1] += emberVel[i*3+1];
      arr[i*3+2] += emberVel[i*3+2] + Math.cos(elapsed*0.25 + emberSeed[i])*0.002;
      if (arr[i*3+1] > 9){
        arr[i*3+1] = -1;
        arr[i*3]   = (Math.random()-.5)*28;
        arr[i*3+2] = (Math.random()-.5)*22 - 2;
      }
    }
    emberGeom.attributes.position.needsUpdate = true;
  }

  // halo pulse
  halo.material.opacity = 0.12 + 0.05*Math.sin(elapsed*1.4);

  // render
  composer.render();
  requestAnimationFrame(tick);
}

// easing
const easeOut = t => 1 - Math.pow(1-t, 3);
const easeIn  = t => t*t*t;
const easeInOut = t => t<.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;

// ─────────── palette application ───────────
function applyPalette(name){
  const p = PALETTES[name] || PALETTES.migraine;
  rimLight.color.copy(p.accent);
  keyLight.color.copy(p.key);
  pulseLight.color.copy(p.accent);
  runeGlow.color.copy(p.accent);
  capeMat.color.copy(p.accent).multiplyScalar(0.7);
  capeMat.emissive.copy(p.accent).multiplyScalar(0.12);
  emblemMat.color.copy(p.rim);
  emblemMat.emissive.copy(p.rim);
  shockMat.color.copy(p.accent);
  shock2.material.color.copy(p.rim);
  halo.material.color.copy(p.accent);
  emberMat.color.copy(p.rim);
  scene.fog.color.set(p.fog);
  document.documentElement.style.setProperty('--accent', `#${p.accent.getHexString()}`);
  document.documentElement.style.setProperty('--accent-2', `#${p.rim.getHexString()}`);
  // subtle body bg accent
  document.body.style.background =
    `radial-gradient(1400px 900px at 50% 30%, ${hexA(p.accent.getHexString(), .12)}, transparent 60%),
     radial-gradient(900px 500px at 10% 100%, ${hexA(p.rim.getHexString(), .05)}, transparent 70%),
     #07070c`;
}
function hexA(hex, a){ return `rgba(${parseInt(hex.slice(0,2),16)},${parseInt(hex.slice(2,4),16)},${parseInt(hex.slice(4,6),16)},${a})`; }

function applyQuality(q){
  state.quality = q;
  bloomPass.strength = q==='high'?0.9 : q==='med'?0.65 : 0.4;
  renderer.shadowMap.enabled = q !== 'low';
  rgbPass.enabled = q === 'high';
  resize();
}

// ─────────── play controls ───────────
function play(variant){
  currentVariant = variant;
  state.variant = variant;
  resetObjects();
  t0 = clock.elapsedTime;
  const times = TIMES[variant];
  document.documentElement.style.setProperty('--t-kicker', `${times.kicker}s`);
  document.documentElement.style.setProperty('--t-title',  `${times.title}s`);
  document.documentElement.style.setProperty('--t-tag',    `${times.tag}s`);
  document.documentElement.style.setProperty('--t-cta',    `${times.cta}s`);
  const heroUI = document.getElementById('heroUI');
  heroUI.classList.remove('shown'); void heroUI.offsetWidth;
  heroUI.classList.add('shown');
  thunkSoon(variant);
  document.getElementById('sceneLabel').textContent = SCENE_LABELS[variant];
  document.querySelectorAll('.vdot').forEach(d=>d.classList.toggle('on', d.dataset.variant===variant));
  document.querySelectorAll('#chips-variant .chip').forEach(c=>c.classList.toggle('on', c.dataset.variant===variant));
  persist({variant});
}

// ─────────── sound ───────────
let audioCtx = null;
function ensureAudio(){
  if (audioCtx) return audioCtx;
  try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ return null; }
  return audioCtx;
}
function thunk(pitch=1, vol=1){
  const ctx = ensureAudio(); if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const now = ctx.currentTime;
  const o1 = ctx.createOscillator(), g1 = ctx.createGain();
  o1.type='sine'; o1.frequency.setValueAtTime(180*pitch, now);
  o1.frequency.exponentialRampToValueAtTime(44*pitch, now+0.24);
  g1.gain.setValueAtTime(0.0001, now);
  g1.gain.exponentialRampToValueAtTime(0.55*vol, now+0.008);
  g1.gain.exponentialRampToValueAtTime(0.0001, now+0.4);
  o1.connect(g1).connect(ctx.destination); o1.start(now); o1.stop(now+0.45);

  const bsz = ctx.sampleRate*0.1;
  const buf = ctx.createBuffer(1,bsz,ctx.sampleRate); const d = buf.getChannelData(0);
  for (let i=0;i<bsz;i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/bsz, 2.2);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=2000*pitch; bp.Q.value=1.1;
  const ng = ctx.createGain(); ng.gain.setValueAtTime(0.28*vol, now); ng.gain.exponentialRampToValueAtTime(0.0001, now+0.1);
  src.connect(bp).connect(ng).connect(ctx.destination); src.start(now);

  const o2 = ctx.createOscillator(), g2 = ctx.createGain();
  o2.type='sine'; o2.frequency.setValueAtTime(52*pitch, now);
  o2.frequency.exponentialRampToValueAtTime(28*pitch, now+0.45);
  g2.gain.setValueAtTime(0.0001, now);
  g2.gain.exponentialRampToValueAtTime(0.55*vol, now+0.02);
  g2.gain.exponentialRampToValueAtTime(0.0001, now+0.7);
  o2.connect(g2).connect(ctx.destination); o2.start(now); o2.stop(now+0.75);
}
function whoosh(dur=.6){
  const ctx = ensureAudio(); if (!ctx) return;
  if (ctx.state==='suspended') ctx.resume();
  const now = ctx.currentTime;
  const bsz = ctx.sampleRate*dur;
  const buf = ctx.createBuffer(1,bsz,ctx.sampleRate); const d = buf.getChannelData(0);
  for (let i=0;i<bsz;i++) d[i] = (Math.random()*2-1);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value = 1.5;
  bp.frequency.setValueAtTime(350, now); bp.frequency.exponentialRampToValueAtTime(1400, now+dur*.7);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(.18, now+dur*.3); g.gain.exponentialRampToValueAtTime(0.0001, now+dur);
  src.connect(bp).connect(g).connect(ctx.destination); src.start(now);
}

let thunkTimer = 0;
function thunkSoon(variant){ /* audio disabled */ }

// ─────────── UI wiring ───────────
const heroUI = document.getElementById('heroUI');
document.getElementById('kicker').textContent = state.kicker;
document.getElementById('bigTitle').textContent = state.title;
document.getElementById('tagline').textContent = `"${state.tagline}"`;
document.querySelectorAll('.vdot').forEach(b=> b.addEventListener('click', ()=> play(b.dataset.variant)));
document.querySelectorAll('#chips-variant .chip').forEach(b=> b.addEventListener('click', ()=> play(b.dataset.variant)));
document.querySelectorAll('#chips-palette .chip').forEach(b=> b.addEventListener('click', ()=> { applyPalette(b.dataset.palette); state.palette = b.dataset.palette; persist({palette: state.palette}); syncChips(); }));
document.querySelectorAll('#chips-quality .chip').forEach(b=> b.addEventListener('click', ()=> { applyQuality(b.dataset.quality); persist({quality: state.quality}); syncChips(); }));

document.getElementById('capeSlider').addEventListener('input', e=>{ state.cape = parseFloat(e.target.value); persist({cape: state.cape}); });
document.getElementById('titleIn').addEventListener('input', e=>{ state.title = e.target.value; document.getElementById('bigTitle').textContent = state.title; persist({title: state.title}); });
document.getElementById('taglineIn').addEventListener('input', e=>{ state.tagline = e.target.value; document.getElementById('tagline').textContent = `"${state.tagline}"`; persist({tagline: state.tagline}); });
document.getElementById('kickerIn').addEventListener('input', e=>{ state.kicker = e.target.value; document.getElementById('kicker').textContent = state.kicker; persist({kicker: state.kicker}); });

document.getElementById('openApp').addEventListener('click', ()=> { window.dismissOrakelSplash && window.dismissOrakelSplash(); });
document.getElementById('ctaPrimary').addEventListener('click', ()=>{ setTimeout(()=> { window.dismissOrakelSplash && window.dismissOrakelSplash(); }, 180); });

canvas.addEventListener('click', (e)=>{
  if (e.target.closest('button,a')) return;
  play(currentVariant);
});

const panel = document.getElementById('tweaksPanel');
document.getElementById('tweaksToggle').addEventListener('click', ()=>{
  panel.classList.toggle('open'); panel.setAttribute('aria-hidden', !panel.classList.contains('open'));
});
document.getElementById('titleIn').value = state.title;
document.getElementById('taglineIn').value = state.tagline;
document.getElementById('kickerIn').value = state.kicker;
document.getElementById('capeSlider').value = state.cape;

function syncChips(){
  document.querySelectorAll('#chips-palette .chip').forEach(c=>c.classList.toggle('on', c.dataset.palette===state.palette));
  document.querySelectorAll('#chips-quality .chip').forEach(c=>c.classList.toggle('on', c.dataset.quality===state.quality));
  document.querySelectorAll('#chips-variant .chip').forEach(c=>c.classList.toggle('on', c.dataset.variant===state.variant));
}
syncChips();

// persist for tweaks host
window.addEventListener('message', ev=>{
  const d = ev.data||{};
  if (d.type === '__activate_edit_mode'){ panel.classList.add('open'); panel.setAttribute('aria-hidden','false'); }
  else if (d.type === '__deactivate_edit_mode'){ panel.classList.remove('open'); panel.setAttribute('aria-hidden','true'); }
});
function persist(edits){ try{ window.parent.postMessage({type:'__edit_mode_set_keys', edits},'*'); }catch(e){} }
try{ window.parent.postMessage({type:'__edit_mode_available'},'*'); }catch(e){}

// ─────────── init ───────────
function orakelInit(){
  try {
    console.log('[orakel] applying palette');
    applyPalette(state.palette);
    console.log('[orakel] applying quality');
    applyQuality(state.quality);
    console.log('[orakel] resetObjects');
    resetObjects();
    console.log('[orakel] attachHammerToRightHand');
    attachHammerToRightHand();
    console.log('[orakel] init complete, hiding loader on next frame');

    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        try { window.__orakelClearSafetyTimer && window.__orakelClearSafetyTimer(); } catch(e){}
        const loadingEl = document.getElementById('loading');
        if (loadingEl) loadingEl.classList.add('hidden');
        console.log('[orakel] loader hidden, starting animation');
        play(state.variant);
        tick();
      });
    });
  } catch (err) {
    console.error('[orakel] init failed:', err);
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
      loadingEl.innerHTML = '<div style="color:#ff2d55;font-family:monospace;font-size:11px;letter-spacing:.1em;text-align:center;max-width:80%;">INIT FAILED<br>' + String(err && err.message || err) + '</div>';
    }
    try { window.__orakelClearSafetyTimer && window.__orakelClearSafetyTimer(); } catch(e){}
    setTimeout(()=>{ if (window.dismissOrakelSplash) window.dismissOrakelSplash(); }, 2500);
  }
}
orakelInit();
