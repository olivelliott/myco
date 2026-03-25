import type { Context } from 'hono';

/**
 * Shared zValidator error hook. Returns structured error response
 * matching the decided API error shape: { error: { message, code, status } }.
 *
 * Usage: zValidator('json', schema, validationErrorHook)
 */
export function validationErrorHook(
  result: { success: boolean; error?: { issues: Array<{ message: string }> } },
  c: Context,
) {
  if (!result.success) {
    const firstIssue = result.error?.issues[0];
    return c.json(
      {
        error: {
          message: firstIssue?.message ?? 'Invalid request',
          code: 'INVALID_INPUT',
          status: 400,
        },
      },
      400 as const,
    );
  }
}
