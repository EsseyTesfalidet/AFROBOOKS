import type { CopyrightBasis } from '@/types/book';

export const COPYRIGHT_BASIS_OPTIONS: { value: CopyrightBasis; label: string; description: string }[] = [
  { value: 'original', label: 'I created this work', description: 'You wrote the book and own the publishing rights.' },
  { value: 'licensed', label: 'Licensed rights', description: 'You have a contract or license that lets you publish it.' },
  { value: 'public_domain', label: 'Public domain', description: 'The work is legally in the public domain.' },
  { value: 'commissioned', label: 'Commissioned work', description: 'You own rights through work-for-hire or assignment.' },
  { value: 'other', label: 'Other rights basis', description: 'Use this when another legal basis applies.' },
];

export function getCopyrightBasisLabel(basis: CopyrightBasis | undefined) {
  return COPYRIGHT_BASIS_OPTIONS.find((option) => option.value === basis)?.label ?? 'Rights not declared';
}

export function requiresManualCopyrightReview(basis: CopyrightBasis | undefined) {
  return basis !== 'original';
}
