/** Bind the real service, not a probe socket: no check-then-bind race. */
export interface PortOptions {
  port: number;
  /** Explicit ports stay strict unless the caller opts into fallback. */
  strictPort?: boolean;
  maxAttempts?: number;
}

export async function withPortFallback<T>(
  bind: (port: number) => Promise<T>,
  { port, strictPort = true, maxAttempts = 100 }: PortOptions,
): Promise<T> {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port: " + port);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error("maxAttempts must be a positive integer");
  for (let attempt = 0; ; attempt++) {
    try {
      return await bind(port);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "EADDRINUSE" || strictPort || port === 0 || port === 65535 || attempt + 1 >= maxAttempts) throw error;
      port++;
    }
  }
}
