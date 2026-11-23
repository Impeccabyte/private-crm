/**
 * Transparent lead score (0–100), deliberately simple: industry/MCC fit + estimated volume + source quality,
 * plus engagement that grows as activity is logged. No ML until there is outcome data to learn from.
 */
const HIGH_RISK_MCC = new Set(["5993", "5921", "5813", "7995", "5967", "4829", "6051", "5912"]);
const GOOD_FIT_MCC = new Set(["5812", "5814", "5462", "5251", "5941", "8021", "8011", "8043", "8099", "0742", "7538", "5942", "7230", "5992", "5712"]);

export function scoreFit(mcc?: string | null) {
  if (!mcc) return 12;
  if (HIGH_RISK_MCC.has(mcc)) return 6;
  if (GOOD_FIT_MCC.has(mcc)) return 25;
  return 16;
}
export function scoreVolume(v?: number | null) {
  if (!v) return 5;
  if (v >= 100_000) return 30;
  if (v >= 50_000) return 26;
  if (v >= 25_000) return 21;
  if (v >= 10_000) return 15;
  return 9;
}
export function scoreSource(s: string) {
  return { referral: 13, partner: 11, web_form: 9, import: 7, manual: 6 }[s] ?? 6;
}
export const scoreEngagementFor = (activities: number) => Math.min(25, activities * 5);
