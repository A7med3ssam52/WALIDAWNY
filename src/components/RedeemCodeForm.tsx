import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';

import { Button } from './Button';
import { Input } from './Input';

interface RedeemCodeFormProps {
  onSubmit: (code: string) => Promise<boolean>;
  busy?: boolean;
  error?: string | null;
  inputLabel?: string;
  placeholder?: string;
  submitLabel?: string;
  onSuccess?: () => void;
}

export function RedeemCodeForm({
  onSubmit,
  busy = false,
  error,
  inputLabel = 'كود التفعيل',
  placeholder = 'WLDN-XXXX-XXXX-XXXX',
  submitLabel = 'تفعيل',
  onSuccess,
}: RedeemCodeFormProps) {
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setLocalError('أدخل كود التفعيل');
      return;
    }
    setLocalError(null);
    const succeeded = await onSubmit(trimmed);
    setCode('');
    if (succeeded) {
      onSuccess?.();
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="w-full sm:max-w-xs">
        <Input
          label={inputLabel}
          name="redeem-code"
          placeholder={placeholder}
          value={code}
          error={error ?? localError ?? undefined}
          dir="ltr"
          autoComplete="off"
          onChange={(event) => setCode(event.target.value)}
        />
      </div>
      <Button
        type="submit"
        loading={busy}
        icon={<KeyRound aria-hidden="true" className="h-4 w-4" />}
        className="sm:mt-6"
      >
        {submitLabel}
      </Button>
    </form>
  );
}
