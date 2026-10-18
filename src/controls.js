import { Quat, Vec3 } from 'playcanvas';

const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight']);
const TRANSLATION_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF']);

export class FirstPersonController {
  constructor(canvas, camera, { sensitivity = 0.15, moveSpeed = 1, rollSpeed = 90, response = 10, damping = 14 } = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.sensitivity = sensitivity;
    this.baseSpeed = moveSpeed;
    this.rollSpeed = rollSpeed;
    this.response = response;
    this.damping = damping;
    this.keys = new Set();
    this.screenInputs = new Map();
    this.drag = null;
    this.direction = new Vec3();
    this.forward = new Vec3();
    this.right = new Vec3();
    this.up = new Vec3();
    this.velocity = new Vec3();
    this.step = new Vec3();
    this.lookDelta = new Quat();
    this.lookRotation = new Quat();
    this.events = new AbortController();
    const on = (element, type, handler, options = {}) => element.addEventListener(type, handler, { ...options, signal: this.events.signal });
    const release = event => {
      if (event && this.drag?.id !== event.pointerId) return;
      const id = this.drag?.id;
      this.drag = null;
      if (id !== undefined && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      canvas.classList.remove('dragging');
    };
    this.releaseLook = release;
    const resetInput = () => this.clearInput();
    on(canvas, 'pointerdown', event => {
      if (event.button !== 0 || this.drag) return;
      canvas.focus({ preventScroll: true });
      if (![...this.keys, ...this.screenInputs.values()].some(key => TRANSLATION_KEYS.has(key))) this.stopMotion();
      canvas.setPointerCapture(event.pointerId);
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
        rotation: camera.getLocalRotation().clone(), pitch: 0, yaw: 0, roll: 0 };
      canvas.classList.add('dragging');
    });
    on(canvas, 'pointermove', event => {
      if (this.drag?.id !== event.pointerId) return;
      this.drag.pitch = -(event.clientY - this.drag.y) * this.sensitivity;
      this.drag.yaw = -(event.clientX - this.drag.x) * this.sensitivity;
      this.applyDragRotation();
    });
    on(canvas, 'pointerup', release);
    on(canvas, 'pointercancel', release);
    on(canvas, 'lostpointercapture', release);
    on(canvas, 'contextmenu', event => event.preventDefault());
    on(canvas, 'keydown', event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (MOVEMENT_KEYS.has(event.code)) { event.preventDefault(); if (!event.repeat) this.keys.add(event.code); }
      if (event.code === 'Home') { event.preventDefault(); this.reset(); }
    });
    on(window, 'keyup', event => this.keys.delete(event.code));
    on(window, 'blur', resetInput);
    on(canvas, 'blur', resetInput);
    on(document, 'visibilitychange', () => { if (document.hidden) resetInput(); });
  }

  clearInput() {
    this.stopMotion();
    this.keys.clear();
    this.screenInputs.clear();
    this.releaseLook?.();
    this.onInputReset?.();
  }

  stopMotion() { this.velocity.set(0, 0, 0); }

  rotate(pitch, yaw, roll) {
    // Compose local rotations as quaternions, including past vertical and upside down.
    this.camera.rotateLocal(pitch, yaw, roll);
    this.camera.setLocalRotation(this.camera.getLocalRotation().normalize());
  }

  applyDragRotation() {
    const { rotation, pitch, yaw, roll } = this.drag;
    this.lookDelta.setFromEulerAngles(pitch, yaw, roll);
    this.camera.setLocalRotation(this.lookRotation.mul2(rotation, this.lookDelta).normalize());
  }

  setHome(position, target, quaternion) {
    if (quaternion !== undefined && (!Array.isArray(quaternion) || quaternion.length !== 4
      || !quaternion.every(Number.isFinite) || Math.hypot(...quaternion) < 1e-8)) {
      throw new Error('camera.quaternion 必须是非零的 [x, y, z, w] 四元数');
    }
    this.homePosition = position.clone();
    this.homeTarget = target.clone();
    this.homeRotation = quaternion === undefined ? null : new Quat(...quaternion).normalize();
    this.reset();
  }

  reset() {
    if (!this.homePosition) return;
    this.clearInput();
    this.camera.setPosition(this.homePosition);
    if (this.homeRotation) this.camera.setRotation(this.homeRotation);
    else this.camera.lookAt(this.homeTarget);
  }

  update(dt) {
    const frameTime = Math.min(dt, 0.05);
    const screenKeys = new Set(this.screenInputs.values());
    const pressed = key => this.keys.has(key) || screenKeys.has(key) ? 1 : 0;
    const roll = pressed('KeyQ') - pressed('KeyE');
    if (roll) {
      if (this.drag) {
        this.drag.roll += roll * this.rollSpeed * frameTime;
        this.applyDragRotation();
      } else this.rotate(0, 0, roll * this.rollSpeed * frameTime);
    }
    const z = pressed('KeyW') - pressed('KeyS');
    const x = pressed('KeyD') - pressed('KeyA');
    const y = pressed('KeyR') - pressed('KeyF');
    this.forward.copy(this.camera.forward);
    this.right.copy(this.camera.right);
    this.up.copy(this.camera.up);
    this.direction.copy(this.forward).mulScalar(z).add(this.right.mulScalar(x)).add(this.up.mulScalar(y));
    const active = this.direction.lengthSq() > 1e-10;
    const boost = pressed('ShiftLeft') || pressed('ShiftRight') ? 3 : 1;
    if (active) this.direction.normalize().mulScalar(this.baseSpeed * boost);
    if (this.drag && !active) this.stopMotion();
    else this.velocity.lerp(this.velocity, this.direction, 1 - Math.exp(-(active ? this.response : this.damping) * frameTime));
    if (!active && this.velocity.length() < this.baseSpeed * 0.003) this.stopMotion();
    this.camera.translate(this.step.copy(this.velocity).mulScalar(frameTime));
  }

  destroy() { this.clearInput(); this.events.abort(); }
}
