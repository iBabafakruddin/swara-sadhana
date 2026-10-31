import type { Clock, IdGenerator } from '@/application/ports';

export const systemClock: Clock = { now: () => Date.now() };

export const cryptoIdGenerator: IdGenerator = { next: () => crypto.randomUUID() };
