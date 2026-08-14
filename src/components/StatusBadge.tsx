import type { AccountStatus } from '../types/database';
import { Badge } from './Badge';

interface StatusBadgeProps {
  status: AccountStatus;
  deleted: boolean;
}

export function StatusBadge({ status, deleted }: StatusBadgeProps) {
  if (deleted) {
    return <Badge variant="error">محذوف</Badge>;
  }
  if (status === 'disabled') {
    return <Badge variant="warning">موقوف</Badge>;
  }
  return <Badge variant="success">نشط</Badge>;
}
