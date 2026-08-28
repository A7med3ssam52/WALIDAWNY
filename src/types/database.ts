export type UserRole = 'student' | 'teacher' | 'mr_walid' | 'admin';

export type AccountStatus = 'active' | 'disabled';

export type Profile = {
  id: string;
  full_name: string;
  phone: string;
  guardian_phone: string;
  address: string;
  grade_id: string | null;
  role: UserRole;
  status: AccountStatus;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Grade = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export interface PublicSettings {
  platform_name?: string | null;
  whatsapp_number?: string | null;
  whatsapp_default_message?: string | null;
}

export type ActiveGrade = {
  id: string;
  name: string;
  sort_order: number;
};

export type CodeStatus = 'available' | 'used' | 'revoked';

export type ContentStatus = 'draft' | 'published' | 'hidden';

export type Unit = {
  id: string;
  grade_id: string;
  name: string;
  sort_order: number;
  status: ContentStatus;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Lesson = {
  id: string;
  unit_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  status: ContentStatus;
  is_trial: boolean;
  published_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LessonPdf = {
  id: string;
  lesson_id: string;
  storage_path: string;
  original_name: string;
  size_bytes: number | null;
  mime_type: string;
  is_primary: boolean;
  is_ready: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LessonBoard = {
  id: string;
  lesson_id: string;
  storage_path: string;
  original_name: string;
  size_bytes: number | null;
  mime_type: string;
  sort_order: number;
  is_ready: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VideoStatus =
  'pending_upload' | 'uploading' | 'processing' | 'ready' | 'failed' | 'replaced';

export type LessonVideo = {
  id: string;
  lesson_id: string;
  source: 'bunny' | 'youtube';
  bunny_video_id: string | null;
  youtube_video_id: string | null;
  title: string | null;
  status: VideoStatus;
  is_primary: boolean;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  error_message: string | null;
  created_at: string;
  deleted_at: string | null;
};

export interface VideoUploadSession {
  video_id: string;
  bunny_video_id: string;
  upload_url: string;
  tus_headers: {
    AuthorizationSignature: string;
    AuthorizationExpire: string;
    LibraryId: string;
    VideoId: string;
  };
  metadata: {
    filetype: string;
    title: string;
  };
  expires_in: number;
}

export interface PlaybackResponse {
  playback_url: string;
  video_id: string;
  lesson_id: string;
}

export type UnitPurchaseStatus = 'active' | 'void';

export type UnitPricing = {
  id: string;
  unit_id: string;
  base_price: number;
  platform_fee: number;
  total_price: number;
  is_active: boolean;
};

export type UnitPricingWithUnit = UnitPricing & {
  unit_name: string;
  grade_name: string;
};

export type PublicUnitPrice = {
  unit_id: string;
  unit_name: string;
  grade_name: string;
  base_price: number;
  platform_fee: number;
  total_price: number;
};

export type UnitCode = {
  id: string;
  code: string;
  unit_pricing_id: string;
  status: CodeStatus;
  created_by: string;
  created_at: string;
  used_at: string | null;
  used_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  note: string | null;
};

export type UnitCodeWithUnit = UnitCode & {
  unit_name: string;
  used_by_name: string | null;
};

export type UnitPurchase = {
  id: string;
  student_id: string;
  unit_id: string;
  base_price: number;
  platform_fee: number;
  total_price: number;
  code_id: string | null;
  status: UnitPurchaseStatus;
  purchased_at: string;
};

export type UnitPurchaseWithUnit = UnitPurchase & {
  unit_name: string;
  grade_name: string | null;
};

export interface LessonAccessInfo {
  has_access: boolean;
  has_purchase: boolean;
  is_trial: boolean;
  unit_id: string | null;
  unit_name: string | null;
  price: number | null;
}

export interface UnitPurchaseStats {
  total_purchases: number;
  total_revenue: number;
  revenue_this_month: number;
  by_grade: Array<{ grade_name: string; purchases: number; revenue: number }>;
  top_units: Array<{ unit_name: string; purchases: number; revenue: number }>;
}

export type Progress = {
  id: string;
  student_id: string;
  lesson_id: string;
  video_id: string | null;
  position_seconds: number;
  percent_completed: number;
  is_completed: boolean;
  last_watched_at: string | null;
  updated_at: string;
};

export type ExamQuestionType = 'mcq' | 'essay';

export type Exam = {
  id: string;
  lesson_id: string;
  title: string;
  sort_order: number;
  passing_score: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExamQuestion = {
  id: string;
  exam_id: string;
  type: ExamQuestionType;
  prompt: string;
  choices: string[] | null;
  correct_index: number | null;
  max_score: number;
  sort_order: number;
  prompt_image_path: string | null;
  choice_image_paths: (string | null)[] | null;
};

export type ExamQuestionImageUrls = {
  question_id: string;
  prompt_image_url: string | null;
  choice_image_urls: (string | null)[] | null;
};

export type ExamImageSignedUrlsResponse = {
  exam_id: string;
  images: ExamQuestionImageUrls[];
};

export type ExamAttemptStatus = 'submitted' | 'graded';

export type ExamAttempt = {
  id: string;
  exam_id: string;
  student_id: string;
  status: ExamAttemptStatus;
  auto_score: number | null;
  manual_score: number | null;
  final_score: number | null;
  graded_by: string | null;
  graded_at: string | null;
  submitted_at: string;
};

export type ExamAnswer = {
  id: string;
  attempt_id: string;
  question_id: string;
  choice_index: number | null;
  answer_text: string | null;
  score: number | null;
};

export type LessonCommentStatus = 'visible' | 'removed';

export type LessonComment = {
  id: string;
  lesson_id: string;
  author_id: string;
  author_name: string;
  parent_id: string | null;
  body: string;
  status: LessonCommentStatus;
  created_at: string;
};

export type NotificationType =
  | 'unit_activated'
  | 'new_content'
  | 'system'
  | 'exam_submitted'
  | 'exam_graded'
  | 'lesson_comment'
  | 'comment_reply';

export type AppNotification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  dedup_key: string | null;
  is_read: boolean;
  read_at: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
};

export interface PdfAccessResponse {
  pdf_url: string;
  pdf_id: string;
  lesson_id: string;
  original_name: string | null;
}

export type LessonBoardSignedUrl = {
  board_id: string;
  original_name: string;
  sort_order: number;
  signed_url: string;
};

export type AuditLogRow = {
  id: string;
  actor_id: string | null;
  actor_role: UserRole | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  actor_name: string | null;
};

export interface AuditFilters {
  from?: string | null;
  to?: string | null;
  action?: string | null;
  entityType?: string | null;
  actorId?: string | null;
}

export interface DashboardStudentsStats {
  total: number;
  active: number;
  disabled: number;
  deleted: number;
  new_this_month: number;
}

export interface DashboardPurchasesStats {
  total: number;
  staff_revenue_this_month: number;
  platform_fee_total: number;
}

export interface DashboardContentStats {
  grades: number;
  units: number;
  lessons: number;
  published_lessons: number;
  videos: number;
  videos_ready: number;
  pdfs: number;
  pdfs_ready: number;
}

export interface DashboardEngagementStats {
  students_with_progress: number;
  completed_lessons: number;
  avg_percent: number;
}

export interface DashboardByGradeRow {
  grade_name: string;
  students: number;
  purchases: number;
  revenue: number;
}

export interface DashboardTopUnit {
  unit_name: string;
  purchases: number;
  revenue: number;
}

export interface DashboardRecentPurchase {
  student_name: string;
  grade_name: string | null;
  unit_name: string;
  total_price: number;
  purchased_at: string;
}

export interface FinancialSummary {
  total_purchases: number;
  total_base: number;
  total_platform_fee: number;
  total_revenue: number;
  avg_ticket: number;
  void_purchases: number;
  expenses_total: number;
  payouts_total: number;
  net_platform: number;
}

export interface FinancialByGradeRow {
  grade_id: string;
  grade_name: string;
  purchases: number;
  base_revenue: number;
  platform_revenue: number;
  total_revenue: number;
}

export interface FinancialByUnitRow {
  unit_id: string;
  unit_name: string;
  grade_name: string;
  purchases: number;
  base_revenue: number;
  platform_revenue: number;
  total_revenue: number;
}

export interface FinancialDailyRow {
  date: string;
  purchases: number;
  base_revenue: number;
  platform_revenue: number;
  total_revenue: number;
}

export interface FinancialCodeStats {
  available: number;
  used: number;
  revoked: number;
  pending_base: number;
  pending_total: number;
}

export interface FinancialRecentPurchase {
  student_name: string;
  grade_name: string | null;
  unit_name: string;
  base_price: number;
  platform_fee: number;
  total_price: number;
  purchased_at: string;
}

export interface FinancialReports {
  filters: { from: string | null; to: string | null; grade_id: string | null; unit_id: string | null };
  summary: FinancialSummary;
  by_grade: FinancialByGradeRow[];
  by_unit: FinancialByUnitRow[];
  daily: FinancialDailyRow[];
  code_stats: FinancialCodeStats;
  recent_purchases: FinancialRecentPurchase[];
}

export type PlatformExpense = {
  id: string;
  amount: number;
  category: string;
  description: string | null;
  spent_at: string;
  created_at: string;
  created_by: string | null;
};

export type PlatformPayout = {
  id: string;
  amount: number;
  note: string | null;
  paid_at: string;
  created_at: string;
  recipient_id: string | null;
};

export interface DashboardStats {
  students: DashboardStudentsStats;
  purchases: DashboardPurchasesStats;
  content: DashboardContentStats;
  engagement: DashboardEngagementStats;
  by_grade: DashboardByGradeRow[];
  top_units: DashboardTopUnit[];
  recent_purchases: DashboardRecentPurchase[];
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Profile;
        Update: Partial<Profile>;
        Relationships: [];
      };
      grades: {
        Row: Grade;
        Insert: Grade;
        Update: Partial<Grade>;
        Relationships: [];
      };
      units: {
        Row: Unit;
        Insert: Unit;
        Update: Partial<Unit>;
        Relationships: [];
      };
      lessons: {
        Row: Lesson;
        Insert: Lesson;
        Update: Partial<Lesson>;
        Relationships: [];
      };
      lesson_pdfs: {
        Row: LessonPdf;
        Insert: LessonPdf;
        Update: Partial<LessonPdf>;
        Relationships: [];
      };
      lesson_boards: {
        Row: LessonBoard;
        Insert: LessonBoard;
        Update: Partial<LessonBoard>;
        Relationships: [];
      };
      lesson_videos: {
        Row: LessonVideo;
        Insert: LessonVideo;
        Update: Partial<LessonVideo>;
        Relationships: [];
      };
      unit_pricing: {
        Row: UnitPricing;
        Insert: UnitPricing;
        Update: Partial<UnitPricing>;
        Relationships: [];
      };
      unit_codes: {
        Row: UnitCode;
        Insert: UnitCode;
        Update: Partial<UnitCode>;
        Relationships: [];
      };
      unit_purchases: {
        Row: UnitPurchase;
        Insert: UnitPurchase;
        Update: Partial<UnitPurchase>;
        Relationships: [];
      };
      progress: {
        Row: Progress;
        Insert: Progress;
        Update: Partial<Progress>;
        Relationships: [];
      };
      notifications: {
        Row: AppNotification;
        Insert: AppNotification;
        Update: Partial<AppNotification>;
        Relationships: [];
      };
      exams: {
        Row: Exam;
        Insert: Partial<Exam>;
        Update: Partial<Exam>;
        Relationships: [];
      };
      exam_questions: {
        Row: ExamQuestion;
        Insert: Partial<ExamQuestion>;
        Update: Partial<ExamQuestion>;
        Relationships: [];
      };
      exam_attempts: {
        Row: ExamAttempt;
        Insert: Partial<ExamAttempt>;
        Update: Partial<ExamAttempt>;
        Relationships: [];
      };
      exam_answers: {
        Row: ExamAnswer;
        Insert: Partial<ExamAnswer>;
        Update: Partial<ExamAnswer>;
        Relationships: [];
      };
      lesson_comments: {
        Row: LessonComment;
        Insert: Partial<LessonComment>;
        Update: Partial<LessonComment>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      update_own_profile: {
        Args: {
          p_full_name?: string | null;
          p_phone?: string | null;
          p_guardian_phone?: string | null;
          p_address?: string | null;
        };
        Returns: void;
      };
      update_student_profile: {
        Args: {
          p_student_id: string;
          p_full_name?: string | null;
          p_phone?: string | null;
          p_guardian_phone?: string | null;
          p_address?: string | null;
        };
        Returns: void;
      };
      set_student_grade: {
        Args: { p_student_id: string; p_grade_id: string | null };
        Returns: void;
      };
      disable_student: { Args: { p_student_id: string }; Returns: void };
      enable_student: { Args: { p_student_id: string }; Returns: void };
      soft_delete_student: { Args: { p_student_id: string }; Returns: void };
      restore_student: { Args: { p_student_id: string }; Returns: void };
      list_trash: { Args: never; Returns: Profile[] };
      set_user_role: { Args: { p_user_id: string; p_role: UserRole }; Returns: void };
      set_role_by_email: { Args: { p_email: string; p_role: UserRole }; Returns: void };
      list_active_grades: { Args: never; Returns: ActiveGrade[] };
      get_public_settings: { Args: never; Returns: PublicSettings };
      get_current_role: { Args: never; Returns: UserRole };
      redeem_unit_code: { Args: { p_code: string }; Returns: UnitPurchase };
      get_my_unit_purchases: { Args: never; Returns: UnitPurchase[] };
      get_my_lesson_access: { Args: { p_lesson_id: string }; Returns: LessonAccessInfo };
      get_public_unit_prices: { Args: never; Returns: PublicUnitPrice[] };
      set_unit_price: {
        Args: {
          p_unit_id: string;
          p_base_price: number;
        };
        Returns: void;
      };
      set_platform_fee: { Args: { p_fee: number }; Returns: void };
      get_platform_fee: { Args: never; Returns: number };
      list_unit_pricing: { Args: never; Returns: UnitPricingWithUnit[] };
      list_codes_by_unit: {
        Args: { p_unit_id: string };
        Returns: (UnitCode & { used_by_name: string | null })[];
      };
      revoke_unit_code: { Args: { p_code_id: string }; Returns: void };
      create_unit_codes_for_staff: {
        Args: { p_unit_id: string; p_count: number; p_note?: string | null };
        Returns: UnitCode[];
      };
      list_all_unit_purchases: {
        Args: { p_student_id?: string | null };
        Returns: UnitPurchaseWithUnit[];
      };
      unit_purchase_stats: { Args: never; Returns: UnitPurchaseStats };
      create_grade: { Args: { p_name: string; p_sort_order?: number }; Returns: string };
      create_unit: {
        Args: { p_grade_id: string; p_name: string; p_sort_order?: number };
        Returns: string;
      };
      update_unit: {
        Args: { p_unit_id: string; p_name: string | null; p_sort_order?: number | null };
        Returns: void;
      };
      delete_unit: { Args: { p_unit_id: string }; Returns: void };
      restore_unit: { Args: { p_unit_id: string }; Returns: void };
      publish_unit: { Args: { p_unit_id: string }; Returns: void };
      hide_unit: { Args: { p_unit_id: string }; Returns: void };
      create_lesson: {
        Args: {
          p_unit_id: string;
          p_title: string;
          p_description?: string | null;
          p_sort_order?: number;
          p_is_trial?: boolean;
        };
        Returns: string;
      };
      update_lesson: {
        Args: {
          p_lesson_id: string;
          p_title: string | null;
          p_description?: string | null;
          p_sort_order?: number | null;
          p_is_trial?: boolean | null;
        };
        Returns: void;
      };
      publish_lesson: { Args: { p_lesson_id: string }; Returns: void };
      hide_lesson: { Args: { p_lesson_id: string }; Returns: void };
      soft_delete_lesson: { Args: { p_lesson_id: string }; Returns: void };
      restore_lesson: { Args: { p_lesson_id: string }; Returns: void };
      finalize_pdf_upload: { Args: { p_pdf_id: string }; Returns: void };
      create_board_upload_record: {
        Args: {
          p_lesson_id: string;
          p_original_name: string;
          p_size_bytes?: number | null;
        };
        Returns: Array<{ id: string; storage_path: string }>;
      };
      finalize_board_upload: { Args: { p_board_id: string }; Returns: void };
      delete_board_upload_record: {
        Args: { p_lesson_id: string; p_board_id: string };
        Returns: void;
      };
      reorder_boards: {
        Args: { p_lesson_id: string; p_board_ids: string[] };
        Returns: void;
      };
      update_grade: {
        Args: { p_grade_id: string; p_name?: string | null; p_sort_order?: number | null };
        Returns: void;
      };
      delete_grade: { Args: { p_grade_id: string }; Returns: void };
      restore_grade: { Args: { p_grade_id: string }; Returns: void };
      upsert_progress: {
        Args: {
          p_lesson_id: string;
          p_position_seconds?: number | null;
          p_percent?: number | null;
        };
        Returns: Progress;
      };
      mark_notification_read: { Args: { p_notification_id: string }; Returns: void };
      mark_all_notifications_read: { Args: never; Returns: void };
      get_dashboard_stats: { Args: never; Returns: DashboardStats };
      list_audit_logs: {
        Args: {
          p_from?: string | null;
          p_to?: string | null;
          p_action?: string | null;
          p_entity_type?: string | null;
          p_actor_id?: string | null;
          p_limit?: number | null;
          p_offset?: number | null;
        };
        Returns: AuditLogRow[];
      };
      count_audit_logs: {
        Args: {
          p_from?: string | null;
          p_to?: string | null;
          p_action?: string | null;
          p_entity_type?: string | null;
          p_actor_id?: string | null;
        };
        Returns: number;
      };
      list_exams: { Args: { p_lesson_id: string }; Returns: Exam[] };
      get_exam_questions: { Args: { p_exam_id: string }; Returns: ExamQuestion[] };
      get_my_exam_attempt: { Args: { p_exam_id: string }; Returns: ExamAttempt[] };
      delete_exam: { Args: { p_exam_id: string }; Returns: void };
      delete_exam_question: { Args: { p_question_id: string }; Returns: void };
      submit_exam_attempt: {
        Args: { p_exam_id: string; p_answers: unknown };
        Returns: ExamAttempt;
      };
      grade_exam_attempt: {
        Args: { p_attempt_id: string; p_scores: unknown };
        Returns: ExamAttempt;
      };
      add_lesson_comment: {
        Args: { p_lesson_id: string; p_body: string; p_parent_id?: string | null };
        Returns: LessonComment;
      };
      delete_lesson_comment: { Args: { p_comment_id: string }; Returns: void };
      list_lesson_comments: { Args: { p_lesson_id: string }; Returns: LessonComment[] };
      add_youtube_video: {
        Args: { p_lesson_id: string; p_youtube_url: string; p_title?: string | null };
        Returns: void;
      };
      delete_lesson_video: { Args: { p_lesson_id: string; p_video_id: string }; Returns: void };
      get_financial_reports: {
        Args: {
          p_from?: string | null;
          p_to?: string | null;
          p_grade_id?: string | null;
          p_unit_id?: string | null;
        };
        Returns: FinancialReports;
      };
      add_platform_expense: {
        Args: { p_amount: number; p_category: string; p_description?: string | null; p_spent_at?: string | null };
        Returns: string;
      };
      list_platform_expenses: {
        Args: { p_from?: string | null; p_to?: string | null };
        Returns: PlatformExpense[];
      };
      add_platform_payout: {
        Args: { p_amount: number; p_note?: string | null; p_paid_at?: string | null };
        Returns: string;
      };
      list_platform_payouts: {
        Args: { p_from?: string | null; p_to?: string | null };
        Returns: PlatformPayout[];
      };
      get_trial_lessons: {
        Args: never;
        Returns: {
          lesson_id: string;
          lesson_title: string;
          lesson_description: string | null;
          lesson_sort_order: number;
          unit_id: string;
          unit_name: string;
          grade_id: string;
          grade_name: string;
        }[];
      };
    };
  };
}
