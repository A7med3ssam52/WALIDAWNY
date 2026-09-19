import { describe, expect, it } from 'vitest';

import { buildLabsLeaderboard, gradeLabsExam, LABS_TOTAL_SCORE } from './labsExamData';

describe('gradeLabsExam', () => {
  it('scores a perfect paper', () => {
    const result = gradeLabsExam({
      choices: { 'lab-q1': 1, 'lab-q2': 1, 'lab-q3': 2, 'lab-q4': 2, 'lab-q5': 0 },
      essays: { 'lab-q6': 'بسبب قاعدة أرخميدس' },
    });
    expect(result.finalScore).toBe(LABS_TOTAL_SCORE);
    expect(result.passed).toBe(true);
  });

  it('scores blanks as zero and fails an empty paper', () => {
    const result = gradeLabsExam({ choices: {}, essays: {} });
    expect(result.finalScore).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('counts wrong MCQ as zero', () => {
    const result = gradeLabsExam({
      choices: { 'lab-q1': 0, 'lab-q2': 1, 'lab-q3': 2, 'lab-q4': 2, 'lab-q5': 0 },
      essays: {},
    });
    expect(result.finalScore).toBe(4);
  });
});

describe('buildLabsLeaderboard', () => {
  it('inserts you ranked by score', () => {
    const board = buildLabsLeaderboard(7);
    expect(board[0].student_id).toBe('lab-you');
    expect(board[0].rank).toBe(1);
    const ranks = board.map((row) => row.rank);
    expect(ranks).toEqual([1, 2, 3, 4, 5]);
  });
});
