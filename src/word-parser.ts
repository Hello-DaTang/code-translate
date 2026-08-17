const identifierPartPattern = /[A-Z]{2,}(?=[A-Z][a-z]|[0-9]|$)|[A-Z]?[a-z]+|[0-9]+/g;
const textTokenPattern = /[\p{Script=Han}]+|[A-Za-z]+|[0-9]+/gu;

export function cleanWord(value: string): string {
  return value.replace(/["'`]/g, "").trim();
}

export function splitIdentifier(value: string): string[] {
  const cleaned = cleanWord(value);
  if (!cleaned) {
    return [];
  }

  const matches = cleaned.match(identifierPartPattern);
  if (!matches || matches.length === 0) {
    return [cleaned.toLowerCase()];
  }

  return matches.map((part) => part.toLowerCase());
}

export function tokenizeForTranslation(value: string): string[] {
  const cleaned = cleanWord(value);
  if (!cleaned) {
    return [];
  }

  const tokens = cleaned.match(textTokenPattern) ?? [];
  const segments: string[] = [];
  for (const token of tokens) {
    if (/^[\p{Script=Han}]+$/u.test(token)) {
      segments.push(token);
    } else {
      segments.push(...splitIdentifier(token));
    }
  }

  return Array.from(new Set(segments.filter(Boolean)));
}

export function containsChinese(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}
