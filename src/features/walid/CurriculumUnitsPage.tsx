import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DirectionalArrow } from '../../components/DirectionalArrow';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Input } from '../../components/Input';
import { LayoutShell } from '../../components/LayoutShell';
import { Modal } from '../../components/Modal';
import { RoleNav } from '../../components/RoleNav';
import { useToast } from '../../components/Toast';
import { UnitStatusBadge } from '../../components/UnitStatusBadge';
import {
  createUnit,
  deleteUnit,
  getGradeById,
  hideUnit,
  listDeletedUnitsForGrade,
  listUnitsForGrade,
  publishUnit,
  restoreUnit,
  setUnitFree,
  setUnitPrice,
  updateUnit,
} from '../../data/rpc';
import type { Grade, Unit } from '../../types/database';
import { ListSkeleton, OrderChip, curriculumErrorMessage } from './curriculumShared';

type PendingUnitEdit = { unit: Unit } | null;
type PendingUnitDelete = { unit: Unit } | null;

export function CurriculumUnitsPage() {
  const { gradeId } = useParams<{ gradeId: string }>();
  const { showToast } = useToast();

  const [grade, setGrade] = useState<Grade | null | undefined>(undefined);
  const [gradeError, setGradeError] = useState(false);
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [deletedUnits, setDeletedUnits] = useState<Unit[] | null>(null);
  const [unitsError, setUnitsError] = useState(false);
  const [showDeletedUnits, setShowDeletedUnits] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [unitName, setUnitName] = useState('');
  const [unitOrder, setUnitOrder] = useState('0');
  const [unitPrice, setUnitPriceInput] = useState('');
  const [unitCreateError, setUnitCreateError] = useState<string | null>(null);
  const [unitCreateBusy, setUnitCreateBusy] = useState(false);

  const [editingUnit, setEditingUnit] = useState<PendingUnitEdit>(null);
  const [editUnitName, setEditUnitName] = useState('');
  const [editUnitOrder, setEditUnitOrder] = useState('0');
  const [editUnitError, setEditUnitError] = useState<string | null>(null);
  const [editUnitBusy, setEditUnitBusy] = useState(false);

  const [deletingUnit, setDeletingUnit] = useState<PendingUnitDelete>(null);
  const [deleteUnitBusy, setDeleteUnitBusy] = useState(false);
  const [restoringUnitId, setRestoringUnitId] = useState<string | null>(null);
  const [togglingUnitId, setTogglingUnitId] = useState<string | null>(null);
  const [freeTogglingId, setFreeTogglingId] = useState<string | null>(null);

  const loadGrade = useCallback(async () => {
    if (!gradeId) {
      setGrade(null);
      return;
    }
    setGradeError(false);
    try {
      setGrade(await getGradeById(gradeId));
    } catch {
      setGradeError(true);
    }
  }, [gradeId]);

  const loadUnits = useCallback(async () => {
    if (!gradeId) {
      setUnits([]);
      setDeletedUnits([]);
      return;
    }
    setUnitsError(false);
    try {
      const settled = await Promise.allSettled([
        listUnitsForGrade(gradeId),
        listDeletedUnitsForGrade(gradeId),
      ]);
      if (settled[0].status === 'fulfilled') setUnits(settled[0].value);
      else setUnitsError(true);
      if (settled[1].status === 'fulfilled') setDeletedUnits(settled[1].value);
      else setDeletedUnits([]);
    } catch {
      setUnitsError(true);
    }
  }, [gradeId]);

  useEffect(() => {
    void loadGrade();
    void loadUnits();
  }, [loadGrade, loadUnits]);

  const resetCreateForm = () => {
    setUnitName('');
    setUnitOrder('0');
    setUnitPriceInput('');
    setUnitCreateError(null);
  };

  const openCreate = () => {
    resetCreateForm();
    setCreateOpen(true);
  };

  const handleCreateUnit = async () => {
    const name = unitName.trim();
    setUnitCreateError(null);
    if (!name) {
      setUnitCreateError('اسم الوحدة مطلوب');
      return;
    }
    if (!gradeId) {
      setUnitCreateError('اختر صفًا أولاً');
      return;
    }
    let priceToApply: number | null = null;
    if (unitPrice.trim() !== '') {
      const price = Number(unitPrice);
      if (Number.isNaN(price) || price < 0) {
        setUnitCreateError('سعر الباب يجب أن يكون قيمة صحيحة غير سالبة');
        return;
      }
      priceToApply = price;
    }
    setUnitCreateBusy(true);
    try {
      const unitId = await createUnit({
        gradeId,
        name,
        sortOrder: Number(unitOrder) || 0,
      });
      if (priceToApply !== null) {
        await setUnitPrice({ unitId, basePrice: priceToApply });
      }
      setCreateOpen(false);
      resetCreateForm();
      showToast('تم إنشاء الوحدة بنجاح');
      await loadUnits();
    } catch (err) {
      setUnitCreateError(curriculumErrorMessage(err, true));
    } finally {
      setUnitCreateBusy(false);
    }
  };

  const openEditUnit = (unit: Unit) => {
    setEditingUnit({ unit });
    setEditUnitName(unit.name);
    setEditUnitOrder(String(unit.sort_order));
    setEditUnitError(null);
  };

  const handleEditUnit = async () => {
    if (!editingUnit) {
      return;
    }
    setEditUnitBusy(true);
    setEditUnitError(null);
    try {
      await updateUnit({
        unitId: editingUnit.unit.id,
        name: editUnitName.trim() ? editUnitName.trim() : null,
        sortOrder: editUnitOrder.trim() ? Number(editUnitOrder) : null,
      });
      showToast('تم تحديث الوحدة بنجاح');
      setEditingUnit(null);
      await loadUnits();
    } catch (err) {
      setEditUnitError(curriculumErrorMessage(err, true));
    } finally {
      setEditUnitBusy(false);
    }
  };

  const handleDeleteUnit = async () => {
    if (!deletingUnit) {
      return;
    }
    setDeleteUnitBusy(true);
    try {
      await deleteUnit(deletingUnit.unit.id);
      showToast('تم نقل الوحدة إلى المحذوفات');
      setDeletingUnit(null);
      await loadUnits();
    } catch (err) {
      showToast(curriculumErrorMessage(err, true), 'error');
      setDeletingUnit(null);
    } finally {
      setDeleteUnitBusy(false);
    }
  };

  const handleRestoreUnit = async (unit: Unit) => {
    setRestoringUnitId(unit.id);
    try {
      await restoreUnit(unit.id);
      showToast('تمت استعادة الوحدة');
      await loadUnits();
    } catch (err) {
      showToast(curriculumErrorMessage(err, true), 'error');
    } finally {
      setRestoringUnitId(null);
    }
  };

  const handleToggleUnitStatus = async (unit: Unit) => {
    setTogglingUnitId(unit.id);
    try {
      if (unit.status === 'published') {
        await hideUnit(unit.id);
        showToast('تم إخفاء الوحدة');
      } else {
        await publishUnit(unit.id);
        showToast('تم نشر الوحدة');
      }
      await loadUnits();
    } catch (err) {
      showToast(curriculumErrorMessage(err, true), 'error');
    } finally {
      setTogglingUnitId(null);
    }
  };

  const handleToggleFree = async (unit: Unit) => {
    const nextFree = !unit.is_free;
    setFreeTogglingId(unit.id);
    try {
      await setUnitFree(unit.id, nextFree);
      showToast(nextFree ? 'تم جعل الباب مجاني — سعره الآن صفر' : 'تم إلغاء مجانية الباب');
      await loadUnits();
    } catch (err) {
      showToast(curriculumErrorMessage(err, true), 'error');
    } finally {
      setFreeTogglingId(null);
    }
  };

  return (
    <LayoutShell
      title={grade ? `وحدات ${grade.name}` : 'وحدات الصف'}
      subtitle="أنشئ الوحدات وأدر نشرها وإخفاءها، ثم افتح دروسها"
      variant="sidebar"
      nav={<RoleNav />}
      actions={
        <Link
          to="/walid/curriculum"
          className="glass-soft inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1 sm:h-10"
        >
          <DirectionalArrow direction="back" />
          العودة إلى الصفوف
        </Link>
      }
    >
      {gradeError ? (
        <ErrorState message="تعذر تحميل بيانات الصف" onRetry={() => void loadGrade()} />
      ) : grade === undefined ? (
        <ListSkeleton />
      ) : grade === null ? (
        <ErrorState message="الصف غير موجود أو أنه محذوف" />
      ) : (
        <Card
          title="وحدات الصف"
          subtitle={`${grade.name} — اختر وحدة للانتقال إلى دروسها`}
          actions={
            <Button icon={<Plus aria-hidden="true" className="h-4 w-4" />} onClick={openCreate} className="w-full sm:w-auto">
              <span className="hidden sm:inline">إضافة وحدة</span>
            </Button>
          }
        >
          {unitsError ? (
            <ErrorState message="تعذر تحميل الوحدات" onRetry={() => void loadUnits()} />
          ) : units === null ? (
            <ListSkeleton />
          ) : units.length === 0 ? (
            <EmptyState title="لا توجد وحدات بعد" description="أنشئ أول وحدة في هذا الصف." />
          ) : (
            <ul className="flex flex-col gap-2">
              {units.map((unit) => (
                <li
                  key={unit.id}
                  data-testid={`unit-row-${unit.id}`}
                  className="glass-soft flex flex-col gap-3 rounded-xl border border-white/8 p-3 transition-all duration-200 hover:border-indigo-400/20 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                    <OrderChip order={unit.sort_order} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground sm:flex-none">
                      {unit.name}
                    </span>
                    <UnitStatusBadge status={unit.status} />
                    {unit.is_free ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-300">مجاني</span>
                    ) : null}
                  </div>
                  <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end sm:gap-1">
                    <Link
                      to={`/walid/curriculum/${gradeId}/${unit.id}`}
                      className="col-span-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary-soft px-3 text-sm font-semibold text-primary-strong transition-colors hover:bg-primary-soft/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1 sm:col-span-1 sm:h-9 sm:justify-start sm:bg-transparent sm:px-2.5 sm:hover:bg-primary-soft"
                    >
                      <BookOpen aria-hidden="true" className="h-4 w-4 shrink-0" />
                      فتح الدروس
                    </Link>
                    {unit.status === 'published' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<EyeOff aria-hidden="true" className="h-4 w-4" />}
                        onClick={() => void handleToggleUnitStatus(unit)}
                        disabled={togglingUnitId === unit.id}
                        className="w-full justify-center whitespace-nowrap text-warning hover:bg-amber-500/10 hover:text-warning sm:w-auto"
                      >
                        {togglingUnitId === unit.id ? 'جاري...' : 'إخفاء'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleToggleUnitStatus(unit)}
                        disabled={togglingUnitId === unit.id}
                        className="w-full justify-center whitespace-nowrap text-primary-strong hover:bg-primary-soft hover:text-primary-strong sm:w-auto"
                      >
                        {togglingUnitId === unit.id ? 'جاري...' : 'نشر'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Pencil aria-hidden="true" className="h-4 w-4" />}
                      onClick={() => openEditUnit(unit)}
                      className="w-full justify-center whitespace-nowrap sm:w-auto"
                    >
                      تعديل
                    </Button>
                    <Button
                      size="sm"
                      variant={unit.is_free ? 'secondary' : 'ghost'}
                      onClick={() => void handleToggleFree(unit)}
                      disabled={freeTogglingId === unit.id}
                      className={`w-full justify-center whitespace-nowrap sm:w-auto ${unit.is_free ? 'text-emerald-300' : ''}`}
                    >
                      {freeTogglingId === unit.id ? (
                        'جاري...'
                      ) : unit.is_free ? (
                        <>
                          <span className="sm:hidden">إلغاء</span>
                          <span className="hidden sm:inline">إلغاء المجانية</span>
                        </>
                      ) : (
                        <>
                          <span className="sm:hidden">مجاني</span>
                          <span className="hidden sm:inline">اجعله مجاني</span>
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}
                      onClick={() => setDeletingUnit({ unit })}
                      className="col-span-2 w-full justify-center whitespace-nowrap text-error hover:bg-rose-500/10 hover:text-error sm:col-span-1 sm:w-auto"
                    >
                      حذف
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowDeletedUnits((prev) => !prev)}
              className="inline-flex items-center rounded-lg px-2 py-1 text-sm font-semibold text-foreground-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong focus-visible:ring-offset-1"
            >
              {showDeletedUnits ? 'إخفاء المحذوفة' : `عرض المحذوفة (${deletedUnits?.length ?? 0})`}
            </button>
            {showDeletedUnits ? (
              deletedUnits === null ? (
                <ListSkeleton rows={1} />
              ) : deletedUnits.length === 0 ? (
                <p className="mt-2 text-sm text-foreground-subtle">لا توجد وحدات محذوفة.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {deletedUnits.map((unit) => (
                    <li
                      key={unit.id}
                      data-testid={`deleted-unit-row-${unit.id}`}
                      className="glass-soft flex items-center justify-between gap-3 rounded-xl border border-white/8 p-3"
                    >
                      <span className="truncate text-sm text-foreground-muted">{unit.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleRestoreUnit(unit)}
                        disabled={restoringUnitId === unit.id}
                        className="shrink-0 text-primary-strong hover:bg-primary-soft hover:text-primary-strong"
                      >
                        {restoringUnitId === unit.id ? 'جاري الاستعادة...' : 'استعادة'}
                      </Button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        </Card>
      )}

      <Modal
        open={createOpen}
        title="إضافة وحدة جديدة"
        description="أنشئ وحدة جديدة في هذا الصف، ويمكنك تحديد سعرها اختياريًا."
        confirmLabel="إضافة"
        loading={unitCreateBusy}
        onConfirm={() => void handleCreateUnit()}
        onCancel={() => {
          if (!unitCreateBusy) {
            setCreateOpen(false);
          }
        }}
      >
        <div className="mt-4 flex flex-col gap-3">
          <Input
            label="اسم الوحدة"
            name="unit-name"
            placeholder="مثال: الوحدة الأولى"
            value={unitName}
            error={unitCreateError ?? undefined}
            onChange={(event) => setUnitName(event.target.value)}
          />
          <Input
            label="الترتيب"
            name="unit-sort-order"
            type="number"
            value={unitOrder}
            onChange={(event) => setUnitOrder(event.target.value)}
          />
          <Input
            label="سعر الباب (ج.م — اختياري)"
            name="unit-price"
            type="number"
            min={0}
            step="0.01"
            placeholder="مثال: 100"
            value={unitPrice}
            onChange={(event) => setUnitPriceInput(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={editingUnit !== null}
        title={editingUnit ? `تعديل الوحدة: ${editingUnit.unit.name}` : ''}
        description="قم بتعديل اسم الوحدة أو ترتيبها."
        confirmLabel="حفظ"
        loading={editUnitBusy}
        onConfirm={() => void handleEditUnit()}
        onCancel={() => {
          if (!editUnitBusy) {
            setEditingUnit(null);
          }
        }}
      >
        <div className="mt-4 flex flex-col gap-3">
          <Input
            label="اسم الوحدة"
            name="edit-unit-name"
            value={editUnitName}
            error={editUnitError ?? undefined}
            onChange={(event) => setEditUnitName(event.target.value)}
          />
          <Input
            label="الترتيب"
            name="edit-unit-order"
            type="number"
            value={editUnitOrder}
            onChange={(event) => setEditUnitOrder(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={deletingUnit !== null}
        title={deletingUnit ? `حذف الوحدة: ${deletingUnit.unit.name}` : ''}
        description="سيتم نقل الوحدة ودروسها إلى المحذوفات ولن تظهر في المنهج، ويمكنك استعادتها لاحقًا."
        confirmLabel="نعم، حذف"
        danger
        loading={deleteUnitBusy}
        onConfirm={() => void handleDeleteUnit()}
        onCancel={() => {
          if (!deleteUnitBusy) {
            setDeletingUnit(null);
          }
        }}
      />
    </LayoutShell>
  );
}
