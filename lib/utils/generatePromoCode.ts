const ADJECTIVES = ['LAUNCH', 'BOLD', 'EPIC', 'FIRE', 'GOLD', 'WILD', 'FAST', 'RARE'];
const NOUNS = ['DEAL', 'READ', 'BOOK', 'SAVE', 'SALE', 'PICK', 'DROP', 'CUT'];

export function generatePromoCode(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${adj}${num}`;
}

export function generateUniqueCode(prefix = ''): string {
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return prefix ? `${prefix.toUpperCase()}-${random}` : random;
}
