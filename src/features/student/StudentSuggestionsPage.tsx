import { useCallback, useEffect, useState } from 'react';
import { ImagePlus, Lightbulb, Megaphone, Send, X } from 'lucide-react';

import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { GridCard } from '../../components/GridCard';
import { LayoutShell } from '../../components/LayoutShell';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { StudentNav } from '../../components/StudentNav';
import { useToast } from '../../components/Toast';
import {
  attachSuggestionImage,
  getPublicSettings,
  getRpcErrorCode,
  listMySuggestions,
  submitSuggestion,
  uploadSuggestionImage,
} from '../../data/rpc';
import { compressSuggestionImage, validateSuggestionImage } from '../../lib/imageCompress';
import { formatDateTime } from '../../lib/format';
import type { PlatformSuggestion, SuggestionKind } from '../../types/database';
import { useAuth } from '../auth/AuthContext';
import { SuggestionImageThumb } from '../suggestions/SuggestionImageThumb';
import {
  SUGGESTION_KIND_LABELS,
  SUGGESTION_STATUS_LABELS,
  SUGGESTION_STATUS_VARIANTS,
  suggestionErrorMessage,
} from '../suggestions/suggestionLabels';

const KIND_OPTIONS: SuggestionKind[] = ['issue', 'suggestion', 'other'];

function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-28 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function StudentSuggestionsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [closedMessage, setClosedMessage] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [configLoaded, setConfigLoaded] = useState(false);

  const [kind, setKind] = useState<SuggestionKind>('suggestion');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [history, setHistory] = useState<PlatformSuggestion[] | null>(null);
  const [historyError, setHistoryError] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const settings = await getPublicSettings();
      setBannerMessage(settings.suggestions_banner_message?.trim() || null);
      setClosedMessage(settings.suggestions_closed_message?.trim() || null);
      setIsOpen(settings.suggestions_open !== false);
    } catch {
      setIsOpen(true);
    } finally {
      setConfigLoaded(true);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryError(false);
    try {
      setHistory(await listMySuggestions());
    } catch {
      setHistoryError(true);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadHistory();
  }, [loadConfig, loadHistory]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const handleImageChange = (file: File | null) => {
    if (!file) {
      setImageFile(null);
      return;
    }
    const validationError = validateSuggestionImage(file);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    setImageFile(file);
  };

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || trimmedTitle.length > 100) {
      setFormError(suggestionErrorMessage('invalid_title'));
      return;
    }
    if (trimmedBody.length < 10 || trimmedBody.length > 1000) {
      setFormError(suggestionErrorMessage('invalid_body'));
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const row = await submitSuggestion(kind, trimmedTitle, trimmedBody);
      if (imageFile && user) {
        try {
          const blob = await compressSuggestionImage(imageFile);
          const path = await uploadSuggestionImage(user.id, row.id, blob);
          await attachSuggestionImage(row.id, path);
        } catch {
          showToast('تم إرسال مشاركتك لكن تعذر إرفاق الصورة', 'error');
        }
      }
      try {
        localStorage.setItem('suggestions-submitted', '1');
      } catch {
        // private mode — non-fatal
      }
      window.dispatchEvent(new CustomEvent('suggestions-submitted'));
      showToast('تم إرسال مشاركتك بنجاح — شكرًا لمساهمتك');
      setTitle('');
      setBody('');
      setImageFile(null);
      setKind('suggestion');
      await loadHistory();
    } catch (err) {
      const code = getRpcErrorCode(err);
      if (code === 'suggestions_closed') {
        setIsOpen(false);
        await loadConfig();
      }
      setFormError(suggestionErrorMessage(code));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LayoutShell
      title="مقترحات التحديث القادم"
      subtitle="شاركنا المشاكل والأفكار — نراجع كل المشاركات قبل الإطلاق"
      variant="sidebar"
      nav={<StudentNav />}
    >
      <div className="flex flex-col gap-5">
        <PageHeader
          title="مقترحات التحديث القادم"
          subtitle="مشكلة بتقابلك؟ فكرة جديدة؟ اكتبها هنا"
          icon={<Lightbulb className="h-5 w-5" />}
        />

        {configLoaded && (bannerMessage || !isOpen) ? (
          <div
            className="glass-card flex items-start gap-3 border-indigo-400/25 bg-gradient-to-br from-indigo-500/12 to-fuchsia-500/8 p-4 sm:p-5"
            data-testid="suggestions-banner"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-white">
              <Megaphone className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm leading-7 text-foreground">
              {isOpen ? bannerMessage : (closedMessage ?? bannerMessage)}
            </p>
          </div>
        ) : null}

        {isOpen ? (
          <GridCard>
            <h2 className="font-display text-base font-bold text-foreground">مشاركة جديدة</h2>
            <div className="mt-4 flex flex-col gap-4">
              <div>
                <label htmlFor="suggestion-kind" className="mb-1.5 block text-sm font-bold text-foreground">
                  النوع
                </label>
                <select
                  id="suggestion-kind"
                  value={kind}
                  onChange={(event) => setKind(event.target.value as SuggestionKind)}
                  className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-foreground sm:max-w-xs"
                  disabled={submitting}
                >
                  {KIND_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {SUGGESTION_KIND_LABELS[option]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="suggestion-title" className="mb-1.5 block text-sm font-bold text-foreground">
                  العنوان المختصر
                </label>
                <input
                  id="suggestion-title"
                  type="text"
                  value={title}
                  maxLength={100}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="مثال: زر تشغيل الفيديو لا يعمل على موبايلي"
                  className="glass-input w-full rounded-xl px-3 py-2.5 text-sm text-foreground"
                  disabled={submitting}
                />
                <p className="mt-1 text-xs text-foreground-subtle">{title.trim().length}/100</p>
              </div>

              <div>
                <label htmlFor="suggestion-body" className="mb-1.5 block text-sm font-bold text-foreground">
                  التفاصيل
                </label>
                <textarea
                  id="suggestion-body"
                  value={body}
                  maxLength={1000}
                  rows={5}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="اشرح المشكلة أو الفكرة بالتفصيل — متى تحدث؟ وما الذي تتوقعه؟"
                  className="glass-input w-full resize-y rounded-xl px-3 py-2.5 text-sm leading-7 text-foreground"
                  disabled={submitting}
                />
                <p className="mt-1 text-xs text-foreground-subtle">
                  {body.trim().length}/1000 (10 أحرف على الأقل)
                </p>
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-bold text-foreground">
                  صورة توضيحية <span className="font-normal text-foreground-subtle">(اختياري)</span>
                </span>
                {imagePreview && imageFile ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={imagePreview}
                      alt="معاينة الصورة المرفقة"
                      className="h-20 w-28 rounded-lg border border-white/10 object-cover"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setImageFile(null)}
                      icon={<X className="h-4 w-4" />}
                      disabled={submitting}
                    >
                      إزالة
                    </Button>
                  </div>
                ) : (
                  <label
                    htmlFor="suggestion-image"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-2.5 text-sm font-bold text-foreground-muted transition-colors hover:border-indigo-400/40 hover:text-foreground"
                  >
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                    إرفاق سكرين شوت
                  </label>
                )}
                <input
                  id="suggestion-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  disabled={submitting}
                  onChange={(event) => handleImageChange(event.target.files?.[0] ?? null)}
                />
              </div>

              {formError ? (
                <p role="alert" className="text-sm font-bold text-error" data-testid="suggestion-form-error">
                  {formError}
                </p>
              ) : null}

              <div>
                <Button
                  variant="primary"
                  onClick={() => void handleSubmit()}
                  loading={submitting}
                  disabled={submitting}
                  icon={<Send className="h-4 w-4" />}
                  data-testid="suggestion-submit"
                >
                  إرسال المشاركة
                </Button>
              </div>
            </div>
          </GridCard>
        ) : configLoaded ? (
          <GridCard>
            <p className="text-sm leading-7 text-foreground-muted">
              {closedMessage ?? 'انتهت فترة جمع المقترحات لهذا التحديث — شكرًا لمشاركتك.'}
            </p>
          </GridCard>
        ) : null}

        <section aria-label="مشاركاتي السابقة">
          <h2 className="font-display mb-3 text-base font-bold text-foreground">مشاركاتي السابقة</h2>
          {historyError ? (
            <ErrorState message="تعذر تحميل مشاركاتك" onRetry={() => void loadHistory()} />
          ) : history === null ? (
            <HistorySkeleton />
          ) : history.length === 0 ? (
            <EmptyState
              title="لا توجد مشاركات بعد"
              description="كن أول المساهمين — اكتب مشكلتك أو فكرتك بالأعلى."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {history.map((item) => (
                <li
                  key={item.id}
                  className="glass-card p-4"
                  data-testid={`my-suggestion-${item.id}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="info">{SUGGESTION_KIND_LABELS[item.kind]}</Badge>
                    <Badge variant={SUGGESTION_STATUS_VARIANTS[item.status]}>
                      {SUGGESTION_STATUS_LABELS[item.status]}
                    </Badge>
                    <span className="ms-auto text-xs text-foreground-subtle" dir="ltr">
                      {formatDateTime(item.created_at)}
                    </span>
                  </div>
                  <p className="mt-2 font-bold text-foreground">{item.title}</p>
                  <p className="mt-1 text-sm leading-7 text-foreground-muted">{item.body}</p>
                  {item.image_path ? (
                    <div className="mt-3">
                      <SuggestionImageThumb path={item.image_path} title={item.title} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </LayoutShell>
  );
}
