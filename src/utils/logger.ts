import { env } from '../config/env';

const timestamp = () => new Date().toISOString();

function serializeArg(arg: unknown): unknown {
  if (arg instanceof Error) {
    const extra = arg as Error & { code?: string; meta?: unknown; clientVersion?: string };
    return {
      name: arg.name,
      message: arg.message,
      stack: arg.stack,
      code: extra.code,
      meta: extra.meta,
      clientVersion: extra.clientVersion,
    };
  }

  return arg;
}

const serializeArgs = (args: unknown[]) => args.map(serializeArg);

export const logger = {
  info:  (msg: string, ...args: unknown[]) => console.log( `[${timestamp()}] INFO  ${msg}`, ...serializeArgs(args)),
  warn:  (msg: string, ...args: unknown[]) => console.warn(`[${timestamp()}] WARN  ${msg}`, ...serializeArgs(args)),
  error: (msg: string, ...args: unknown[]) => console.error(`[${timestamp()}] ERROR ${msg}`, ...serializeArgs(args)),
  debug: (msg: string, ...args: unknown[]) => {
    if (env.NODE_ENV === 'development') {
      console.log(`[${timestamp()}] DEBUG ${msg}`, ...serializeArgs(args));
    }
  },
  http: (method: string, path: string, status: number, ms: number) =>
    console.log(`[${timestamp()}] HTTP ${method.padEnd(6)} ${path.padEnd(40)} ${status} (${ms}ms)`),
};
