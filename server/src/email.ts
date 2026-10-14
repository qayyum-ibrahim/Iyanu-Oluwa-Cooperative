// Email normalising (D-22). Done in logic code, before any store call.
// The stores keep matching exactly; they only ever see normalised emails.

export const EMAIL_MAX_LENGTH = 254;

export class InvalidEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEmailError";
  }
}

// One "@", something before it, a dot-separated domain after it, no spaces.
const SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Trims outer spaces and lower-cases. Throws InvalidEmailError if the result does not look like an email. */
export function normalizeEmail(input: unknown): string {
  if (typeof input !== "string") {
    throw new InvalidEmailError("Email must be text");
  }
  const email = input.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH || !SHAPE.test(email)) {
    throw new InvalidEmailError("Email address is not valid");
  }
  return email;
}