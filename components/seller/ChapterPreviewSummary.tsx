export default function ChapterPreviewSummary({ chapters }: { chapters: { isPreview: boolean }[] }) {
  if (!chapters.length) return null;
  const count = chapters.filter(chapter => chapter.isPreview === true).length;
  return <section aria-label="Free preview settings" className="space-y-2 rounded-xl border border-[#444] bg-[#161616] p-4">
    <h3 className="text-sm font-medium text-white">Free sample: {count} of {chapters.length} sections</h3>
    <p className="text-xs leading-relaxed text-[#bbb]">{!count
      ? 'No free sample is selected. Readers can buy this book, but they cannot preview it. Mark an opening chapter FREE PREVIEW in Book Content to offer a sample.'
      : count === chapters.length
        ? 'Your entire manuscript is selected for free preview. Readers will be able to read all of it without buying. To offer a shorter sample, split the manuscript into reading sections and keep only the opening section as FREE PREVIEW.'
        : 'Readers can preview the sections marked FREE PREVIEW. All other sections require access to the book.'}</p>
    {chapters.length === 1 && <p className="text-xs leading-relaxed text-[#bbb]">Preview access covers the whole chapter. Use Split into reading sections for a shorter sample, then review the preview buttons below.</p>}
  </section>;
}
