import { randomUUID } from "crypto";

Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID }
});

