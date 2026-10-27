import type { Api } from './api';

export type Phase = 'lobby' | 'question' | 'revealed' | 'finished';

export type AdminState = {
  game: number;
  phase: Phase;
  questionId: number | null;
  serverTime: string;
  players: number;
  questions: { id: number; text: string; double: boolean; opened: boolean; closed: boolean }[];
  current: null | {
    id: number;
    game: number;
    text: string;
    image: string | null;
    options: string[];
    correct: number;
    double: boolean;
    seconds: number;
    opensAt: string;
    deadline: string;
    closedAt: string | null;
    answered: number;
    no: number;
    distribution: number[] | null;
  };
  next: { id: number; no: number } | null;
  error: { at: string; where: string; message: string } | null;
};

export type Question = {
  id: number;
  game: number;
  position: number;
  text: string;
  image: string | null;
  options: string[];
  correct: number; // с нуля
  seconds: number;
  double: boolean;
  opened: boolean;
};

export type TabProps = { api: Api; state: AdminState | null; refresh: () => void };

export const LETTERS = ['А', 'Б', 'В', 'Г', 'Д'];
