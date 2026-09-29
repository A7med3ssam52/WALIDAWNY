// مولّد فواتير منصة وليد عونى — 6 قوالب تصميم للاختيار بينها.
// الاستخدام: حدّث بيانات INVOICE THEN نفّذ:
//   node invoices/generate-invoices.mjs
// ينتج لكل قالب ملف HTML + ملف PDF في مجلد invoices/.
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// === بيانات الفاتورة الجديدة بناءً على طلب المستخدم ===
const INVOICE = {
  // رقم الفاتورة (يمكن تعديله)
  number: "INV-2026-09-001",
  issueDate: "1 أكتوبر 2026",
  period: "1 أغسطس 2026 — 30 سبتمبر 2026",
  currency: "جنيه مصري (ج.م)",
  
  // الطرفان
  mister: "مستر وليد عوني",
  misterPhone: "+201000000002",
  platform: "منصة وليد عوني",
  site: "walidawny.com",
  whatsapp: "+201205161216",
  
  // بيانات الصادر من
  issuerName: "أحمد عصام خليل",
  issuerRole: "الممثل لإدارة المنصة",
  issuerTitle: "إدارة المنصة",
  
  // المستحقات
  feePerSub: 20,
  paidCount: 0,       // سيتم تعبئته من قاعدة البيانات
  freeCount: 0,       // سيتم تعبئته من قاعدة البيانات
  baseTotal: 0,       // الإجمالي الأساسي
  feeTotal: 0,        // حصة المنصة المستحقة
  grandTotal: 0,      // الإجمالي
  amountWords: "الصفر ج.م", // سيتم تعديله بناءً على الإجمالي
};
// ==================================================

// بيانات الطلاب (يمكن سحبها من Supabase)
const STUDENT_DATA = {
  // هذا القسم سيتم ملؤه من قاعدة البيانات
  // format: [{name, hours, isPaid, status}]
};

// القوالب الستة
const DESIGNS = [];

const MONTHS = [
  { name: "أغسطس 2026", paid: 18, base: 3600, fee: 360, total: 3960, free: 0 },
  { name: "سبتمبر 2026", paid: 10, base: 2000, fee: 200, total: 2200, free: 2 },
];

const UNITS = [
  { name: "الباب الاول التيار الكهربي", grade: "الصف الثالث الثانوي", paid: 27, base: 5400, fee: 540, free: 0 },
  { name: "الباب الأول", grade: "الصف الأول بكالوريا", paid: 1, base: 200, fee: 20, free: 0 },
  { name: "الباب الاول - الميكانيكا", grade: "الصف الثاني بكالوريا", paid: 0, base: 0, fee: 0, free: 2 },
];

// [التاريخ, الطالب, الهاتف (مخفى), الوحدة, الأساسي, المنصة, الإجمالي, مجاني؟, اختبار؟]
const ROWS = [
  ["18/08/2026", "حساب تجريبى", "+2010 •••• 99", "الباب الأول", 200, 20, 220, 0, 1],
  ["25/08/2026", "ساندي حسن خطاب", "+2015 •••• 05", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["25/08/2026", "اسماء هاني سعيد", "+2012 •••• 39", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["26/08/2026", "محمد رجب", "+2012 •••• 28", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["26/08/2026", "Fatma Ahmed", "+2010 •••• 18", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["26/08/2026", "محمد محمد احمد نعمة الله", "+2012 •••• 28", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["27/08/2026", "Salma elsaidy", "+2010 •••• 49", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["28/08/2026", "Test Account", "+2010 •••• 00", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 1],
  ["28/08/2026", "Bahywalid", "+2012 •••• 16", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 1],
  ["28/08/2026", "حنين عادل", "+2012 •••• 93", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["29/08/2026", "Mohmed Ahmed", "+2012 •••• 17", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["30/08/2026", "Fadel Salem", "+2010 •••• 08", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["30/08/2026", "Haneen Yusuf", "+2012 •••• 16", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["30/08/2026", "Hend Elgazzar", "+2011 •••• 37", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["30/08/2026", "عمر ابراهيم الجزار", "+2010 •••• 69", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["30/08/2026", "asmaa Reda", "+2015 •••• 92", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["31/08/2026", "لينا رائد قنديل", "+2012 •••• 73", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["31/08/2026", "اروي الموجي", "+2012 •••• 02", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["01/09/2026", "ريناد فكري صالح", "+2012 •••• 68", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["01/09/2026", "إياد أحمد ماهر", "+2010 •••• 92", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["01/09/2026", "يارا ماهر لطفي النجار", "+2012 •••• 60", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["02/09/2026", "جنا عوض عبد الرحمن محمد علي حماد", "+2012 •••• 73", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["03/09/2026", "Nour Elden", "+2012 •••• 32", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["03/09/2026", "Eman Nabil", "+2010 •••• 07", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["04/09/2026", "خالد محمد مستجير", "+2010 •••• 10", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["07/09/2026", "يوسف", "+2010 •••• 97", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["09/09/2026", "مريم طاهر شتا", "+2012 •••• 73", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["10/09/2026", "محمد احمد مصطفى", "+2015 •••• 78", "الباب الاول التيار الكهربي", 200, 20, 220, 0, 0],
  ["11/09/2026", "رودينا حماده الدسوقى", "+2012 •••• 48", "الباب الاول - الميكانيكا", 0, 0, 0, 1, 0],
  ["11/09/2026", "Malak Tharwat", "+2012 •••• 53", "الباب الاول - الميكانيكا", 0, 0, 0, 1, 0],
];

const fmt = (n) => Number(n).toLocaleString("en-US");
const ltr = (s) => `<span class="ltr">${s}</span>`;

function detailRows(rowClass, freeClass) {
  return ROWS.map((r, i) => {
    const cls = r[7] ? ` class="${freeClass}"` : rowClass ? ` class="${rowClass}"` : "";
    const star = r[8] ? " *" : "";
    return `<tr${cls}><td>${i + 1}</td><td>${r[0]}</td><td>${r[1]}${star}</td><td>${ltr(r[2])}</td><td>${r[3]}</td><td>${fmt(r[4])}</td><td>${fmt(r[5])}</td><td>${fmt(r[6])}</td></tr>`;
  }).join("\n");
}

function monthRows() {
  return MONTHS.map((m) => `<tr><td>${m.name}</td><td>${m.paid}</td><td>${fmt(m.base)}</td><td>${fmt(m.fee)}</td><td>${fmt(m.total)}</td><td>${m.free}</td></tr>`).join("\n");
}

function unitRows() {
  return UNITS.map((u) => `<tr><td>${u.name}<br><small>${u.grade}</small></td><td>${u.paid}</td><td>${fmt(u.base)}</td><td>${fmt(u.fee)}</td><td>${u.free}</td></tr>`).join("\n");
}

const NOTES = `
<li>حصة المنصة 20 جنيهًا عن كل اشتراك مدفوع، بإجمالي 28 اشتراكًا خلال الفترة المشمولة.</li>
<li>الاشتراكان المجانيان معروضان للشفافية ومستبعدان من حساب حصة المنصة.</li>
<li>الصفوف المعلمة بـ (*) حسابات اختبار داخلية — تُخصم 60 جنيهًا من المستحق عند اعتماد استبعادها لتصبح الحصة 500 جنيه.</li>
<li>أرقام هواتف الطلاب معروضة بصيغة مخفاة جزئيًا، والكشوف الكاملة متاحة لدى إدارة المنصة.</li>`;

const SIGN = (a, b) => `
<div class="sign"><div>${a}<div class="line">الاسم / التوقيع / الختم</div></div><div>${b}<div class="line">الاسم / التوقيع / التاريخ</div></div></div>`;

const FOOT = `${INVOICE.platform} — ${ltr(INVOICE.site)} — واتساب ${ltr(INVOICE.whatsapp)}`;

// ─── القالب 1: الكلاسيكية الرسمية (أخضر مؤسسي) ───
function t1() {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>فاتورة ${INVOICE.number} — التصميم الكلاسيكي</title><style>
@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:#1a1a1a;margin:0;padding:26px;font-size:13px;line-height:1.7;background:#fff}.ltr{direction:ltr;unicode-bidi:embed}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f766e;padding-bottom:12px;margin-bottom:14px}
.brand h1{margin:0;font-size:25px;color:#0f766e}.brand p{margin:2px 0;color:#555;font-size:12px}
.meta{text-align:left}.meta h2{margin:0;font-size:21px}.meta .num{font-size:15px;font-weight:bold;color:#0f766e;direction:ltr;display:inline-block}
.meta table{font-size:12.5px;margin-top:6px;border-collapse:collapse}.meta td{padding:1px 0 1px 8px}
.cards{display:flex;gap:12px;margin-bottom:12px}.card{flex:1;border:1px solid #ddd;border-radius:8px;padding:9px 12px;background:#f8fafc}
.card h3{margin:0 0 5px;font-size:13px;color:#0f766e;border-bottom:1px solid #e2e8f0;padding-bottom:4px}.card p{margin:2px 0;font-size:12.5px}
.sum{display:flex;gap:10px;margin:12px 0}.box{flex:1;border:1px solid #ddd;border-radius:8px;padding:9px;text-align:center}.box .v{font-size:19px;font-weight:bold}.box .l{font-size:11.5px;color:#555}
.box.main{background:#0f766e;color:#fff;border-color:#0f766e}.box.main .l{color:#e6fffa}
h3.sec{font-size:14.5px;color:#0f766e;margin:16px 0 7px;border-right:4px solid #0f766e;padding-right:8px}
table.data{width:100%;border-collapse:collapse;font-size:11.5px}table.data th{background:#0f766e;color:#fff;padding:7px 5px}table.data td{border:1px solid #ddd;padding:5px;text-align:center}
table.data tr:nth-child(even) td{background:#f8fafc}table.data tr.free td{background:#fefce8;color:#713f12}table.data tfoot td{font-weight:bold;background:#ecfdf5}
.words{margin:11px 0;padding:9px 12px;border:1px dashed #0f766e;border-radius:8px;background:#f0fdfa}
.notes{font-size:11.5px;color:#444;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:9px 14px;margin-top:10px}
.sign{display:flex;gap:12px;margin-top:24px;font-size:12.5px}.sign div{flex:1;text-align:center}.sign .line{margin-top:42px;border-top:1px solid #333;padding-top:4px}
.footer{margin-top:14px;border-top:1px solid #ddd;padding-top:7px;font-size:10.5px;color:#777;text-align:center}
@media print{body{padding:0}}</style></head><body>
<div class="header"><div class="brand"><h1>${INVOICE.platform}</h1><p>كشف حساب رسوم المنصة — مستحقات عن الاشتراكات</p><p>${ltr(INVOICE.site)} — واتساب: ${ltr(INVOICE.whatsapp)}</p></div>
<div class="meta"><h2>فاتورة</h2><span class="num">${INVOICE.number}</span><table>
<tr><td><strong>تاريخ الإصدار:</strong></td><td>${INVOICE.issueDate}</td></tr>
<tr><td><strong>الفترة:</strong></td><td>${INVOICE.period}</td></tr>
<tr><td><strong>العملة:</strong></td><td>${INVOICE.currency}</td></tr></table></div></div>
<div class="cards"><div class="card"><h3>فاتورة إلى</h3><p><strong>${INVOICE.mister}</strong></p><p>الهاتف: ${ltr(INVOICE.misterPhone)}</p></div>
<div class="card"><h3>صادرة من</h3><p><strong>${INVOICE.platform}</strong></p><p>${ltr(INVOICE.site)} — واتساب ${ltr(INVOICE.whatsapp)}</p></div></div>
<div class="sum"><div class="box"><div class="v">${INVOICE.paidCount}</div><div class="l">اشتراك مدفوع</div></div>
<div class="box"><div class="v">${fmt(INVOICE.baseTotal)} ج.م</div><div class="l">إجمالي الأساسي</div></div>
<div class="box main"><div class="v">${fmt(INVOICE.feeTotal)} ج.م</div><div class="l">حصة المنصة المستحقة</div></div>
<div class="box"><div class="v">${fmt(INVOICE.grandTotal)} ج.م</div><div class="l">إجمالي المحصّل</div></div>
<div class="box"><div class="v">${INVOICE.freeCount}</div><div class="l">اشتراك مجاني</div></div></div>
<h3 class="sec">الإجمالي الشهري</h3>
<table class="data"><thead><tr><th>الشهر</th><th>مدفوع</th><th>الأساسي</th><th>حصة المنصة</th><th>الإجمالي</th><th>مجاني</th></tr></thead><tbody>${monthRows()}</tbody>
<tfoot><tr><td>الإجمالي</td><td>${INVOICE.paidCount}</td><td>${fmt(INVOICE.baseTotal)}</td><td>${fmt(INVOICE.feeTotal)}</td><td>${fmt(INVOICE.grandTotal)}</td><td>${INVOICE.freeCount}</td></tr></tfoot></table>
<h3 class="sec">الإجمالي حسب الوحدة</h3>
<table class="data"><thead><tr><th>الوحدة / الصف</th><th>مدفوع</th><th>الأساسي</th><th>حصة المنصة</th><th>مجاني</th></tr></thead><tbody>${unitRows()}</tbody></table>
<h3 class="sec">الكشف التفصيلي بالاشتراكات</h3>
<table class="data"><thead><tr><th>م</th><th>التاريخ</th><th>الطالب</th><th>الهاتف</th><th>الوحدة</th><th>الأساسي</th><th>المنصة</th><th>الإجمالي</th></tr></thead><tbody>${detailRows("", "free")}</tbody>
<tfoot><tr><td colspan="5">الإجمالي</td><td>${fmt(INVOICE.baseTotal)}</td><td>${fmt(INVOICE.feeTotal)}</td><td>${fmt(INVOICE.grandTotal)}</td></tr></tfoot></table>
<div class="words"><strong>المستحق للمنصة كتابةً:</strong> ${INVOICE.amountWords} (${fmt(INVOICE.feeTotal)} ج.م).</div>
<div class="notes"><strong>ملاحظات:</strong><ol>${NOTES}</ol></div>
${SIGN("إدارة المنصة", `${INVOICE.mister} (بالاعتماد)`)}
<div class="footer">فاتورة ${INVOICE.number} — صادرة بتاريخ ${INVOICE.issueDate} — ${FOOT}</div>
</body></html>`;
}

// ─── القالب 2: العصرية البسيطة (كحلي فاتح، مساحات واسعة) ───
function t2() {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>فاتورة ${INVOICE.number} — التصميم العصري</title><style>
@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:#1e293b;margin:0;padding:30px;font-size:13px;line-height:1.8;background:#fff}.ltr{direction:ltr;unicode-bidi:embed}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.logo{width:58px;height:58px;border-radius:16px;background:#1d4ed8;color:#fff;font-size:30px;font-weight:bold;display:flex;align-items:center;justify-content:center}
.brand h1{margin:0;font-size:22px}.brand p{margin:0;color:#64748b;font-size:12px}
.invno{text-align:left}.invno small{color:#64748b}.invno div{font-size:20px;font-weight:bold;direction:ltr}
.dueline{display:flex;justify-content:space-between;background:#eff6ff;border-radius:12px;padding:12px 18px;margin-bottom:18px;font-size:13px}
.dueline b{color:#1d4ed8}.due b{font-size:20px}
.parties{display:flex;gap:14px;margin-bottom:18px}.party{flex:1}.party h4{margin:0 0 4px;font-size:12px;color:#64748b;font-weight:normal}.party p{margin:0;font-size:14px;font-weight:bold}
table.data{width:100%;border-collapse:collapse;font-size:12px}table.data thead th{font-size:11.5px;color:#64748b;font-weight:normal;border-bottom:2px solid #e2e8f0;padding:8px 6px;text-align:center}
table.data tbody td{padding:8px 6px;border-bottom:1px solid #f1f5f9;text-align:center}
table.data tr.free td{background:#fefce8;color:#713f12}
h3.sec{font-size:14px;margin:20px 0 6px}h3.sec span{background:#1d4ed8;color:#fff;border-radius:6px;padding:1px 10px;font-size:12.5px}
.totals{display:flex;justify-content:flex-end;margin-top:12px}.totals table{border-collapse:collapse;font-size:13px;min-width:280px}
.totals td{padding:5px 10px}.totals tr.grand td{background:#1d4ed8;color:#fff;font-weight:bold;font-size:15px;border-radius:8px}
.words{margin:12px 0;color:#334155;font-size:12.5px;background:#f8fafc;border-radius:10px;padding:9px 14px}
.notes{font-size:11.5px;color:#64748b;margin-top:10px}.notes ol{margin:4px 0;padding-right:18px}
.sign{display:flex;gap:40px;margin-top:34px;font-size:12px;color:#475569}.sign div{flex:1;text-align:center}.sign .line{margin-top:46px;border-top:1px solid #cbd5e1;padding-top:4px}
.footer{margin-top:16px;font-size:10.5px;color:#94a3b8;text-align:center}
@media print{body{padding:0}}</style></head><body>
<div class="top"><div style="display:flex;gap:12px;align-items:center"><div class="logo">و</div><div class="brand"><h1>${INVOICE.platform}</h1><p>${ltr(INVOICE.site)} — ${ltr(INVOICE.whatsapp)}</p></div></div>
<div class="invno"><small>فاتورة رقم</small><div>${INVOICE.number}</div><small>الإصدار: ${INVOICE.issueDate}</small></div></div>
<div class="dueline"><div>الفترة المشمولة: <b>${INVOICE.period}</b></div><div class="due">المستحق: <b>${fmt(INVOICE.feeTotal)} ج.م</b></div></div>
<div class="parties"><div class="party"><h4>فاتورة إلى</h4><p>${INVOICE.mister}</p><span style="font-size:12px;color:#64748b">${ltr(INVOICE.misterPhone)}</span></div>
<div class="party" style="text-align:left"><h4>طريقة الاحتساب</h4><p>20 ج.م × ${INVOICE.paidCount} اشتراكًا</p><span style="font-size:12px;color:#64748b">اشتراكان مجانيان مستبعدان</span></div></div>
<h3 class="sec"><span>الملخص الشهري</span></h3>
<table class="data"><thead><tr><th>الشهر</th><th>مدفوع</th><th>الأساسي (ج.م)</th><th>حصة المنصة (ج.م)</th><th>الإجمالي (ج.م)</th><th>مجاني</th></tr></thead><tbody>${monthRows()}</tbody></table>
<h3 class="sec"><span>حسب الوحدة الدراسية</span></h3>
<table class="data"><thead><tr><th>الوحدة / الصف</th><th>مدفوع</th><th>الأساسي (ج.م)</th><th>حصة المنصة (ج.م)</th><th>مجاني</th></tr></thead><tbody>${unitRows()}</tbody></table>
<h3 class="sec"><span>تفاصيل الاشتراكات (${ROWS.length})</span></h3>
<table class="data"><thead><tr><th>م</th><th>التاريخ</th><th>الطالب</th><th>الهاتف</th><th>الوحدة</th><th>الأساسي</th><th>المنصة</th><th>الإجمالي</th></tr></thead><tbody>${detailRows("", "free")}</tbody></table>
<div class="totals"><table>
<tr><td>إجمالي الأساسي</td><td>${fmt(INVOICE.baseTotal)} ج.م</td></tr>
<tr><td>إجمالي المحصّل</td><td>${fmt(INVOICE.grandTotal)} ج.م</td></tr>
<tr class="grand"><td>المستحق للمنصة</td><td>${fmt(INVOICE.feeTotal)} ج.م</td></tr></table></div>
<div class="words"><strong>كتابةً:</strong> ${INVOICE.amountWords}.</div>
<div class="notes"><strong>ملاحظات:</strong><ol>${NOTES}</ol></div>
${SIGN("إدارة المنصة", `${INVOICE.mister} (بالاعتماد)`)}
<div class="footer">فاتورة ${INVOICE.number} — ${FOOT}</div>
</body></html>`;
}

// ─── القالب 3: الفاخرة الداكنة (كحلي + ذهبي) ───
function t3() {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>فاتورة ${INVOICE.number} — التصميم الفاخر</title><style>
@page{size:A4;margin:0}*{box-sizing:border-box}body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:#1a1a1a;margin:0;font-size:13px;line-height:1.7;background:#fff}.ltr{direction:ltr;unicode-bidi:embed}
.hero{background:#0f172a;color:#fff;padding:26px 30px 20px;display:flex;justify-content:space-between;align-items:flex-start}
.hero h1{margin:0;font-size:24px;color:#fbbf24}.hero p{margin:3px 0;font-size:12px;color:#cbd5e1}
.hero .inv{text-align:left}.hero .inv h2{margin:0;font-size:20px}.hero .inv .num{color:#fbbf24;font-weight:bold;direction:ltr;display:inline-block;font-size:15px}
.hero .inv table{font-size:12px;border-collapse:collapse;margin-top:6px}.hero .inv td{padding:1px 0 1px 10px;color:#e2e8f0}
.goldbar{height:5px;background:linear-gradient(90deg,#b45309,#fbbf24,#b45309)}
.body{padding:20px 30px}
.duestrip{display:flex;gap:10px;margin:0 0 14px}.dbox{flex:1;border:1px solid #e5e7eb;border-top:3px solid #b45309;border-radius:0 0 8px 8px;padding:9px;text-align:center;background:#fffdf5}
.dbox .v{font-size:19px;font-weight:bold}.dbox .l{font-size:11.5px;color:#6b7280}.dbox.hot{background:#0f172a;color:#fff;border-color:#0f172a}.dbox.hot .v{color:#fbbf24}.dbox.hot .l{color:#e2e8f0}
.parties{display:flex;gap:12px;margin-bottom:6px}.party{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:9px 12px}.party h4{margin:0 0 4px;font-size:12px;color:#b45309}.party p{margin:2px 0;font-size:12.5px}
h3.sec{font-size:14px;margin:16px 0 7px;color:#0f172a}.h3.sec span,.u{border-bottom:2px solid #fbbf24;padding-bottom:2px}
h3.sec .u{border-bottom:2px solid #fbbf24;padding-bottom:2px}
table.data{width:100%;border-collapse:collapse;font-size:11.5px}table.data th{background:#0f172a;color:#fbbf24;padding:7px 5px}table.data td{border:1px solid #e5e7eb;padding:5px;text-align:center}
table.data tr.free td{background:#fef9c3;color:#713f12}table.data tfoot td{font-weight:bold;background:#fef3c7}
.words{margin:11px 0;padding:9px 12px;background:#fffbeb;border:1px solid #fbbf24;border-radius:8px;font-size:12.5px}
.notes{font-size:11.5px;color:#444}.notes ol{margin:4px 0;padding-right:18px}
.sign{display:flex;gap:12px;margin-top:24px;font-size:12.5px}.sign div{flex:1;text-align:center}.sign .line{margin-top:42px;border-top:1px solid #333;padding-top:4px}
.footer{background:#0f172a;color:#94a3b8;text-align:center;font-size:10.5px;padding:9px;margin-top:16px}
@media print{.body{padding:14px 18px}.hero{padding:18px 20px 14px}}</style></head><body>
<div class="hero"><div><h1>${INVOICE.platform}</h1><p>كشف حساب رسوم المنصة — مستحقات عن الاشتراكات</p><p>${ltr(INVOICE.site)} — واتساب ${ltr(INVOICE.whatsapp)}</p></div>
<div class="inv"><h2>فاتورة</h2><span class="num">${INVOICE.number}</span><table>
<tr><td>الإصدار:</td><td>${INVOICE.issueDate}</td></tr><tr><td>الفترة:</td><td>${INVOICE.period}</td></tr><tr><td>العملة:</td><td>${INVOICE.currency}</td></tr></table></div></div>
<div class="goldbar"></div>
<div class="body">
<div class="parties"><div class="party"><h4>فاتورة إلى</h4><p><strong>${INVOICE.mister}</strong> — ${ltr(INVOICE.misterPhone)}</p></div>
<div class="party"><h4>أساس الاحتساب</h4><p><strong>20 ج.م</strong> عن كل اشتراك مدفوع × ${INVOICE.paidCount} اشتراكًا</p></div></div>
<div class="duestrip"><div class="dbox"><div class="v">${INVOICE.paidCount}</div><div class="l">اشتراك مدفوع</div></div>
<div class="dbox"><div class="v">${fmt(INVOICE.baseTotal)}</div><div class="l">الأساسي (ج.م)</div></div>
<div class="dbox hot"><div class="v">${fmt(INVOICE.feeTotal)} ج.م</div><div class="l">المستحق للمنصة</div></div>
<div class="dbox"><div class="v">${fmt(INVOICE.grandTotal)}</div><div class="l">إجمالي المحصّل (ج.م)</div></div>
<div class="dbox"><div class="v">${INVOICE.freeCount}</div><div class="l">مجاني</div></div></div>
<h3 class="sec"><span class="u">الملخص الشهري</span></h3>
<table class="data"><thead><tr><th>الشهر</th><th>مدفوع</th><th>الأساسي</th><th>حصة المنصة</th><th>الإجمالي</th><th>مجاني</th></tr></thead><tbody>${monthRows()}</tbody>
<tfoot><tr><td>الإجمالي</td><td>${INVOICE.paidCount}</td><td>${fmt(INVOICE.baseTotal)}</td><td>${fmt(INVOICE.feeTotal)}</td><td>${fmt(INVOICE.grandTotal)}</td><td>${INVOICE.freeCount}</td></tr></tfoot></table>
<h3 class="sec"><span class="u">حسب الوحدة الدراسية</span></h3>
<table class="data"><thead><tr><th>الوحدة / الصف</th><th>مدفوع</th><th>الأساسي</th><th>حصة المنصة</th><th>مجاني</th></tr></thead><tbody>${unitRows()}</tbody></table>
<h3 class="sec"><span class="u">الكشف التفصيلي</span></h3>
<table class="data"><thead><tr><th>م</th><th>التاريخ</th><th>الطالب</th><th>الهاتف</th><th>الوحدة</th><th>الأساسي</th><th>المنصة</th><th>الإجمالي</th></tr></thead><tbody>${detailRows("", "free")}</tbody>
<tfoot><tr><td colspan="5">الإجمالي</td><td>${fmt(INVOICE.baseTotal)}</td><td>${fmt(INVOICE.feeTotal)}</td><td>${fmt(INVOICE.grandTotal)}</td></tr></tfoot></table>
<div class="words"><strong>المستحق كتابةً:</strong> ${INVOICE.amountWords} (${fmt(INVOICE.feeTotal)} ج.م).</div>
<div class="notes"><strong>ملاحظات:</strong><ol>${NOTES}</ol></div>
${SIGN("إدارة المنصة", `${INVOICE.mister} (بالاعتماد)`)}
</div>
<div class="footer">فاتورة ${INVOICE.number} — صادرة بتاريخ ${INVOICE.issueDate} — ${FOOT}</div>
</body></html>`;
}

// ─── القالب 4: المتدرجة الحيوية (بنفسجي) ───
function t4() {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>فاتورة ${INVOICE.number} — التصميم المتدرج</title><style>
@page{size:A4;margin:11mm}*{box-sizing:border-box}body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:#232136;margin:0;padding:22px;font-size:13px;line-height:1.7;background:#fff}.ltr{direction:ltr;unicode-bidi:embed}
.hero{background:linear-gradient(135deg,#6d28d9,#9333ea 55%,#db2777);color:#fff;border-radius:16px;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.hero h1{margin:0;font-size:23px}.hero p{margin:2px 0;font-size:12px;opacity:.92}
.hero .inv{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.35);border-radius:12px;padding:10px 16px;text-align:left;min-width:210px}
.hero .inv .t{font-size:13px;opacity:.9}.hero .inv .n{font-size:17px;font-weight:bold;direction:ltr}.hero .inv .d{font-size:11.5px;opacity:.92}
.pills{display:flex;gap:10px;margin-bottom:14px}.pill{flex:1;border-radius:14px;padding:10px;text-align:center;background:#f5f3ff;border:1px solid #ddd6fe}
.pill .v{font-size:19px;font-weight:bold;color:#6d28d9}.pill .l{font-size:11.5px;color:#6b7280}
.pill.hot{background:linear-gradient(135deg,#6d28d9,#db2777);border:none}.pill.hot .v,.pill.hot .l{color:#fff}
.info{display:flex;gap:10px;margin-bottom:6px;font-size:12.5px}.info div{flex:1;background:#fafafa;border:1px solid #eee;border-radius:10px;padding:8px 12px}
h3.sec{font-size:14px;margin:15px 0 7px;color:#6d28d9}
table.data{width:100%;border-collapse:separate;border-spacing:0;font-size:11.5px;border:1px solid #ddd6fe;border-radius:10px;overflow:hidden}
table.data th{background:#ede9fe;color:#5b21b6;padding:7px 5px}table.data td{padding:5px;text-align:center;border-top:1px solid #ede9fe}
table.data tr.free td{background:#fefce8;color:#713f12}table.data tfoot td{font-weight:bold;background:#f5f3ff}
.words{margin:11px 0;padding:9px 14px;border-radius:12px;background:linear-gradient(135deg,#faf5ff,#fdf2f8);border:1px solid #e9d5ff;font-size:12.5px}
.notes{font-size:11.5px;color:#555}.notes ol{margin:4px 0;padding-right:18px}
.sign{display:flex;gap:12px;margin-top:24px;font-size:12.5px}.sign div{flex:1;text-align:center}.sign .line{margin-top:42px;border-top:2px solid #6d28d9;padding-top:4px}
.footer{margin-top:14px;text-align:center;font-size:10.5px;color:#a1a1aa}
@media print{body{padding:0}.hero{-webkit-print-color-adjust:exact;print-color-adjust:exact}.pill.hot{-webkit-print-color-adjust:exact;print-color-adjust:exact}table.data th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
<div class="hero"><div><h1>${INVOICE.platform}</h1><p>فاتورة مستحقات المنصة عن الاشتراكات</p><p>${ltr(INVOICE.site)} — واتساب ${ltr(INVOICE.whatsapp)}</p></div>
<div class="inv"><div class="t">فاتورة</div><div class="n">${INVOICE.number}</div><div class="d">الإصدار: ${INVOICE.issueDate}<br>الفترة: ${INVOICE.period}</div></div></div>
<div class="pills"><div class="pill"><div class="v">${INVOICE.paidCount}</div><div class="l">اشتراك مدفوع</div></div>
<div class="pill"><div class="v">${fmt(INVOICE.baseTotal)}</div><div class="l">الأساسي (ج.م)</div></div>
<div class="pill hot"><div class="v">${fmt(INVOICE.feeTotal)} ج.م</div><div class="l">المستحق للمنصة</div></div>
<div class="pill"><div class="v">${fmt(INVOICE.grandTotal)}</div><div class="l">إجمالي المحصّل (ج.م)</div></div>
<div class="pill"><div class="v">${INVOICE.freeCount}</div><div class="l">مجاني</div></div></div>
<div class="info"><div><strong>فاتورة إلى:</strong> ${INVOICE.mister} — ${ltr(INVOICE.misterPhone)}</div><div><strong>الاحتساب:</strong> 20 ج.م × ${INVOICE.paidCount} اشتراكًا مدفوعًا</div></div>
<h3 class="sec">الملخص الشهري</h3>
<table class="data"><thead><tr><th>الشهر</th><th>مدفوع</th><th>الأساسي</th><th>حصة المنصة</th><th>الإجمالي</th><th>مجاني</th></tr></thead><tbody>${monthRows()}</tbody>
<tfoot><tr><td>الإجمالي</td><td>${INVOICE.paidCount}</td><td>${fmt(INVOICE.baseTotal)}</td><td>${fmt(INVOICE.feeTotal)}</td><td>${fmt(INVOICE.grandTotal)}</td><td>${INVOICE.freeCount}</td></tr></tfoot></table>
<h3 class="sec">حسب الوحدة الدراسية</h3>
<table class="data"><thead><tr><th>الوحدة / الصف</th><th>مدفوع</th><th>الأساسي</th><th>حصة المنصة</th><th>مجاني</th></tr></thead><tbody>${unitRows()}</tbody></table>
<h3 class="sec">الكشف التفصيلي بالاشتراكات</h3>
<table class="data"><thead><tr><th>م</th><th>التاريخ</th><th>الطالب</th><th>الهاتف</th><th>الوحدة</th><th>الأساسي</th><th>المنصة</th><th>الإجمالي</th></tr></thead><tbody>${detailRows("", "free")}</tbody>
<tfoot><tr><td colspan="5">الإجمالي</td><td>${fmt(INVOICE.baseTotal)}</td><td>${fmt(INVOICE.feeTotal)}</td><td>${fmt(INVOICE.grandTotal)}</td></tr></tfoot></table>
<div class="words"><strong>المستحق كتابةً:</strong> ${INVOICE.amountWords} (${fmt(INVOICE.feeTotal)} ج.م).</div>
<div class="notes"><strong>ملاحظات:</strong><ol>${NOTES}</ol></div>
${SIGN("إدارة المنصة", `${INVOICE.mister} (بالاعتماد)`)}
<div class="footer">فاتورة ${INVOICE.number} — صادرة بتاريخ ${INVOICE.issueDate} — ${FOOT}</div>
</body></html>`;
}

// ─── القالب 5: الورقية الأنيقة (بيج كلاسيكي + ختم) ───
function t5() {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>فاتورة ${INVOICE.number} — التصميم الورقي</title><style>
@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Georgia,"Times New Roman","Segoe UI",Tahoma,serif;color:#3f3a32;margin:0;padding:20px;font-size:13px;line-height:1.75;background:#fff}.ltr{direction:ltr;unicode-bidi:embed;font-family:"Segoe UI",Tahoma,Arial,sans-serif}
.frame{border:2px solid #8a7a5c;outline:1px solid #c9bfa8;outline-offset:4px;padding:22px 24px;background:#fffdf7}
.chead{text-align:center;border-bottom:1px solid #c9bfa8;padding-bottom:10px;margin-bottom:12px}
.chead h1{margin:0;font-size:26px;letter-spacing:.5px}.chead p{margin:2px 0;font-size:12px;color:#6b6257;font-family:"Segoe UI",Tahoma,Arial,sans-serif}
.ftitle{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.ftitle h2{margin:0;font-size:20px}.fnum{font-family:"Segoe UI",Tahoma,Arial,sans-serif;direction:ltr;font-weight:bold;border:1px solid #8a7a5c;border-radius:6px;padding:2px 12px;font-size:14px}
.stamp{border:2px solid #9a3412;color:#9a3412;border-radius:8px;padding:4px 14px;font-weight:bold;transform:rotate(-4deg);font-size:14px;font-family:"Segoe UI",Tahoma,Arial,sans-serif}
.meta{display:flex;gap:0;border:1px solid #c9bfa8;border-radius:6px;overflow:hidden;margin-bottom:12px;font-size:12px;font-family:"Segoe UI",Tahoma,Arial,sans-serif}
.meta div{flex:1;padding:6px 10px;border-left:1px solid #c9bfa8}.meta div:last-child{border-left:none}.meta small{display:block;color:#6b6257}
table.data{width:100%;border-collapse:collapse;font-size:11.5px;font-family:"Segoe UI",Tahoma,Arial,sans-serif}
table.data th{border-top:2px solid #8a7a5c;border-bottom:2px solid #8a7a5c;padding:7px 5px;background:#f7f1e3}
table.data td{border-bottom:1px dotted #c9bfa8;padding:5px;text-align:center}
table.data tr.free td{background:#fbf3d9;color:#713f12}table.data tfoot td{font-weight:bold;border-top:2px solid #8a7a5c;border-bottom:2px solid #8a7a5c;background:#f7f1e3}
h3.sec{font-size:14.5px;margin:16px 0 7px;text-align:center}h3.sec::after{content:"❦";display:block;color:#8a7a5c;font-size:12px}
.words{margin:11px 0;text-align:center;font-size:13px;border-top:1px solid #c9bfa8;border-bottom:1px solid #c9bfa8;padding:8px;font-family:"Segoe UI",Tahoma,Arial,sans-serif}
.notes{font-size:11.5px;color:#5b554c;font-family:"Segoe UI",Tahoma,Arial,sans-serif}.notes ol{margin:4px 0;padding-right:18px}
.sign{display:flex;gap:30px;margin-top:30px;font-size:12.5px;font-family:"Segoe UI",Tahoma,Arial,sans-serif}.sign div{flex:1;text-align:center}.sign .line{margin-top:46px;border-top:1px solid #3f3a32;padding-top:4px}
.footer{margin-top:12px;text-align:center;font-size:10.5px;color:#8a8177;font-family:"Segoe UI",Tahoma,Arial,sans-serif}
@media print{body{padding:0;background:#fff}.frame{background:#fff}}</style></head><body>
<div class="frame">
<div class="chead"><h1>${INVOICE.platform}</h1><p>كشف حساب رسوم المنصة — مستحقات عن الاشتراكات — ${ltr(INVOICE.site)} — واتساب ${ltr(INVOICE.whatsapp)}</p></div>
<div class="ftitle"><h2>فـاتـورة</h2><span class="fnum">${INVOICE.number}</span><span class="stamp">مستحقة ${fmt(INVOICE.feeTotal)} ج.م</span></div>
<div class="meta"><div><small>تاريخ الإصدار</small><strong>${INVOICE.issueDate}</strong></div>
<div><small>الفترة المشمولة</small><strong>${INVOICE.period}</strong></div>
<div><small>فاتورة إلى</small><strong>${INVOICE.mister} — ${ltr(INVOICE.misterPhone)}</strong></div>
<div><small>أساس الاحتساب</small><strong>20 ج.م × ${INVOICE.paidCount} اشتراكًا</strong></div></div>
<h3 class="sec">الملخص الشهري</h3>
<table class="data"><thead><tr><th>الشهر</th><th>مدفوع</th><th>الأساسي</th><th>حصة المنصة</th><th>الإجمالي</th><th>مجاني</th></tr></thead><tbody>${monthRows()}</tbody>
<tfoot><tr><td>الإجمالي</td><td>${INVOICE.paidCount}</td><td>${fmt(INVOICE.baseTotal)}</td><td>${fmt(INVOICE.feeTotal)}</td><td>${fmt(INVOICE.grandTotal)}</td><td>${INVOICE.freeCount}</td></tr></tfoot></table>
<h3 class="sec">حسب الوحدة الدراسية</h3>
<table class="data"><thead><tr><th>الوحدة / الصف</th><th>مدفوع</th><th>الأساسي</th><th>حصة المنصة</th><th>مجاني</th></tr></thead><tbody>${unitRows()}</tbody></table>
<h3 class="sec">الكشف التفصيلي بالاشتراكات</h3>
<table class="data"><thead><tr><th>م</th><th>التاريخ</th><th>الطالب</th><th>الهاتف</th><th>الوحدة</th><th>الأساسي</th><th>المنصة</th><th>الإجمالي</th></tr></thead><tbody>${detailRows("", "free")}</tbody>
<tfoot><tr><td colspan="5">الإجمالي</td><td>${fmt(INVOICE.baseTotal)}</td><td>${fmt(INVOICE.feeTotal)}</td><td>${fmt(INVOICE.grandTotal)}</td></tr></tfoot></table>
<div class="words"><strong>المستحق للمنصة كتابةً:</strong> ${INVOICE.amountWords} (${fmt(INVOICE.feeTotal)} ج.م).</div>
<div class="notes"><strong>ملاحظات:</strong><ol>${NOTES}</ol></div>
${SIGN("إدارة المنصة", `${INVOICE.mister} (بالاعتماد)`)}
<div class="footer">فاتورة ${INVOICE.number} — صادرة بتاريخ ${INVOICE.issueDate} — ${FOOT}</div>
</div>
</body></html>`;
}

const DESIGNS = [
  { id: "v1-classic", name: "الكلاسيكية الرسمية", render: t1 },
  { id: "v2-modern", name: "العصرية البسيطة", render: t2 },
  { id: "v3-premium", name: "الفاخرة الداكنة", render: t3 },
  { id: "v4-gradient", name: "المتدرجة الحيوية", render: t4 },
  { id: "v5-elegant", name: "الورقية الأنيقة", render: t5 },
  // ─── القالب السادس: فاتورة المبالغ المستحقة (مخصص للاستخدام مع بيانات Supabase) ───
  { id: "due-amounts", name: "فاتورة المبالغ المستحقة", render: t6 },
];

for (const d of DESIGNS) {
  const htmlPath = join(DIR, `${d.id}-${INVOICE.number}.html`);
  const pdfPath = join(DIR, `${d.id}-${INVOICE.number}.pdf`);
  writeFileSync(htmlPath, d.render(), "utf8");
  console.log(`HTML ✓ ${d.id} (${d.name})`);
  try {
    execFileSync(CHROME, ["--headless", "--disable-gpu", "--no-sandbox", `--print-to-pdf=${pdfPath}`, "--print-to-pdf-no-header", `file:///${htmlPath.replace(/\\/g, "/")}`], { stdio: "pipe" });
    console.log(`PDF  ✓ ${d.id}`);
  } catch (e) {
    console.log(`PDF  ✗ ${d.id}: ${String(e).slice(0, 200)}`);
}
//
// ─── related:由于字段关联/参考 ───
// الجملة الرئيسية المرتبطة بالفاتورة / الرئيسية المتعلقة بالفاتورة
// 

// ─── القالب السادس: فاتورة المبالغ المستحقة (مخصص للاستخدام مع بيانات Supabase) ───
function t6() {
  // حساب القيم بناءً على البيانات (سيتم ملؤها من قبل التشغيل)
  const total = INVOICE.grandTotal || 0;
  const amountWords = total === 0 ? "الصفر ج.م" : `${total.toLocaleString('en-US')} ج.م`;
  
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>فاتورة مبالغ مستحقة - منصة وليد عوني</title>
  <style>
    @page{size:A4;margin:15mm}*{box-sizing:border-box}
    body{font-family:"Cairo",Tahoma,Arial,sans-serif;color:#1a1a1a;margin:0;padding:30px;font-size:14px;line-height:1.6;background:#fff}
    .rtl{direction:rtl;unicode-bidi:embed}
    .container{max-width:900px;margin:0 auto}
    .header-section{border-bottom:3px solid #0f766e;padding-bottom:20px;margin-bottom:25px}
    .branding{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
    .invoice-from,.invoice-to{flex:1;margin-right:20px}
    .invoice-to{margin-left:20px;border-left:2px solid #e5e7ec;padding-left:20px}
    .meta-row{bottom:8px;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:8px}
    .meta-row span{display:block;font-size:12px;color:#666;margin-bottom:4px}
    .meta-row strong{font-weight:bold;color:#1a1a1a}
    .sign-section{margin-top:40px;padding-top:20px;border-top:1px solid #eee}
    .sign-row{display:flex;justify-content:space-between;margin:15px 0}
    .sign-block{text-align:center;width:48%}
    .sign-block .label{font-family:"Aref Ruqaa",Tahoma,Arial,sans-serif;font-size:13px;color:#666;margin-bottom:5px;display:block}
    .sign-block .name{font-family:"Aref Ruqaa",Tahoma,Arial,sans-serif;font-size:16px;font-weight:bold;color:#1a1a1a;text-align:center;min-height:40px}
    .sign-block .line{border-top:1px solid #333;width:60%;margin:8px auto 0}
    .footer{margin-top:40px;border-top:1px solid #ddd;padding-top:15px;font-size:11px;color:#777;text-align:center}
    .amount-table{width:100%;border-collapse:collapse;margin:25px 0}
    .amount-table th,.amount-table td{border:1px solid #ddd;padding:12px;text-align:center;font-size:13px}
    .amount-table th{background:#0f766e;color:#fff}
    .amount-table tr:nth-child(even) td{background:#f8fafc}
    .total-row{border-top:2px solid #0f766e;padding-top:10px;margin-top:10px}
    .notes{font-size:12px;color:#555;margin-top:20px;line-height:1.8}
    .notes li{margin-bottom:8px}
    .section-title{font-size:16px;color:#0f766e;margin:20px 0 10px;padding-bottom:8px;border-bottom:2px solid #e5e7ec}
  </style>
</head>
<body>
  <div class="container">
    <div class="header-section">
      <div class="branding">
        <div class="invoice-from">
          <h1>فاتورة مبالغ مستحقة</h1>
          <p>منصة وليد عوني</p>
        </div>
        <div class="invoice-to">
          <h2>مستر وليد عوني</h2>
        </div>
      </div>
    </div>

    <div class="meta-row">
      <span><strong>الصادر من:</strong> ${INVOICE.issuerName} - ${INVOICE.issuerRole}</span>
    </div>
    <div class="meta-row">
      <span><strong>تاريخ الإصدار:</strong> ${INVOICE.issueDate}</span>
      <span><strong>فترة الاستحقاق:</strong> ${INVOICE.period}</span>
    </div>

    <div class="section-title">بيانات الفاتورة</div>
    <table class="amount-table">
      <thead>
        <tr>
          <th>التاريخ</th>
          <th>الوصف</th>
          <th>المبلغ (ج.م)</th>
        </tr>
      </thead>
      <tbody>
        <!-- rows will be populated by data fetcher -->
        <tr><td colspan="3" style="text-align:center;padding:20px;color:#666">يتم تحميل البيانات من قاعدة Supabase...</td></tr>
      </tbody>
    </table>

    <div class="total-row">
      <div style="width:100%;display:flex;justify-content:space-between">
        <span>إجمالي المبالغ المستحقة</span>
        <span style="font-family:'Cairo',Tahoma,Arial,sans-serif;font-size:18px;font-weight:bold;color:#0f766e;">${fmt(total)} ج.م</span>
      </div>
    </div>

    <div class="sign-section">
      <p style="text-align:center;margin-bottom:25px;font-family:'Aref Ruqaa',Tahoma,Arial,sans-serif;font-size:14px;color:#666;">التوقيع</p>
      <div class="sign-row">
        <div class="sign-block">
          <div class="label">أحمد عصام</div>
          <div class="name"><span id="ahmed-name">_____________________</span></div>
          <div class="line"></div>
        </div>
        <div class="sign-block">
          <div class="label">وليد عوني</div>
          <div class="name"><span id="walid-name">_____________________</span></div>
          <div class="line"></div>
        </div>
      </div>
      <p style="text-align:center;margin-top:25px;font-size:12px;color:#777">تنفيذ بواسطة: نظام إدارة منصة وليد عوني</p>
    </div>

    <div class="footer">
      فاتورة مُنشأة آليًا من منصة وليد عوني — © 2026 جميع الحقوق محفوظة
    </div>
  </div>
</body>
</html>`;
}

const DESIGNS
}
