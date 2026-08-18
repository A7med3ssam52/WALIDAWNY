import { vi } from 'vitest';

type AnyRecord = Record<string, unknown>;

export interface MockSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: AnyRecord;
}

interface MockState {
  auth: { session: MockSession | null; user: AnyRecord | null };
  profiles: AnyRecord[];
  grades: AnyRecord[];
  units: AnyRecord[];
  lessons: AnyRecord[];
  lessonPdfs: AnyRecord[];
  lessonVideos: AnyRecord[];
  unitPricing: AnyRecord[];
  platformFee: number;
  unitCodes: AnyRecord[];
  unitPurchases: AnyRecord[];
  progress: AnyRecord[];
  notifications: AnyRecord[];
  exams: AnyRecord[];
  examQuestions: AnyRecord[];
  examAttempts: AnyRecord[];
  examAnswers: AnyRecord[];
  lessonComments: AnyRecord[];
  dashboardStats: AnyRecord;
  auditLogs: AnyRecord[];
  rpcResults: Record<string, unknown>;
  rpcErrors: Record<string, string>;
  queryErrors: Record<string, string>;
  singleQueryErrors: Record<string, string>;
  queryGates: Record<string, Promise<void>>;
  authGates: { getSession?: Promise<void>; getUser?: Promise<void> };
  signUpCreatesSession: boolean;
  signUpError: string | null;
  signInError: string | null;
  updateUserError: string | null;
  reauthenticateError: string | null;
  signOutError: string | null;
  rpcCalls: Array<{ fn: string; args: AnyRecord | undefined }>;
  authCalls: Array<{ method: string; params: unknown }>;
  queryCalls: Array<{
    table: string;
    filters: Array<{ column: string; value: unknown; op: string }>;
  }>;
  authListeners: Array<(event: string, session: MockSession | null) => void>;
  idSeq: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function daysFromNow(days: number, hours = 0): string {
  return new Date(Date.now() + days * 86_400_000 + hours * 3_600_000).toISOString();
}

const state: MockState = {
  auth: { session: null, user: null },
  profiles: [],
  grades: [],
  units: [],
  lessons: [],
  lessonPdfs: [],
  lessonVideos: [],
  unitPricing: [],
  platformFee: 0,
  unitCodes: [],
  unitPurchases: [],
  progress: [],
  notifications: [],
  exams: [],
  examQuestions: [],
  examAttempts: [],
  examAnswers: [],
  lessonComments: [],
  dashboardStats: makeDashboardStats(),
  auditLogs: [],
  rpcResults: {},
  rpcErrors: {},
  queryErrors: {},
  singleQueryErrors: {},
  queryGates: {},
  authGates: {},
  signUpCreatesSession: true,
  signUpError: null,
  signInError: null,
  updateUserError: null,
  reauthenticateError: null,
  signOutError: null,
  rpcCalls: [],
  authCalls: [],
  queryCalls: [],
  authListeners: [],
  idSeq: 0,
};

export const mockState = state;

export function makeUser(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: 'user-test-1',
    email: 'student@example.com',
    aud: 'authenticated',
    created_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makeSession(user: AnyRecord): MockSession {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
}

export function makeProfile(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'user-test-1',
    full_name: 'أحمد محمد',
    phone: '01001234567',
    guardian_phone: '01112345678',
    address: 'القاهرة',
    grade_id: null,
    role: 'student',
    status: 'active',
    deleted_at: null,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makeGrade(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'grade-1',
    name: 'الصف الأول',
    sort_order: 1,
    is_active: true,
    deleted_at: null,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makeUnit(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'unit-1',
    grade_id: 'grade-1',
    name: 'الوحدة الأولى',
    sort_order: 1,
    status: 'draft',
    deleted_at: null,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makeLesson(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'lesson-1',
    unit_id: 'unit-1',
    title: 'الدرس الأول',
    description: null,
    is_trial: false,
    sort_order: 1,
    status: 'draft',
    published_at: null,
    deleted_at: null,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makePdf(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'pdf-1',
    lesson_id: 'lesson-1',
    storage_path: 'lesson-1/pdf-1.pdf',
    original_name: 'ملخص الدرس.pdf',
    size_bytes: 204_800,
    mime_type: 'application/pdf',
    is_primary: true,
    is_ready: true,
    deleted_at: null,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makeVideo(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'video-1',
    lesson_id: 'lesson-1',
    bunny_video_id: 'bunny-video-1',
    status: 'ready',
    is_primary: true,
    duration_seconds: 125,
    thumbnail_url: 'https://vz.example.test/thumb-1.jpg',
    error_message: null,
    deleted_at: null,
    created_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makeUnitPricing(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'pricing-1',
    unit_id: 'unit-1',
    base_price: 300,
    platform_fee: 50,
    total_price: 350,
    is_active: true,
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makeUnitPurchase(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'purchase-1',
    student_id: 'user-test-1',
    unit_id: 'unit-1',
    base_price: 300,
    platform_fee: 50,
    total_price: 350,
    code_id: null,
    purchased_at: daysFromNow(-2),
    status: 'active',
    ...overrides,
  };
}

export function makeUnitCode(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'code-1',
    code: 'WLDN-ABCD-EFGH-JKLM',
    unit_id: 'unit-1',
    status: 'available',
    created_by: 'user-walid-1',
    created_at: daysFromNow(-2),
    used_at: null,
    used_by: null,
    revoked_at: null,
    revoked_by: null,
    note: null,
    ...overrides,
  };
}

export function makeProgress(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'progress-1',
    student_id: 'user-test-1',
    lesson_id: 'lesson-1',
    video_id: 'video-1',
    position_seconds: 0,
    percent_completed: 0,
    is_completed: false,
    last_watched_at: nowIso(),
    updated_at: nowIso(),
    ...overrides,
  };
}

export function makeNotification(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'notif-1',
    user_id: 'user-test-1',
    type: 'new_content',
    title: 'درس جديد متاح',
    body: 'تم نشر درس جديد في صفك',
    dedup_key: null,
    is_read: false,
    read_at: null,
    entity_type: 'lesson',
    entity_id: 'lesson-1',
    created_at: daysFromNow(-1),
    ...overrides,
  };
}

export function makeDashboardStats(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    students: { total: 0, active: 0, disabled: 0, deleted: 0, new_this_month: 0 },
    purchases: { total: 0, total_revenue: 0, revenue_this_month: 0 },
    content: {
      grades: 0,
      units: 0,
      lessons: 0,
      published_lessons: 0,
      videos: 0,
      videos_ready: 0,
      pdfs: 0,
      pdfs_ready: 0,
    },
    engagement: { students_with_progress: 0, completed_lessons: 0, avg_percent: 0 },
    by_grade: [],
    top_units: [],
    recent_purchases: [],
    ...overrides,
  };
}

export function makeExam(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'exam-1',
    lesson_id: 'lesson-1',
    title: 'اختبار الدرس الأول',
    sort_order: 1,
    passing_score: 50,
    deleted_at: null,
    created_at: '2026-01-02T10:00:00.000Z',
    updated_at: '2026-01-02T10:00:00.000Z',
    ...overrides,
  };
}

export function makeExamQuestion(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'question-1',
    exam_id: 'exam-1',
    type: 'mcq',
    prompt: 'ما عاصمة مصر؟',
    choices: ['القاهرة', 'الإسكندرية', 'الجيزة', 'أسوان'],
    correct_index: 0,
    max_score: 1,
    sort_order: 1,
    ...overrides,
  };
}

export function makeExamAttempt(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'attempt-1',
    exam_id: 'exam-1',
    student_id: 'user-test-1',
    status: 'submitted',
    auto_score: null,
    manual_score: null,
    final_score: null,
    graded_by: null,
    graded_at: null,
    submitted_at: '2026-01-05T10:00:00.000Z',
    ...overrides,
  };
}

export function makeExamAnswer(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'answer-1',
    attempt_id: 'attempt-1',
    question_id: 'question-1',
    choice_index: 0,
    answer_text: null,
    score: 1,
    ...overrides,
  };
}

export function makeLessonComment(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'comment-1',
    lesson_id: 'lesson-1',
    author_id: 'user-test-1',
    author_name: 'أحمد محمد',
    parent_id: null,
    body: 'شرح ممتاز، شكرًا للأستاذ',
    status: 'visible',
    created_at: '2026-01-03T10:00:00.000Z',
    ...overrides,
  };
}

export function makeAuditLog(overrides: Partial<AnyRecord> = {}): AnyRecord {
  return {
    id: 'audit-1',
    actor_id: 'user-walid-1',
    actor_role: 'mr_walid',
    action: 'profile.update',
    entity_type: 'profiles',
    entity_id: 'user-test-1',
    metadata: { changed_fields: ['full_name'] },
    ip_address: '127.0.0.1',
    created_at: daysFromNow(-2),
    actor_name: 'الأستاذ وليد',
    ...overrides,
  };
}

export function setAuthenticatedUser(profile: AnyRecord): MockSession {
  const user = makeUser({ id: profile.id, email: profile.email ?? 'student@example.com' });
  const session = makeSession(user);
  state.auth = { session, user };
  if (!state.profiles.some((existing) => existing.id === profile.id)) {
    state.profiles.push(profile);
  }
  state.rpcResults['get_public_settings'] = {
    platform_name: 'وليد عونى',
    whatsapp_number: '+201000000000',
    whatsapp_default_message: 'مرحبًا، أود التواصل مع الأستاذ',
  };
  return session;
}

export function setAuthenticatedStudent(overrides: Partial<AnyRecord> = {}) {
  return setAuthenticatedUser(makeProfile(overrides));
}

export function setAuthenticatedWalid(overrides: Partial<AnyRecord> = {}) {
  return setAuthenticatedUser(
    makeProfile({
      id: 'user-walid-1',
      email: 'walid@example.com',
      full_name: 'الأستاذ وليد',
      role: 'mr_walid',
      ...overrides,
    }),
  );
}

export function setAuthenticatedTeacher(overrides: Partial<AnyRecord> = {}) {
  return setAuthenticatedUser(
    makeProfile({
      id: 'user-teacher-1',
      email: 'teacher@example.com',
      full_name: 'الأستاذ أحمد',
      role: 'teacher',
      ...overrides,
    }),
  );
}

type FilterOp = 'eq' | 'neq' | 'is' | 'in' | 'not_is';
type Filter = { column: string; value: unknown; op: FilterOp };

interface QueryBuilder {
  select: () => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  neq: (column: string, value: unknown) => QueryBuilder;
  is: (column: string, value: unknown) => QueryBuilder;
  not: (column: string, operator: string, value: unknown) => QueryBuilder;
  in: (column: string, values: unknown[]) => QueryBuilder;
  order: () => QueryBuilder;
  limit: () => QueryBuilder;
  single: () => QueryBuilder;
  maybeSingle: () => QueryBuilder;
  insert: (values: AnyRecord | AnyRecord[]) => QueryBuilder;
  update: (values: AnyRecord) => QueryBuilder;
  delete: () => QueryBuilder;
  then: <T>(onFulfilled: (value: unknown) => T) => Promise<T>;
  catch: (onRejected: (reason: unknown) => unknown) => Promise<unknown>;
  finally: (onFinally?: () => void) => Promise<unknown>;
}

function tableRows(table: string): AnyRecord[] {
  if (table === 'profiles') {
    return state.profiles;
  }
  if (table === 'grades') {
    return state.grades;
  }
  if (table === 'units') {
    return state.units;
  }
  if (table === 'lessons') {
    return state.lessons;
  }
  if (table === 'lesson_pdfs') {
    return state.lessonPdfs;
  }
  if (table === 'lesson_videos') {
    return state.lessonVideos;
  }
  if (table === 'unit_pricing') {
    return state.unitPricing;
  }
  if (table === 'unit_codes') {
    return state.unitCodes;
  }
  if (table === 'unit_purchases') {
    return state.unitPurchases;
  }
  if (table === 'progress') {
    return state.progress;
  }
  if (table === 'notifications') {
    return state.notifications;
  }
  if (table === 'exams') {
    return state.exams;
  }
  if (table === 'exam_questions') {
    return state.examQuestions;
  }
  if (table === 'exam_attempts') {
    return state.examAttempts;
  }
  if (table === 'exam_answers') {
    return state.examAnswers;
  }
  if (table === 'lesson_comments') {
    return state.lessonComments;
  }
  return [];
}

function createQueryBuilder(table: string): QueryBuilder {
  const filters: Filter[] = [];
  let single = false;
  let op: 'none' | 'insert' | 'update' | 'delete' = 'none';
  let opValues: AnyRecord | AnyRecord[] | null = null;

  const applyFilters = (rows: AnyRecord[]): AnyRecord[] => {
    for (const filter of filters) {
      rows = rows.filter((row) => {
        const actual = row[filter.column];
        if (filter.op === 'is') {
          return filter.value === null
            ? actual === null || actual === undefined
            : actual !== null && actual !== undefined && actual === filter.value;
        }
        if (filter.op === 'not_is') {
          return actual !== null && actual !== undefined;
        }
        if (filter.op === 'in') {
          const values = filter.value as unknown[];
          return values.includes(actual);
        }
        return filter.op === 'eq' ? actual === filter.value : actual !== filter.value;
      });
    }
    return rows;
  };

  const run = async (): Promise<{ data: unknown; error: { message: string } | null }> => {
    if (state.queryErrors[table] && !single && op === 'none') {
      return { data: null, error: { message: state.queryErrors[table] } };
    }
    if (state.singleQueryErrors[table] && single && op === 'none') {
      return { data: null, error: { message: state.singleQueryErrors[table] } };
    }
    const gate = state.queryGates[table];
    if (gate) {
      await gate;
    }
    state.queryCalls.push({ table, filters: [...filters] });
    if (op === 'insert') {
      const source = Array.isArray(opValues) ? opValues : [opValues ?? {}];
      const inserted = source.map((values) => {
        const row: AnyRecord = {
          id: `created-${table}-${++state.idSeq}`,
          created_at: nowIso(),
          updated_at: nowIso(),
          ...values,
        };
        tableRows(table).push(row);
        return row;
      });
      return { data: single ? (inserted[0] ?? null) : inserted, error: null };
    }
    let rows = applyFilters(tableRows(table));
    if (op === 'update') {
      rows.forEach((row) => {
        Object.assign(row, opValues ?? {});
      });
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    }
    if (op === 'delete') {
      const removed = [...rows];
      const store = tableRows(table);
      rows.forEach((row) => {
        const index = store.indexOf(row);
        if (index >= 0) {
          store.splice(index, 1);
        }
      });
      return { data: single ? (removed[0] ?? null) : removed, error: null };
    }
    rows = applyFilters(tableRows(table));
    if (single) {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  };

  const builder: QueryBuilder = {
    select: () => builder,
    eq: (column, value) => {
      filters.push({ column, value, op: 'eq' });
      return builder;
    },
    neq: (column, value) => {
      filters.push({ column, value, op: 'neq' });
      return builder;
    },
    is: (column, value) => {
      filters.push({ column, value, op: 'is' });
      return builder;
    },
    not: (column, _operator, value) => {
      filters.push({ column, value, op: value === null ? 'not_is' : 'neq' });
      return builder;
    },
    in: (column, values) => {
      filters.push({ column, value: values, op: 'in' });
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    single: () => {
      single = true;
      return builder;
    },
    maybeSingle: () => {
      single = true;
      return builder;
    },
    insert: (values) => {
      op = 'insert';
      opValues = values;
      return builder;
    },
    update: (values) => {
      op = 'update';
      opValues = values;
      return builder;
    },
    delete: () => {
      op = 'delete';
      return builder;
    },
    then: (onFulfilled) => run().then(onFulfilled),
    catch: (onRejected) => run().catch(onRejected),
    finally: (onFinally) => run().finally(onFinally),
  };
  return builder;
}

function error(message: string): { data: null; error: { message: string } } {
  return { data: null, error: { message } };
}

function createMockClient() {
  const emit = (event: string, session: MockSession | null) => {
    state.auth = { session, user: session?.user ?? null };
    state.authListeners.forEach((listener) => listener(event, session));
  };

  const applyLifecycleRpc = (fn: string, args: AnyRecord | undefined): boolean => {
    const studentId = args?.p_student_id as string | undefined;
    if (!studentId) {
      return false;
    }
    const profile = state.profiles.find((item) => item.id === studentId);
    if (!profile) {
      return false;
    }
    if (fn === 'disable_student') {
      profile.status = 'disabled';
    } else if (fn === 'enable_student') {
      profile.status = 'active';
    } else if (fn === 'soft_delete_student') {
      profile.status = 'disabled';
      profile.deleted_at = nowIso();
    } else if (fn === 'restore_student') {
      profile.status = 'active';
      profile.deleted_at = null;
    } else {
      return false;
    }
    return true;
  };

  type RpcResult = { data: unknown; error: { message: string } | null };

  const currentUserId = (): string | null => (state.auth.user?.id as string | undefined) ?? null;

  const applyLearningRpc = (fn: string, args: AnyRecord | undefined): RpcResult | null => {
    const uid = currentUserId();
    if (fn === 'upsert_progress') {
      const lessonId = String(args?.p_lesson_id ?? '');
      const position = Number(args?.p_position_seconds ?? 0);
      const percent = Math.min(100, Math.max(0, Number(args?.p_percent ?? 0)));
      if (!uid) {
        return error('access_denied');
      }
      const existing = state.progress.find(
        (item) => item.student_id === uid && item.lesson_id === lessonId,
      );
      const updated = makeProgress({
        ...existing,
        id: existing?.id ?? `progress-created-${++state.idSeq}`,
        student_id: uid,
        lesson_id: lessonId,
        position_seconds: position,
        percent_completed: existing
          ? Math.max(Number(existing.percent_completed), percent)
          : percent,
        is_completed: existing
          ? Boolean(existing.is_completed) ||
            Math.max(Number(existing.percent_completed), percent) >= 90
          : percent >= 90,
        last_watched_at: nowIso(),
        updated_at: nowIso(),
      });
      if (existing) {
        Object.assign(existing, updated);
      } else {
        state.progress.push(updated);
      }
      return { data: updated, error: null };
    }
    if (fn === 'mark_notification_read') {
      const row = state.notifications.find((item) => item.id === args?.p_notification_id);
      if (!row) {
        return error('notification_not_found');
      }
      row.is_read = true;
      row.read_at = nowIso();
      return { data: null, error: null };
    }
    if (fn === 'mark_all_notifications_read') {
      state.notifications.forEach((item) => {
        if (!item.is_read) {
          item.is_read = true;
          item.read_at = nowIso();
        }
      });
      return { data: null, error: null };
    }
    return null;
  };

  const applyGradeRpc = (fn: string, args: AnyRecord | undefined): RpcResult | null => {
    const grade = state.grades.find((item) => item.id === args?.p_grade_id);
    if (fn === 'create_grade') {
      const name = String(args?.p_name ?? '').trim();
      if (!name) {
        return error('grade_name_required');
      }
      if (state.grades.some((item) => item.name === name)) {
        return error('duplicate grade');
      }
      const sortOrder = (args?.p_sort_order as number | undefined) ?? 0;
      const row = makeGrade({
        id: `grade-created-${++state.idSeq}`,
        name,
        sort_order: sortOrder,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      state.grades.push(row);
      return { data: row.id, error: null };
    }
    if (fn === 'update_grade') {
      if (!grade) {
        return error('grade_not_found');
      }
      if (grade.deleted_at !== null) {
        return error('grade_deleted');
      }
      if (grade.is_active === false) {
        return error('grade_inactive');
      }
      if (args?.p_name != null && String(args.p_name).trim() === '') {
        return error('grade_name_required');
      }
      if (
        args?.p_name != null &&
        state.grades.some(
          (item) => item.id !== args.p_grade_id && item.name === String(args.p_name).trim(),
        )
      ) {
        return error('duplicate grade');
      }
      if (args?.p_name != null) {
        grade.name = String(args.p_name).trim();
      }
      if (args?.p_sort_order != null) {
        grade.sort_order = args.p_sort_order;
      }
      grade.updated_at = nowIso();
      return { data: null, error: null };
    }
    if (fn === 'delete_grade') {
      if (!grade) {
        return error('grade_not_found');
      }
      grade.deleted_at = nowIso();
      grade.updated_at = nowIso();
      return { data: null, error: null };
    }
    if (fn === 'restore_grade') {
      if (!grade) {
        return error('grade_not_found');
      }
      grade.deleted_at = null;
      grade.updated_at = nowIso();
      return { data: null, error: null };
    }
    return null;
  };

  const applyCurriculumRpc = (fn: string, args: AnyRecord | undefined): RpcResult | null => {
    const unit = state.units.find((item) => item.id === args?.p_unit_id);
    const lesson = state.lessons.find((item) => item.id === args?.p_lesson_id);
    if (fn === 'create_unit') {
      const name = String(args?.p_name ?? '').trim();
      if (!name) {
        return error('unit name must not be empty');
      }
      const gradeId = args?.p_grade_id as string;
      if (state.units.some((item) => item.grade_id === gradeId && item.name === name)) {
        return error('duplicate key value violates unique constraint "units_grade_id_name_key"');
      }
      const sortOrder = (args?.p_sort_order as number | undefined) ?? 0;
      const row = makeUnit({
        id: `unit-created-${++state.idSeq}`,
        grade_id: gradeId,
        name,
        sort_order: sortOrder,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      state.units.push(row);
      return { data: row.id, error: null };
    }
    if (fn === 'update_unit') {
      if (!unit) {
        return error('unit_not_found');
      }
      if (args?.p_name != null && String(args.p_name).trim() === '') {
        return error('unit name must not be empty');
      }
      if (
        args?.p_name != null &&
        state.units.some(
          (item) =>
            item.id !== args.p_unit_id &&
            item.grade_id === unit.grade_id &&
            item.name === String(args.p_name).trim(),
        )
      ) {
        return error('duplicate key value violates unique constraint "units_grade_id_name_key"');
      }
      if (args?.p_name != null) {
        unit.name = String(args.p_name).trim();
      }
      if (args?.p_sort_order != null) {
        unit.sort_order = args.p_sort_order;
      }
      unit.updated_at = nowIso();
      return { data: null, error: null };
    }
    if (fn === 'delete_unit') {
      if (!unit) {
        return error('unit_not_found');
      }
      unit.deleted_at = nowIso();
      unit.updated_at = nowIso();
      return { data: null, error: null };
    }
    if (fn === 'restore_unit') {
      if (!unit) {
        return error('unit_not_found');
      }
      unit.deleted_at = null;
      unit.updated_at = nowIso();
      return { data: null, error: null };
    }
    if (fn === 'create_lesson') {
      const title = String(args?.p_title ?? '').trim();
      if (!title) {
        return error('lesson title must not be empty');
      }
      const sortOrder = (args?.p_sort_order as number | undefined) ?? 0;
      const row = makeLesson({
        id: `lesson-created-${++state.idSeq}`,
        unit_id: args?.p_unit_id as string,
        title,
        description: args?.p_description ?? null,
        sort_order: sortOrder,
        is_trial: args?.p_is_trial === true,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      state.lessons.push(row);
      return { data: row.id, error: null };
    }
    if (fn === 'update_lesson') {
      if (!lesson) {
        return error('lesson_not_found');
      }
      if (args?.p_title != null && String(args.p_title).trim() === '') {
        return error('lesson title must not be empty');
      }
      if (args?.p_title != null) {
        lesson.title = String(args.p_title).trim();
      }
      if (args?.p_description != null) {
        lesson.description = String(args.p_description);
      }
      if (args?.p_sort_order != null) {
        lesson.sort_order = args.p_sort_order;
      }
      if (args?.p_is_trial != null) {
        lesson.is_trial = args.p_is_trial === true;
      }
      lesson.updated_at = nowIso();
      return { data: null, error: null };
    }
    if (fn === 'publish_lesson') {
      if (!lesson) {
        return error('lesson_not_found');
      }
      lesson.status = 'published';
      lesson.published_at = nowIso();
      lesson.updated_at = nowIso();
      return { data: null, error: null };
    }
    if (fn === 'hide_lesson') {
      if (!lesson) {
        return error('lesson_not_found');
      }
      lesson.status = 'hidden';
      lesson.updated_at = nowIso();
      return { data: null, error: null };
    }
    if (fn === 'soft_delete_lesson') {
      if (!lesson) {
        return error('lesson_not_found');
      }
      lesson.deleted_at = nowIso();
      lesson.updated_at = nowIso();
      return { data: null, error: null };
    }
    if (fn === 'restore_lesson') {
      if (!lesson) {
        return error('lesson_not_found');
      }
      lesson.deleted_at = null;
      lesson.updated_at = nowIso();
      return { data: null, error: null };
    }
    if (fn === 'finalize_pdf_upload') {
      const pdf = state.lessonPdfs.find((item) => item.id === args?.p_pdf_id);
      if (!pdf) {
        return error('pdf_not_found');
      }
      state.lessonPdfs.forEach((item) => {
        if (
          item.lesson_id === pdf.lesson_id &&
          item.id !== pdf.id &&
          item.is_primary &&
          item.deleted_at === null
        ) {
          item.is_primary = false;
        }
      });
      pdf.is_ready = true;
      pdf.is_primary = true;
      pdf.updated_at = nowIso();
      return { data: null, error: null };
    }
    return null;
  };

  const applyUnitPricingRpc = (fn: string, args: AnyRecord | undefined): RpcResult | null => {
    if (fn === 'set_unit_price') {
      const base = Number(args?.p_base_price);
      const fee = state.platformFee;
      const unitId = String(args?.p_unit_id ?? '');
      if (Number.isNaN(base) || base < 0) {
        return error('invalid_price_values');
      }
      const unit = state.units.find((item) => item.id === unitId);
      if (!unit) {
        return error('unit_not_found');
      }
      const existing = state.unitPricing.find((item) => item.unit_id === unitId);
      if (existing) {
        existing.base_price = base;
        existing.platform_fee = fee;
        existing.total_price = base + fee;
        existing.is_active = true;
        existing.updated_at = nowIso();
        return { data: existing.id, error: null };
      }
      const row = makeUnitPricing({
        id: `pricing-created-${++state.idSeq}`,
        unit_id: unitId,
        base_price: base,
        platform_fee: fee,
        total_price: base + fee,
        is_active: true,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      state.unitPricing.push(row);
      return { data: row.id, error: null };
    }
    if (fn === 'set_platform_fee') {
      const fee = Number(args?.p_fee);
      if (Number.isNaN(fee) || fee < 0) {
        return error('invalid_fee');
      }
      state.platformFee = fee;
      state.unitPricing.forEach((item) => {
        item.platform_fee = fee;
        item.total_price = Number(item.base_price ?? 0) + fee;
      });
      return { data: null, error: null };
    }
    if (fn === 'get_platform_fee') {
      return { data: state.platformFee, error: null };
    }
    return null;
  };

  const enrichUnitPricing = (item: AnyRecord): AnyRecord => {
    const unit = state.units.find((candidate) => candidate.id === item.unit_id);
    const grade = unit ? state.grades.find((candidate) => candidate.id === unit.grade_id) : null;
    return {
      ...item,
      unit_name: unit?.name ?? item.unit_id,
      grade_name: grade?.name ?? null,
    };
  };

  const applyUnitPurchaseRpc = (fn: string, args: AnyRecord | undefined): RpcResult | null => {
    const uid = currentUserId();
    if (fn === 'get_my_unit_purchases') {
      const rows = state.unitPurchases
        .filter((item) => item.student_id === uid)
        .sort((a, b) => String(b.purchased_at).localeCompare(String(a.purchased_at)));
      return { data: rows, error: null };
    }
    if (fn === 'get_my_lesson_access') {
      const lessonId = String(args?.p_lesson_id ?? '');
      const lesson = state.lessons.find((item) => item.id === lessonId);
      if (!lesson) {
        return error('lesson_not_found');
      }
      const unit = state.units.find((item) => item.id === lesson.unit_id);
      const pricing = state.unitPricing.find((item) => item.unit_id === lesson.unit_id);
      const isTrial = lesson.is_trial === true;
      const purchased = state.unitPurchases.some(
        (item) => item.student_id === uid && item.unit_id === lesson.unit_id,
      );
      return {
        data: {
          has_access: purchased || isTrial,
          is_trial: isTrial && !purchased,
          unit_id: lesson.unit_id,
          unit_name: unit?.name ?? '',
          price: pricing?.total_price ?? null,
        },
        error: null,
      };
    }
    if (fn === 'get_public_unit_prices') {
      const rows = state.unitPricing
        .filter((item) => item.is_active !== false)
        .map(enrichUnitPricing);
      return { data: rows, error: null };
    }
    if (fn === 'list_unit_pricing') {
      const rows = state.unitPricing.map(enrichUnitPricing);
      return { data: rows, error: null };
    }
    if (fn === 'list_codes_by_unit') {
      const unitId = String(args?.p_unit_id ?? '');
      const rows = state.unitCodes
        .filter((item) => item.unit_id === unitId)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return { data: rows, error: null };
    }
    if (fn === 'redeem_unit_code') {
      const code = String(args?.p_code ?? '')
        .trim()
        .toUpperCase();
      const codeRow = state.unitCodes.find((item) => item.code === code);
      if (!codeRow) {
        return error('code_not_found');
      }
      if (codeRow.status === 'used') {
        return error('code_already_used');
      }
      if (codeRow.status === 'revoked') {
        return error('code_revoked');
      }
      const unit = state.units.find((item) => item.id === codeRow.unit_id);
      if (!unit) {
        return error('unit_not_found');
      }
      const pricing = state.unitPricing.find((item) => item.unit_id === codeRow.unit_id);
      if (!pricing || pricing.is_active === false) {
        return error('unit_inactive');
      }
      const student = state.profiles.find((item) => item.id === uid);
      const gradeId = student?.grade_id as string | undefined;
      if (!gradeId) {
        return error('no_grade_assigned');
      }
      if (
        state.unitPurchases.some(
          (item) => item.student_id === uid && item.unit_id === codeRow.unit_id,
        )
      ) {
        return error('unit_purchased');
      }
      const purchase = makeUnitPurchase({
        id: `purchase-created-${++state.idSeq}`,
        student_id: uid,
        unit_id: codeRow.unit_id,
        base_price: pricing.base_price,
        platform_fee: pricing.platform_fee,
        total_price: pricing.total_price,
        code_id: codeRow.id,
        purchased_at: nowIso(),
        status: 'active',
      });
      state.unitPurchases.push(purchase);
      codeRow.status = 'used';
      codeRow.used_at = nowIso();
      codeRow.used_by = uid;
      return { data: purchase, error: null };
    }
    if (fn === 'revoke_unit_code') {
      const codeRow = state.unitCodes.find((item) => item.id === args?.p_code_id);
      if (!codeRow) {
        return error('code_not_found');
      }
      if (codeRow.status === 'used') {
        return error('code_already_used');
      }
      if (codeRow.status === 'revoked') {
        return error('code_not_revocable');
      }
      codeRow.status = 'revoked';
      codeRow.revoked_at = nowIso();
      codeRow.revoked_by = uid;
      return { data: null, error: null };
    }
    if (fn === 'create_unit_codes_for_staff') {
      const unitId = String(args?.p_unit_id ?? '');
      const count = Number(args?.p_count ?? 0);
      if (!Number.isInteger(count) || count < 1 || count > 500) {
        return error('invalid_count');
      }
      const unit = state.units.find((item) => item.id === unitId);
      if (!unit) {
        return error('unit_not_found');
      }
      const note = (args?.p_note as string | null) ?? null;
      const rows = Array.from({ length: count }, () =>
        makeUnitCode({
          id: `code-created-${++state.idSeq}`,
          code: `WLDN-${String(state.idSeq).padStart(6, '0')}`,
          unit_id: unitId,
          status: 'available',
          created_by: uid ?? 'user-walid-1',
          created_at: nowIso(),
          used_at: null,
          used_by: null,
          revoked_at: null,
          revoked_by: null,
          note,
        }),
      );
      state.unitCodes.push(...rows);
      return { data: rows, error: null };
    }
    if (fn === 'list_all_unit_purchases') {
      const studentId = (args?.p_student_id as string | null) ?? null;
      let rows = state.unitPurchases;
      if (studentId) {
        rows = rows.filter((item) => item.student_id === studentId);
      }
      const enriched = rows
        .map((item) => {
          const unit = state.units.find((candidate) => candidate.id === item.unit_id);
          return {
            ...item,
            unit_name: unit?.name ?? item.unit_id,
            grade_name: unit
              ? (state.grades.find((g) => g.id === unit.grade_id)?.name ?? null)
              : null,
            purchased_at: item.purchased_at ?? '',
          } as AnyRecord;
        })
        .sort((a, b) => String(b.purchased_at).localeCompare(String(a.purchased_at)));
      return { data: enriched, error: null };
    }
    if (fn === 'unit_purchase_stats') {
      const total = state.unitPurchases.length;
      const totalRevenue = state.unitPurchases.reduce(
        (sum, item) => sum + Number(item.total_price ?? 0),
        0,
      );
      return {
        data: {
          total_units: total,
          total_revenue: totalRevenue,
          purchased_units: state.unitPurchases.filter((item) => item.status === 'active').length,
          by_grade: [],
        },
        error: null,
      };
    }
    return null;
  };

  const currentRole = (uid: string | null): string | null =>
    uid ? ((state.profiles.find((item) => item.id === uid)?.role as string | null) ?? null) : null;

  const studentHasLessonAccess = (uid: string, lessonId: string): boolean => {
    const lesson = state.lessons.find((item) => item.id === lessonId);
    if (!lesson) {
      return false;
    }
    const isTrial = lesson.is_trial === true;
    const purchased = state.unitPurchases.some(
      (item) => item.student_id === uid && item.unit_id === lesson.unit_id,
    );
    return purchased || isTrial;
  };

  const applyPhase6Rpc = (fn: string, args: AnyRecord | undefined): RpcResult | null => {
    const uid = currentUserId();
    const role = currentRole(uid);
    const isStaff = role === 'mr_walid';
    const isStudent = role === 'student';
    if (fn === 'list_exams') {
      const lessonId = String(args?.p_lesson_id ?? '');
      if (isStudent && uid && !studentHasLessonAccess(uid, lessonId)) {
        return error('access_denied');
      }
      const rows = state.exams
        .filter((item) => item.lesson_id === lessonId && !item.deleted_at)
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
      return { data: rows, error: null };
    }
    if (fn === 'get_exam_questions') {
      const examId = String(args?.p_exam_id ?? '');
      const exam = state.exams.find((item) => item.id === examId);
      if (!exam || exam.deleted_at) {
        return error('exam_not_found');
      }
      if (isStudent && uid && !studentHasLessonAccess(uid, String(exam.lesson_id))) {
        return error('access_denied');
      }
      const rows = state.examQuestions
        .filter((item) => item.exam_id === examId)
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
      if (isStudent) {
        return {
          data: rows.map((item) => ({ ...item, correct_index: null })),
          error: null,
        };
      }
      return { data: rows, error: null };
    }
    if (fn === 'get_my_exam_attempt') {
      const examId = String(args?.p_exam_id ?? '');
      const attempt = state.examAttempts.find(
        (item) => item.exam_id === examId && item.student_id === uid,
      );
      return { data: attempt ? [attempt] : [], error: null };
    }
    if (fn === 'submit_exam_attempt') {
      if (!uid) {
        return error('auth_required');
      }
      if (!isStudent) {
        return error('permission_denied');
      }
      const examId = String(args?.p_exam_id ?? '');
      const exam = state.exams.find((item) => item.id === examId);
      if (!exam || exam.deleted_at) {
        return error('exam_not_found');
      }
      if (!studentHasLessonAccess(uid, String(exam.lesson_id))) {
        return error('access_denied');
      }
      if (state.examAttempts.some((item) => item.exam_id === examId && item.student_id === uid)) {
        return error('attempt_already_exists');
      }
      const answers = (args?.p_answers as AnyRecord[] | undefined) ?? [];
      const questions = state.examQuestions
        .filter((item) => item.exam_id === examId)
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
      if (!Array.isArray(answers) || answers.length !== questions.length) {
        return error('invalid_answers');
      }
      const questionIds = new Set(questions.map((question) => question.id));
      for (const answer of answers) {
        if (!questionIds.has(String(answer?.question_id ?? ''))) {
          return error('invalid_answers');
        }
      }
      const attempt = makeExamAttempt({
        id: `attempt-created-${++state.idSeq}`,
        exam_id: examId,
        student_id: uid,
        status: 'submitted',
        submitted_at: nowIso(),
      });
      state.examAttempts.push(attempt);
      let autoScore = 0;
      questions.forEach((question, index) => {
        const answer = answers[index];
        let score: number | null = null;
        if (question.type === 'mcq' && question.correct_index != null) {
          const isCorrect = Number(answer?.choice_index) === Number(question.correct_index);
          score = isCorrect ? 1 : 0;
          if (isCorrect) {
            autoScore += 1;
          }
        }
        state.examAnswers.push(
          makeExamAnswer({
            id: `answer-created-${++state.idSeq}`,
            attempt_id: attempt.id,
            question_id: question.id,
            choice_index: question.type === 'mcq' ? Number(answer?.choice_index ?? null) : null,
            answer_text: question.type === 'essay' ? String(answer?.answer_text ?? '') : null,
            score,
          }),
        );
      });
      const hasEssay = questions.some((question) => question.type === 'essay');
      if (hasEssay) {
        attempt.auto_score = autoScore;
      } else {
        attempt.status = 'graded';
        attempt.auto_score = autoScore;
        attempt.manual_score = 0;
        attempt.final_score = autoScore;
        attempt.graded_at = nowIso();
        attempt.graded_by = 'auto';
      }
      state.notifications.push(
        makeNotification({
          id: `notif-created-${++state.idSeq}`,
          user_id: 'user-walid-1',
          type: 'exam_submitted',
          title: 'إجابة جديدة',
          body: `أرسل طالب إجابة عن اختبار ${exam.title}`,
          entity_type: 'exam',
          entity_id: exam.id,
          created_at: nowIso(),
        }),
      );
      if (attempt.status === 'graded') {
        state.notifications.push(
          makeNotification({
            id: `notif-created-${++state.idSeq}`,
            user_id: uid,
            type: 'exam_graded',
            title: 'تم تصحيح الاختبار',
            body: `حصلت على ${autoScore} من ${questions.length}`,
            entity_type: 'exam',
            entity_id: exam.id,
            created_at: nowIso(),
          }),
        );
      }
      return { data: attempt, error: null };
    }
    if (fn === 'grade_exam_attempt') {
      if (!uid || !isStaff) {
        return error('permission_denied');
      }
      const attemptId = String(args?.p_attempt_id ?? '');
      const attempt = state.examAttempts.find((item) => item.id === attemptId);
      if (!attempt) {
        return error('attempt_not_found');
      }
      if (attempt.status === 'graded') {
        return error('already_graded');
      }
      const scores = (args?.p_scores as AnyRecord[] | undefined) ?? [];
      if (!Array.isArray(scores)) {
        return error('invalid_scores');
      }
      const answers = state.examAnswers.filter((item) => item.attempt_id === attemptId);
      let manual = 0;
      for (const score of scores) {
        if (!score || typeof score.question_id !== 'string') {
          return error('invalid_scores');
        }
        const answer = answers.find((item) => item.question_id === score.question_id);
        if (!answer) {
          return error('invalid_scores');
        }
        const value = Number(score.score);
        if (!Number.isFinite(value) || value < 0) {
          return error('invalid_scores');
        }
        answer.score = value;
        manual += value;
      }
      attempt.status = 'graded';
      attempt.auto_score = Number((attempt.auto_score as number | null | undefined) ?? 0);
      attempt.manual_score = manual;
      attempt.final_score = Number((attempt.auto_score as number | null | undefined) ?? 0) + manual;
      attempt.graded_by = uid;
      attempt.graded_at = nowIso();
      state.notifications.push(
        makeNotification({
          id: `notif-created-${++state.idSeq}`,
          user_id: attempt.student_id,
          type: 'exam_graded',
          title: 'تم تصحيح الاختبار',
          body: `نتيجتك النهائية: ${attempt.final_score}`,
          entity_type: 'exam',
          entity_id: attempt.exam_id,
          created_at: nowIso(),
        }),
      );
      return { data: attempt, error: null };
    }
    if (fn === 'list_lesson_comments') {
      if (!uid) {
        return error('access_denied');
      }
      const lessonId = String(args?.p_lesson_id ?? '');
      if (isStudent && !studentHasLessonAccess(uid, lessonId)) {
        return error('access_denied');
      }
      const rows = state.lessonComments
        .filter((item) => item.lesson_id === lessonId && (item.status === 'visible' || isStaff))
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      return { data: rows, error: null };
    }
    if (fn === 'add_lesson_comment') {
      if (!uid) {
        return error('access_denied');
      }
      if (!isStudent && !isStaff) {
        return error('permission_denied');
      }
      const lessonId = String(args?.p_lesson_id ?? '');
      const body = String(args?.p_body ?? '').trim();
      if (!body || body.length > 500) {
        return error('invalid_body');
      }
      if (isStudent && !studentHasLessonAccess(uid, lessonId)) {
        return error('access_denied');
      }
      const parentId = (args?.p_parent_id as string | null) ?? null;
      if (parentId) {
        const parent = state.lessonComments.find((item) => item.id === parentId);
        if (!parent || parent.lesson_id !== lessonId || parent.parent_id) {
          return error('invalid_parent');
        }
      }
      const profile = state.profiles.find((item) => item.id === uid);
      const comment = makeLessonComment({
        id: `comment-created-${++state.idSeq}`,
        lesson_id: lessonId,
        author_id: uid,
        author_name: profile?.full_name ?? '',
        parent_id: parentId,
        body,
        status: 'visible',
        created_at: nowIso(),
      });
      state.lessonComments.push(comment);
      state.notifications.push(
        makeNotification({
          id: `notif-created-${++state.idSeq}`,
          user_id: 'user-walid-1',
          type: 'lesson_comment',
          title: 'تعليق جديد',
          body: `${comment.author_name}: ${body.slice(0, 40)}`,
          entity_type: 'lesson',
          entity_id: lessonId,
          created_at: nowIso(),
        }),
      );
      if (parentId) {
        const parent = state.lessonComments.find((item) => item.id === parentId);
        if (parent && parent.author_id !== uid) {
          state.notifications.push(
            makeNotification({
              id: `notif-created-${++state.idSeq}`,
              user_id: parent.author_id,
              type: 'comment_reply',
              title: 'رد جديد على تعليقك',
              body: `${comment.author_name} رد عليك: ${body.slice(0, 40)}`,
              entity_type: 'lesson',
              entity_id: lessonId,
              created_at: nowIso(),
            }),
          );
        }
      }
      return { data: comment, error: null };
    }
    if (fn === 'delete_lesson_comment') {
      if (!uid) {
        return error('permission_denied');
      }
      const commentId = String(args?.p_comment_id ?? '');
      const comment = state.lessonComments.find((item) => item.id === commentId);
      if (!comment) {
        return error('comment_not_found');
      }
      if (!isStaff && comment.author_id !== uid) {
        return error('permission_denied');
      }
      comment.status = 'removed';
      return { data: null, error: null };
    }
    return null;
  };

  const auth = {
    getSession: vi.fn(async () => {
      const gate = state.authGates.getSession;
      if (gate) {
        await gate;
      }
      return { data: { session: state.auth.session }, error: null };
    }),
    getUser: vi.fn(async () => {
      const gate = state.authGates.getUser;
      if (gate) {
        await gate;
      }
      return { data: { user: state.auth.user }, error: null };
    }),
    onAuthStateChange: vi.fn((listener: (event: string, session: MockSession | null) => void) => {
      state.authListeners.push(listener);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signUp: vi.fn(
      async (params: { email: string; password: string; options?: { data?: AnyRecord } }) => {
        state.authCalls.push({ method: 'signUp', params });
        if (state.signUpError) {
          return { data: { user: null, session: null }, error: { message: state.signUpError } };
        }
        const user = makeUser({ id: 'user-test-1', email: params.email });
        const session = state.signUpCreatesSession ? makeSession(user) : null;
        if (session) {
          state.profiles.push(
            makeProfile({
              id: user.id,
              email: user.email,
              full_name: params.options?.data?.full_name ?? 'طالب جديد',
            }),
          );
          emit('SIGNED_IN', session);
        }
        return { data: { user: session?.user ?? null, session }, error: null };
      },
    ),
    signInWithPassword: vi.fn(async (params: { email: string; password: string }) => {
      state.authCalls.push({ method: 'signInWithPassword', params });
      if (state.signInError) {
        return {
          data: { user: null, session: null },
          error: { code: 'invalid_credentials', message: state.signInError },
        };
      }
      const user = makeUser({ id: 'user-test-1', email: params.email });
      if (!state.profiles.some((existing) => existing.id === user.id)) {
        state.profiles.push(makeProfile({ id: user.id, email: user.email }));
      }
      const session = makeSession(user);
      emit('SIGNED_IN', session);
      return { data: { user: session.user, session }, error: null };
    }),
    signOut: vi.fn(async () => {
      state.authCalls.push({ method: 'signOut', params: undefined });
      if (state.signOutError) {
        return { error: { message: state.signOutError } };
      }
      emit('SIGNED_OUT', null);
      return { error: null };
    }),
    updateUser: vi.fn(async (params: { password: string }) => {
      state.authCalls.push({ method: 'updateUser', params });
      if (state.updateUserError) {
        const message = state.updateUserError;
        state.updateUserError = null;
        return { data: { user: state.auth.user }, error: { message } };
      }
      return { data: { user: state.auth.user }, error: null };
    }),
    reauthenticate: vi.fn(async () => {
      state.authCalls.push({ method: 'reauthenticate', params: undefined });
      if (state.reauthenticateError) {
        return { data: { user: null }, error: { message: state.reauthenticateError } };
      }
      return { data: { user: state.auth.user }, error: null };
    }),
  };

  const rpc = vi.fn(async (fn: string, args?: AnyRecord): Promise<RpcResult> => {
    state.rpcCalls.push({ fn, args });
    if (state.rpcErrors[fn]) {
      return { data: null, error: { message: state.rpcErrors[fn] } };
    }
    const mockedResult = state.rpcResults[fn];
    if (mockedResult !== undefined) {
      return { data: mockedResult, error: null };
    }
    if (fn === 'list_trash') {
      return { data: state.profiles.filter((profile) => profile.deleted_at !== null), error: null };
    }
    if (fn === 'list_active_grades') {
      return {
        data: state.grades
          .filter((grade) => grade.is_active && !grade.deleted_at)
          .map((grade) => ({ id: grade.id, name: grade.name, sort_order: grade.sort_order })),
        error: null,
      };
    }
    if (fn === 'get_dashboard_stats') {
      return { data: state.dashboardStats, error: null };
    }
    if (fn === 'list_audit_logs') {
      const from = (args?.p_from as string | null) ?? null;
      const to = (args?.p_to as string | null) ?? null;
      const action = ((args?.p_action as string | null) ?? '').toLowerCase();
      const entityType = ((args?.p_entity_type as string | null) ?? '').toLowerCase();
      const actorId = (args?.p_actor_id as string | null) ?? null;
      const limit = Number(args?.p_limit ?? 50);
      const offset = Number(args?.p_offset ?? 0);
      let rows = state.auditLogs
        .filter((row) => !from || String(row.created_at) >= from)
        .filter((row) => !to || String(row.created_at) <= to)
        .filter((row) => !action || String(row.action).toLowerCase().includes(action))
        .filter((row) => !entityType || String(row.entity_type).toLowerCase().includes(entityType))
        .filter((row) => !actorId || row.actor_id === actorId)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      rows = rows.slice(offset, offset + limit);
      return { data: rows, error: null };
    }
    if (fn === 'count_audit_logs') {
      const from = (args?.p_from as string | null) ?? null;
      const to = (args?.p_to as string | null) ?? null;
      const action = ((args?.p_action as string | null) ?? '').toLowerCase();
      const entityType = ((args?.p_entity_type as string | null) ?? '').toLowerCase();
      const actorId = (args?.p_actor_id as string | null) ?? null;
      const total = state.auditLogs
        .filter((row) => !from || String(row.created_at) >= from)
        .filter((row) => !to || String(row.created_at) <= to)
        .filter((row) => !action || String(row.action).toLowerCase().includes(action))
        .filter((row) => !entityType || String(row.entity_type).toLowerCase().includes(entityType))
        .filter((row) => !actorId || row.actor_id === actorId).length;
      return { data: total, error: null };
    }
    if (applyLifecycleRpc(fn, args)) {
      return { data: null, error: null };
    }
    if (fn === 'set_user_role') {
      const profile = state.profiles.find((candidate) => candidate.id === args?.p_user_id);
      if (profile) {
        profile.role = args?.p_role;
      }
      return { data: null, error: null };
    }
    const learning = applyLearningRpc(fn, args);
    if (learning) {
      return learning;
    }
    const phase3 =
      applyGradeRpc(fn, args) ??
      applyCurriculumRpc(fn, args) ??
      applyUnitPricingRpc(fn, args) ??
      applyUnitPurchaseRpc(fn, args);
    if (phase3) {
      return phase3;
    }
    const phase6 = applyPhase6Rpc(fn, args);
    if (phase6) {
      return phase6;
    }
    return { data: null, error: null };
  });

  const from = (table: string) => createQueryBuilder(table);

  return { auth, from, rpc };
}

export function resetMockState() {
  state.auth = { session: null, user: null };
  state.profiles = [];
  state.grades = [];
  state.units = [];
  state.lessons = [];
  state.lessonPdfs = [];
  state.lessonVideos = [];
  state.unitPricing = [];
  state.unitCodes = [];
  state.unitPurchases = [];
  state.progress = [];
  state.notifications = [];
  state.exams = [];
  state.examQuestions = [];
  state.examAttempts = [];
  state.examAnswers = [];
  state.lessonComments = [];
  state.dashboardStats = makeDashboardStats();
  state.auditLogs = [];
  state.rpcResults = {};
  state.rpcErrors = {};
  state.queryErrors = {};
  state.singleQueryErrors = {};
  state.queryGates = {};
  state.authGates = {};
  state.signUpCreatesSession = true;
  state.signUpError = null;
  state.signInError = null;
  state.updateUserError = null;
  state.reauthenticateError = null;
  state.signOutError = null;
  state.rpcCalls = [];
  state.authCalls = [];
  state.queryCalls = [];
  state.authListeners = [];
  state.idSeq = 0;
}

export function getRpcCalls() {
  return state.rpcCalls;
}

export function getAuthCalls() {
  return state.authCalls;
}

export function expectRpcCall(fn: string): AnyRecord | undefined {
  return state.rpcCalls.find((call) => call.fn === fn)?.args;
}

export function expectAuthCall(method: string) {
  return state.authCalls.find((call) => call.method === method)?.params;
}

export function expectQueryFilters(
  table: string,
): Array<{ column: string; value: unknown; op: string }> {
  return state.queryCalls
    .filter((call) => call.table === table)
    .map((call) => call.filters)
    .flat();
}

export function getQueryCallCount(table: string): number {
  return state.queryCalls.filter((call) => call.table === table).length;
}

export function mockRpc(fn: string, data: unknown) {
  state.rpcResults[fn] = data;
}

export function mockRpcError(fn: string, message: string) {
  state.rpcErrors[fn] = message;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => createMockClient()),
}));
