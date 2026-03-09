import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

// --- 1. Scene Setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// Add some geometry to see the effect
const group = new THREE.Group();
for (let i = 0; i < 40; i++) {
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(Math.random() * 2 + 1, 0),
    new THREE.MeshNormalMaterial()
  );
  mesh.position.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(50);
  group.add(mesh);
}
scene.add(group);
camera.position.z = 50;

// --- 2. Multi-Pass Post-Processing ---

// A. Main Scene Render
const mainComposer = new EffectComposer(renderer);
mainComposer.addPass(new RenderPass(scene, camera));

// B. Blur Render Target (Where we store the blurry version)
const blurRT = new THREE.WebGLRenderTarget(window.innerWidth / 2, window.innerHeight / 2); 
const blurComposer = new EffectComposer(renderer, blurRT);
blurComposer.addPass(new RenderPass(scene, camera));

const hBlur = new ShaderPass(HorizontalBlurShader);
const vBlur = new ShaderPass(VerticalBlurShader);
hBlur.uniforms['h'].value = 1 / (window.innerWidth / 2);
vBlur.uniforms['v'].value = 1 / (window.innerHeight / 2);
blurComposer.addPass(hBlur);
blurComposer.addPass(vBlur);

// C. Final Mask Shader
const MaskShader = {
  uniforms: {
    "tDiffuse": { value: null },   // Sharp scene (from mainComposer)
    "tBlur": { value: null },      // Blurred scene (from blurRT)
    "mouse": { value: new THREE.Vector2(0.5, 0.5) },
    "aspect": { value: window.innerWidth / window.innerHeight },
    "radius": { value: 0.15 },
    "softness": { value: 0.1 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tBlur;
    uniform vec2 mouse;
    uniform float aspect;
    uniform float radius;
    uniform float softness;
    varying vec2 vUv;

    void main() {
      vec4 sharp = texture2D(tDiffuse, vUv);
      vec4 blurred = texture2D(tBlur, vUv);
      
      vec2 uv = vUv;
      vec2 m = mouse;
      uv.x *= aspect;
      m.x *= aspect;

      float dist = distance(uv, m);
      float mask = smoothstep(radius, radius - softness, dist);
      
      gl_FragColor = mix(blurred, sharp, mask);
    }
  `
};

const finalPass = new ShaderPass(MaskShader);
finalPass.renderToScreen = true;
// We manually assign the blur texture in the loop
mainComposer.addPass(finalPass);

// --- 3. Events & Loop ---

window.addEventListener('mousemove', (e) => {
  finalPass.uniforms.mouse.value.x = e.clientX / window.innerWidth;
  finalPass.uniforms.mouse.value.y = 1.0 - (e.clientY / window.innerHeight);
});

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  finalPass.uniforms.aspect.value = w / h;
});

function animate() {
  requestAnimationFrame(animate);
  //group.rotation.x += 0.002;
  //group.rotation.y += 0.003;

  // 1. Render the scene into the blur composer first
  blurComposer.render();
  
  // 2. Feed that blurred result into our final mask shader
  finalPass.uniforms.tBlur.value = blurRT.texture;
  
  // 3. Render the final output
  mainComposer.render();
}
animate();