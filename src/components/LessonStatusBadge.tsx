import type { ContentStatus } from '../types/database';
import { Badge, type BadgeVariant } from './Badge';

const variants: Record<ContentStatus, BadgeVariant> = {
  draft: 'neutral',
  published: 'success',
  hidden: 'warning',
};

const labels: Record<ContentStatus, string> = {
  draft: 'مسودة',
  published: 'منشور',
  hidden: 'مخفي',
};

export function LessonStatusBadge({ status }: { status: ContentStatus }) {
  return (
    <Badge data-testid={`lesson-status-${status}`} variant={variants[status]}>
      {labels[status]}
    </Badge>
  );
}
