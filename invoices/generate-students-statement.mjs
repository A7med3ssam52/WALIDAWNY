// البيان الشامل للطلاب — كل البيانات + آخر ظهور + النشاط (محلي فقط).
// نفس هوية كشف الطلاب: مقسم حسب الصف (نشط/موقوف/محذوف).
// الهواتف والبيانات كاملة — الملف سري ولا يُرفع على git أبداً.
//
// الاستخدام:
//   node invoices/generate-students-statement.mjs [--no-pdf] [--no-open]
import {
  createServiceClient, docHeader, docShell, esc, fmtDay, fmtIssueDate,
  kpis, ltr, nextNumber, pill, saveReport, sec, tbl,
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
const INACTIVE_DAYS = 7;

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

async function fetchAuthUsers(sb) {
  const map = new Map();
  let page = 1;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`تعذر قراءة سجلات الدخول: ${error.message}`);
    for (const u of data?.users ?? []) map.set(u.id, { email: u.email || "—", lastSignIn: u.last_sign_in_at || null });
    if (!data?.users || data.users.length < 200) break;
    page += 1;
  }
  return map;
}

function daysAgo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.floor(ms / 86400000);
}

async function main() {
  const sb = await createServiceClient();
  const [profiles, grades, units, purchases, sessions, progress, attempts, authMap] = await Promise.all([
    fetchAll(sb, "profiles", "id, full_name, phone, guardian_phone, address, grade_id, status, deleted_at, created_at").then((r) => r.filter((p) => true)),
    fetchAll(sb, "grades", "id, name, sort_order"),
    fetchAll(sb, "units", "id, name"),
    sb.from("unit_purchases").select("student_id, unit_id, total_price, purchased_at").eq("status", "active").then(({ data, error }) => {
      if (error) throw new Error(`تعذر قراءة المشتريات: ${error.message}`);
      return data ?? [];
    }),
    fetchAll(sb, "student_sessions", "student_id, started_at, last_seen_at, ended_at", "started_at"),
    fetchAll(sb, "progress", "student_id, is_completed, percent_completed", "student_id"),
    fetchAll(sb, "exam_attempts", "student_id", "student_id"),
    fetchAuthUsers(sb),
  ]);

  const students = profiles.filter((p) => true);
  const gradeById = new Map(grades.map((g) => [g.id, g]));
  const unitById = new Map(units.map((u) => [u.id, u.name]));

  const purchByStudent = new Map();
  for (const pur of purchases) {
    if (!purchByStudent.has(pur.student_id)) purchByStudent.set(pur.student_id, []);
    purchByStudent.get(pur.student_id).push(pur);
  }
  const sessByStudent = new Map();
  for (const s of sessions) {
    if (!sessByStudent.has(s.student_id)) sessByStudent.set(s.student_id, { count: 0, seconds: 0, last: null });
    const a = sessByStudent.get(s.student_id);
    a.count += 1;
    const end = s.ended_at || s.last_seen_at || s.started_at;
    const sec = Math.max(0, (new Date(end) - new Date(s.started_at)) / 1000);
    if (!Number.isNaN(sec)) a.seconds += sec;
    if (s.last_seen_at && (!a.last || s.last_seen_at > a.last)) a.last = s.last_seen_at;
  }
  const progByStudent = new Map();
  for (const pr of progress) {
    if (!progByStudent.has(pr.student_id)) progByStudent.set(pr.student_id, { total: 0, done: 0, sum: 0 });
    const a = progByStudent.get(pr.student_id);
    a.total += 1;
    if (pr.is_completed) a.done += 1;
    a.sum += Number(pr.percent_completed) || 0;
  }
  const examsByStudent = new Map();
  for (const at of attempts) examsByStudent.set(at.student_id, (examsByStudent.get(at.student_id) || 0) + 1);

  // تجميع حسب الصف — الأقدم تسجيلاً أولاً (مثل الكشف)
  const byGrade = new Map();
  for (const p of students) {
    const g = (p.grade_id && gradeById.get(p.grade_id)) || { id: "nog", name: "بدون صف", sort_order: 999 };
    if (!byGrade.has(g.id)) byGrade.set(g.id, { gradeId: g.id, gradeName: g.name, gradeOrder: g.sort_order ?? 999, items: [] });
    const auth = authMap.get(p.id) || { email: "—", lastSignIn: null };
    const purs = purchByStudent.get(p.id) || [];
    const sess = sessByStudent.get(p.id) || { count: 0, seconds: 0, last: null };
    const prog = progByStudent.get(p.id) || { total: 0, done: 0, sum: 0 };
    const lastSeen = [sess.last, auth.lastSignIn].filter(Boolean).sort().pop() || null;
    const ago = daysAgo(lastSeen);
    const deleted = Boolean(p.deleted_at);
    byGrade.get(g.id).items.push({
      name: p.full_name, phone: p.phone, guardian: p.guardian_phone, address: p.address,
      email: auth.email, deleted,
      status: deleted ? "محذوف" : p.status === "active" ? "نشط" : "موقوف",
      created: p.created_at,
      purch: purs.map((x) => unitById.get(x.unit_id) || "—"),
      spent: purs.reduce((s, x) => s + (Number(x.total_price) || 0), 0),
      lastSeen, ago, neverSeen: !lastSeen, inactive: ago !== null && ago >= INACTIVE_DAYS,
      sessions: sess.count, hours: Math.round((sess.seconds / 3600) * 10) / 10,
      done: prog.done, avg: prog.total ? Math.round(prog.sum / prog.total) : 0,
      exams: examsByStudent.get(p.id) || 0,
    });
  }
  const sections = [...byGrade.values()].sort((a, b) => a.gradeOrder - b.gradeOrder);
  for (const s of sections) s.items.sort((a, b) => (a.created < b.created ? -1 : 1));

  const all = sections.flatMap((s) => s.items);
  const c = (f) => all.filter(f).length;
  const nActive = c((i) => !i.deleted && i.status === "نشط");
  const nDisabled = c((i) => !i.deleted && i.status !== "نشط");
  const nDeleted = c((i) => i.deleted);
  const nPurch = c((i) => i.purch.length > 0);
  const nInactive = c((i) => i.neverSeen || i.inactive);
  console.log(`الطلاب: ${all.length} (نشط ${nActive} • موقوف ${nDisabled} • محذوف ${nDeleted} • لديهم اشتراك ${nPurch} • خامل ${INACTIVE_DAYS}+ أيام ${nInactive})`);

  const number = nextNumber("STMT");
  const issueDate = fmtIssueDate();

  const lastSeenCell = (i) => {
    if (i.neverSeen) return pill("لم يظهر بعد", "mute");
    const d = daysAgo(i.lastSeen);
    const label = d === 0 ? "اليوم" : d === 1 ? "أمس" : `منذ ${d} يوم`;
    const tone = i.inactive ? "warn" : "ok";
    return `${fmtDay(i.lastSeen)} ${pill(label + (i.inactive ? " • خامل" : ""), tone)}`;
  };

  const statusPill = (r) => r.deleted ? pill("محذوف", "bad") : r.status === "نشط" ? pill("نشط", "ok") : pill("موقوف", "warn");

  const detail = sections.map((sec) => {
    const rows = sec.items.map((r, idx) => {
      const cls = r.deleted ? ` class="hl"` : "";
      const purch = r.purch.length ? `${pill(String(r.purch.length), "info")} ${esc(r.purch.join("، "))}` : pill("—", "mute");
      const bar = `<span class="pbar"><i style="width:${r.avg}%"></i></span> ${r.avg}%`;
      return `<tr${cls}><td>${idx + 1}</td><td><b>${esc(r.name)}</b></td><td>${ltr(esc(r.phone))}</td><td>${ltr(esc(r.guardian))}</td><td>${esc(r.address)}</td><td>${ltr(esc(r.email))}</td><td>${statusPill(r)}</td><td>${fmtDay(r.created)}</td><td>${purch}</td><td>${lastSeenCell(r)}</td><td>${r.sessions} جلسة • ${r.hours} س</td><td><b>${r.done}</b></td><td style="white-space:nowrap">${bar}</td><td><b>${r.exams}</b></td></tr>`;
    }).join("\n");
    const g = sec.items;
    const gc = (f) => g.filter(f).length;
    return `<div class="avoid"><h2 class="gsec">${g.length} ${g.length === 1 ? "طالب" : "طلاب"} — ${esc(sec.gradeName)}</h2>
${tbl(["م", "الاسم", "الهاتف", "هاتف ولي الأمر", "العنوان", "البريد الإلكتروني", "الحالة", "التسجيل", "المشتريات", "آخر ظهور", "التواجد", "مكتمل", "التقدم", "امتحانات"], rows)}
<p class="sec-sum">نشط: <b>${gc((i) => !i.deleted && i.status === "نشط")}</b> • موقوف: <b>${gc((i) => !i.deleted && i.status !== "نشط")}</b> • محذوف: <b>${gc((i) => i.deleted)}</b> • لديهم اشتراك: <b>${gc((i) => i.purch.length > 0)}</b> • لم يظهروا منذ ${INACTIVE_DAYS}+ أيام: <b>${gc((i) => i.neverSeen || i.inactive)}</b></p></div>`;
  }).join("\n");

  const body = `
${docHeader({ doc: "بيان الطلاب الشامل", sub: "جميع الطلاب المسجلين (نشط / موقوف / محذوف) — مقسم حسب الصفوف، مع بيانات التواصل والمشتريات وآخر ظهور والنشاط.", number, meta: [["تاريخ الإصدار", issueDate], ["إجمالي الطلاب", String(all.length)], ["الصفوف", String(sections.length)]] })}
${kpis([
    { v: all.length, l: "إجمالي الطلاب", tone: "navy" },
    { v: nActive, l: "نشط", tone: "ok" },
    { v: nDisabled, l: "موقوف", tone: "teal" },
    { v: nDeleted, l: "محذوف", tone: "bad" },
    { v: nPurch, l: "لديهم اشتراك", tone: "teal" },
    { v: nInactive, l: `خامل ${INACTIVE_DAYS}+ أيام`, tone: "gold" },
  ])}
${sec("تعليمات القراءة")}
<div class="notes"><ol>
<li>مرتب حسب الصف ثم الأقدم تسجيلاً. رقم م مسلسل داخل كل صف.</li>
<li>البريد الإلكتروني مأخوذ من سجلات الدخول (auth) وقت إصدار البيان.</li>
<li>آخر ظهور = أحدث جلسة تواجد على المنصة، أو آخر تسجيل دخول عند غياب الجلسات.</li>
<li>الخامل = لم يظهر منذ ${INACTIVE_DAYS} أيام أو أكثر (مرشح للمتابعة).</li>
<li>الهواتف والعناوين كما أدخلها الطالب — الأرقام بالأرقام الغربية.</li>
<li>هذا البيان رسمي وسري ومخصص للإدارة فقط.</li>
</ol></div>
${detail || "<p>لا يوجد طلاب.</p>"}
<div class="final"><strong>ملاحظات ختامية:</strong> صدر هذا البيان آلياً من قاعدة بيانات المنصة بتاريخ ${issueDate} بتوقيت القاهرة. إجمالي السجلات: ${all.length} — نشط ${nActive} • موقوف ${nDisabled} • محذوف ${nDeleted}. يُحظر تداول هذا الملف خارج الإدارة لاحتوائه على بيانات شخصية (أسماء وهواتف وعناوين).</div>`;

  saveReport(number, docShell(`بيان الطلاب الشامل ${number} — منصة وليد عوني`, body), { pdf: WANT_PDF, open: WANT_OPEN });
}

main().catch((e) => {
  console.error(`خطأ: ${e.message || e}`);
  process.exit(1);
});
