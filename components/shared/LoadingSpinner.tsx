interface LoadingSpinnerProps {
  size?: number;
  color?: string;
  fullPage?: boolean;
}

export default function LoadingSpinner({
  size = 32,
  color = '#e8442a',
  fullPage = false,
}: LoadingSpinnerProps) {
  const spinner = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      style={{ color }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );

  if (fullPage) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0e0e0e] z-50">
        {spinner}
      </div>
    );
  }

  return spinner;
}
