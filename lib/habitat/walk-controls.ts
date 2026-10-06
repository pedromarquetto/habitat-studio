export const DEFAULT_LOOK_SENSITIVITY = 1;

export function normalizeLookSensitivity(value: number) {
  return Number.isFinite(value) ? Math.max(.25, Math.min(2, value)) : DEFAULT_LOOK_SENSITIVITY;
}

type LookPointer = Pick<PointerEvent, 'pointerId' | 'pointerType' | 'isPrimary' | 'button' | 'buttons' | 'clientX' | 'clientY'>;

/** A single primary pointer owns mouse/touch look until it is released. */
export class WalkLook {
  private pointer: { id: number; x: number; y: number; touch: boolean } | null = null;

  get pointerId() { return this.pointer?.id ?? null; }

  begin(event: LookPointer) {
    if (this.pointer || !event.isPrimary || event.button !== 0) return false;
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch' };
    return true;
  }

  move(event: LookPointer, sensitivity: number) {
    const pointer = this.pointer;
    if (!pointer || pointer.id !== event.pointerId || (!pointer.touch && !(event.buttons & 1))) return null;
    const scale = (pointer.touch ? .004 : .002) * normalizeLookSensitivity(sensitivity);
    const delta = { yaw: (event.clientX - pointer.x) * scale, pitch: (event.clientY - pointer.y) * scale };
    pointer.x = event.clientX; pointer.y = event.clientY;
    return delta;
  }

  end(pointerId?: number) {
    if (pointerId !== undefined && pointerId !== this.pointerId) return false;
    const wasActive = this.pointer !== null;
    this.pointer = null;
    return wasActive;
  }
}
