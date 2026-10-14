// Text scramble for the glitch on titles: random characters that resolve back to the
// real text. Used by the card hovers and the page title when a page loads.
// (The image effects are in datamosh.ts.)

/** Characters swapped in while text glitches (letters, digits and symbols). */
export const SCRAMBLE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789#&/<>_+=';

/** Letters only, for text in CS Ariston Halfpixel (the titles): the font has no digits or symbols. */
export const TITLE_CHARS = 'abcdefghijklmnopqrstuvwxyz';

/**
 * The text at moment t (0 to 1) of a glitch. A full glitch resolves left to right;
 * a light one keeps the text and swaps a few characters.
 */
export function scrambled(text: string, t: number, full: boolean, chars = SCRAMBLE_CHARS) {
  const randomChar = () => chars[Math.floor(Math.random() * chars.length)];
  const resolved = full ? Math.floor(text.length * Math.min(1, t / 0.85)) : text.length;
  return [...text]
    .map((ch, i) => {
      if (ch === ' ') return ' ';
      if (i < resolved) return !full && Math.random() < 0.22 ? randomChar() : ch;
      return randomChar();
    })
    .join('');
}
