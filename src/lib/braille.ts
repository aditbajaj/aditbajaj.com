/** Unicode Braille dot ordering, arranged row-by-row for a 2 × 4 cell. */
export const BRAILLE_BITS = [0, 3, 1, 4, 2, 5, 6, 7];

export function brailleCharacter(active: boolean[]) {
  const mask = active.reduce((value, enabled, index) => {
    const bit = BRAILLE_BITS[index];
    return enabled && bit !== undefined ? value | (1 << bit) : value;
  }, 0);
  return String.fromCodePoint(0x2800 + mask);
}
