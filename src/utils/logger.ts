import { env } from '../config/env';

const timestamp = () => new Date().toISOString();

export const logger = {
  info:  (msg: string, ...args: unknown[]) => console.log( `[${timestamp()}] ℹ INFO  ${msg}`, ...args),
  warn:  (msg: string, ...args: unknown[]) => console.warn(`[${timestamp()}] ⚠ WARN  ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[${timestamp()}] ✖ ERROR ${msg}`, ...args),
  debug: (msg: string, ...args: unknown[]) => {
    if (env.NODE_ENV === 'development') {
      console.log(`[${timestamp()}] ◆ DEBUG ${msg}`, ...args);
    }
  },
  http: (method: string, path: string, status: number, ms: number) =>
    console.log(`[${timestamp()}] → ${method.padEnd(6)} ${path.padEnd(40)} ${status} (${ms}ms)`),
};
