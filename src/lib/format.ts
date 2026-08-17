const dateTimeFormatter = new Intl.DateTimeFormat('ar-EG', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDateTime(value?: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return dateTimeFormatter.format(date);
}

const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' });

export function formatDate(value?: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return dateFormatter.format(date);
}

export function formatPrice(value?: number | string | null): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(parsed)) {
    return '—';
  }
  return `${parsed} ج.م`;
}

export function remainingDays(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const expires = new Date(value).getTime();
  if (Number.isNaN(expires)) {
    return null;
  }
  return Math.ceil((expires - Date.now()) / 86_400_000);
}

export function toWhatsAppDigits(value?: string | null): string {
  if (!value) {
    return '';
  }
  const digits = value.replace(/[^0-9]/g, '').replace(/^0020/, '20');
  if (digits.startsWith('20')) {
    return digits;
  }
  if (digits.startsWith('0')) {
    return `20${digits.slice(1)}`;
  }
  return digits;
}

export function buildWhatsAppLink(numberValue: string, defaultMessage?: string | null): string {
  const digits = toWhatsAppDigits(numberValue);
  const text = defaultMessage ? `?text=${encodeURIComponent(defaultMessage)}` : '';
  return `https://wa.me/${digits}${text}`;
}
