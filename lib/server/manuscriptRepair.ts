import { decodeManuscriptBytes } from '../publishing/manuscriptEncoding';
import { extractSectionsFromText } from '../publishing/manuscriptImport';

interface StoredChapter {
  id: string;
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
}

export function planManuscriptRepair(bytes: Uint8Array, stored: StoredChapter[]) {
  const chapters = [...stored].sort((a, b) => a.chapterNumber - b.chapterNumber);
  // Encoding repairs must reproduce the original importer, not also reformat it.
  const legacy = extractSectionsFromText(new TextDecoder('utf-8').decode(bytes), 'legacy');
  const recovered = extractSectionsFromText(decodeManuscriptBytes(bytes), 'legacy');
  if (!chapters.length || chapters.length !== legacy.length || chapters.length !== recovered.length) {
    throw new Error('The original manuscript and stored chapter structure do not match.');
  }
  return chapters.flatMap((chapter, index) => {
    const original = legacy[index];
    const fixed = recovered[index];
    if (chapter.chapterNumber !== original.chapterNumber ||
        (chapter.content !== original.content && chapter.content !== fixed.content)) {
      throw new Error(`Chapter ${chapter.chapterNumber} was edited after import; preserve it for manual review.`);
    }
    const title = chapter.title === original.title ? fixed.title : chapter.title;
    return chapter.content === fixed.content && chapter.title === title ? [] : [{
      id: chapter.id, content: fixed.content, title, wordCount: fixed.wordCount,
    }];
  });
}
