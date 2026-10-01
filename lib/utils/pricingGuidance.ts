export interface PricingGuidance {
  low: number;
  suggested: number;
  high: number;
  basis: string;
}

// Editorial starting ranges in USD cents, not market estimates. These guide
// authors without changing the saved price, platform fees or checkout limits.
export function pricingGuidance(wordCount: number, genre = '', audience = 'all'): PricingGuidance {
  if (genre === 'Poetry' || audience === 'children') return {
    low: 299, suggested: 499, high: 799,
    basis: 'For poetry and children’s titles, illustrations, presentation and the reading experience can matter more than word count.',
  };
  if (!Number.isFinite(wordCount) || wordCount <= 0) return {
    low: 299, suggested: 499, high: 799,
    basis: 'A general starting range. Add your manuscript for guidance based on its length.',
  };
  if (wordCount < 10000) return {
    low: 99, suggested: 199, high: 299,
    basis: 'A starting range for a short read under 10,000 words.',
  };
  if (wordCount < 40000) return {
    low: 299, suggested: 399, high: 599,
    basis: 'A starting range for a manuscript of 10,000–39,999 words.',
  };
  return {
    low: 499, suggested: 699, high: 999,
    basis: 'A starting range for a manuscript of 40,000 words or more.',
  };
}
