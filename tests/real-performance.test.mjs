import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) { if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(`${specifier}.ts`, context); return next(specifier, context); } });
const THREE = await import('three');
const { AdaptiveResolution, ReflectionSchedule, realPixelRatio, realProfile, normalizeRealQuality } = await import('../lib/habitat/real-performance.ts');
const { RealLightPool, nearbyLightSources, invalidateShadowMaps } = await import('../lib/habitat/real-lights.ts');
const { makeModel, disposeObject } = await import('../lib/habitat/models.ts');
const d = await import('../lib/habitat/domain.ts');
const l = await import('../lib/habitat/lighting.ts');

test('Real defaults to bounded, direct rendering and caps high-DPI/large-screen allocations', () => {
  assert.equal(normalizeRealQuality(null), 'auto'); assert.equal(normalizeRealQuality('old-setting'), 'auto');
  assert.equal(normalizeRealQuality('high'), 'high');
  assert.equal(realProfile('auto'), realProfile('balanced'));
  for (const quality of ['auto', 'balanced', 'performance', 'high']) {
    const budget = realProfile(quality);
    for (const [width, height, dpr] of [[1366, 768, 2], [7680, 4320, 3], [400, 700, .8]]) {
      const ratio = realPixelRatio(quality, width, height, dpr);
      assert.ok(ratio <= dpr && ratio <= budget.pixelRatio);
      assert.ok(width * height * ratio * ratio <= budget.maxPixels + .01);
    }
    assert.equal(budget.postprocessing, quality === 'high'); assert.equal(budget.reflections, quality === 'high');
    assert.ok(budget.roomShadows <= 3 && budget.roomLights <= 8);
  }
  assert.equal(realPixelRatio('auto', 800, 600, 2, .6), .6);
});

test('sustained slow active frames reduce resolution gradually with a hard lower bound', () => {
  const adaptive = new AdaptiveResolution(); adaptive.reset('auto', 0);
  let changes = 0;
  for (let now = 33; now < 20000; now += 33) if (adaptive.sample(33, now, true)) changes++;
  assert.equal(changes, 4); assert.equal(adaptive.scale, .6); assert.equal(adaptive.fps, 30);
  assert.equal(adaptive.sample(900, 22000, true), false); assert.equal(adaptive.scale, .6);
});

test('idle, hidden/loading equivalents and a single hitch never downgrade; recovery has hysteresis', () => {
  const adaptive = new AdaptiveResolution(); adaptive.reset('auto', 0);
  adaptive.sample(200, 1500, true);
  for (let now = 1600; now < 5000; now += 100) adaptive.sample(100, now, false);
  assert.equal(adaptive.scale, 1); assert.equal(adaptive.fps, null);
  for (let now = 5033; now < 14000; now += 33) adaptive.sample(33, now, true);
  assert.equal(adaptive.scale, .6);
  for (let now = 14016; now < 17000; now += 16) adaptive.sample(16, now, true);
  assert.equal(adaptive.scale, .6);
  for (let now = 17016; now < 41000; now += 16) adaptive.sample(16, now, true);
  assert.ok(adaptive.scale > .6 && adaptive.scale <= 1);
  adaptive.pause(42000);
  assert.equal(adaptive.sample(200, 42100, true), false);
});

test('manual quality remains fixed even when measured frame rate is low', () => {
  for (const quality of ['high', 'balanced', 'performance']) {
    const adaptive = new AdaptiveResolution(); adaptive.reset(quality, 0);
    for (let now = 80; now < 12000; now += 80) adaptive.sample(80, now, true);
    assert.equal(adaptive.scale, 1); assert.equal(adaptive.fps, 13);
  }
});

test('automatic resolution handles extremely slow devices without reacting to one isolated stall', () => {
  const slow = new AdaptiveResolution(); slow.reset('auto', 0);
  for (let now = 400; now < 16000; now += 400) slow.sample(400, now, true);
  assert.ok(slow.scale < 1); assert.ok(slow.scale >= .6);
  const single = new AdaptiveResolution(); single.reset('auto', 0);
  for (let now = 1216; now < 5000; now += 16) single.sample(now === 2400 ? 600 : 16, now, true);
  assert.equal(single.scale, 1);
});

test('local reflection capture waits for a navigation pause and enforces a cooldown', () => {
  const schedule = new ReflectionSchedule();
  assert.equal(schedule.ready(2000, true, true, true), false);
  assert.equal(schedule.ready(2500, false, true, true), false);
  assert.equal(schedule.ready(3200, false, false, true), false);
  assert.equal(schedule.ready(3200, false, true, false), false);
  assert.equal(schedule.ready(3200, false, true, true), true); schedule.captured(3200);
  assert.equal(schedule.ready(6000, false, true, true), false);
  assert.equal(schedule.ready(7300, false, true, true), true);
});

test('nearby light selection follows rooms, excludes disabled/distant fixtures and preserves project data', () => {
  const project = l.installRoomLighting(d.createBuilding(2)), saved = JSON.stringify(project), floor = project.floors[0];
  const room = project.entities.find(e => l.isLitRoom(e) && e.floorId === floor.id);
  const sources = l.lightSources(project, floor.id);
  const selected = nearbyLightSources(sources, room, 3, room.id);
  assert.ok(selected.length <= 3); assert.equal(selected[0].roomId, room.id);
  const sw = project.entities.find(e => e.kind === 'lightSwitch' && e.roomId === room.id);
  const off = l.toggleLight(project, sw.id);
  assert.ok(nearbyLightSources(l.lightSources(off, floor.id), room, 3, room.id).every(source => source.roomId !== room.id));
  assert.deepEqual(nearbyLightSources(sources, { x: 200, z: 200 }, 3), []);
  assert.equal(JSON.stringify(project), saved);
});

test('fixed light pool reuses shader/light slots and cached shadows until a fixture or scene changes', () => {
  const pool = new RealLightPool(realProfile('balanced'));
  const ids = pool.lights.map(light => light.uuid);
  assert.equal(pool.lights.length, 6); assert.equal(pool.lights.filter(light => light.castShadow).length, 2);
  const fixture = { id: 'a', x: 2, z: 3, y: 2.9, intensity: 1, color: '#ffd6a3', on: true, virtual: false, roomId: 'r' };
  assert.equal(pool.update([fixture], 3.2, false), true);
  assert.equal(pool.lights[0].position.y, 6.04); assert.equal(pool.lights[0].intensity, 55);
  for (const light of pool.lights) { light.shadow.needsUpdate = false; assert.equal(light.shadow.autoUpdate, false); }
  assert.equal(pool.update([fixture], 3.2, false), false);
  assert.ok(pool.lights.every(light => !light.shadow.needsUpdate));
  assert.equal(pool.update([{ ...fixture, id: 'b', x: 5 }], 3.2, false), true);
  assert.equal(pool.lights[0].shadow.needsUpdate, true);
  assert.deepEqual(pool.lights.map(light => light.uuid), ids);
  pool.update([{ ...fixture, on: false }], 3.2, true); assert.equal(pool.lights[0].intensity, 0);
  const scene = new THREE.Group(), sun = new THREE.DirectionalLight(); sun.castShadow = true; sun.shadow.autoUpdate = false;
  scene.add(sun, pool.group); for (const light of pool.lights) light.shadow.needsUpdate = false;
  const shadowMap = { needsUpdate: false }; invalidateShadowMaps(shadowMap, scene);
  assert.equal(shadowMap.needsUpdate, true); assert.equal(sun.shadow.needsUpdate, true);
  assert.ok(pool.lights.filter(light => light.castShadow).every(light => light.shadow.needsUpdate));
  assert.ok(pool.lights.filter(light => !light.castShadow).every(light => !light.shadow.needsUpdate));
  pool.dispose(); assert.equal(pool.group.children.length, 0);
});

test('lighter rounded geometry preserves exact metric bounds with fewer vertices', () => {
  for (const kind of ['sofa', 'baseCabinet', 'fridge', 'washingMachine', 'table']) {
    const item = d.entity(kind, 'f', 0, 0), before = JSON.stringify(item);
    const detailed = makeModel(item, [item], false, true, 2), light = makeModel(item, [item], false, true, 1);
    const a = new THREE.Box3().setFromObject(detailed), b = new THREE.Box3().setFromObject(light);
    assert.ok(a.min.distanceTo(b.min) < 1e-6 && a.max.distanceTo(b.max) < 1e-6);
    let highVertices = 0, lowVertices = 0;
    detailed.traverse(object => { if (object.isMesh) highVertices += object.geometry.attributes.position.count; });
    light.traverse(object => { if (object.isMesh) lowVertices += object.geometry.attributes.position.count; });
    assert.ok(lowVertices < highVertices); assert.equal(JSON.stringify(item), before);
    disposeObject(detailed); disposeObject(light);
  }
});
