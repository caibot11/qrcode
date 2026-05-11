import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { easeInOutCubic, lerp } from '../codes/qr/qr-helpers.js';

/**
 * BaseVisualizer — generic 3D scene, camera, controls, InstancedMesh, labels, animation loop.
 * Code-type-specific logic is provided via a config object and a visualizer delegate.
 *
 * Config interface:
 *   stageCount, stageLabels, stageColors, stageDurations, geometryType ('grid'|'bars'),
 *   cameraPresets: { default: { pos: [x,y,z], target: [x,y,z] } }
 *
 * Delegate interface:
 *   categorizeModules(data, helpers) → modules[]
 *   setupExtras(scene, gridSize, halfSize) → extras{}
 *   renderStage(step, progress, ctx) → void
 *   cleanupStage(step, ctx) → void
 *   onLoadNew(vizData, ctx) → void   (optional, for loadNewQR-equivalent)
 *   disposeExtras(extras) → void
 */
export class BaseVisualizer {
  constructor(container, vizData, config, delegate, callbacks = {}) {
    this.container = container;
    this.data = vizData;
    this.config = config;
    this.delegate = delegate;
    this.onStepChange = callbacks.onStepChange || (() => {});
    this.onStageData = callbacks.onStageData || (() => {});
    this.currentStep = -1;
    this.autoPlay = false;
    this.destroyed = false;

    this.gridSize = vizData.gridSize;
    this.halfSize = this.gridSize / 2;

    // Animation state
    this.stageStartTime = 0;
    this.stageProgress = 0;
    this.isAnimating = false;
    this.lastInteraction = performance.now();
    this.idleTimeout = 30000;
    this._lastStageDataKey = '';

    // Reusable Three.js objects
    this._mat4 = new THREE.Matrix4();
    this._color = new THREE.Color();
    this._vec3 = new THREE.Vector3();
    this._scaleMat = new THREE.Matrix4();

    // Camera animation
    this._camPos = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
    this._camPosGoal = new THREE.Vector3();
    this._camTargetGoal = new THREE.Vector3();

    this._setupScene();

    // Let delegate categorize modules
    this.modules = delegate.categorizeModules(vizData, this);
    this._setupModules();

    // Let delegate set up extras (mask plane, cursor, etc.)
    this.extras = delegate.setupExtras(this.scene, this.gridSize, this.halfSize);

    this._setupLabels();

    // Start render loop
    this._rafId = null;
    this._lastFrame = performance.now();
    this._boundAnimate = this._animate.bind(this);
    this._boundAnimate();
  }

  // =========================================
  // Scene Setup
  // =========================================

  _setupScene() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e1a);
    this.scene.fog = new THREE.FogExp2(0x0a0e1a, 0.006);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
    const preset = this.config.cameraPresets?.default;
    if (preset) {
      this.camera.position.set(...preset.pos);
      this._camPos.set(...preset.pos);
      this._camTarget.set(...preset.target);
      this._camPosGoal.set(...preset.pos);
      this._camTargetGoal.set(...preset.target);
    } else {
      const dist = this.gridSize * 0.9;
      this.camera.position.set(dist * 0.7, dist * 0.8, dist * 0.7);
      this._camPos.copy(this.camera.position);
      this._camTarget.set(0, 0, 0);
      this._camPosGoal.copy(this._camPos);
      this._camTargetGoal.set(0, 0, 0);
    }
    this.camera.lookAt(this._camTarget.x, this._camTarget.y, this._camTarget.z);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.cssRenderer = new CSS2DRenderer();
    this.cssRenderer.setSize(w, h);
    this.cssRenderer.domElement.style.position = 'absolute';
    this.cssRenderer.domElement.style.top = '0';
    this.cssRenderer.domElement.style.left = '0';
    this.cssRenderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.cssRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.enableZoom = true;
    this.controls.zoomSpeed = 1.2;
    this.controls.enablePan = true;
    this.controls.panSpeed = 0.8;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = this.gridSize * 0.25;
    this.controls.maxDistance = this.gridSize * 3.5;
    this.controls.maxPolarAngle = Math.PI * 0.85;
    this.controls.minPolarAngle = Math.PI * 0.05;

    const onInteract = () => {
      this.lastInteraction = performance.now();
      this.controls.autoRotate = false;
      this._userInteracting = true;
    };
    const onInteractEnd = () => {
      this._userInteracting = false;
      // Resume auto-rotate after a delay
      clearTimeout(this._autoRotateTimer);
      this._autoRotateTimer = setTimeout(() => {
        if (!this._userInteracting) this.controls.autoRotate = true;
      }, 5000);
    };
    this.renderer.domElement.addEventListener('pointerdown', onInteract);
    this.renderer.domElement.addEventListener('wheel', onInteract);
    this.renderer.domElement.addEventListener('pointerup', onInteractEnd);
    this.renderer.domElement.addEventListener('pointerleave', onInteractEnd);

    const ambient = new THREE.AmbientLight(0x404060, 1.2);
    this.scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(10, 20, 10);
    this.scene.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0x4488ff, 0.4);
    dirLight2.position.set(-10, 10, -10);
    this.scene.add(dirLight2);

    const groundGeo = new THREE.PlaneGeometry(this.gridSize * 2 + 10, this.gridSize * 2 + 10);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0d1117, transparent: true, opacity: 0.6, roughness: 1
    });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.15;
    this.scene.add(this.ground);

    this._onResize = () => {
      const w2 = this.container.clientWidth;
      const h2 = this.container.clientHeight;
      this.camera.aspect = w2 / h2;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w2, h2);
      this.cssRenderer.setSize(w2, h2);
    };
    window.addEventListener('resize', this._onResize);
  }

  // =========================================
  // InstancedMesh Setup
  // =========================================

  _setupModules() {
    const count = this.modules.length;
    const geomType = this.config.geometryType || 'grid';

    let geo;
    if (geomType === 'bars') {
      // For barcodes: unit box, scaled per-instance
      geo = new THREE.BoxGeometry(1, 1, 1);
    } else {
      geo = new THREE.BoxGeometry(0.85, 0.18, 0.85);
    }
    const mat = new THREE.MeshPhongMaterial({ flatShading: false });

    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < count; i++) {
      const m = this.modules[i];
      if (geomType === 'bars') {
        this._mat4.identity();
        this._mat4.makeTranslation(m.x || 0, m.y || 0, m.z || 0);
        if (m.sx || m.sy || m.sz) {
          this._scaleMat.makeScale(m.sx || 1, m.sy || 1, m.sz || 1);
          this._mat4.multiply(this._scaleMat);
        }
      } else {
        this._mat4.makeTranslation(
          m.col - this.halfSize + 0.5,
          0,
          m.row - this.halfSize + 0.5
        );
      }
      this.mesh.setMatrixAt(i, this._mat4);

      if (m.val) {
        this._color.setRGB(0.78, 0.8, 0.84);
      } else {
        this._color.setRGB(0.1, 0.11, 0.14);
      }
      this.mesh.setColorAt(i, this._color);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.scene.add(this.mesh);
  }

  // =========================================
  // CSS2D Labels
  // =========================================

  _setupLabels() {
    this.labels = new Map();
    this.labelGroup = new THREE.Group();
    this.scene.add(this.labelGroup);
  }

  showLabel(id, text, x, y, z, extraClass) {
    let label = this.labels.get(id);
    if (!label) {
      const div = document.createElement('div');
      div.className = 'label-3d' + (extraClass ? ' ' + extraClass : '');
      const obj = new CSS2DObject(div);
      this.labelGroup.add(obj);
      label = { element: div, object: obj };
      this.labels.set(id, label);
    }
    label.element.className = 'label-3d' + (extraClass ? ' ' + extraClass : '');
    label.element.textContent = text;
    label.object.position.set(x, y, z);
    label.object.visible = true;
    return label;
  }

  hideLabel(id) {
    const label = this.labels.get(id);
    if (label) label.object.visible = false;
  }

  hideAllLabels() {
    for (const [, label] of this.labels) {
      label.object.visible = false;
    }
  }

  // =========================================
  // Camera Targeting
  // =========================================

  setCameraGoal(px, py, pz, tx, ty, tz) {
    this._camPosGoal.set(px, py, pz);
    this._camTargetGoal.set(tx, ty, tz);
  }

  defaultCameraGoal() {
    const preset = this.config.cameraPresets?.default;
    if (preset) {
      this.setCameraGoal(...preset.pos, ...preset.target);
    } else {
      const dist = this.gridSize * 0.9;
      this.setCameraGoal(dist * 0.7, dist * 0.8, dist * 0.7, 0, 0, 0);
    }
  }

  // =========================================
  // Stage Data Emission
  // =========================================

  emitStageData(type, payload) {
    const key = type + JSON.stringify(payload);
    if (key === this._lastStageDataKey) return;
    this._lastStageDataKey = key;
    this.onStageData({ type, payload });
  }

  // =========================================
  // Color Helpers
  // =========================================

  setDefaultColors() {
    for (const m of this.modules) {
      if (m.val) {
        m._r = 0.78; m._g = 0.8; m._b = 0.84;
      } else {
        m._r = 0.1; m._g = 0.11; m._b = 0.14;
      }
      m._y = 0;
    }
  }

  blendColor(m, r, g, b, t) {
    m._r = lerp(m._r, r, t);
    m._g = lerp(m._g, g, t);
    m._b = lerp(m._b, b, t);
  }

  // =========================================
  // Public API
  // =========================================

  goToStep(index) {
    const maxStep = this.config.stageCount - 1;
    if (index < 0 || index > maxStep) return;

    // Let delegate clean up previous stage
    if (this.currentStep >= 0 && this.delegate.cleanupStage) {
      this.delegate.cleanupStage(this.currentStep, this);
    }

    this.currentStep = index;
    this.stageStartTime = performance.now();
    this.stageProgress = 0;
    this.isAnimating = true;
    this.lastInteraction = performance.now();
    this._lastStageDataKey = '';

    // Hide extras via delegate
    if (this.delegate.hideExtras) {
      this.delegate.hideExtras(this.extras, this);
    }
    this.hideAllLabels();

    // Reset module Y positions
    for (const m of this.modules) {
      m._y = 0;
    }

    this.defaultCameraGoal();
    this.onStepChange(index);
  }

  loadNewCode(vizData) {
    this.scene.remove(this.mesh);
    this.mesh.dispose();

    this.data = vizData;
    this.gridSize = vizData.gridSize;
    this.halfSize = this.gridSize / 2;

    this.controls.minDistance = this.gridSize * 0.4;
    this.controls.maxDistance = this.gridSize * 2.5;

    // Let delegate handle code-specific reinitialization
    if (this.delegate.onLoadNew) {
      this.delegate.onLoadNew(vizData, this);
    }

    this.modules = this.delegate.categorizeModules(vizData, this);
    this._setupModules();

    // Re-setup extras
    if (this.delegate.disposeExtras) {
      this.delegate.disposeExtras(this.extras);
    }
    if (this.extras) {
      for (const obj of Object.values(this.extras)) {
        if (obj && obj.parent) this.scene.remove(obj);
      }
    }
    this.extras = this.delegate.setupExtras(this.scene, this.gridSize, this.halfSize);

    this.ground.geometry.dispose();
    this.ground.geometry = new THREE.PlaneGeometry(this.gridSize * 2 + 10, this.gridSize * 2 + 10);

    this.defaultCameraGoal();
    this.goToStep(0);
  }

  destroy() {
    this.destroyed = true;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    window.removeEventListener('resize', this._onResize);

    this.mesh.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();

    if (this.delegate.disposeExtras) {
      this.delegate.disposeExtras(this.extras);
    }

    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.renderer.dispose();
    this.controls.dispose();

    this.container.removeChild(this.renderer.domElement);
    this.container.removeChild(this.cssRenderer.domElement);

    for (const [, label] of this.labels) {
      this.labelGroup.remove(label.object);
    }
    this.labels.clear();
  }

  // =========================================
  // Animation Loop
  // =========================================

  _animate() {
    if (this.destroyed) return;
    this._rafId = requestAnimationFrame(this._boundAnimate);

    const now = performance.now();
    const dt = now - this._lastFrame;
    this._lastFrame = now;

    if (this.isAnimating && this.currentStep >= 0) {
      const duration = this.config.stageDurations[this.currentStep];
      this.stageProgress = Math.min(1, (now - this.stageStartTime) / duration);

      const easedProgress = easeInOutCubic(this.stageProgress);
      this.delegate.renderStage(this.currentStep, easedProgress, this);

      if (this.stageProgress >= 1) {
        this.isAnimating = false;
        this._onStageComplete();
      }
    }

    // Update instanced mesh
    this._updateInstancedMesh();

    // Camera interpolation
    const camLerp = 1 - Math.pow(0.05, dt / 1000);
    this._camPos.lerp(this._camPosGoal, camLerp);
    this._camTarget.lerp(this._camTargetGoal, camLerp);
    this.camera.position.copy(this._camPos);
    this.controls.target.copy(this._camTarget);

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.cssRenderer.render(this.scene, this.camera);

    // Idle restart
    const maxStep = this.config.stageCount - 1;
    if (!this.isAnimating && this.currentStep === maxStep && this.autoPlay) {
      if (now - this.lastInteraction > this.idleTimeout) {
        this.lastInteraction = now;
        this.goToStep(0);
      }
    }
  }

  _onStageComplete() {
    const maxStep = this.config.stageCount - 1;
    if (this.autoPlay && this.currentStep < maxStep) {
      setTimeout(() => {
        if (!this.destroyed) this.goToStep(this.currentStep + 1);
      }, 2500);
    }
  }

  _updateInstancedMesh() {
    const count = this.modules.length;
    const geomType = this.config.geometryType || 'grid';

    for (let i = 0; i < count; i++) {
      const m = this.modules[i];

      if (geomType === 'bars') {
        this._mat4.identity();
        this._mat4.makeTranslation(
          m.x || 0,
          (m._y !== undefined ? m._y : (m.y || 0)),
          m.z || 0
        );
        this._scaleMat.makeScale(
          m._sx || m.sx || 1,
          m._sy || m.sy || 1,
          m._sz || m.sz || 1
        );
        this._mat4.multiply(this._scaleMat);
      } else {
        const sy = m._scaleY || 1;
        this._mat4.makeTranslation(
          m.col - this.halfSize + 0.5,
          m._y,
          m.row - this.halfSize + 0.5
        );
        if (sy !== 1) {
          this._scaleMat.makeScale(1, sy, 1);
          this._mat4.multiply(this._scaleMat);
        }
      }
      this.mesh.setMatrixAt(i, this._mat4);

      this._color.setRGB(m._r, m._g, m._b);
      this.mesh.setColorAt(i, this._color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
