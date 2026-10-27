// Снимок участника — то же, что собирает сервер в server/src/snapshots.ts.
export type Snapshot = {
  phase: 'lobby' | 'countdown' | 'question' | 'revealed' | 'finished';
  game: number;
  nick: string;
  questionId: number | null;
  questionNo: number | null;
  questionsTotal: number;
  opensAt: string | null;
  deadline: string | null;
  text: string | null;
  image: string | null;
  options: string[] | null;
  double: boolean;
  myAnswer: number | null;
  correct: number | null;
};

export type Pending = {
  questionId: number;
  option: number;
  status: 'sending' | 'ok' | 'rejected' | 'failed';
};

export const LETTERS = ['А', 'Б', 'В', 'Г', 'Д'];
