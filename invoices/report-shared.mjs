// وحدة مشتركة لتقارير invoices المحلية (فاتورة/أكواد/بيان).
// هوية كشف الطلاب الشامل + أدوات env/PDF/ترقيم — بدون أي أسرار مطبوعة.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DIR = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = dirname(DIR);

export const fmt = (n) => Number(n || 0).toLocaleString("en-US");
export const ltr = (s) => `<span class="ltr">${s}</span>`;
export const esc = (s) => String(s ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const fmtDay = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};
export function fmtIssueDate() {
  return new Intl.DateTimeFormat("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date());
}

// قراءة env محلياً — القيم لا تُطبع أبداً
export function loadLocalEnv() {
  const files = [".env.functions.local", ".env.local", ".env"];
  const env = {};
  for (const f of files) {
    const p = join(PROJECT_ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(m[1] in env)) env[m[1]] = v;
    }
  }
  return env;
}

export async function createServiceClient() {
  const { createClient } = await import("@supabase/supabase-js");
  const env = loadLocalEnv();
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("مفاتيح الاتصال غير موجودة في .env.functions.local (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// ترقيم مسلسل: PREFIX-YYYYMMDD-NNN
export function nextNumber(prefix) {
  const today = new Date();
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const re = new RegExp(`^${prefix}-(\\d{8})-(\\d+)\\.(html|pdf)$`);
  let max = 0;
  for (const f of readdirSync(DIR)) {
    const m = f.match(re);
    if (m && m[1] === stamp) max = Math.max(max, Number(m[2]));
  }
  return `${prefix}-${stamp}-${String(max + 1).padStart(3, "0")}`;
}

export function findBrowser() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

export function toPdf(htmlPath, pdfPath) {
  const browser = findBrowser();
  if (!browser) {
    console.log("تنبيه: لم يتم العثور على Chrome/Edge — تم إنتاج HTML فقط.");
    return false;
  }
  try {
    execFileSync(browser, ["--headless", "--disable-gpu", "--no-sandbox", `--print-to-pdf=${pdfPath}`, "--print-to-pdf-no-header", `file:///${htmlPath.replace(/\\/g, "/")}`], { stdio: "pipe" });
    console.log(`PDF ✓ ${pdfPath}`);
    return true;
  } catch (e) {
    console.log(`تعذر إنتاج PDF: ${String(e).slice(0, 200)} — ملف HTML جاهز للطباعة اليدوية (Ctrl+P).`);
    return false;
  }
}

export function openHtml(htmlPath) {
  if (process.platform !== "win32") return;
  try {
    spawn("cmd", ["/c", "start", "", htmlPath], { detached: true, stdio: "ignore" }).unref();
  } catch { /* غير حرج */ }
}

export function saveReport(number, html, { pdf = true, open = true } = {}) {
  const htmlPath = join(DIR, `${number}.html`);
  const pdfPath = join(DIR, `${number}.pdf`);
  writeFileSync(htmlPath, html, "utf8");
  console.log(`HTML ✓ ${htmlPath}`);
  if (pdf) toPdf(htmlPath, pdfPath);
  if (open) openHtml(htmlPath);
  return { htmlPath, pdfPath };
}

// ── الهوية الاحترافية v2: كحلي مؤسسي + تيل + ذهبي ──────────────
export const BASE_CSS = `
:root{--navy:#0f172a;--navy2:#1e3a5f;--teal:#0f766e;--teal-d:#0b4f4a;--gold:#b45309;--gold-l:#f59e0b;
--ink:#1e293b;--muted:#64748b;--line:#e2e8f0;--soft:#f8fafc;--ok:#047857;--ok-bg:#ecfdf5;
--warn:#92400e;--warn-bg:#fffbeb;--bad:#b91c1c;--bad-bg:#fef2f2;--info:#1d4ed8;--info-bg:#eff6ff}
@page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}
body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:var(--ink);margin:0;padding:26px 28px 30px;font-size:11px;line-height:1.7;background:#eef2f7;
-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{background:#fff;border-radius:16px;padding:26px 28px 34px;box-shadow:0 10px 30px -12px rgba(15,23,42,.25)}
.ltr{direction:ltr;unicode-bidi:embed;font-variant-numeric:tabular-nums}
/* الشريط المؤسسي */
.brand{display:flex;justify-content:space-between;align-items:center;gap:14px;color:#fff;border-radius:14px;
padding:16px 22px;background:linear-gradient(120deg,var(--navy) 20%,var(--navy2) 60%,var(--teal-d) 100%)}
.brand .id{display:flex;align-items:center;gap:13px}
.mark{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,var(--teal),#14b8a6);color:#fff;
font-size:28px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 2px rgba(255,255,255,.35)}
.brand h1{margin:0;font-size:23px;letter-spacing:0}
.brand .tag{margin:1px 0 0;font-size:11px;color:#cbd5e1}
.brand .side{text-align:left;display:flex;flex-direction:column;gap:7px;align-items:flex-start}
.doc-chip{font-size:11px;color:#fde68a;border:1px solid rgba(253,230,138,.6);border-radius:999px;padding:2px 12px}
.secret{display:inline-block;font-size:11.5px;font-weight:800;color:#fff;background:rgba(185,28,28,.85);
border:1px solid #fca5a5;border-radius:8px;padding:2px 14px}
.gold-rule{height:4px;border-radius:99px;margin:10px 0 0;background:linear-gradient(90deg,var(--gold),var(--gold-l),var(--gold))}
/* بطاقة العنوان */
.hero{margin:14px 0;border:1px solid var(--line);border-radius:14px;padding:16px 20px;background:linear-gradient(180deg,#fff, #f8fafc)}
.hero h2{margin:0;font-size:22px;color:var(--navy)}
.hero .sub{margin:3px 0 0;font-size:12px;color:var(--muted)}
.meta-grid{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.meta{flex:1;min-width:150px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:7px 12px}
.meta small{display:block;font-size:10px;color:var(--muted)}
.meta b{font-size:13.5px;color:var(--navy)}
.meta b.num{color:var(--teal);direction:ltr;unicode-bidi:embed;font-size:14.5px}
/* مؤشرات */
.kpis{display:flex;gap:10px;margin:14px 0;flex-wrap:wrap}
.kpi{flex:1;min-width:135px;background:#fff;border:1px solid var(--line);border-top:4px solid var(--teal);border-radius:12px;
padding:10px 12px;text-align:center;box-shadow:0 4px 14px -8px rgba(15,23,42,.25)}
.kpi .v{font-size:23px;font-weight:800;color:var(--navy);line-height:1.25}
.kpi .l{font-size:11px;color:var(--muted)}
.kpi .s{font-size:10px;color:var(--muted)}
.kpi.t-teal{border-top-color:var(--teal)}.kpi.t-teal .v{color:var(--teal-d)}
.kpi.t-navy{border-top-color:var(--navy)}
.kpi.t-gold{border-top-color:var(--gold-l)}.kpi.t-gold .v{color:var(--gold)}
.kpi.t-ok{border-top-color:#10b981}.kpi.t-ok .v{color:var(--ok)}
.kpi.t-bad{border-top-color:#ef4444}.kpi.t-bad .v{color:var(--bad)}
.kpi.hero-kpi{background:linear-gradient(135deg,var(--teal-d),var(--teal));border:none}
.kpi.hero-kpi .v,.kpi.hero-kpi .l,.kpi.hero-kpi .s{color:#fff}
/* عناوين الأقسام */
.sec{display:flex;align-items:center;gap:9px;margin:20px 0 9px;font-size:15px;font-weight:800;color:var(--navy)}
.sec::before{content:"";width:9px;height:22px;border-radius:3px;background:linear-gradient(180deg,var(--gold-l),var(--gold))}
.sec::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--line),transparent)}
h2.gsec{font-size:14px;color:var(--navy);margin:16px 0 6px;display:flex;align-items:center;gap:8px}
h2.gsec small{font-size:11px;color:var(--muted);font-weight:400}
/* الجداول */
.tbl{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff}
table.data{width:100%;border-collapse:collapse;font-size:10.5px}
table.data th{background:linear-gradient(180deg,#24365a,var(--navy));color:#fff;padding:8px 5px;font-size:10.5px;
border-bottom:2px solid var(--gold-l);white-space:nowrap}
table.data td{padding:6px 5px;text-align:center;border-bottom:1px solid #eef2f7}
table.data tbody tr:nth-child(even) td{background:#f8fafc}
table.data tbody tr:last-child td{border-bottom:none}
table.data tfoot td{background:var(--ok-bg);font-weight:800;color:var(--teal-d);border-top:2px solid var(--teal)}
table.data tr.hl td{background:var(--warn-bg);color:var(--warn)}
table.data tr.struck td{background:#fff7f7;color:var(--bad);text-decoration:line-through}
.code{display:inline-block;font-family:Consolas,"Courier New",monospace;font-weight:700;direction:ltr;unicode-bidi:embed;
background:#f1f5f9;border:1px dashed #94a3b8;border-radius:7px;padding:1px 9px;font-size:11px;color:var(--navy)}
.pill{display:inline-block;padding:1px 11px;border-radius:999px;font-size:10.5px;font-weight:700;border:1px solid transparent;white-space:nowrap}
.pill.ok{background:var(--ok-bg);color:var(--ok);border-color:#a7f3d0}
.pill.warn{background:var(--warn-bg);color:var(--warn);border-color:#fde68a}
.pill.bad{background:var(--bad-bg);color:var(--bad);border-color:#fecaca}
.pill.info{background:var(--info-bg);color:var(--info);border-color:#bfdbfe}
.pill.mute{background:#f1f5f9;color:#475569;border-color:#e2e8f0}
.pbar{display:inline-block;width:74px;height:8px;border-radius:99px;background:#e2e8f0;vertical-align:middle;overflow:hidden}
.pbar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--teal),#14b8a6)}
.sec-sum{font-size:11px;color:var(--muted);margin:6px 2px 0}
.sec-sum b{color:var(--navy)}
/* الملاحظات والتوقيع والختام */
.words{margin:13px 0;padding:10px 16px;border-radius:12px;font-size:12px;
background:linear-gradient(135deg,#f0fdfa,#eff6ff);border:1px solid #99f6e4}
.notes{font-size:11px;color:#334155;background:#fffdf5;border:1px solid #fde68a;border-right:4px solid var(--gold-l);
border-radius:10px;padding:9px 16px;margin-top:10px}
.notes ol{margin:4px 0;padding-right:18px}
.sign{display:flex;gap:14px;margin-top:30px;font-size:12px}
.sign .box{flex:1;background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:12px;text-align:center}
.sign .box b{color:var(--navy)}
.sign .line{margin-top:46px;border-top:1px dashed #94a3b8;padding-top:5px;color:var(--muted);font-size:11px}
.final{font-size:11px;color:#334155;margin-top:14px;border:1px solid var(--line);border-radius:12px;padding:10px 16px;background:var(--soft)}
.page-footer{position:fixed;bottom:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;
font-size:10px;color:#fff;background:var(--navy);border-top:3px solid var(--gold-l);padding:6px 18px}
.page-footer .pagenum::after{content:"صفحة " counter(page) " من " counter(pages)}
thead{display:table-header-group}.avoid{page-break-inside:avoid}
@media print{body{background:#fff;padding:0}.page{box-shadow:none;border-radius:0;padding:0 0 22px}.kpi{box-shadow:none}.page-footer{position:fixed}}`;

// هيدر الصفحة: الشريط المؤسسي + بطاقة العنوان + شبكة البيانات
export function docHeader({ doc, sub = "", number = "", meta = [] }) {
  const cells = meta.map(([k, v, num]) => `<div class="meta"><small>${k}</small><b${num ? ' class="num"' : ""}>${v}</b></div>`).join("");
  return `<div class="brand"><div class="id"><div class="mark">و</div>
<div><h1>منصة وليد عوني</h1><p class="tag">WALIDAWNY • دروس مصورة وملازم PDF وسبورات تفاعلية — ${ltr("walidawny.com")}</p></div></div>
<div class="side"><span class="doc-chip">وثيقة إدارية رسمية</span><span class="secret">سري — مخصص للإدارة فقط</span></div></div>
<div class="gold-rule"></div>
<div class="hero"><h2>${doc}</h2>${sub ? `<p class="sub">${sub}</p>` : ""}
<div class="meta-grid">${number ? `<div class="meta"><small>رقم الوثيقة</small><b class="num">${number}</b></div>` : ""}${cells}</div></div>`;
}

export function kpis(cards) {
  return `<div class="kpis">${cards.map((c) =>
    `<div class="kpi${c.tone ? ` t-${c.tone}` : ""}${c.hero ? " hero-kpi" : ""}"><div class="v">${c.v}</div><div class="l">${c.l}</div>${c.s ? `<div class="s">${c.s}</div>` : ""}</div>`
  ).join("")}</div>`;
}

export function sec(t) {
  return `<h3 class="sec">${t}</h3>`;
}

export function pill(text, tone = "mute") {
  return `<span class="pill ${tone}">${text}</span>`;
}

export function tbl(headers, body, foot = "") {
  return `<div class="tbl"><table class="data"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ""}</table></div>`;
}

export function pageFooter() {
  return `<div class="page-footer"><span>منصة وليد عوني — وثيقة سرية مخصصة للإدارة فقط • ${ltr("walidawny.com")}</span><span class="pagenum"></span></div>`;
}

export function docShell(pageTitle, bodyHtml) {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${pageTitle}</title><style>${BASE_CSS}</style></head><body><div class="page">${bodyHtml}</div>${pageFooter()}</body></html>`;
}

// توافق قديم (لم يعد مستخدماً في القوالب الجديدة)
export function pageHead(title, number) {
  return docHeader({ doc: title, number });
}
