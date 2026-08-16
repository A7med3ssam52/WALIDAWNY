import { useCallback, useEffect, useState } from 'react';
import { MessageSquareText, Send } from 'lucide-react';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { addLessonComment, deleteLessonComment, getRpcErrorCode, listLessonComments } from '../../data/rpc';
import { formatDate } from '../../lib/format';
import type { LessonComment } from '../../types/database';

const COMMENT_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'لا تملك صلاحية التعليق على هذا الدرس',
  invalid_body: 'التعليق لا يمكن أن يكون فارغًا',
  invalid_parent: 'لا يمكن الرد على هذا التعليق',
  permission_denied: 'لا تملك صلاحية حذف هذا التعليق',
  comment_not_found: 'التعليق غير موجود',
};

function commentErrorMessage(error: unknown): string {
  const code = getRpcErrorCode(error);
  if (code && COMMENT_ERROR_MESSAGES[code]) {
    return COMMENT_ERROR_MESSAGES[code];
  }
  return 'حدث خطأ غير متوقع. حاول مرة أخرى';
}

function CommentsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-20 w-3/4" />
      <Skeleton className="h-20 w-2/3" />
    </div>
  );
}

function groupComments(comments: LessonComment[]): LessonComment[] {
  const roots = comments.filter((comment) => !comment.parent_id);
  const repliesByParent = comments
    .filter((comment) => comment.parent_id)
    .reduce<Record<string, LessonComment[]>>((map, comment) => {
      const parentId = comment.parent_id ?? '';
      map[parentId] = map[parentId] ?? [];
      map[parentId].push(comment);
      return map;
    }, {});
  return roots.flatMap((root) => [root, ...(repliesByParent[root.id] ?? [])]);
}

interface StudentLessonCommentsTabProps {
  lessonId: string;
  userId: string;
}

export function StudentLessonCommentsTab({ lessonId, userId }: StudentLessonCommentsTabProps) {
  const { showToast } = useToast();
  const [comments, setComments] = useState<LessonComment[] | null>(null);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<LessonComment | null>(null);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setComments(await listLessonComments(lessonId));
    } catch {
      setLoadError(true);
    }
  }, [lessonId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async () => {
    const trimmed = body.trim();
    if (!trimmed) {
      setError(COMMENT_ERROR_MESSAGES.invalid_body);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await addLessonComment(lessonId, trimmed);
      showToast('تم إضافة تعليقك');
      setBody('');
      await load();
    } catch (err) {
      setError(commentErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReply = async (parent: LessonComment) => {
    const trimmed = replyText.trim();
    if (!trimmed) {
      setError(COMMENT_ERROR_MESSAGES.invalid_body);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await addLessonComment(lessonId, trimmed, parent.id);
      showToast('تم إضافة ردك');
      setReplyTo(null);
      setReplyText('');
      await load();
    } catch (err) {
      setError(commentErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (comment: LessonComment) => {
    setDeletingId(comment.id);
    try {
      await deleteLessonComment(comment.id);
      showToast('تم حذف التعليق');
      await load();
    } catch (err) {
      setError(commentErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  if (loadError) {
    return <ErrorState message="تعذر تحميل التعليقات" onRetry={() => void load()} />;
  }

  if (comments === null) {
    return <CommentsSkeleton />;
  }

  const grouped = groupComments(comments);

  return (
    <div className="flex flex-col gap-4" data-testid="lesson-comments-tab">
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <MessageSquareText aria-hidden="true" className="h-4 w-4 text-foreground-subtle" />
            <span className="text-sm font-medium text-foreground">أضف تعليقك</span>
          </div>
          <textarea
            aria-label="نص التعليق"
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              if (error) {
                setError(null);
              }
            }}
            rows={3}
            maxLength={500}
            className="w-full rounded-lg border border-white/15 bg-white/5 p-3 text-sm text-foreground placeholder:text-foreground-subtle/60 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="اكتب تعليقك على الدرس هنا..."
            data-testid="comment-input"
          />
          {error ? (
            <p role="alert" className="text-sm font-medium text-error">
              {error}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-3">
            <Button onClick={() => void handleAdd()} loading={busy} data-testid="comment-submit">
              إضافة التعليق
            </Button>
          </div>
        </div>
      </Card>

      {grouped.length === 0 ? (
        <EmptyState
          title="لا توجد تعليقات بعد"
          description="كن أول من يشارك سؤالًا أو ملاحظة عن هذا الدرس."
          icon={<MessageSquareText className="h-6 w-6" />}
        />
      ) : (
        <div className="flex flex-col gap-3" data-testid="comment-list">
          {grouped.map((comment) => {
            const isReply = Boolean(comment.parent_id);
            const isOwn = comment.author_id === userId;
            const isDeleting = deletingId === comment.id;
            return (
              <div
                key={comment.id}
                className={`rounded-xl border border-white/10 bg-white/4 p-4 ${
                  isReply ? 'ms-6 border-primary/15 bg-primary/5' : ''
                }`}
                data-testid={`comment-${comment.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-foreground">{comment.author_name}</span>
                    <span className="text-foreground-subtle">{formatDate(comment.created_at)}</span>
                  </div>
                  {isOwn ? (
                    <button
                      type="button"
                      onClick={() => void handleDelete(comment)}
                      disabled={isDeleting}
                      className="rounded-md px-2 py-1 text-xs font-medium text-foreground-subtle transition-colors hover:bg-error/10 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-55"
                      data-testid={`comment-delete-${comment.id}`}
                    >
                      {isDeleting ? 'جاري الحذف...' : 'حذف'}
                    </button>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-foreground">{comment.body}</p>
                {!isReply ? (
                  <div className="mt-3">
                    {replyTo?.id === comment.id ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          aria-label={`الرد على ${comment.author_name}`}
                          value={replyText}
                          onChange={(event) => {
                            setReplyText(event.target.value);
                            if (error) {
                              setError(null);
                            }
                          }}
                          rows={2}
                          maxLength={500}
                          className="w-full rounded-lg border border-white/15 bg-white/5 p-3 text-sm text-foreground placeholder:text-foreground-subtle/60 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="اكتب ردك هنا..."
                          data-testid={`reply-input-${comment.id}`}
                        />
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setReplyTo(null);
                              setReplyText('');
                            }}
                          >
                            إلغاء
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => void handleReply(comment)}
                            loading={busy}
                            data-testid={`reply-submit-${comment.id}`}
                          >
                            إرسال الرد
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTo(comment);
                          setReplyText('');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary-strong transition-colors hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        data-testid={`reply-toggle-${comment.id}`}
                      >
                        <Send aria-hidden="true" className="h-3.5 w-3.5" />
                        رد
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
