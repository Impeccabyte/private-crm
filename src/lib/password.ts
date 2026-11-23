import bcrypt from "bcryptjs";

let dummyHash: Promise<string> | null = null;

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);

/** Compares against a real dummy hash when the user has none, so response time doesn't reveal whether an account exists. */
export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    dummyHash ??= bcrypt.hash("not-a-real-password", 12);
    await bcrypt.compare(plain, await dummyHash);
    return false;
  }
  return bcrypt.compare(plain, hash);
}

export function passwordProblems(pw: string, minLength: number): string | null {
  if (pw.length < minLength) return `Use at least ${minLength} characters.`;
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Use a mix of letters and numbers.";
  return null;
}
