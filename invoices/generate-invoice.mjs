// فاتورة مستحقات المنصة — توليد محلي فقط (داخل فولدر invoices/).
// نفس هوية كشف الطلاب الشامل (reports/students-full-*.pdf):
// هيدر رسمي + كروت ملخص + ملخص صفوف + جداول مقسمة حسب الصف + فوتر سري.
// الهواتف تظهر كاملة — الملف الناتج سري ولا يُرفع على git أبداً.
//
// الاستخدام:
//   node invoices/generate-invoice.mjs --from 2026-09-01 --to 2026-09-30
//   node invoices/generate-invoice.mjs            (يسأل تفاعلياً، الافتراضي: آخر شهر ميلادي)
//   node invoices/generate-invoice.mjs --mock     (بيانات تجريبية للتحقق من التصميم بدون قاعدة بيانات)
//   node invoices/generate-invoice.mjs --no-pdf   (HTML فقط بدون PDF)
//   node invoices/generate-invoice.mjs --no-open  (بدون فتح تلقائي في المتصفح)
//
// البيانات: تُقرأ محلياً من SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// (من .env.functions.local — لا تُطبع ولا تُحفظ في المخرجات).
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readdirSync } from "node:fs";
import {
  createServiceClient, docHeader, docShell, esc, fmt, fmtDay, fmtIssueDate,
  kpis, ltr, pill, saveReport, sec, tbl, DIR,
} from "./report-shared.mjs";

// ── قراءة args ──────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => {
    if (!a.startsWith("--")) return ["_", ""];
    const eq = a.indexOf("=");
    if (eq > 0) return [a.slice(2, eq), a.slice(eq + 1)];
    const next = arr[i + 1];
    if (next && !next.startsWith("--")) return [a.slice(2), next];
    return [a.slice(2), true];
  }).filter((e) => e[0] !== "_"),
);
const WANT_PDF = args.pdf !== false && args["no-pdf"] === undefined;
const WANT_OPEN = args.open !== false && args["no-open"] === undefined;
const MOCK = args.mock !== undefined;

// ── تحميل env محلياً (قيم المفاتيح لا تُطبع أبداً) ───────────
// (يتم عبر createServiceClient من الوحدة المشتركة)

// ── الفترة: آخر شهر ميلادي كامل كافتراضي ────────────────────
function lastCalendarMonth() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(first), to: iso(last) };
}

function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || "").trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}

async function resolvePeriod() {
  let from = args.from && args.from !== true ? String(args.from) : "";
  let to = args.to && args.to !== true ? String(args.to) : "";
  const def = lastCalendarMonth();
  if (from && to && parseDay(from) && parseDay(to)) return { from, to };
  if (input.isTTY) {
    const rl = createInterface({ input, output });
    try {
      const a = (await rl.question(`من تاريخ (YYYY-MM-DD) [${def.from}]: `)).trim();
      const b = (await rl.question(`إلى تاريخ (YYYY-MM-DD) [${def.to}]: `)).trim();
      from = a || def.from;
      to = b || def.to;
    } finally {
      rl.close();
    }
  } else {
    from = from || def.from;
    to = to || def.to;
  }
  if (!parseDay(from) || !parseDay(to)) throw new Error("تاريخ غير صحيح — الصيغة المطلوبة YYYY-MM-DD");
  if (from > to) throw new Error("تاريخ البداية بعد تاريخ النهاية");
  return { from, to };
}

// ── ترقيم مسلسل عادي: INV-YYYY-MM-NNN ────────────────────────
function nextInvoiceNumber(from) {
  const ym = from.slice(0, 7);
  const prefix = `INV-${ym}-`;
  let max = 0;
  for (const f of readdirSync(DIR)) {
    const m = f.match(/^INV-(\d{4}-\d{2})-(\d+)\.(html|pdf)$/);
    if (m && m[1] === ym) max = Math.max(max, Number(m[2]));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

// ── المبلغ كتابةً بالعربية ──────────────────────────────────
const AR_ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة",
  "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const AR_TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const AR_HUND = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
function threeAr(n) {
  const h = Math.floor(n / 100), r = n % 100;
  const out = [];
  if (h) out.push(AR_HUND[h]);
  if (r) {
    if (r < 20) out.push(AR_ONES[r]);
    else {
      const t = Math.floor(r / 10), o = r % 10;
      out.push(o ? `${AR_ONES[o]} و${AR_TENS[t]}` : AR_TENS[t]);
    }
  }
  return out.join(" و");
}
function amountInWords(n) {
  n = Math.round(Number(n) || 0);
  if (n === 0) return "صفر جنيه مصري فقط لا غير";
  const parts = [];
  const m = Math.floor(n / 1000000), k = Math.floor((n % 1000000) / 1000), rest = n % 1000;
  if (m) parts.push(`${threeAr(m)} مليون${m > 2 ? "اً" : ""}`);
  if (k === 1) parts.push("ألف");
  else if (k === 2) parts.push("ألفان");
  else if (k) parts.push(`${threeAr(k)} آلاف`);
  if (rest) parts.push(threeAr(rest));
  return `${parts.join(" و")} جنيه مصري فقط لا غير`;
}

// ── سحب البيانات ────────────────────────────────────────────
async function fetchPurchases(sb, from, to) {
  const fromIso = new Date(`${from}T00:00:00`).toISOString();
  const toIso = new Date(`${to}T23:59:59.999`).toISOString();

  const rows = [];
  const PAGE = 1000;
  for (let page = 0; ; page += 1) {
    const { data, error } = await sb
      .from("unit_purchases")
      .select("id, student_id, unit_id, base_price, platform_fee, total_price, status, purchased_at")
      .eq("status", "active")
      .gte("purchased_at", fromIso)
      .lte("purchased_at", toIso)
      .order("purchased_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`تعذر قراءة المشتريات: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  if (rows.length === 0) return { rows: [], grades: [], units: new Map(), profiles: new Map() };

  const studentIds = [...new Set(rows.map((r) => r.student_id))];
  const unitIds = [...new Set(rows.map((r) => r.unit_id))];
  const profiles = new Map();
  for (let i = 0; i < studentIds.length; i += 200) {
    const { data, error } = await sb
      .from("profiles")
      .select("id, full_name, phone, guardian_phone")
      .in("id", studentIds.slice(i, i + 200));
    if (error) throw new Error(`تعذر قراءة الطلاب: ${error.message}`);
    for (const p of data ?? []) profiles.set(p.id, p);
  }
  const units = new Map();
  let grades = [];
  {
    const { data, error } = await sb.from("units").select("id, name, grade_id").in("id", unitIds);
    if (error) throw new Error(`تعذر قراءة الوحدات: ${error.message}`);
    for (const u of data ?? []) units.set(u.id, u);
    const gradeIds = [...new Set((data ?? []).map((u) => u.grade_id).filter(Boolean))];
    if (gradeIds.length) {
      const { data: g, error: gErr } = await sb.from("grades").select("id, name, sort_order").in("id", gradeIds);
      if (gErr) throw new Error(`تعذر قراءة الصفوف: ${gErr.message}`);
      grades = (g ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
  }
  return { rows, grades, units, profiles };
}

function mockData() {
  const grades = [
    { id: "g1", name: "الصف الأول بكالوريا", sort_order: 1 },
    { id: "g2", name: "الصف الثالث الثانوي", sort_order: 2 },
  ];
  const units = new Map([
    ["u1", { id: "u1", name: "الباب الأول", grade_id: "g1" }],
    ["u2", { id: "u2", name: "الباب الاول التيار الكهربي", grade_id: "g2" }],
  ]);
  const profiles = new Map([
    ["s1", { id: "s1", full_name: "طالب تجريبي للمعاينة", phone: "+201012345678", guardian_phone: "+201087654321" }],
    ["s2", { id: "s2", full_name: "اسم تجريبي ثان", phone: "+201122233344", guardian_phone: "+201155566677" }],
  ]);
  const rows = [
    { id: "m1", student_id: "s1", unit_id: "u2", base_price: 200, platform_fee: 20, total_price: 220, status: "active", purchased_at: "2026-09-05T10:00:00Z" },
    { id: "m2", student_id: "s2", unit_id: "u1", base_price: 0, platform_fee: 0, total_price: 0, status: "active", purchased_at: "2026-09-06T10:00:00Z" },
  ];
  return { rows, grades, units, profiles };
}

// ── تجهيز صفوف الفاتورة ─────────────────────────────────────
function buildInvoice(fetched) {
  const gradeById = new Map((fetched.grades ?? []).map((g) => [g.id, g]));
  const items = [];
  for (const r of fetched.rows ?? []) {
    const p = fetched.profiles.get(r.student_id) || {};
    const u = fetched.units.get(r.unit_id) || {};
    const g = gradeById.get(u.grade_id) || { id: "nog", name: "بدون صف", sort_order: 999 };
    const base = Number(r.base_price) || 0;
    const fee = Number(r.platform_fee) || 0;
    const total = Number(r.total_price ?? base + fee) || 0;
    const free = base === 0 && total === 0;
    const name = p.full_name || "—";
    const test = /test|تجريب|اختبار|chat@/i.test(name) ? 1 : 0;
    items.push({
      date: r.purchased_at,
      student: name,
      phone: p.phone || "—",
      guardian: p.guardian_phone || "—",
      unit: u.name || "—",
      gradeId: g.id,
      gradeName: g.name,
      gradeOrder: g.sort_order ?? 999,
      base, fee, total, free, test,
    });
  }
  items.sort((a, b) => a.gradeOrder - b.gradeOrder || (a.date < b.date ? -1 : 1));

  const paid = items.filter((i) => !i.free);
  const freeItems = items.filter((i) => i.free);
  const sum = (arr, k) => arr.reduce((s, i) => s + i[k], 0);
  // حصة المنصة الشائعة (أساس الملاحظات) — الغالبية العظمى 20
  const feeCounts = new Map();
  for (const i of paid) feeCounts.set(i.fee, (feeCounts.get(i.fee) || 0) + 1);
  const feePerSub = [...feeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 20;

  const byGrade = new Map();
  for (const i of items) {
    if (!byGrade.has(i.gradeId)) {
      byGrade.set(i.gradeId, { gradeId: i.gradeId, gradeName: i.gradeName, gradeOrder: i.gradeOrder, items: [] });
    }
    byGrade.get(i.gradeId).items.push(i);
  }
  return {
    items,
    gradeSections: [...byGrade.values()].sort((a, b) => a.gradeOrder - b.gradeOrder),
    paidCount: paid.length,
    freeCount: freeItems.length,
    baseTotal: sum(items, "base"),
    feeTotal: sum(items, "fee"),
    grandTotal: sum(items, "total"),
    feePerSub,
  };
}

// ── القالب الاحترافي v2 (الهوية الموحدة) ────────────────────
function renderBody(inv) {
  const sections = inv.data.gradeSections.map((sec) => {
    const paid = sec.items.filter((i) => !i.free).length;
    const free = sec.items.length - paid;
    const fee = sec.items.reduce((s, i) => s + i.fee, 0);
    const rows = sec.items.map((r, idx) => {
      const tag = r.test ? ` ${pill("اختبار", "mute")}` : "";
      const freeTag = r.free ? ` ${pill("مجاني", "warn")}` : "";
      const cls = r.free ? ` class="hl"` : "";
      return `<tr${cls}><td>${idx + 1}</td><td>${fmtDay(r.date)}</td><td><b>${esc(r.student)}</b>${tag}${freeTag}</td><td>${ltr(esc(r.phone))}</td><td>${ltr(esc(r.guardian))}</td><td>${esc(r.unit)}</td><td>${fmt(r.base)}</td><td><b>${fmt(r.fee)}</b></td><td><b>${fmt(r.total)}</b></td></tr>`;
    }).join("\n");
    const foot = `<tr><td colspan="6">إجمالي الصف</td><td>${fmt(sec.items.reduce((s, i) => s + i.base, 0))}</td><td>${fmt(fee)}</td><td>${fmt(sec.items.reduce((s, i) => s + i.total, 0))}</td></tr>`;
    return `<div class="avoid"><h2 class="gsec">${sec.items.length} ${sec.items.length === 1 ? "اشتراك" : "اشتراكًا"} — ${esc(sec.gradeName)}</h2>
${tbl(["م", "التاريخ", "الطالب", "الهاتف", "هاتف ولي الأمر", "الوحدة", "الأساسي", "المنصة", "الإجمالي"], rows, foot)}
<p class="sec-sum">مدفوع: <b>${paid}</b> • مجاني: <b>${free}</b> • حصة المنصة: <b>${fmt(fee)} ج.م</b></p></div>`;
  }).join("\n");

  const gradeRows = inv.data.gradeSections.map((sec) => {
    const paid = sec.items.filter((i) => !i.free).length;
    const free = sec.items.length - paid;
    const base = sec.items.reduce((s, i) => s + i.base, 0);
    const fee = sec.items.reduce((s, i) => s + i.fee, 0);
    const total = sec.items.reduce((s, i) => s + i.total, 0);
    return `<tr><td><b>${esc(sec.gradeName)}</b></td><td>${sec.items.length}</td><td>${paid}</td><td>${free}</td><td>${fmt(base)}</td><td>${fmt(fee)}</td><td><b>${fmt(total)}</b></td></tr>`;
  }).join("\n") || `<tr><td colspan="7">لا توجد مشتريات في هذه الفترة</td></tr>`;
  const gradeFoot = inv.data.gradeSections.length
    ? `<tr><td>الإجمالي</td><td>${inv.data.items.length}</td><td>${inv.data.paidCount}</td><td>${inv.data.freeCount}</td><td>${fmt(inv.data.baseTotal)}</td><td>${fmt(inv.data.feeTotal)}</td><td>${fmt(inv.data.grandTotal)}</td></tr>` : "";

  return `
${docHeader({ doc: "فاتورة مستحقات المنصة", sub: "كشف رسمي بالمشتريات خلال الفترة — مقسم حسب الصفوف الدراسية، مع بيانات التواصل الكاملة.", number: inv.number, meta: [["الفترة المشمولة", `${inv.fromAr} — ${inv.toAr}`], ["تاريخ الإصدار", inv.issueDate], ["العملة", "جنيه مصري (ج.م)"]] })}
${kpis([
    { v: inv.data.paidCount, l: "اشتراك مدفوع", tone: "teal" },
    { v: fmt(inv.data.baseTotal), l: "إجمالي الأساسي (ج.م)", tone: "navy", s: "نصيب المدرس" },
    { v: `${fmt(inv.data.feeTotal)} ج.م`, l: "حصة المنصة المستحقة", hero: true },
    { v: fmt(inv.data.grandTotal), l: "إجمالي المحصّل (ج.م)", tone: "navy" },
    { v: inv.data.freeCount, l: "اشتراك مجاني", tone: "gold", s: "مستبعد من الحسبة" },
  ])}
${sec("الملخص حسب الصف")}
${tbl(["الصف", "الاشتراكات", "مدفوع", "مجاني", "الأساسي", "حصة المنصة", "الإجمالي"], gradeRows, gradeFoot)}
${sec("الكشف التفصيلي بالاشتراكات")}
${sections || "<p>لا توجد مشتريات في هذه الفترة.</p>"}
<div class="words"><strong>المستحق للمنصة كتابةً:</strong> ${inv.words} (${fmt(inv.data.feeTotal)} ج.م).</div>
${sec("تعليمات الفاتورة")}
<div class="notes"><ol>
<li>حصة المنصة ${fmt(inv.data.feePerSub)} جنيهًا عن كل اشتراك مدفوع، بإجمالي ${inv.data.paidCount} ${inv.data.paidCount === 1 ? "اشتراك" : "اشتراكًا"} خلال الفترة المشمولة.</li>
<li>الاشتراكات المجانية معروضة للشفافية ومستبعدة من حساب حصة المنصة.</li>
<li>الشارات المميزة لحسابات الاختبار الداخلية — تُراجع مع الإدارة قبل الاعتماد النهائي.</li>
<li>أرقام الهواتف ظاهرة كاملة — هذا الملف سري ومخصص للإدارة فقط ويُحظر تداوله خارجها.</li>
</ol></div>
<div class="sign"><div class="box"><b>إدارة المنصة</b><div class="line">الاسم / التوقيع / الختم</div></div><div class="box"><b>مستر وليد عوني (بالاعتماد)</b><div class="line">الاسم / التوقيع / التاريخ</div></div></div>
<div class="final"><strong>ملاحظات ختامية:</strong> صدرت هذه الفاتورة آلياً من قاعدة بيانات المنصة بتاريخ ${inv.issueDate} بتوقيت القاهرة. إجمالي السجلات: ${inv.data.items.length} ${inv.data.items.length === 1 ? "اشتراك" : "اشتراكًا"} — مدفوع ${inv.data.paidCount} • مجاني ${inv.data.freeCount}. يُحظر تداول هذا الملف خارج الإدارة لاحتوائه على بيانات شخصية (أسماء وهواتف).</div>`;
}

// ── التشغيل ─────────────────────────────────────────────────
async function main() {
  const { from, to } = await resolvePeriod();
  const number = nextInvoiceNumber(from);
  console.log(`الفترة: ${from} — ${to}`);
  console.log(`رقم الفاتورة: ${number}`);

  let fetched;
  if (MOCK) {
    console.log("وضع المعاينة: بيانات تجريبية (بدون قاعدة بيانات).");
    fetched = mockData();
  } else {
    fetched = await fetchPurchases(await createServiceClient(), from, to);
  }
  const data = buildInvoice(fetched);
  console.log(`الاشتراكات: ${data.items.length} (مدفوع ${data.paidCount} • مجاني ${data.freeCount}) — حصة المنصة ${fmt(data.feeTotal)} ج.م`);

  const arFmt = new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" });
  const inv = {
    number, from, to,
    fromAr: arFmt.format(parseDay(from)),
    toAr: arFmt.format(parseDay(to)),
    issueDate: fmtIssueDate(),
    data,
    words: amountInWords(data.feeTotal),
  };
  saveReport(number, docShell(`فاتورة ${number} — منصة وليد عوني`, renderBody(inv)), { pdf: WANT_PDF, open: WANT_OPEN });
}

main().catch((e) => {
  console.error(`خطأ: ${e.message || e}`);
  process.exit(1);
});
