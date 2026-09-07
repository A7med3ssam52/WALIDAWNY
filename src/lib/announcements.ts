import { getSupabaseClient } from './supabase';

export type AnnouncementVariant = 'info' | 'warning' | 'success' | 'error';
export type UserRole = 'student' | 'teacher' | 'mr_walid' | 'admin';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  link_url: string | null;
  link_label: string | null;
  variant: AnnouncementVariant;
  target_roles: UserRole[];
  hide_on_paths: string[];
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  dismissible: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  link_url?: string | null;
  link_label?: string | null;
  variant?: AnnouncementVariant;
  target_roles?: UserRole[];
  hide_on_paths?: string[];
  starts_at?: string;
  ends_at?: string | null;
  is_active?: boolean;
  dismissible?: boolean;
}

export interface UpdateAnnouncementInput {
  title?: string;
  body?: string;
  link_url?: string | null;
  link_label?: string | null;
  variant?: AnnouncementVariant;
  target_roles?: UserRole[];
  hide_on_paths?: string[];
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean;
  dismissible?: boolean;
}

const VARIANT_LABELS: Record<AnnouncementVariant, string> = {
  info: 'معلومات',
  warning: 'تحذير',
  success: 'نجاح',
  error: 'خطأ',
};

const ROLE_LABELS: Record<UserRole, string> = {
  student: 'طالب',
  teacher: 'مدرس',
  mr_walid: 'الأستاذ وليد',
  admin: 'مشرف',
};

export function getVariantLabel(variant: AnnouncementVariant): string {
  return VARIANT_LABELS[variant] ?? variant;
}

export function getRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

export async function fetchActiveAnnouncement(currentPath: string): Promise<Announcement | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await (supabase as any).rpc('get_active_announcements', {
      p_current_path: currentPath,
    });
    if (error) {
      // 404 = function not yet deployed (migration 0049 not on prod) — treat as no banner
      const code = String((error as { code?: unknown })?.code ?? '').toLowerCase();
      const msg = String((error as { message?: unknown })?.message ?? '').toLowerCase();
      if (code === '42883' || code === 'pgrst202' || msg.includes('could not find the function')) {
        return null;
      }
      return null;
    }
    if (!data?.length) return null;
    return data[0] as Announcement;
  } catch {
    return null;
  }
}

export async function listAnnouncements(limit = 50, offset = 0): Promise<Announcement[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await (supabase as any).rpc('list_announcements', {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as Announcement[];
}

export async function getAnnouncementById(id: string): Promise<Announcement> {
  const supabase = getSupabaseClient();
  const { data, error } = await (supabase as any).rpc('get_announcement_by_id', {
    p_id: id,
  });
  if (error) throw error;
  return data as Announcement;
}

export async function createAnnouncement(input: CreateAnnouncementInput): Promise<Announcement> {
  const supabase = getSupabaseClient();
  const { data, error } = await (supabase as any).rpc('create_announcement', {
    p_title: input.title,
    p_body: input.body,
    p_link_url: input.link_url ?? null,
    p_link_label: input.link_label ?? null,
    p_variant: input.variant ?? 'info',
    p_target_roles: input.target_roles ?? ['student', 'teacher', 'mr_walid', 'admin'],
    p_hide_on_paths: input.hide_on_paths ?? [],
    p_starts_at: input.starts_at ?? new Date().toISOString(),
    p_ends_at: input.ends_at ?? null,
    p_is_active: input.is_active ?? true,
    p_dismissible: input.dismissible ?? true,
  });
  if (error) throw error;
  return data as Announcement;
}

export async function updateAnnouncement(id: string, input: UpdateAnnouncementInput): Promise<Announcement> {
  const supabase = getSupabaseClient();
  const { data, error } = await (supabase as any).rpc('update_announcement', {
    p_id: id,
    p_title: input.title ?? null,
    p_body: input.body ?? null,
    p_link_url: input.link_url ?? null,
    p_link_label: input.link_label ?? null,
    p_variant: input.variant ?? null,
    p_target_roles: input.target_roles ?? null,
    p_hide_on_paths: input.hide_on_paths ?? null,
    p_starts_at: input.starts_at ?? null,
    p_ends_at: input.ends_at ?? null,
    p_is_active: input.is_active ?? null,
    p_dismissible: input.dismissible ?? null,
  });
  if (error) throw error;
  return data as Announcement;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await (supabase as any).rpc('delete_announcement', {
    p_id: id,
  });
  if (error) throw error;
}