import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { fetchActiveAnnouncement, type Announcement } from '../lib/announcements';
import { ADMIN_DEFAULT_SIGNATURE } from '../lib/announcements';
import { safeJsonParseObject, safeSetJson } from '../lib/safeStorage';
import { AdModalShell, getAdDesign, type AdContent } from './ads';

const DISMISS_KEY = 'announcement-dismissed';

interface AnnouncementModalProps {
  /** معرّف التصميم من سجل الـ20 — الافتراضي: الترويسة المتدرجة */
  designId?: string;
  showSignature?: boolean;
}

/**
 * العرض الرسمي للإعلانات داخل Modal احترافي.
 * - نفس منطق AnnouncementBanner: استهداف المسار + الجدولة + التخزين المحلي للإخفاء
 * - التصميم الافتراضي: الترويسة المتدرجة (gradient-header)
 * - الإعلان غير القابل للإخفاء: يُغلق دون حفظ (فيظهر مجدداً) ولا يحبس المستخدم أبداً
 */
export function AnnouncementModal({
  designId = 'gradient-header',
  showSignature = true,
}: AnnouncementModalProps) {
  const location = useLocation();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(() =>
    safeJsonParseObject<Record<string, boolean>>(DISMISS_KEY, {}),
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setOpen(false);
    fetchActiveAnnouncement(location.pathname)
      .then((ann) => {
        if (!active) return;
        setAnnouncement(ann);
        if (ann) {
          const state = safeJsonParseObject<Record<string, boolean>>(DISMISS_KEY, {});
          setDismissed(state);
          if (!state[ann.id]) setOpen(true);
        }
      })
      .catch(() => {
        if (active) setAnnouncement(null);
      });
    return () => {
      active = false;
    };
  }, [location.pathname]);

  if (!announcement || !open) return null;

  const design = getAdDesign(designId) ?? getAdDesign('classic-center');
  if (!design) return null;
  const Design = design.component;

  const content: AdContent = {
    title: announcement.title,
    body: announcement.body,
    link_url: announcement.link_url,
    link_label: announcement.link_label,
    variant: announcement.variant,
    showSignature,
    signatureName: announcement.signature_name?.trim() || ADMIN_DEFAULT_SIGNATURE,
  };

  const handleClose = (persist: boolean) => {
    if (persist && announcement.dismissible) {
      const next = { ...dismissed, [announcement.id]: true };
      setDismissed(next);
      safeSetJson(DISMISS_KEY, next);
    }
    setOpen(false);
  };

  return (
    <AdModalShell
      open={open}
      onClose={() => handleClose(true)}
      placement={design.placement}
      size={design.size}
      label={announcement.title}
      dismissible={announcement.dismissible}
      testId="announcement-modal"
    >
      <Design content={content} onClose={() => handleClose(false)} />
    </AdModalShell>
  );
}
