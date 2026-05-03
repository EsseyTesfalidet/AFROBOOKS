'use client';

import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Bold, Italic, Underline as UnderlineIcon, Heading2, List, X } from 'lucide-react';
import type { Chapter } from '@/types/book';

interface Props {
  chapterNumber: number;
  onSave: (chapter: Pick<Chapter, 'title' | 'content' | 'wordCount' | 'chapterNumber'>) => void;
  onCancel: () => void;
  initial?: { title: string; content: string };
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function ChapterEditor({ chapterNumber, onSave, onCancel, initial }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: initial?.content ?? '',
    editorProps: {
      attributes: {
        class: 'tiptap-editor min-h-[280px] p-4 rounded-b-xl focus:outline-none',
        'data-placeholder': 'Start writing your chapter...',
      },
    },
  });

  function handleSave() {
    if (!editor) return;
    const content = editor.getHTML();
    const wordCount = countWords(editor.getText());
    onSave({ chapterNumber, title, content, wordCount });
  }

  const ToolBtn = ({ onClick, active, icon: Icon }: { onClick: () => void; active?: boolean; icon: React.ElementType }) => (
    <button
      type="button"
      onClick={onClick}
      className="p-1.5 rounded transition-colors"
      style={{ background: active ? '#e8442a' : 'transparent', color: active ? '#fff' : '#aaa' }}
    >
      <Icon size={14} />
    </button>
  );

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#333', background: '#161616' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: '#222' }}>
        <p className="text-sm font-medium text-white">Editing Chapter {chapterNumber}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg border text-xs" style={{ borderColor: '#333', color: '#888' }}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#e8442a', color: '#fff' }}>
            Save Chapter
          </button>
        </div>
      </div>

      {/* Chapter title */}
      <div className="px-4 pt-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Chapter title..."
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b" style={{ borderColor: '#222' }}>
        <ToolBtn onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive('bold')} icon={Bold} />
        <ToolBtn onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive('italic')} icon={Italic} />
        <ToolBtn onClick={() => editor?.chain().focus().toggleUnderline().run()} active={editor?.isActive('underline')} icon={UnderlineIcon} />
        <ToolBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={editor?.isActive('heading', { level: 2 })} icon={Heading2} />
        <ToolBtn onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive('bulletList')} icon={List} />
        <div className="w-px h-4 mx-1" style={{ background: '#333' }} />
        <button type="button" onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()} className="p-1.5 rounded text-[#888]"><X size={14} /></button>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  );
}
