/**
 * Structural typing for zod schemas without depending on the zod package
 * directly (mobile does not declare it; schemas come from @fitness/contracts).
 */

export interface FieldIssue {
  code: string;
  message: string;
}

type SafeParseResult =
  | { success: true }
  | { success: false; error: { issues: FieldIssue[] } };

interface FieldSchema {
  safeParse: (value: unknown) => SafeParseResult;
}

/**
 * Validates a single field against a zod schema (usually from a
 * `@fitness/contracts` DTO schema `.shape`) and returns the first error
 * message, or undefined when valid.
 */
export function validateField(
  schema: FieldSchema,
  value: string,
  formatIssue?: (issue: FieldIssue) => string,
): string | undefined {
  const result = schema.safeParse(value);
  if (result.success) return undefined;
  const issue = result.error.issues[0];
  if (!issue) return 'Invalid value';
  return formatIssue ? formatIssue(issue) : issue.message;
}
