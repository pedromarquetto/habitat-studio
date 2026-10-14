export type RealQuality = 'auto' | 'balanced' | 'performance' | 'high';
export interface RealProfile {
  pixelRatio: number;
  maxPixels: number;
  sunShadow: number;
  roomLights: number;
  roomShadows: number;
  roomShadowSize: number;
  postprocessing: boolean;
  reflections: boolean;
  geometryDetail: 1 | 2;
}
export const REAL_PROFILES: Record<Exclude<RealQuality, 'auto'>, Readonly<RealProfile>> = {
  high: { pixelRatio: 1.25, maxPixels: 2400000, sunShadow: 2048, roomLights: 8, roomShadows: 3, roomShadowSize: 1024, postprocessing: true, reflections: true, geometryDetail: 2 },
  balanced: { pixelRatio: 1, maxPixels: 1800000, sunShadow: 1024, roomLights: 6, roomShadows: 2, roomShadowSize: 512, postprocessing: false, reflections: false, geometryDetail: 1 },
  performance: { pixelRatio: .8, maxPixels: 1000000, sunShadow: 512, roomLights: 3, roomShadows: 1, roomShadowSize: 512, postprocessing: false, reflections: false, geometryDetail: 1 },
};
export function normalizeRealQuality(value: unknown): RealQuality {
  return value === 'high' || value === 'balanced' || value === 'performance' ? value : 'auto';
}
export function realProfile(quality: RealQuality): Readonly<RealProfile> {
  return REAL_PROFILES[quality === 'auto' ? 'balanced' : quality];
}
export function realPixelRatio(quality: RealQuality, width: number, height: number, deviceRatio: number, scale = 1) {
  const profile = realProfile(quality);
  const pixels = Math.max(1, width) * Math.max(1, height);
  return Math.min(Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1, profile.pixelRatio, Math.sqrt(profile.maxPixels / pixels)) * Math.max(.6, Math.min(1, scale));
}
export interface RealPerformanceStatus { quality: RealQuality; scale: number; fps: number | null }

/** Measures consecutive active frames; idle, hidden and loading frames are excluded. */
export class AdaptiveResolution {
  scale = 1;
  fps: number | null = null;
  private quality: RealQuality = 'auto';
  private elapsed = 0;
  private samples = 0;
  private frames: number[] = [];
  private warmUntil = 0;
  private recoveryMs = 0;
  reset(quality: RealQuality, now: number) {
    this.quality = quality; this.scale = 1; this.fps = null;
    this.pause(now, 1200);
  }
  pause(now: number, warmup = 700) {
    this.elapsed = this.samples = this.recoveryMs = 0; this.frames = []; this.warmUntil = now + warmup;
  }
  sample(milliseconds: number, now: number, active: boolean) {
    if (!active || !Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 1000) {
      this.elapsed = this.samples = this.recoveryMs = 0; this.frames = [];
      return false;
    }
    if (now < this.warmUntil) return false;
    this.elapsed += milliseconds; this.samples++; this.frames.push(milliseconds);
    if (this.elapsed < 1500 || this.samples < 12) return false;
    const average = this.elapsed / this.samples;
    const ordered = this.frames.sort((a, b) => a - b);
    const typical = ordered[Math.floor(ordered.length * .7)];
    this.fps = Math.round(1000 / average);
    this.recoveryMs = typical < 18 ? this.recoveryMs + this.elapsed : 0;
    let next = this.scale;
    if (this.quality === 'auto') {
      if (typical > 23) next = Math.max(.6, Math.round((this.scale - .1) * 10) / 10);
      else if (this.recoveryMs >= 8000) next = Math.min(1, Math.round((this.scale + .1) * 10) / 10);
    }
    this.elapsed = this.samples = 0; this.frames = [];
    if (next === this.scale) return false;
    this.scale = next; this.pause(now);
    return true;
  }
}

/** A local cubemap is optional and must not interrupt navigation or run repeatedly. */
export class ReflectionSchedule {
  private movedAt = 0;
  private updatedAt = -Infinity;
  ready(now: number, moving: boolean, permitted: boolean, pending: boolean) {
    if (moving) this.movedAt = now;
    return permitted && pending && !moving && now - this.movedAt >= 1200 && now - this.updatedAt >= 4000;
  }
  captured(now: number) { this.updatedAt = now; }
}
