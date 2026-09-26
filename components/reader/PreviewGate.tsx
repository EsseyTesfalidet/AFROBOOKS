import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { centsToDisplay } from '@/lib/utils/formatCurrency';

export default function PreviewGate({ bookId, bookTitle, price }: { bookId: string; bookTitle: string; price: number }) {
  return <section className="reader-preview-end" aria-labelledby="preview-end-title">
    <p className="reader-eyebrow">Keep the story going</p>
    <h2 id="preview-end-title">End of free preview</h2>
    <p>You’ve reached the end of the sample of <em>{bookTitle}</em>. Get the full book to continue reading.</p>
    <Link href={`/book/${bookId}`} className="reader-purchase-link">View full book <span>{centsToDisplay(price)} <ArrowRight size={16} /></span></Link>
  </section>;
}
