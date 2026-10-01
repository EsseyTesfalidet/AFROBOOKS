import BookSampleReader from '@/components/reader/BookSampleReader';
export default async function SamplePage({ params }: { params: Promise<{ id: string }> }) {
  return <BookSampleReader bookId={(await params).id} />;
}
