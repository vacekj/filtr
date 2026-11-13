const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole words/phrases; a trailing * explicitly opts into matching word endings. */
export function matchesKeywords(text: string, keywords: string): boolean {
  const input = normalize(text);
  return keywords
    .split(",")
    .map((word) => normalize(word.trim()))
    .filter(Boolean)
    .some((term) => {
      const prefix = term.endsWith("*");
      const literal = prefix ? term.slice(0, -1) : term;
      if (!literal) return false;
      const pattern = escape(literal).replace(/\s+/g, "\\s+");
      return new RegExp(
        `(^|[^\\p{L}\\p{N}])${pattern}${prefix ? "[\\p{L}\\p{N}]*" : ""}(?=$|[^\\p{L}\\p{N}])`,
        "u",
      ).test(input);
    });
}
