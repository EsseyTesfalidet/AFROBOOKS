'use client';

import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

const PasswordInput = forwardRef<HTMLInputElement, Props>(
  ({ hasError = false, className: _cls, style: _style, ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className="field-input w-full rounded-xl px-3.5 py-3 text-sm pr-11"
          style={{
            borderColor: hasError ? '#e8442a' : '#333',
          }}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg transition-colors"
          style={{ color: '#7a7a84' }}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = 'PasswordInput';
export default PasswordInput;
