'use client';

import { Star } from 'lucide-react';

interface StarRatingProps {
  value: number;
  max?: number;
  size?: number;
  interactive?: boolean;
  onChange?: (value: number) => void;
}

export default function StarRating({
  value,
  max = 5,
  size = 14,
  interactive = false,
  onChange,
}: StarRatingProps) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => {
        const filled = i < Math.floor(value);
        const half = !filled && i < value;
        return (
          <button
            key={i}
            type="button"
            disabled={!interactive}
            onClick={() => onChange?.(i + 1)}
            className={interactive ? 'cursor-pointer' : 'cursor-default'}
          >
            <Star
              size={size}
              style={{
                fill: filled || half ? '#f5b800' : 'transparent',
                color: '#f5b800',
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
