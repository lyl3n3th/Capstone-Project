const KNOWN_UPPERCASE_WORDS = new Set([
  "AICS",
  "ABM",
  "BS",
  "BSCS",
  "BSHM",
  "BSIT",
  "GAS",
  "GMA",
  "HUMSS",
  "ICT",
  "ICTBDA",
  "ICTCP",
  "IT",
  "NC",
  "SHS",
  "STEM",
  "TESDA",
  "TVL",
]);

const LOWERCASE_NAME_PARTICLES = new Set([
  "and",
  "da",
  "de",
  "del",
  "dela",
  "la",
  "of",
  "the",
]);

const ROMAN_NUMERAL_PATTERN = /^[ivxlcdm]+$/i;

const normalizeTextSpacing = (value?: string | null) =>
  (value || "").trim().replace(/\s+/g, " ");

const capitalizeWord = (word: string, index: number) => {
  if (!word) {
    return word;
  }

  const uppercaseWord = word.toUpperCase();
  const lowercaseWord = word.toLowerCase();

  if (KNOWN_UPPERCASE_WORDS.has(uppercaseWord)) {
    return uppercaseWord;
  }

  if (ROMAN_NUMERAL_PATTERN.test(word) && word.length > 1) {
    return uppercaseWord;
  }

  if (word.length === 1) {
    return uppercaseWord;
  }

  if (index > 0 && LOWERCASE_NAME_PARTICLES.has(lowercaseWord)) {
    return lowercaseWord;
  }

  return `${lowercaseWord.charAt(0).toUpperCase()}${lowercaseWord.slice(1)}`;
};

export const toDisplayCapitalization = (value?: string | null) => {
  const normalizedValue = normalizeTextSpacing(value);

  if (!normalizedValue) {
    return "";
  }

  let wordIndex = 0;

  return normalizedValue
    .replace(/[A-Za-z]+/g, (word) => {
      const formattedWord = capitalizeWord(word, wordIndex);
      wordIndex += 1;
      return formattedWord;
    })
    .replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, number, suffix: string) => {
      return `${number}${suffix.toLowerCase()}`;
    });
};

export const toNameCapitalization = (value?: string | null) =>
  toDisplayCapitalization(value)
    .replace(/\b([A-Z])\b(?!\.)/g, "$1.")
    .replace(/\s+\./g, ".")
    .replace(/\.\s*\./g, ".")
    .trim();
