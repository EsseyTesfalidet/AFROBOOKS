interface EbookTagProps {
  label: string;
  color?: string;
  bg?: string;
}

export default function EbookTag({ label, color = '#000', bg = '#f5b800' }: EbookTagProps) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}
