import {
  AppBase, AppOptions, Asset, BoundingBox, CameraComponentSystem, Color,
  Entity, FILLMODE_FILL_WINDOW, GSPLAT_LODMODE_DISTANCE, GSplatComponentSystem,
  GSplatHandler, RESOLUTION_AUTO, TextureHandler, TONEMAP_NONE, Vec3, createGraphicsDevice
} from 'playcanvas';
import { FirstPersonController } from './controls.js';
import { ScreenControls } from './screen-controls.js';
import { LandscapeGate } from './landscape.js';
import './style.css';

const canvas = document.querySelector('#scene');
const status = document.querySelector('#status');
const nativeZoomEvents = new AbortController();
const preventNativeZoom = event => event.preventDefault();
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, preventNativeZoom, { passive: false, signal: nativeZoomEvents.signal });
}
document.addEventListener('touchmove', event => {
  if (event.touches.length > 1) event.preventDefault();
}, { passive: false, signal: nativeZoomEvents.signal });
let app;
let controller;
let screenControls;
const controlsRoot = document.querySelector('#screen-controls');
const sceneToggle = document.querySelector('#scene-toggle');
const sceneList = document.querySelector('#scene-list');
const landscape = new LandscapeGate(blocked => {
  controller?.clearInput();
  if (app) app.autoRender = !blocked;
});
let fatal = false;
const base = new URL(import.meta.env.BASE_URL, document.baseURI);
const fail = message => {
  fatal = true;
  controller?.clearInput();
  controlsRoot.hidden = true;
  status.hidden = false;
  status.className = 'error';
  status.textContent = message;
  const retry = document.createElement('a');
  retry.href = location.href;
  retry.textContent = '重新加载';
  status.append(retry);
};
const json = async path => {
  const response = await fetch(new URL(path, base), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${path} (${response.status})`);
  return response.json();
};

try {
  const [catalog, config] = await Promise.all([json('scenes.json'), json('viewer-config.json')]);
  const sceneBase = catalog.assetBaseUrl ? new URL(catalog.assetBaseUrl) : base;
  if (!['http:', 'https:'].includes(sceneBase.protocol)) throw new Error('场景资源地址无效');
  if (!Array.isArray(catalog.scenes) || !catalog.scenes.length) throw new Error('场景目录为空');
  const requestedId = new URLSearchParams(location.search).get('scene');
  const selectedId = requestedId ?? catalog.defaultScene;
  const manifest = catalog.scenes.find(entry => entry.id === selectedId);
  if (!manifest || !/^scenes\/[a-f0-9]{20}\/lod-meta\.json$/.test(manifest.url)) throw new Error('场景不存在或索引地址无效');
  if (catalog.showSwitcher !== false) {
    sceneToggle.hidden = false;
    for (const entry of catalog.scenes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry.name || entry.id;
      button.setAttribute('aria-current', String(entry.id === manifest.id));
      button.addEventListener('click', () => {
        if (entry.id === manifest.id) { sceneList.hidden = true; sceneToggle.setAttribute('aria-expanded', 'false'); return; }
        controller?.clearInput();
        const url = new URL(location.href);
        url.searchParams.set('scene', entry.id);
        location.assign(url.href);
      });
      sceneList.append(button);
    }
    const fitSceneMenu = () => {
      sceneList.style.maxHeight = '';
      if (sceneList.hidden || sceneList.scrollHeight <= sceneList.clientHeight) return;
      const bounds = sceneList.getBoundingClientRect();
      let height;
      for (const button of sceneList.children) {
        const row = button.getBoundingClientRect();
        const partialHeight = row.top - bounds.top + row.height / 2;
        if (partialHeight <= bounds.height) height = partialHeight;
      }
      // A partial row makes overflow visible even when mobile scrollbars hide.
      if (height !== undefined) sceneList.style.maxHeight = `${Math.floor(height)}px`;
    };
    window.addEventListener('resize', fitSceneMenu, { signal: nativeZoomEvents.signal });
    sceneToggle.addEventListener('click', () => {
      sceneList.hidden = !sceneList.hidden;
      sceneToggle.setAttribute('aria-expanded', String(!sceneList.hidden));
      if (!sceneList.hidden) {
        controller?.clearInput();
        sceneList.scrollTop = 0;
        fitSceneMenu();
      }
    });
  }
  await landscape.waitForLandscape();
  const mobile = matchMedia('(pointer: coarse)').matches;
  const performanceConfig = config.performance;
  const maximumBudget = mobile ? performanceConfig.mobileBudget : performanceConfig.desktopBudget;
  const device = await createGraphicsDevice(canvas, {
    deviceTypes: config.renderer === 'webgl2' ? ['webgl2'] : ['webgpu', 'webgl2'],
    antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance'
  });
  const options = new AppOptions();
  options.graphicsDevice = device;
  options.componentSystems = [CameraComponentSystem, GSplatComponentSystem];
  options.resourceHandlers = [TextureHandler, GSplatHandler];
  app = new AppBase(canvas);
  app.init(options);
  app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(RESOLUTION_AUTO);
  let resolutionScale = 1;
  const resize = () => {
    device.maxPixelRatio = Math.min(devicePixelRatio || 1, performanceConfig.maxPixelRatio) * resolutionScale;
    app.resizeCanvas();
  };
  resize();
  window.addEventListener('resize', resize);
  const streaming = app.scene.gsplat;
  streaming.splatBudget = maximumBudget;
  streaming.lodMode = GSPLAT_LODMODE_DISTANCE;
  streaming.lodUnderfillLimit = 16;
  streaming.lodUpdateAngle = 10;
  streaming.lodBehindPenalty = 4;
  streaming.cooldownTicks = 180;

  const camera = new Entity('First person camera');
  camera.addComponent('camera', { fov: config.camera.fov, clearColor: new Color(0.063, 0.071, 0.082), toneMapping: TONEMAP_NONE });
  app.root.addChild(camera);
  const asset = new Asset('Streamed scene', 'gsplat', { url: new URL(manifest.url, sceneBase).href });
  app.assets.add(asset);
  app.start();
  status.textContent = '正在读取场景索引…';
  await new Promise((resolve, reject) => {
    asset.once('load', resolve);
    asset.once('error', reject);
    app.assets.load(asset);
  });
  const scene = new Entity('Gaussian scene');
  scene.setEulerAngles(...(manifest.rotation ?? [0, 0, 0]));
  scene.addComponent('gsplat', { asset, unified: true });
  app.root.addChild(scene);
  const bounds = new BoundingBox();
  bounds.setFromTransformedAabb(asset.resource.aabb, scene.getWorldTransform());
  const radius = Math.max(bounds.halfExtents.length(), 0.01);
  const cameraConfig = { ...config.camera, ...manifest.camera };
  camera.camera.fov = cameraConfig.fov;
  const target = cameraConfig.target ? new Vec3(...cameraConfig.target) : bounds.center.clone();
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const verticalHalfFov = cameraConfig.fov * Math.PI / 360;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
  // Fit the actual AABB in both axes. A bounding sphere leaves excessive empty
  // space for wide scenes, especially on landscape phones.
  const fitHeight = bounds.halfExtents.y / Math.tan(verticalHalfFov);
  const fitWidth = bounds.halfExtents.x / Math.tan(horizontalHalfFov);
  const fitDistance = bounds.halfExtents.z + Math.max(fitHeight, fitWidth);
  const configuredDistanceScale = Number(cameraConfig.startDistanceScale);
  const startDistanceScale = Number.isFinite(configuredDistanceScale) ? Math.max(configuredDistanceScale, 0) : 1.08;
  const distance = fitDistance * startDistanceScale;
  const centerHeightOffset = Number(cameraConfig.centerHeightOffset);
  const automaticHeight = startDistanceScale === 0 && Number.isFinite(centerHeightOffset)
    ? bounds.halfExtents.y * centerHeightOffset
    : 0;
  const position = cameraConfig.position
    ? new Vec3(...cameraConfig.position)
    : target.clone().add(new Vec3(0, automaticHeight, distance));
  const lookTarget = !cameraConfig.position && startDistanceScale === 0
    ? position.clone().add(new Vec3(0, 0, -Math.max(radius / 100, 0.01)))
    : target;
  camera.camera.nearClip = Math.max(radius / 10000, 0.0001);
  camera.camera.farClip = Math.max(radius * 100, 100);
  streaming.lodUpdateDistance = Math.max(radius / 200, 0.001);
  controller = new FirstPersonController(canvas, camera, {
    ...config.controls,
    moveSpeed: cameraConfig.moveSpeed ?? radius / 5
  });
  screenControls = new ScreenControls(controlsRoot, controller);
  controller.setHome(position, lookTarget, cameraConfig.quaternion);
  canvas.focus({ preventScroll: true });
  status.textContent = '正在加载场景轮廓…';
  let visible = false;
  let sampleTime = 0;
  let frames = 0;
  let settleTime = 0;
  app.on('update', dt => {
    if (!fatal && !landscape.blocked) controller.update(dt);
    if (!visible && app.stats.frame.gsplats > 0) {
      visible = true;
      if (!fatal) { status.hidden = true; controlsRoot.hidden = false; }
    }
    // Sample over several seconds to avoid oscillating when a chunk arrives or a shader compiles.
    if (!visible || document.hidden || landscape.blocked || !performanceConfig.adaptive) return;
    settleTime += dt;
    if (settleTime < 4) return;
    sampleTime += dt;
    frames++;
    if (sampleTime < 3) return;
    const fps = frames / sampleTime;
    if (fps < 35) {
      streaming.splatBudget = Math.max(Math.min(100000, maximumBudget), Math.round(streaming.splatBudget * 0.8));
      resolutionScale = Math.max(0.6, resolutionScale - 0.1);
      resize();
    } else if (fps > 57 && streaming.splatBudget < maximumBudget) {
      streaming.splatBudget = Math.min(maximumBudget, Math.round(streaming.splatBudget * 1.08));
      resolutionScale = Math.min(1, resolutionScale + 0.05);
      resize();
    }
    sampleTime = 0;
    frames = 0;
  });
  // Streamed chunk errors can happen after the manifest loaded; do not silently show an incomplete scene.
  app.assets.on('error', (error, failedAsset) => {
    if (failedAsset?.type === 'gsplat' || failedAsset?.type === 'texture') {
      console.error(error);
      fail('场景数据块加载失败。请检查网络，或确认已完整上传 scenes 目录。');
    }
  });
  device.on('devicelost', () => fail('图形设备连接已中断，请重新加载场景。'));
  const loadingTimer = setTimeout(() => {
    if (!visible && !fatal) status.textContent = '场景仍在加载，请稍候；若持续无画面，请检查网络和浏览器的硬件加速。';
  }, 20000);
  // Opt-in diagnostics for verification. No inspector or extra UI in the normal page.
  if (new URLSearchParams(location.search).has('debug')) {
    window.__viewer = {
      app, camera, controller, asset,
      snapshot: () => ({ ready: visible, renderer: device.deviceType, position: camera.getPosition().toArray(),
        sceneId: manifest.id,
        rotation: camera.getEulerAngles().toArray(),
        quaternion: [camera.getRotation().x, camera.getRotation().y, camera.getRotation().z, camera.getRotation().w],
        fov: camera.camera.fov, velocity: controller.velocity.toArray(),
        forward: camera.forward.toArray(), up: camera.up.toArray(),
        renderedSplats: app.stats.frame.gsplats,
        budget: streaming.splatBudget, pixelRatio: device.maxPixelRatio })
    };
  }
  window.addEventListener('pagehide', () => {
    clearTimeout(loadingTimer);
    nativeZoomEvents.abort();
    window.removeEventListener('resize', resize);
    screenControls.destroy();
    landscape.destroy();
    controller.destroy();
    app.destroy();
  }, { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
} catch (error) {
  console.error(error);
  fail('场景打开失败。请确认已经运行转换并完整部署文件，且浏览器支持 WebGL 2 或 WebGPU。');
}
