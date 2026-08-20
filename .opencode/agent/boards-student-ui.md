---
description: يبني واجهة الطالب لميزة «السبورات» — عرض صور السبورة في StudentLessonPage.tsx تحت الفيديو والملف داخل تبويب «الدرس» + تحديث اختباراته.
mode: subagent
---

# Sub Agent: boards-student-ui

## الفكرة (الميزة كاملة)

السبورات = صور يرفعها المدرس جوا كل درس، والصورة بتتعرض للطالب **جوه نفس تبويب «الدرس»** (تحت الفيديو وملف الـ PDF، قبل شريط التنقل بين الدروس) كشبكة صور. لو مفيش صور → مفيش أي حاجة تظهر. انت مسؤول عن **واجهة الطالب فقط**.

## نطاقك (ملكك حصرياً — ممنوع تلمس غيرها)

1. `src/features/student/StudentLessonPage.tsx` (تعديل)
2. `src/features/student/StudentLessonPage.test.tsx` (تعديل/تحديث)

**ممنوع:** `src/types/database.ts`، `src/data/rpc.ts`، `src/test/supabase-mock.ts` — جاهزة ومكتملة، اعتمد عليها فقط.

## اقرأ قبل الكتابة

- `src/features/student/StudentLessonPage.tsx` بالكامل — هيكل `load()` بـ `requestIdRef` + الـ `Promise.all` + ترتيب Cards في تبويب `lesson` (فيديو → ملف → تنقل) + نمط `pdfFailed` الهادئ + الـ `data-testid`s.
- `src/data/rpc.ts` — الدالة الجديدة الجاهزة: `getLessonBoardSignedUrls(lessonId)` → `{ boards: LessonBoardSignedUrl[], lesson_id }` (`LessonBoardSignedUrl = { board_id, original_name, sort_order, signed_url }`).
- `src/features/student/StudentLessonPage.test.tsx` — الشكل الحالي عشان تحديثه من غير كسر.

## المطلوب بالتفصيل

### في `StudentLessonPage.tsx`

1. **State:** أضف `const [boards, setBoards] = useState<LessonBoardSignedUrl[]>([])` (وأي state خطأ لو احتاجه — تفضيل: صمت عند الفشل زي نمط `pdfFailed` لكن من غير رسالة قاسية).
2. **في `load()`:** بعد فحص `has_access` (مع باقي الـ Promise.all أو بعده): اقرا `getLessonBoardSignedUrls(lessonRow.id)`:
   - نجاح → `setBoards(res.boards)` (مع مراعاة `requestIdRef` زي باقي الحالات).
   - فشل → `setBoards([])` (مش شرط يعرض خطأ — بس لو عندك `boardsFailed` استخدمه لإخفاء الكارد بصمت).
   - **افتراضي جديد في `load()`:** `setBoards([])` أول ما تبدأ الـ load عشان مفيش صور قديمة تلمع أثناء تبديل الدروس.
3. **العرض:** في تبويب `lesson`، **بعد Card الـ PDF مباشرة وقبل عنصر التنقل**:
   ```tsx
   {boards.length > 0 ? (
     <Card title="السبورة">
       <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="board-grid">
         {boards.map((board) => (
           <img
             key={board.board_id}
             src={board.signed_url}
             alt={board.original_name}
             loading="lazy"
             className="w-full rounded-lg border border-white/15 bg-white/5 object-contain"
             data-testid={`board-image-${board.board_id}`}
           />
         ))}
       </div>
     </Card>
   ) : null}
   ```
   - التراتيب بتاعة الـ EF جاية `sort_order asc` — اعرضها كما هي.
   - **مهم:** لو `boards.length === 0` → **لا ترندّر أي حاجة** (لا كارد ولا EmptyState).
4. لا تغيّر أي حاجة في التبويبات التانية أو الـ navigation أو منطق الـ progress.

### في `StudentLessonPage.test.tsx`

- حدّث الموكس: الـ `supabase-mock.ts` جاهز ويرجع `[]` افتراضياً للـ boards — اتأكد إن الاختبارات الموجودة ما زالت بتعدي (الكارد مفروض ما يظهرش).
- أضف اختبار: مع boards في الـ mock (ارجع صفين) → كارد «السبورة» يظهر + صورتين بـ `data-testid`.
- أضف اختبار: بدون boards → الكارد مش موجود (`queryByTestId('board-grid')` → null).
- أضف اختبار: فشل جلب الـ boards → الصفحة بتفضل شغالة عادي والكارد مش موجود.

## قيود

- **ممنوع تعديل** سلوك الفيديو/الـ PDF/الامتحانات/الأسئلة أو الـ load بتاعهم — إضافة فقط.
- كل النصوص بالعربي RTL (العنوان «السبورة»)، استخدم `Card` من `../../components/Card` (موجودة في الصفحة).
- ممنوع تلمس `src/test/supabase-mock.ts` — لو الـ mock الحالي ناقص حاجة لاختباراتك، استخدم `vi.mock` محلي في ملف الاختبار من غير تعديل الملف المشترك.

## النتيجة النهائية

قائمة الملفات + ملخص التغييرات (state/load/render) + نتيجة اختبارات صفحة الطالب لو شغلتها.
