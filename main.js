import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { DragControls } from 'three/addons/controls/DragControls.js';
import { GUI } from 'lil-gui';

import { createCigarette, setGlowIntensity } from './cigarette.js';
import { SmokeSystem } from './smoke.js';
import { CONFIG } from './config.js';

// KHỞI TẠO SCENE, CAMERA, RENDERER
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);

const camera = new THREE.PerspectiveCamera(
    60, 
    window.innerWidth / window.innerHeight, 
    0.1, 
    1000
);
camera.position.set(5, 3, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

// ÁNH SÁNG MÔI TRƯỜNG & ORBIT CONTROLS
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// THÊM ĐỐI TƯỢNG TỪ TV1 VÀ TV2
const cigaretteGroup = createCigarette();
scene.add(cigaretteGroup);

const smokeSystem = new SmokeSystem(scene);

// 2. CẤU HÌNH KÉO THẢ CHUỘT (DRAG CONTROLS) CHO ĐIẾU THUỐC
let isDragging = false;

const dragControls = new DragControls([cigaretteGroup], camera, renderer.domElement);
dragControls.transformGroup = true;

dragControls.addEventListener('dragstart', () => {
    isDragging = true;
    controls.enabled = false;
    document.body.style.cursor = 'grabbing';
});

dragControls.addEventListener('dragend', () => {
    isDragging = false;
    controls.enabled = true;
    document.body.style.cursor = 'auto';
});

dragControls.addEventListener('hoveron', () => {
    if (!isDragging) document.body.style.cursor = 'grab';
});
dragControls.addEventListener('hoveroff', () => {
    if (!isDragging) document.body.style.cursor = 'auto';
});

// THIẾT LẬP BẢNG ĐIỀU KHIỂN UI (LIL-GUI)
const gui = new GUI({ title: 'ĐIỀU KHIỂN MÔ PHỎNG' });

const params = {
    glowIntensity: CONFIG.glowIntensity,
    smokeDensity: CONFIG.smokeDensity,
    windStrength: CONFIG.windStrength,
    enableMovement: true 
};

gui.add(params, 'glowIntensity', 0, 5, 0.1)
   .name('Độ sáng Than')
   .onChange(val => setGlowIntensity(cigaretteGroup, val));

gui.add(params, 'smokeDensity', 50, 2000, 10)
   .name('Mật độ Khói')
   .onChange(val => smokeSystem.setSmokeDensity(val));

gui.add(params, 'windStrength', 0, 2, 0.05)
   .name('Sức gió')
   .onChange(val => smokeSystem.setWindStrength(val));

gui.add(params, 'enableMovement').name('🎬 Thuốc đung đưa');

// ANIMATION LOOP
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();

    if (params.enableMovement && !isDragging) {
        cigaretteGroup.position.x = Math.sin(elapsedTime * 0.8) * 0.5;
        cigaretteGroup.position.y = Math.cos(elapsedTime * 0.6) * 0.3;
        cigaretteGroup.position.z = Math.sin(elapsedTime * 0.5) * 0.2;
    }

    const emitterPos = new THREE.Vector3();
    cigaretteGroup.getWorldPosition(emitterPos);

    if (cigaretteGroup.update) {
        cigaretteGroup.update(deltaTime);
    }
    
    smokeSystem.updateEmitterPosition(emitterPos);
    smokeSystem.update(deltaTime);

    controls.update();
    renderer.render(scene, camera);
}

animate();

// XỬ LÝ RESIZE CỬA SỔ
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});