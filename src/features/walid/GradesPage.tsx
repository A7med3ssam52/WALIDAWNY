import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { Modal } from '../../components/Modal';
import { Skeleton } from '../../components/Skeleton';
import { StaffNav } from '../../components/StaffNav';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeadCell,
  TableRow,
} from '../../components/Table';
import { useToast } from '../../components/Toast';
import {
  createGrade,
  deleteGrade,
  getRpcErrorCode,
  listAllGrades,
  listDeletedGrades,
  restoreGrade,
  updateGrade,
} from '../../data/rpc';
import type { Grade } from '../../types/database';

const GRADE_ERROR_MESSAGES: Record<string, string> = {
  grade_name_required: 'اسم الصف مطلوب',
  'duplicate grade': 'يوجد صف بنفس الاسم',
  grade_not_found: 'الصف غير موجود',
  grade_deleted: 'الصف محذوف',
  grade_inactive: 'الصف غير نشط',
  permission_denied: 'ليست لديك صلاحية',
  access_denied: 'ليست لديك صلاحية',
};

function gradeErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && GRADE_ERROR_MESSAGES[code]) {
    return GRADE_ERROR_MESSAGES[code];
  }
  return 'تعذر تنفيذ العملية. حاول مرة أخرى';
}

type PendingEdit = { grade: Grade } | null;
type PendingDelete = { grade: Grade } | null;

export function GradesPage() {
  const { showToast } = useToast();
  const [grades, setGrades] = useState<Grade[] | null>(null);
  const [deletedGrades, setDeletedGrades] = useState<Grade[] | null>(null);
  const [error, setError] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createOrder, setCreateOrder] = useState('0');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [editing, setEditing] = useState<PendingEdit>(null);
  const [editName, setEditName] = useState('');
  const [editOrder, setEditOrder] = useState('0');
  const [editError, setEditError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [deleting, setDeleting] = useState<PendingDelete>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [active, deleted] = await Promise.all([listAllGrades(), listDeletedGrades()]);
      setGrades(active);
      setDeletedGrades(deleted);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (grade: Grade) => {
    setEditing({ grade });
    setEditName(grade.name);
    setEditOrder(String(grade.sort_order));
    setEditError(null);
  };

  const handleCreate = async () => {
    const name = createName.trim();
    setCreateError(null);
    if (!name) {
      setCreateError('اسم الصف مطلوب');
      return;
    }
    setCreateBusy(true);
    try {
      await createGrade({ name, sortOrder: Number(createOrder) || 0 });
      setCreateName('');
      showToast('تم إنشاء الصف بنجاح');
      await load();
    } catch (err) {
      setCreateError(gradeErrorMessage(err));
    } finally {
      setCreateBusy(false);
    }
  };

  const handleEdit = async () => {
    if (!editing) {
      return;
    }
    setEditBusy(true);
    setEditError(null);
    try {
      await updateGrade({
        gradeId: editing.grade.id,
        name: editName.trim() ? editName.trim() : null,
        sortOrder: editOrder.trim() ? Number(editOrder) : null,
      });
      showToast('تم تحديث الصف بنجاح');
      setEditing(null);
      await load();
    } catch (err) {
      setEditError(gradeErrorMessage(err));
    } finally {
      setEditBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) {
      return;
    }
    setDeleteBusy(true);
    try {
      await deleteGrade(deleting.grade.id);
      showToast('تم نقل الصف إلى المحذوفات');
      setDeleting(null);
      await load();
    } catch (err) {
      showToast(gradeErrorMessage(err), 'error');
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleRestore = async (grade: Grade) => {
    setRestoringId(grade.id);
    try {
      await restoreGrade(grade.id);
      showToast('تمت استعادة الصف');
      await load();
    } catch (err) {
      showToast(gradeErrorMessage(err), 'error');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <LayoutShell
      title="إدارة الصفوف"
      subtitle="أنشئ الصفوف وأعد ترتيبها وأدر حالتها"
      variant="sidebar"
      nav={<StaffNav />}
    >
      <div className="flex flex-col gap-4">
        <Card title="إضافة صف جديد">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="w-full sm:max-w-xs">
              <Input
                label="اسم الصف"
                name="grade-name"
                placeholder="مثال: الصف الثالث الإعدادي"
                value={createName}
                error={createError ?? undefined}
                onChange={(event) => setCreateName(event.target.value)}
              />
            </div>
            <div className="w-full sm:max-w-32">
              <Input
                label="الترتيب"
                name="grade-sort-order"
                type="number"
                value={createOrder}
                onChange={(event) => setCreateOrder(event.target.value)}
              />
            </div>
            <Button
              loading={createBusy}
              icon={<Plus aria-hidden="true" className="h-4 w-4" />}
              onClick={() => void handleCreate()}
              className="sm:mt-6"
            >
              إضافة
            </Button>
          </div>
        </Card>

        <Card title="قائمة الصفوف">
          {error ? (
            <ErrorState message="تعذر تحميل قائمة الصفوف" onRetry={() => void load()} />
          ) : grades === null ? (
            <div className="flex flex-col gap-3" aria-hidden="true">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded-sm" />
              ))}
            </div>
          ) : grades.length === 0 ? (
            <EmptyState title="لا توجد صفوف بعد — أنشئ أول صف" />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>الاسم</TableHeadCell>
                  <TableHeadCell>الترتيب</TableHeadCell>
                  <TableHeadCell>الحالة</TableHeadCell>
                  <TableHeadCell>إجراءات</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {grades.map((grade) => (
                  <TableRow key={grade.id} data-testid={`grade-row-${grade.id}`}>
                    <TableCell label="الاسم" className="font-medium text-foreground">
                      {grade.name}
                    </TableCell>
                    <TableCell label="الترتيب" dir="ltr">
                      {grade.sort_order}
                    </TableCell>
                    <TableCell label="الحالة">
                      <Badge variant={grade.is_active ? 'success' : 'warning'}>
                        {grade.is_active ? 'نشط' : 'موقوف'}
                      </Badge>
                    </TableCell>
                    <TableCell label="إجراءات">
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Pencil aria-hidden="true" className="h-4 w-4" />}
                          onClick={() => openEdit(grade)}
                        >
                          تعديل
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                          onClick={() => setDeleting({ grade })}
                          className="text-error hover:bg-rose-500/10 hover:text-error"
                        >
                          حذف
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card title="الصفوف المحذوفة">
          {error ? (
            <ErrorState message="تعذر تحميل الصفوف المحذوفة" onRetry={() => void load()} />
          ) : deletedGrades === null ? (
            <div className="flex flex-col gap-3" aria-hidden="true">
              {Array.from({ length: 2 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded-sm" />
              ))}
            </div>
          ) : deletedGrades.length === 0 ? (
            <p className="text-sm text-foreground-subtle">لا توجد صفوف محذوفة.</p>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeadCell>الاسم</TableHeadCell>
                  <TableHeadCell>الترتيب</TableHeadCell>
                  <TableHeadCell>إجراءات</TableHeadCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {deletedGrades.map((grade) => (
                  <TableRow key={grade.id} data-testid={`deleted-grade-row-${grade.id}`}>
                    <TableCell label="الاسم" className="font-medium text-foreground">
                      {grade.name}
                    </TableCell>
                    <TableCell label="الترتيب" dir="ltr">
                      {grade.sort_order}
                    </TableCell>
                    <TableCell label="إجراءات">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleRestore(grade)}
                        disabled={restoringId === grade.id}
                        className="text-primary-strong hover:bg-primary-soft hover:text-primary-strong"
                      >
                        {restoringId === grade.id ? 'جاري الاستعادة...' : 'استعادة'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Modal
        open={editing !== null}
        title={editing ? `تعديل الصف: ${editing.grade.name}` : ''}
        description="قم بتعديل اسم الصف أو ترتيبه."
        confirmLabel="حفظ"
        loading={editBusy}
        onConfirm={() => void handleEdit()}
        onCancel={() => {
          if (!editBusy) {
            setEditing(null);
          }
        }}
      >
        <div className="mt-4 flex flex-col gap-3">
          <Input
            label="اسم الصف"
            name="edit-grade-name"
            value={editName}
            error={editError ?? undefined}
            onChange={(event) => setEditName(event.target.value)}
          />
          <Input
            label="الترتيب"
            name="edit-grade-order"
            type="number"
            value={editOrder}
            onChange={(event) => setEditOrder(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        title={deleting ? `حذف الصف: ${deleting.grade.name}` : ''}
        description="سيتم إيقاف الصف وإخفاؤه من القوائم. الطلاب المرتبطون به سيبقون على حساباتهم ولن يتم حذف أي بيانات، ويمكنك استعادة الصف لاحقًا."
        confirmLabel="نعم، حذف"
        danger
        loading={deleteBusy}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          if (!deleteBusy) {
            setDeleting(null);
          }
        }}
      />
    </LayoutShell>
  );
}
