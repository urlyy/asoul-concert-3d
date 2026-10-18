export class LandscapeGate {
  constructor(onChange) {
    this.query = matchMedia('(pointer: coarse) and (orientation: portrait)');
    this.events = new AbortController();
    this.waiters = [];
    this.overlay = document.querySelector('#landscape-gate');
    this.update = () => {
      this.blocked = this.query.matches;
      this.overlay.hidden = !this.blocked;
      document.body.classList.toggle('landscape-required', this.blocked);
      document.querySelector('#scene').inert = this.blocked;
      document.querySelector('#screen-controls').inert = this.blocked;
      onChange(this.blocked);
      if (!this.blocked) this.waiters.splice(0).forEach(resolve => resolve());
    };
    this.query.addEventListener('change', this.update, { signal: this.events.signal });
    this.update();
    const button = this.overlay.querySelector('button');
    button.addEventListener('click', async () => {
      button.disabled = true;
      const hint = this.overlay.querySelector('p');
      try {
        if (!screen.orientation?.lock) throw new Error('No orientation locking');
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
        await screen.orientation.lock('landscape');
      } catch {
        hint.textContent = '请关闭手机的方向锁定，然后将手机横过来。';
      } finally { button.disabled = false; }
    }, { signal: this.events.signal });
  }

  waitForLandscape() {
    return this.blocked ? new Promise(resolve => this.waiters.push(resolve)) : Promise.resolve();
  }

  destroy() { this.events.abort(); }
}
