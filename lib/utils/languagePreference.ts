export const DISCOVERY_LANGUAGES = ['Tigrinya', 'Amharic', 'Swahili', 'English', 'Arabic', 'French', 'Oromo', 'Somali', 'Hausa', 'Yoruba', 'Igbo', 'Zulu', 'Portuguese'];
export function languageKey(language: string) {
  const key = language.trim().toLocaleLowerCase();
  return ({ tigrina: 'tigrinya', tigrigna: 'tigrinya', tigriyna: 'tigrinya', 'ትግርኛ': 'tigrinya', kiswahili: 'swahili' } as Record<string, string>)[key] || key;
}
// Stable preference ordering: never hide another language or change equal ranks.
export function preferLanguages<T>(items: T[], languages: string[], getLanguage: (item: T) => string): T[] {
  if (!languages.length) return items;
  const preferred = new Set(languages.map(languageKey));
  return [...items].sort((a, b) => Number(preferred.has(languageKey(getLanguage(b)))) - Number(preferred.has(languageKey(getLanguage(a)))));
}
