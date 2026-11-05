const CODE = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** A short project code derived from a number, e.g. "7KD-3QM". Sample data only; real codes come with the forms flow (D-040). */
export function shortCode(id: number): string {
  let n = id * 7919;
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += CODE[n % CODE.length];
    n = Math.floor(n / CODE.length) + 17;
  }
  return s.slice(0, 3) + "-" + s.slice(3);
}
