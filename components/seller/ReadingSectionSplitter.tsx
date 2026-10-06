'use client';

import { useState } from 'react';
import { SECTION_LENGTHS, splitReadingSections, type SectionDraft } from '@/lib/publishing/readingSections';
import { sanitizeChapter } from '@/lib/utils/sanitizeChapter';

export default function ReadingSectionSplitter({ chapters, onApply }: { chapters: SectionDraft[]; onApply: (chapters: SectionDraft[]) => void }) {
  const [length, setLength] = useState(1500);
  const [preview, setPreview] = useState<{ original: SectionDraft; sections: SectionDraft[] } | null>(null);
  const [message, setMessage] = useState('');
  const original = chapters[0];
  const sections = preview && preview.original === original ? preview.sections : null;
  if (chapters.length !== 1) return null;
  return <section className="space-y-3 rounded-xl border border-[#444] bg-[#161616] p-4">
    <h3 className="text-sm font-medium text-white">One long chapter?</h3>
    <p className="text-xs leading-relaxed text-[#bbb]">Suggest shorter reading sections without cutting paragraphs or changing the words. Review and rename them before saving.</p>
    <label className="block text-sm text-[#ddd]">Approximate section length<select aria-label="Existing chapter section length" value={length} onChange={event => { setLength(Number(event.target.value)); setPreview(null); setMessage(''); }} className="mt-2 min-h-11 w-full rounded-lg border border-[#555] bg-[#222] px-3 text-white">{SECTION_LENGTHS.map(size => <option key={size} value={size}>{size.toLocaleString()} words</option>)}</select></label>
    <button type="button" className="min-h-11 rounded-lg border border-[#777] px-3 text-sm text-white" onClick={() => {
      try {
        const result = splitReadingSections(original, length);
        setPreview(result.length > 1 ? { original, sections: result } : null);
        setMessage(result.length > 1 ? '' : 'This chapter stays in one section at this length. Try a shorter length. If it is one large paragraph or list, add paragraph breaks in the editor first.');
      } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : 'Could not prepare sections. Your chapter was not changed.'); }
    }}>Split into reading sections</button>
    {message && <p role="status" className="text-sm text-[#f5b800]">{message}</p>}
    {sections && <div className="space-y-3">
      <p role="status" className="text-sm text-white">{sections.length} suggested sections. Your chapter has not been changed yet.</p>
      <div aria-label="Reading section preview" className="max-h-80 space-y-4 overflow-y-auto rounded-lg bg-[#222] p-3">
        {sections.map(section => <section key={section.chapterNumber}><h4 className="text-sm font-medium text-white">{section.title} · {section.wordCount.toLocaleString()} words</h4><p className="text-xs text-[#bbb]">{section.isPreview ? 'Free preview' : 'Locked'}</p><div className="manuscript-preview mt-2 text-sm leading-relaxed text-[#ddd]" dir="auto" dangerouslySetInnerHTML={{ __html: sanitizeChapter(section.content) }} /></section>)}
      </div>
      <p className="text-xs leading-relaxed text-[#bbb]">{original.isPreview ? 'Only the first section keeps free-preview access. Review the preview buttons below.' : 'All sections stay locked.'} Applying changes your editing draft; saving or publishing updates the book. Existing reading positions may move when its chapter structure changes.</p>
      <div className="flex flex-wrap gap-3"><button type="button" className="min-h-11 rounded-lg bg-[var(--app-action,#e8442a)] px-3 text-sm text-[var(--app-on-action,#fff)]" onClick={() => { onApply(sections); setPreview(null); }}>Use these sections</button><button type="button" className="min-h-11 px-3 text-sm text-[#ccc]" onClick={() => setPreview(null)}>Cancel split</button></div>
    </div>}
  </section>;
}
