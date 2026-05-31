type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

function formatArgs(args: unknown[]): { message: string; context?: Record<string, unknown> } {
  if (args.length === 0) return { message: '' };

  const message = typeof args[0] === 'string' ? args[0] : String(args[0]);
  if (args.length === 1) return { message };

  const rest = args.slice(1);
  const context: Record<string, unknown> = {};
  rest.forEach((arg, i) => {
    if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      Object.assign(context, arg);
    } else {
      context[`arg${i}`] = arg;
    }
  });

  return { message, context: Object.keys(context).length > 0 ? context : undefined };
}

function emit(level: LogLevel, args: unknown[]) {
  if (import.meta.env.PROD) {
    const { message, context } = formatArgs(args);
    const entry: StructuredLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context ? { context } : {}),
    };
    const json = JSON.stringify(entry);
    if (level === 'error') console.error(json);
    else if (level === 'warn') console.warn(json);
    else if (level === 'debug') console.debug(json);
    else console.log(json);
  } else {
    const consoleFn = level === 'error' ? console.error
      : level === 'warn' ? console.warn
      : level === 'debug' ? console.debug
      : console.log;
    consoleFn(`[${level.toUpperCase()}]`, ...args);
  }
}

export const logger = {
  info: (...args: unknown[]) => emit('info', args),
  warn: (...args: unknown[]) => emit('warn', args),
  error: (...args: unknown[]) => emit('error', args),
  debug: (...args: unknown[]) => emit('debug', args),
};
