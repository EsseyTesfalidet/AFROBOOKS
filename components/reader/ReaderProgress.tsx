interface Props {
  percent: number;
}

export default function ReaderProgress({ percent }: Props) {
  return (
    <div className="w-full h-0.5" style={{ background: '#1a1a1a' }}>
      <div
        className="h-full transition-all duration-500"
        style={{ width: `${Math.min(100, percent)}%`, background: '#e8442a' }}
      />
    </div>
  );
}
