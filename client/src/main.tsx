import { createRoot } from 'react-dom/client';
import { Player } from './player/Player';
import './styles/fonts.css';
import './styles/brand.css';
import './styles/app.css';

// Тёмной темы нет: по брендбуку чёрного фона не бывает, только светлый и красный.
const root = createRoot(document.getElementById('root')!);
if (window.location.pathname.startsWith('/admin')) {
  // Пульт грузится отдельным файлом: телефонам участников его код не нужен.
  void import('./admin/Admin').then(({ Admin }) => root.render(<Admin />));
} else {
  root.render(<Player />);
}
