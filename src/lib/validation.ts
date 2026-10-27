/**
 * Shared input validation, used by both the API routes and the forms so the
 * two can never disagree about what counts as valid.
 */

/**
 * Philippine mobile numbers are 09XXXXXXXXX (11 digits), also written as
 * +639XXXXXXXXX or 639XXXXXXXXX. Spaces, dashes and brackets are ignored.
 */
export function normalizePhMobile(input: string): string | null {
  const digits = String(input ?? "").replace(/[\s()-]/g, "");
  const match = /^(?:\+63|63|0)(9\d{9})$/.exec(digits);
  return match ? `0${match[1]}` : null;
}

export function isValidPhMobile(input: string) {
  return normalizePhMobile(input) !== null;
}

export const PH_MOBILE_HINT = "Use an 11-digit number starting 09, e.g. 09171234567.";
