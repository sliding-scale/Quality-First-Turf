/** Visit 0 is the consultation; every later visit is a numbered follow-up. */
export function visitLabel(visit: number): string {
  return visit <= 0 ? "Consultation" : `Follow-up ${visit}`;
}
