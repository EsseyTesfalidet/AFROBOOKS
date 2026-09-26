import { redirect } from 'next/navigation';
export default async function SamplePage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/read/${encodeURIComponent((await params).id)}`);
}
