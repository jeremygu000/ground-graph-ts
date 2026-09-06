export interface Clock {
  now(): Date;
  nowUTC(): Date;
  nowISOString(): string;
}
