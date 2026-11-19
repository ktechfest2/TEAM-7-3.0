const SMALL: Record<string, number> = {
  zero: 0, nil: 0, none: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};
const FILLER = new Set(["and", "only", "votes", "vote"]);

/**
 * Reads a score written in English words ("One hundred and forty-two only") as a number.
 * Returns null for anything it can't read with certainty, so a sloppy spelling never
 * becomes a words/figures conflict.
 */
export function wordsToNumber(text: string | null): number | null {
  if (!text) return null;
  const tokens = text.toLowerCase().replace(/[-,.&]/g, " ").split(/\s+/).filter((t) => t && !FILLER.has(t));
  if (tokens.length === 0) return null;
  let total = 0;
  let current = 0;
  for (const t of tokens) {
    if (t in SMALL) current += SMALL[t];
    else if (t === "hundred") current = (current || 1) * 100;
    else if (t === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
    } else return null;
  }
  return total + current;
}
