import type { Clock } from "./clock.types";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowUTC(): Date {
    const now = new Date();
    return new Date(now.toUTCString());
  }

  nowISOString(): string {
    return this.nowUTC().toISOString();
  }
}

let globalClock: Clock = new SystemClock();

export function setGlobalClock(clock: Clock): void {
  globalClock = clock;
}

export function getGlobalClock(): Clock {
  return globalClock;
}
