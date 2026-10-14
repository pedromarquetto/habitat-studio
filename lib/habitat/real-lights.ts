import * as THREE from 'three';
import type { LightSource } from './lighting';
import type { RealProfile } from './real-performance';

export function nearbyLightSources(sources: readonly LightSource[], point: { x: number; z: number }, limit: number, roomId?: string) {
  return sources.filter(source => source.on && source.intensity > 0 && Math.hypot(source.x - point.x, source.z - point.z) <= 16)
    .sort((a, b) => Number(b.roomId === roomId && !!roomId) - Number(a.roomId === roomId && !!roomId)
      || Math.hypot(a.x - point.x, a.z - point.z) - Math.hypot(b.x - point.x, b.z - point.z)
      || a.id.localeCompare(b.id)).slice(0, limit);
}

/** Fixed light slots avoid reallocating lights and recompiling shaders while walking. */
export class RealLightPool {
  readonly group = new THREE.Group();
  readonly lights: THREE.SpotLight[] = [];
  private signatures: string[] = [];
  constructor(profile: Readonly<RealProfile>) {
    for (let index = 0; index < profile.roomLights; index++) {
      const light = new THREE.SpotLight('#ffd6a3', 0, 14, Math.PI * .46, .55, 2);
      light.castShadow = index < profile.roomShadows;
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = true;
      light.shadow.mapSize.set(profile.roomShadowSize, profile.roomShadowSize);
      light.shadow.camera.near = .08; light.shadow.camera.far = 14;
      light.shadow.bias = -.00008; light.shadow.normalBias = .018;
      this.lights.push(light); this.group.add(light, light.target);
    }
  }
  update(sources: readonly LightSource[], floorElevation: number, night: boolean) {
    let changed = false;
    this.lights.forEach((light, index) => {
      const source = sources[index];
      const signature = JSON.stringify([source, floorElevation, night]);
      if (this.signatures[index] === signature) return;
      this.signatures[index] = signature; changed = true;
      light.userData.sourceId = source?.id ?? null;
      light.intensity = source?.on ? (night ? 85 : 55) * source.intensity : 0;
      if (source) {
        light.color.set(source.color);
        light.position.set(source.x, floorElevation + source.y - .06, source.z);
        light.target.position.set(source.x, floorElevation, source.z);
      }
      light.shadow.needsUpdate = true;
    });
    return changed;
  }
  dispose() { for (const light of this.lights) light.shadow.dispose(); this.group.clear(); }
}

export function invalidateShadowMaps(shadowMap: { needsUpdate: boolean }, scene: THREE.Object3D) {
  shadowMap.needsUpdate = true;
  scene.traverse(object => {
    if ((object instanceof THREE.SpotLight || object instanceof THREE.DirectionalLight) && object.castShadow) object.shadow.needsUpdate = true;
  });
}
