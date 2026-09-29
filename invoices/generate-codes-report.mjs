// تقرير الأكواد — ملخص + تفصيلي مقسم حسب الوحدة (محلي فقط).
// سرية قصوى: يحتوي أكواد تفعيل صالحة — لا يُرفع على git أبداً.
//
// الاستخدام:
//   node invoices/generate-codes-report.mjs [--no-pdf] [--no-open]
import {
  createServiceClient, docHeader, docShell, esc, fmt, fmtDay, fmtIssueDate,
  kpis, nextNumber, pill, saveReport, sec, tbl,
} from "./report-shared.mjs";

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
const WANT_PDF = args["no-pdf"] === undefined;
const WANT_OPEN = args["no-open"] === undefined;

async function fetchAll(sb, table, select, orderCol = "created_at") {
  const rows = [];
  const PAGE = 1000;
  for (let page = 0; ; page += 1) {
    const { data, error } = await sb.from(table).select(select).order(orderCol, { ascending: true }).range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`تعذر قراءة ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  const sb = await createServiceClient();
  const [pricing, units, grades, codes, profiles, purchases] = await Promise.all([
    fetchAll(sb, "unit_pricing", "id, unit_id, base_price, platform_fee, total_price, is_active"),
    fetchAll(sb, "units", "id, name, grade_id"),
    fetchAll(sb, "grades", "id, name, sort_order"),
    fetchAll(sb, "unit_codes", "id, code, unit_pricing_id, status, created_at, used_at, used_by, revoked_at, note"),
    fetchAll(sb, "profiles", "id, full_name"),
    sb.from("unit_purchases").select("code_id, unit_id, total_price").eq("status", "active").then(({ data, error }) => {
      if (error) throw new Error(`تعذر قراءة المشتريات: ${error.message}`);
      return data ?? [];
    }),
  ]);

  const priceById = new Map(pricing.map((p) => [p.id, p]));
  const unitById = new Map(units.map((u) => [u.id, u]));
  const gradeById = new Map(grades.map((g) => [g.id, g]));
  const nameById = new Map(profiles.map((p) => [p.id, p.full_name]));
  const collectedByCode = new Map();
  for (const pur of purchases) {
    if (pur.code_id) collectedByCode.set(pur.code_id, Number(pur.total_price) || 0);
  }

  // تجميع حسب الوحدة
  const byUnit = new Map();
  for (const c of codes) {
    const pr = priceById.get(c.unit_pricing_id);
    if (!pr) continue;
    const u = unitById.get(pr.unit_id) || { id: pr.unit_id, name: "وحدة محذوفة", grade_id: null };
    const g = (u.grade_id && gradeById.get(u.grade_id)) || { id: "nog", name: "بدون صف", sort_order: 999 };
    if (!byUnit.has(u.id)) {
      byUnit.set(u.id, {
        unitId: u.id, unitName: u.name, gradeId: g.id, gradeName: g.name,
        gradeOrder: g.sort_order ?? 999, totalPrice: Number(pr.total_price) || 0, codes: [],
      });
    }
    byUnit.get(u.id).codes.push({
      code: c.code, status: c.status,
      user: c.used_by ? (nameById.get(c.used_by) || "—") : "—",
      created: c.created_at, usedAt: c.used_at, note: c.note || "—",
      collected: collectedByCode.get(c.id) || 0,
    });
  }
  const sections = [...byUnit.values()].sort((a, b) => a.gradeOrder - b.gradeOrder || (a.unitName < b.unitName ? -1 : 1));
  for (const s of sections) {
    s.available = s.codes.filter((c) => c.status === "available").length;
    s.used = s.codes.filter((c) => c.status === "used").length;
    s.revoked = s.codes.filter((c) => c.status === "revoked").length;
    s.pending = s.available * s.totalPrice;
    s.collected = s.codes.reduce((t, c) => t + c.collected, 0);
  }

  const tot = (k) => sections.reduce((s, x) => s + x[k], 0);
  const totalCodes = sections.reduce((s, x) => s + x.codes.length, 0);
  console.log(`الوحدات: ${sections.length} — أكواد: ${totalCodes} (متاح ${tot("available")} • مستخدم ${tot("used")} • ملغي ${tot("revoked")})`);

  const number = nextNumber("CODES");
  const issueDate = fmtIssueDate();

  const summaryRows = sections.map((s) =>
    `<tr><td>${esc(s.gradeName)}</td><td><b>${esc(s.unitName)}</b></td><td>${s.codes.length}</td><td>${pill(String(s.available), "ok")}</td><td>${pill(String(s.used), "info")}</td><td>${pill(String(s.revoked), "bad")}</td><td>${fmt(s.pending)}</td><td><b>${fmt(s.collected)}</b></td></tr>`
  ).join("\n") || `<tr><td colspan="8">لا توجد أكواد مسجلة</td></tr>`;

  const summaryFoot = sections.length
    ? `<tr><td colspan="2">الإجمالي</td><td>${totalCodes}</td><td>${tot("available")}</td><td>${tot("used")}</td><td>${tot("revoked")}</td><td>${fmt(sections.reduce((s, x) => s + x.pending, 0))}</td><td>${fmt(sections.reduce((s, x) => s + x.collected, 0))}</td></tr>` : "";

  const detail = sections.map((s) => {
    const rows = s.codes.map((c, i) => {
      const badge = c.status === "available" ? pill("متاح", "ok") : c.status === "used" ? pill("مستخدم", "info") : pill("ملغي", "bad");
      const cls = c.status === "available" ? "" : c.status === "used" ? ` class="hl"` : ` class="struck"`;
      return `<tr${cls}><td>${i + 1}</td><td><span class="code">${esc(c.code)}</span></td><td>${badge}</td><td>${esc(c.user)}</td><td>${fmtDay(c.created)}</td><td>${c.usedAt ? fmtDay(c.usedAt) : "—"}</td><td>${esc(c.note)}</td></tr>`;
    }).join("\n");
    return `<div class="avoid"><h2 class="gsec">${s.codes.length} ${s.codes.length === 1 ? "كود" : "أكواد"} — ${esc(s.unitName)} <small>(${esc(s.gradeName)} • سعر الوحدة ${fmt(s.totalPrice)} ج.م)</small></h2>
${tbl(["م", "الكود", "الحالة", "المستخدم", "الإنشاء", "الاستخدام", "ملاحظة"], rows)}
<p class="sec-sum">متاح: <b>${s.available}</b> • مستخدم: <b>${s.used}</b> • ملغي: <b>${s.revoked}</b> • إيراد متوقع من المتاح: <b>${fmt(s.pending)} ج.م</b> • محصّل فعلي: <b>${fmt(s.collected)} ج.م</b></p></div>`;
  }).join("\n");

  const body = `
${docHeader({ doc: "تقرير أكواد الوحدات", sub: "ملخص المخزون + الكشف التفصيلي لكل كود مقسماً حسب الوحدة.", number, meta: [["تاريخ الإصدار", issueDate], ["الوحدات", String(sections.length)], ["العملة", "جنيه مصري (ج.م)"]] })}
${kpis([
    { v: totalCodes, l: "إجمالي الأكواد", tone: "navy" },
    { v: tot("available"), l: "متاح", tone: "ok" },
    { v: tot("used"), l: "مستخدم", tone: "teal" },
    { v: `${fmt(sections.reduce((s, x) => s + x.pending, 0))} ج.م`, l: "إيراد متوقع (المتاح)", tone: "gold" },
    { v: `${fmt(sections.reduce((s, x) => s + x.collected, 0))} ج.م`, l: "محصّل فعلي من الأكواد", hero: true },
    { v: tot("revoked"), l: "ملغي", tone: "bad" },
  ])}
${sec("الملخص حسب الوحدة")}
${tbl(["الصف", "الوحدة", "الأكواد", "متاح", "مستخدم", "ملغي", "المتوقع (ج.م)", "المحصّل (ج.م)"], summaryRows, summaryFoot)}
${sec("الكشف التفصيلي للأكواد")}
${detail || "<p>لا توجد أكواد.</p>"}
<div class="notes"><strong>ملاحظات:</strong><ol>
<li>المتوقع = عدد الأكواد المتاحة × سعر الوحدة الحالي.</li>
<li>المحصّل = إجمالي المشتريات المرتبطة بالأكواد المستخدمة (من سجل المشتريات).</li>
<li>هذا الملف يحتوي أكواد تفعيل صالحة — سري للغاية ومخصص للإدارة فقط ويُحظر تداوله أو تصويره.</li>
</ol></div>
<div class="final"><strong>ملاحظات ختامية:</strong> صدر هذا التقرير آلياً من قاعدة بيانات المنصة بتاريخ ${issueDate} بتوقيت القاهرة. إجمالي الأكواد: ${totalCodes} — متاح ${tot("available")} • مستخدم ${tot("used")} • ملغي ${tot("revoked")}.</div>`;

  saveReport(number, docShell(`تقرير الأكواد ${number} — منصة وليد عوني`, body), { pdf: WANT_PDF, open: WANT_OPEN });
}

main().catch((e) => {
  console.error(`خطأ: ${e.message || e}`);
  process.exit(1);
});
