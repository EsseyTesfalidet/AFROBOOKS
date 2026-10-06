'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, Underline as UnderlineIcon, Heading2, List, X } from 'lucide-react';
import type { Chapter } from '@/types/book';

interface Props {
  chapterNumber: number;
  onSave: (chapter: Pick<Chapter, 'title' | 'content' | 'wordCount' | 'chapterNumber'>) => void;
  onCancel: () => void;
  onDraftChange?: (chapter: Pick<Chapter, 'title' | 'content' | 'wordCount' | 'chapterNumber'>) => void;
  initial?: { title: string; content: string };
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Keep the author's explicit verse/line-break choice across editor round trips.
const PreserveParagraphBreaks = Extension.create({
  name: 'preserveParagraphBreaks',
  priority: 1000,
  addKeyboardShortcuts() {
    return { 'Shift-Enter': () => this.editor.chain().updateAttributes('paragraph', { preserveBreaks: true }).setHardBreak().run() };
  },
  addGlobalAttributes() {
    return [{ types: ['paragraph'], attributes: { preserveBreaks: {
      default: false,
      parseHTML: element => element.getAttribute('data-preserve-breaks') === 'true',
      renderHTML: attributes => attributes.preserveBreaks ? { 'data-preserve-breaks': 'true' } : {},
    } } }];
  },
});

function ToolBtn({ onClick, active, icon: Icon }: { onClick: () => void; active?: boolean; icon: React.ElementType }) {
  return <button type="button" onClick={onClick} className="p-1.5 rounded transition-colors"
    style={{ background: active ? '#e8442a' : 'transparent', color: active ? '#fff' : "var(--app-muted, #aaa)" }}><Icon size={14} /></button>;
}

export default function ChapterEditor({ chapterNumber, onSave, onCancel, onDraftChange, initial }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const draftCallback = useRef(onDraftChange);
  const currentTitle = useRef(title);
  useLayoutEffect(() => { draftCallback.current = onDraftChange; currentTitle.current = title; });

  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false }), PreserveParagraphBreaks],
    immediatelyRender: false,
    content: initial?.content ?? '',
    editorProps: {
      attributes: {
        class: 'tiptap-editor min-h-[280px] p-4 rounded-b-xl focus:outline-none',
        'data-placeholder': 'Start writing your chapter...',
        dir: 'auto',
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const update = () => draftCallback.current?.({ chapterNumber, title: currentTitle.current, content: editor.getHTML(), wordCount: countWords(editor.getText()) });
    editor.on('update', update);
    return () => { editor.off('update', update); };
  }, [editor, chapterNumber]);

  function handleSave() {
    if (!editor) return;
    const content = editor.getHTML();
    const wordCount = countWords(editor.getText());
    onSave({ chapterNumber, title, content, wordCount });
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--app-line, #333)", background: "var(--app-surface, #161616)" }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b" style={{ borderColor: "var(--app-line, #222)" }}>
        <p className="text-sm font-medium text-white">Editing Chapter {chapterNumber}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg border text-xs" style={{ borderColor: "var(--app-line, #333)", color: "var(--app-muted, #888)" }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--app-action, #e8442a)', color: 'var(--app-on-action, #fff)' }}>
            Save Chapter
          </button>
        </div>
      </div>

      {/* Chapter title */}
      <div className="px-4 pt-3">
        <input
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (editor) draftCallback.current?.({ chapterNumber, title: e.target.value, content: editor.getHTML(), wordCount: countWords(editor.getText()) });
          }}
          placeholder="Chapter title..."
          dir="auto"
          className="chapter-title-input w-full px-3 py-2 rounded-lg border text-sm"
          style={{ background: "var(--app-field, #1a1a1a)", borderColor: "var(--app-line, #333)", color: "var(--app-text, #f5f2eb)" }}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b" style={{ borderColor: "var(--app-line, #222)" }}>
        <ToolBtn onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive('bold')} icon={Bold} />
        <ToolBtn onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive('italic')} icon={Italic} />
        <ToolBtn onClick={() => editor?.chain().focus().toggleUnderline().run()} active={editor?.isActive('underline')} icon={UnderlineIcon} />
        <ToolBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={editor?.isActive('heading', { level: 2 })} icon={Heading2} />
        <ToolBtn onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive('bulletList')} icon={List} />
        <div className="w-px h-4 mx-1" style={{ background: "var(--app-line, #333)" }} />
        <button type="button" onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()} className="p-1.5 rounded text-[#888]"><X size={14} /></button>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  );
}
