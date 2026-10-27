import { createRoot } from 'react-dom/client';
import { Player } from './player/Player';
import './styles/fonts.css';
import './styles/alfa-inside.css';
import './styles/app.css';

// Тёмная тема — как в системе телефона; в дизайн-системе она уже описана.
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => document.documentElement.setAttribute('data-theme', dark.matches ? 'dark' : 'light');
applyTheme();
dark.addEventListener('change', applyTheme);

const root = createRoot(document.getElementById('root')!);
if (window.location.pathname.startsWith('/admin')) {
  // Пульт грузится отдельным файлом: телефонам участников его код не нужен.
  void import('./admin/Admin').then(({ Admin }) => root.render(<Admin />));
} else {
  root.render(<Player />);
}
