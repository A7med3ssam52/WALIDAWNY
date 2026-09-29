import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Clock, MapPin, Mail } from 'lucide-react';

import { Breadcrumbs } from '../../components/Breadcrumbs';
import { SeoHead } from '../../components/SeoHead';
import { getPublicSettings } from '../../data/rpc';
import { buildWhatsAppLink } from '../../lib/format';
import { SEO, SITE_URL } from '../../lib/seo';
import type { PublicSettings } from '../../types/database';
import { WhatsAppIcon } from '../../components/WhatsAppIcon';

export function ContactPage() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);

  useEffect(() => {
    void getPublicSettings()
      .then(setSettings)
      .catch(() => setSettings(null));
  }, []);

  const whatsappHref =
    settings?.whatsapp_number
      ? buildWhatsAppLink(settings.whatsapp_number, settings.whatsapp_default_message ?? 'مرحباً أستاذ وليد، أريد الاستفسار عن المنصة')
      : null;

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <SeoHead
        title={SEO.contact.title}
        description={SEO.contact.description}
        keywords={SEO.contact.keywords}
        canonicalPath="/contact"
        breadcrumbs={[{ name: 'تواصل', url: `${SITE_URL}/contact` }]}
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
        <Breadcrumbs items={[{ name: 'تواصل', url: `${SITE_URL}/contact` }]} className="mb-6" />

        <header className="text-center">
          <h1 className="font-display text-3xl font-extrabold text-foreground sm:text-5xl">تواصل معنا</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-foreground-muted">
            فريق وليد عونى جاهز للرد على استفسارات التفعيل والمنهج — تواصل عبر واتساب للرد السريع خلال ساعات العمل.
          </p>
        </header>

        <section className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="health-dark-card rounded-[20px] p-6 text-center">
            <span className="health-lime-card mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl">
              <MessageCircle className="h-5 w-5" />
            </span>
            <h2 className="mt-2 font-display text-sm font-bold">واتساب مباشر</h2>
            <p className="mt-1 text-sm text-white/80">رد خلال دقائق في ساعات العمل</p>
            {whatsappHref ? (
              <a href={whatsappHref} target="_blank" rel="noreferrer" className="btn-primary mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold">
                <WhatsAppIcon className="h-4 w-4" /> فتح واتساب
              </a>
            ) : (
              <p className="mt-3 text-xs text-white/60">رقم التواصل غير متاح حالياً — حاول لاحقاً</p>
            )}
          </div>
          <div className="glass-card p-6 text-center">
            <span className="card-chip mx-auto inline-flex h-11 w-11 items-center justify-center">
              <Clock className="h-5 w-5" />
            </span>
            <h2 className="mt-2 font-display text-sm font-bold text-foreground">ساعات العمل</h2>
            <p className="mt-1 text-sm text-foreground-muted">يومياً من 10 صباحاً حتى 10 مساءً بتوقيت القاهرة</p>
            <p className="mt-2 text-xs text-foreground-subtle">خارج هذه الساعات نرد في أقرب وقت ممكن</p>
          </div>
          <div className="glass-card p-6 text-center">
            <span className="card-chip mx-auto inline-flex h-11 w-11 items-center justify-center">
              <MapPin className="h-5 w-5" />
            </span>
            <h2 className="mt-2 font-display text-sm font-bold text-foreground">العنوان</h2>
            <p className="mt-1 text-sm text-foreground-muted">القاهرة، مصر — منصة رقمية متاحة لكل المحافظات</p>
            <p className="mt-2 text-xs text-foreground-subtle">لا يوجد مقر حضوري — كل الخدمات أونلاين عبر المنصة وواتساب</p>
          </div>
        </section>

        <section className="glass-card mt-8 p-6 sm:p-8">
          <h2 className="font-display text-lg font-bold text-foreground">NAP — معلومات التواصل الثابتة</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-foreground-muted">
            <li className="flex gap-2"><span className="font-bold text-foreground">الاسم:</span> وليد عونى — WALIDAWNY</li>
            <li className="flex gap-2"><span className="font-bold text-foreground">المنصة:</span> https://walidawny.com</li>
            <li className="flex gap-2"><Mail className="h-4 w-4 shrink-0 text-primary-strong" /> الدعم عبر واتساب المباشر في كل صفحة</li>
            <li className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-primary-strong" /> مصر — القاهرة (خدمة أونلاين كاملة)</li>
          </ul>
          <p className="mt-3 text-xs text-foreground-subtle">
            هذه البيانات تستخدم أيضاً في Structured Data (Organization + ContactPoint) لمساعدة Google على فهم الكيان المحلي.
          </p>
        </section>

        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link to="/faq" className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-surface px-6 text-sm font-bold text-foreground hover:border-primary/50">الأسئلة الشائعة</Link>
          <Link to="/how-it-works" className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-surface px-6 text-sm font-bold text-foreground hover:border-primary/50">كيف أبدأ؟</Link>
        </div>
      </div>
    </div>
  );
}
