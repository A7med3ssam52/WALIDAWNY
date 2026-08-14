import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from './Button';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({ page, totalPages, onPageChange, disabled = false }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = Array.from({ length: totalPages }, (_, index) => index);

  return (
    <nav
      aria-label="التنقل بين الصفحات"
      className="flex flex-wrap items-center justify-center gap-1"
      dir="ltr"
    >
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
        السابق
      </Button>
      {pages.map((index) => (
        <Button
          key={index}
          variant={index === page ? 'primary' : 'ghost'}
          size="sm"
          disabled={disabled}
          aria-current={index === page ? 'page' : undefined}
          aria-label={`الصفحة ${index + 1}`}
          onClick={() => onPageChange(index)}
          className="min-w-10 px-2"
        >
          {index + 1}
        </Button>
      ))}
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || page + 1 >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        التالي
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
      </Button>
    </nav>
  );
}
