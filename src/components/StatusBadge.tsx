import type { AccountStatus, CodeStatus, UnitPurchaseStatus } from '../types/database';
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

export function PurchaseBadge({ status }: { status: UnitPurchaseStatus }) {
  if (status === 'void') {
    return <Badge variant="error">ملغي</Badge>;
  }
  return <Badge variant="success">مدفوع</Badge>;
}

export function CodeBadge({ status }: { status: CodeStatus }) {
  if (status === 'used') {
    return <Badge variant="info">مستخدم</Badge>;
  }
  if (status === 'revoked') {
    return <Badge variant="error">ملغي</Badge>;
  }
  return <Badge variant="neutral">متاح</Badge>;
}
