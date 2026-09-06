import type { IDGenerator, IDPrefix } from "./id.types";

const PREFIX_TO_NUMBER: Record<IDPrefix, string> = {
  ten: "00",
  usr: "01",
  src: "02",
  doc: "03",
  ver: "04",
  chk: "05",
  idx: "06",
  ent: "07",
  fct: "08",
  evd: "09",
  run: "10",
  stp: "11",
  evt: "12",
};

export class UUIDv7Generator implements IDGenerator {
  private counter = 0;
  private lastTimestamp = 0;

  generate(prefix: IDPrefix): string {
    const timestamp = Date.now();
    if (timestamp !== this.lastTimestamp) {
      this.counter = 0;
      this.lastTimestamp = timestamp;
    } else {
      this.counter++;
    }
    const prefixNum = PREFIX_TO_NUMBER[prefix];
    const random = this.generateRandomHex(10);
    const counterHex = this.counter.toString(16).padStart(4, "0");
    return `${prefixNum}${timestamp.toString(16).padStart(12, "0")}${random}${counterHex}`;
  }

  private generateRandomHex(length: number): string {
    const chars = "0123456789abcdef";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }
}

let globalIdGenerator: IDGenerator = new UUIDv7Generator();

export function setGlobalIdGenerator(generator: IDGenerator): void {
  globalIdGenerator = generator;
}

export function getGlobalIdGenerator(): IDGenerator {
  return globalIdGenerator;
}
