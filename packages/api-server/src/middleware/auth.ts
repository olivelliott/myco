import type { MiddlewareHandler } from 'hono';
import { timingSafeEqual } from 'node:crypto';

/**
 * Bearer token auth middleware.
 * - Disabled when MYCO_API_KEY is not set (passes all requests through).
 * - When set, requires Authorization: Bearer <MYCO_API_KEY> header.
 * - Uses timingSafeEqual to prevent timing attacks.
 */
export function apiKeyAuth(): MiddlewareHandler {
  return async (c, next) => {
    const apiKey = process.env.MYCO_API_KEY;
    // Auth disabled when env var is unset
    if (!apiKey) return next();

    const header = c.req.header('Authorization');
    if (!header?.startsWith('Bearer ')) {
      return c.json(
        { error: { message: 'Unauthorized', code: 'UNAUTHORIZED', status: 401 } },
        401,
      );
    }

    const provided = header.slice(7);
    let equal = false;
    try {
      // timingSafeEqual requires equal-length buffers
      const a = Buffer.from(provided);
      const b = Buffer.from(apiKey);
      if (a.length === b.length) {
        equal = timingSafeEqual(a, b);
      }
    } catch {
      equal = false;
    }

    if (!equal) {
      return c.json(
        { error: { message: 'Unauthorized', code: 'UNAUTHORIZED', status: 401 } },
        401,
      );
    }

    return next();
  };
}
