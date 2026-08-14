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

export type SubscriptionStatus = 'active' | 'expired';

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

export type VideoStatus =
  'pending_upload' | 'uploading' | 'processing' | 'ready' | 'failed' | 'replaced';

export type LessonVideo = {
  id: string;
  lesson_id: string;
  bunny_video_id: string;
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
  expires_at: string;
}

export type SubscriptionSource = 'code' | 'manual';

export type Subscription = {
  id: string;
  student_id: string;
  pricing_plan_id: string;
  base_price: number;
  platform_fee: number;
  total_price: number;
  code_id: string | null;
  source: SubscriptionSource;
  started_at: string;
  expires_at: string;
  status: SubscriptionStatus;
  created_at: string;
};

export type PricingPlan = {
  id: string;
  grade_id: string;
  duration_days: number;
  base_price: number;
  platform_fee: number;
  total_price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PricingPlanWithGrade = PricingPlan & {
  grade_name: string | null;
};

export type SubscriptionWithPlan = Subscription & {
  plan_label: string | null;
  grade_name: string | null;
};

export type SubscriptionCode = {
  id: string;
  code: string;
  pricing_plan_id: string;
  status: CodeStatus;
  created_by: string;
  created_at: string;
  used_at: string | null;
  used_by: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  note: string | null;
};

export type CodeWithStudent = SubscriptionCode & {
  student_name: string | null;
};

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

export type NotificationType =
  | 'subscription_activated'
  | 'subscription_expiring'
  | 'subscription_expired'
  | 'new_content'
  | 'system';

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
  expires_at: string;
}

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

export interface DashboardSubscriptionsStats {
  active: number;
  expiring_7d: number;
  expired: number;
  revenue_total: number;
  revenue_this_month: number;
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

export interface DashboardCodesStats {
  available: number;
  used: number;
  revoked: number;
}

export interface DashboardByGradeRow {
  grade_name: string;
  students: number;
  active_subscribers: number;
}

export interface DashboardRecentSubscription {
  student_name: string;
  grade_name: string | null;
  duration_days: number;
  total_price: number;
  status: SubscriptionStatus;
  started_at: string;
  expires_at: string;
}

export interface DashboardUpcomingExpiration {
  student_name: string;
  expires_at: string;
}

export interface DashboardStats {
  students: DashboardStudentsStats;
  subscriptions: DashboardSubscriptionsStats;
  content: DashboardContentStats;
  engagement: DashboardEngagementStats;
  codes: DashboardCodesStats;
  by_grade: DashboardByGradeRow[];
  recent_subscriptions: DashboardRecentSubscription[];
  upcoming_expirations: DashboardUpcomingExpiration[];
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
      lesson_videos: {
        Row: LessonVideo;
        Insert: LessonVideo;
        Update: Partial<LessonVideo>;
        Relationships: [];
      };
      pricing_plans: {
        Row: PricingPlan;
        Insert: PricingPlan;
        Update: Partial<PricingPlan>;
        Relationships: [];
      };
      subscriptions: {
        Row: Subscription;
        Insert: Subscription;
        Update: Partial<Subscription>;
        Relationships: [];
      };
      subscription_codes: {
        Row: SubscriptionCode;
        Insert: SubscriptionCode;
        Update: Partial<SubscriptionCode>;
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
      redeem_subscription_code: { Args: { p_code: string }; Returns: string };
      get_my_subscriptions: { Args: never; Returns: Subscription[] };
      get_my_current_subscription: { Args: never; Returns: Subscription };
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
      create_lesson: {
        Args: {
          p_unit_id: string;
          p_title: string;
          p_description?: string | null;
          p_sort_order?: number;
        };
        Returns: string;
      };
      update_lesson: {
        Args: {
          p_lesson_id: string;
          p_title: string | null;
          p_description?: string | null;
          p_sort_order?: number | null;
        };
        Returns: void;
      };
      publish_lesson: { Args: { p_lesson_id: string }; Returns: void };
      hide_lesson: { Args: { p_lesson_id: string }; Returns: void };
      soft_delete_lesson: { Args: { p_lesson_id: string }; Returns: void };
      restore_lesson: { Args: { p_lesson_id: string }; Returns: void };
      finalize_pdf_upload: { Args: { p_pdf_id: string }; Returns: void };
      update_grade: {
        Args: { p_grade_id: string; p_name?: string | null; p_sort_order?: number | null };
        Returns: void;
      };
      delete_grade: { Args: { p_grade_id: string }; Returns: void };
      restore_grade: { Args: { p_grade_id: string }; Returns: void };
      set_pricing_plan: {
        Args: {
          p_grade_id: string;
          p_duration_days: number;
          p_base_price: number;
          p_platform_fee: number;
          p_is_active?: boolean;
        };
        Returns: string;
      };
      delete_pricing_plan: { Args: { p_plan_id: string }; Returns: void };
      revoke_subscription_code: { Args: { p_code_id: string }; Returns: void };
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
    };
  };
}
