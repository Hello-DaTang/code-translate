function isNumerical(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

function camelize(value: string): string {
  if (isNumerical(value)) {
    return value;
  }

  const normalized = value.replace(/[\-_\s]+(.)?/g, (_match, character: string | undefined) => character ? character.toUpperCase() : "");
  return normalized.slice(0, 1).toLowerCase() + normalized.slice(1);
}

function pascalize(value: string): string {
  const camelized = camelize(value);
  return camelized.slice(0, 1).toUpperCase() + camelized.slice(1);
}

function decamelize(value: string, separator: string): string {
  return value.split(/(?=[A-Z])/).join(separator).toLowerCase();
}

// Mirrors the original formatter.getWordArray implementation.
export function getWordArray(character: string): string[] | undefined {
  let formatChar = character;
  const capitalizes = formatChar.match(/[A-Z\s]{2,}/g);
  if (capitalizes && capitalizes.length) {
    capitalizes.forEach((item) => {
      formatChar = formatChar.replace(item, pascalize(item.toLowerCase()));
    });
  }

  if (!formatChar) {
    return undefined;
  }
  if (/^[A-Z]+$/.test(character)) {
    return [character.toLowerCase()];
  }
  return Array.from(new Set(decamelize(camelize(formatChar), "|").split("|")));
}

// Mirrors the original formatter.cleanWord implementation.
export function cleanWord(character: string): string {
  return character.replace(/"/g, "");
}

// Kept as aliases for the existing TypeScript tests and callers.
export function splitIdentifier(value: string): string[] {
  return getWordArray(value) ?? [];
}

export function tokenizeForTranslation(value: string): string[] {
  const normalized = value.trim();
  const sentenceTokens = normalized.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu);
  if (sentenceTokens && (sentenceTokens.length > 1 || sentenceTokens[0] !== normalized)) {
    return sentenceTokens.flatMap((token) => getWordArray(token) ?? []);
  }
  return getWordArray(value) ?? [];
}

export function containsChinese(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}
