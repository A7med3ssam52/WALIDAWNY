import type { GeneralExamLeaderboardRow } from '../../types/database';

/** Demo-only exam content for /labs/exam. No backend, no persistence. */
export interface LabsQuestion {
  id: string;
  type: 'mcq' | 'essay';
  prompt: string;
  choices: string[] | null;
  correctIndex: number | null;
  maxScore: number;
}

export const LABS_DURATION_MINUTES = 3;
export const LABS_DURATION_MS = LABS_DURATION_MINUTES * 60_000;
export const LABS_PASSING_PERCENT = 50;

export const LABS_QUESTIONS: LabsQuestion[] = [
  {
    id: 'lab-q1',
    type: 'mcq',
    prompt: 'ناتج ٧ × ٨ يساوي',
    choices: ['٥٤', '٥٦', '٤٨', '٦٣'],
    correctIndex: 1,
    maxScore: 1,
  },
  {
    id: 'lab-q2',
    type: 'mcq',
    prompt: 'عاصمة جمهورية مصر العربية هي',
    choices: ['الإسكندرية', 'القاهرة', 'الجيزة', 'أسوان'],
    correctIndex: 1,
    maxScore: 1,
  },
  {
    id: 'lab-q3',
    type: 'mcq',
    prompt: 'أكبر كواكب المجموعة الشمسية هو',
    choices: ['الأرض', 'المريخ', 'المشتري', 'زحل'],
    correctIndex: 2,
    maxScore: 1,
  },
  {
    id: 'lab-q4',
    type: 'mcq',
    prompt: '١٥٪ من ٢٠٠ يساوي',
    choices: ['٢٠', '٢٥', '٣٠', '٣٥'],
    correctIndex: 2,
    maxScore: 1,
  },
  {
    id: 'lab-q5',
    type: 'mcq',
    prompt: 'يغلي الماء عند ١٠٠ درجة مئوية (عند الضغط الجوي المعتاد)',
    choices: ['صح', 'خطأ'],
    correctIndex: 0,
    maxScore: 1,
  },
  {
    id: 'lab-q6',
    type: 'essay',
    prompt: 'اشرح في سطرين: لماذا تطفو السفن المصنوعة من الحديد رغم أن الحديد أثقل من الماء؟',
    choices: null,
    correctIndex: null,
    maxScore: 2,
  },
];

export const LABS_TOTAL_SCORE = LABS_QUESTIONS.reduce((sum, q) => sum + q.maxScore, 0);

export interface LabsAnswers {
  choices: Record<string, number | null>;
  essays: Record<string, string>;
}

export interface LabsResult {
  autoScore: number;
  finalScore: number;
  passed: boolean;
  perQuestion: Record<string, number>;
}

/**
 * Demo grading: MCQ auto-scored; the essay is "auto-graded" for demo
 * purposes (full marks when answered, zero when blank) and clearly
 * labeled as such in the UI. Real exams grade essays manually.
 */
export function gradeLabsExam(answers: LabsAnswers): LabsResult {
  const perQuestion: Record<string, number> = {};
  let autoScore = 0;
  for (const question of LABS_QUESTIONS) {
    if (question.type === 'mcq') {
      const score = answers.choices[question.id] === question.correctIndex ? question.maxScore : 0;
      perQuestion[question.id] = score;
      autoScore += score;
    } else {
      const text = (answers.essays[question.id] ?? '').trim();
      const score = text ? question.maxScore : 0;
      perQuestion[question.id] = score;
      autoScore += score;
    }
  }
  return {
    autoScore,
    finalScore: autoScore,
    passed: (autoScore / LABS_TOTAL_SCORE) * 100 >= LABS_PASSING_PERCENT,
    perQuestion,
  };
}

const MOCK_PEERS: Array<{ name: string; score: number }> = [
  { name: 'أحمد سامي', score: 6 },
  { name: 'مريم خالد', score: 6 },
  { name: 'يوسف محمد', score: 5 },
  { name: 'فاطمة علي', score: 4 },
];

/** Mock leaderboard with "you" inserted by score (demo only). */
export function buildLabsLeaderboard(myScore: number): GeneralExamLeaderboardRow[] {
  const now = new Date().toISOString();
  const rows = [
    ...MOCK_PEERS.map((peer, index) => ({
      rank: 0,
      student_id: `lab-peer-${index}`,
      student_name: peer.name,
      status: 'graded' as const,
      auto_score: peer.score,
      manual_score: 0,
      final_score: peer.score,
      submitted_at: now,
    })),
    {
      rank: 0,
      student_id: 'lab-you',
      student_name: 'أنت (تجريبي)',
      status: 'graded' as const,
      auto_score: myScore,
      manual_score: 0,
      final_score: myScore,
      submitted_at: now,
    },
  ];
  rows.sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0));
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}
