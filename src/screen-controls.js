// Separate pointer IDs let one hand hold movement while the other drags the scene.
export class ScreenControls {
  constructor(root, controller) {
    this.root = root;
    this.controller = controller;
    this.events = new AbortController();
    this.held = new Map();
    const on = (element, type, listener) => element.addEventListener(type, listener, { signal: this.events.signal });
    const paint = button => button.classList.toggle('held', [...this.held.values()].some(hold => hold.button === button));
    const toggles = new Map();
    const clearToggles = () => {
      for (const [button, id] of toggles) {
        controller.screenInputs.delete(id);
        button.setAttribute('aria-pressed', 'false');
      }
      toggles.clear();
    };
    const release = id => {
      const hold = this.held.get(id);
      if (!hold) return;
      this.held.delete(id);
      controller.screenInputs.delete(id);
      if (typeof id === 'number' && hold.button.hasPointerCapture(id)) hold.button.releasePointerCapture(id);
      paint(hold.button);
    };
    this.reset = () => {
      for (const id of [...this.held.keys()]) release(id);
      clearToggles();
    };
    controller.onInputReset = this.reset;
    on(root, 'contextmenu', event => event.preventDefault());
    for (const button of root.querySelectorAll('[data-key]')) {
      on(button, 'pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        controller.canvas.focus({ preventScroll: true });
        button.setPointerCapture(event.pointerId);
        this.held.set(event.pointerId, { button });
        controller.screenInputs.set(event.pointerId, button.dataset.key);
        paint(button);
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) on(button, type, event => {
        release(event.pointerId);
        if (type === 'pointercancel') controller.stopMotion();
      });
      on(button, 'keydown', event => {
        if (!['Space', 'Enter'].includes(event.code)) return;
        event.preventDefault();
        const id = `${button.dataset.key}:${event.code}`;
        this.held.set(id, { button });
        controller.screenInputs.set(id, button.dataset.key);
        paint(button);
      });
      on(button, 'keyup', event => release(`${button.dataset.key}:${event.code}`));
      on(button, 'blur', () => {
        for (const [id, hold] of this.held) if (hold.button === button) release(id);
      });
    }
    for (const button of root.querySelectorAll('[data-toggle-key]')) {
      const touches = new Set();
      let lastTouch = -Infinity;
      const toggle = () => {
        const current = toggles.get(button);
        if (current) {
          controller.screenInputs.delete(current);
          toggles.delete(button);
          button.setAttribute('aria-pressed', 'false');
          return;
        }
        const id = `toggle:${button.dataset.toggleKey}`;
        toggles.set(button, id);
        controller.screenInputs.set(id, button.dataset.toggleKey);
        button.setAttribute('aria-pressed', 'true');
      };
      on(button, 'pointerdown', event => {
        event.preventDefault();
        if (event.pointerType === 'mouse') return;
        touches.add(event.pointerId);
        button.setPointerCapture(event.pointerId);
        lastTouch = performance.now();
        toggle();
      });
      on(button, 'pointerup', event => {
        if (!touches.delete(event.pointerId)) return;
        if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      });
      for (const type of ['pointercancel', 'lostpointercapture']) on(button, type, event => touches.delete(event.pointerId));
      on(button, 'click', event => {
        if (event.pointerType === 'touch' || event.pointerType === 'pen' || (event.detail !== 0 && performance.now() - lastTouch < 800)) return;
        toggle();
      });
    }
    const notice = root.querySelector('.control-notice');
    const showNotice = message => {
      clearTimeout(this.noticeTimer);
      notice.textContent = message;
      notice.hidden = false;
      this.noticeTimer = setTimeout(() => { notice.hidden = true; }, 3000);
    };
    const actions = {
      home: () => controller.reset(),
      fullscreen: async button => {
        const element = document.documentElement;
        const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
        try {
          if (fullscreenElement) {
            const exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (exit) await exit.call(document);
            return;
          }
          const request = element.requestFullscreen || element.webkitRequestFullscreen;
          if (!request) throw new Error('unsupported');
          await request.call(element, { navigationUI: 'hide' });
          try { await screen.orientation?.lock?.('landscape'); } catch {}
        } catch {
          showNotice('当前浏览器不支持全屏。');
        }
        button.blur();
      }
    };
    const fullscreenButton = root.querySelector('[data-action="fullscreen"]');
    const syncFullscreen = () => {
      const active = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      fullscreenButton.textContent = active ? '退出全屏' : '全屏';
      fullscreenButton.setAttribute('aria-label', active ? '退出全屏' : '进入全屏');
    };
    on(document, 'fullscreenchange', syncFullscreen);
    on(document, 'webkitfullscreenchange', syncFullscreen);
    for (const button of root.querySelectorAll('[data-action]')) {
      const touches = new Set();
      let lastTouch = -Infinity;
      // Touch must not steal focus from the canvas and cancel the other hand's drag.
      on(button, 'pointerdown', event => {
        event.preventDefault();
        if (event.pointerType === 'mouse') return;
        touches.add(event.pointerId);
        button.setPointerCapture(event.pointerId);
      });
      on(button, 'pointerup', event => {
        if (!touches.delete(event.pointerId)) return;
        lastTouch = performance.now();
        const bounds = button.getBoundingClientRect();
        if (event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom) actions[button.dataset.action](button);
        if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      });
      for (const type of ['pointercancel', 'lostpointercapture']) on(button, type, event => touches.delete(event.pointerId));
      on(button, 'click', event => {
        // Secondary fingers do not always generate clicks; touch actions run on pointerup.
        if (event.pointerType === 'touch' || event.pointerType === 'pen' || (event.detail !== 0 && performance.now() - lastTouch < 800)) return;
        actions[button.dataset.action](button);
      });
    }
  }

  destroy() {
    clearTimeout(this.noticeTimer);
    this.reset();
    this.controller.onInputReset = null;
    this.events.abort();
  }
}
