// Проверка ника: длина, допустимые символы, фильтр нецензурного (ТЗ, п. 4).
// Фильтр простой и что-то пропустит: на этот случай в админке есть «переименовать» и «удалить».

const ALLOWED = /^[A-Za-zА-Яа-яЁё0-9 _.\-]+$/;

// Корни ищутся в нике целиком, после склейки слов и схлопывания повторов букв.
const CYR_ROOTS = [
  'хуй', 'хуе', 'хуя', 'хую', 'хуи', 'пизд', 'пезд',
  'ебат', 'ебан', 'ебал', 'ебуч', 'ебну', 'ебло', 'еблан', 'ебыр',
  'заеб', 'уеб', 'выеб', 'наеб', 'поеб', 'доеб', 'съеб', 'отъеб', 'долбоеб', 'долбаеб',
  'бляд', 'блят', 'пидор', 'пидар', 'пидр', 'педик', 'мудак', 'мудил', 'мудозв',
  'залуп', 'гандон', 'гондон', 'шлюх', 'дроч', 'мраз', 'говн', 'засран', 'обосра', 'жоп',
  'сучк', 'сучар', 'сучен', 'сукин', 'шалав', 'нахер', 'похер',
  'гитлер', 'фюрер', 'нацист', 'чурк', 'жидяр', 'жидов',
];
// Эти — только в начале слова, иначе ловят «корабля», «рубля».
const CYR_WORD_STARTS = ['бля', 'сука', 'суки', 'суке', 'суку', 'сукой'];

const LAT_ROOTS = [
  'fuck', 'fuk', 'shit', 'bitch', 'cunt', 'dick', 'pusy', 'niga', 'niger', 'fag', 'whore', 'slut', 'porn',
  'nazi', 'hitler', 'huy', 'huj', 'hui', 'xuy', 'xui', 'xyi', 'pizd', 'pezd', 'ebat', 'eban', 'ebal',
  'blyat', 'blyad', 'blya', 'pidor', 'pidar', 'pidr', 'mudak', 'zalup', 'gandon', 'gondon', 'shluh',
  'suka', 'suki', 'dolboeb', 'yeban', 'yebat', 'ueban', 'uebok', 'jopa', 'zhopa', 'govno',
];

// Латиница и цифры, похожие на кириллицу: «xyй», «6ля», «п1зда».
const TO_CYR: Record<string, string> = {
  a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у',
  u: 'и', r: 'г', n: 'п', '0': 'о', '1': 'и', '3': 'з', '4': 'ч', '6': 'б', '@': 'а',
};
// Кириллица и цифры, похожие на латиницу: «fuсk» с русской «с».
const TO_LAT: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i',
};

function squeeze(s: string): string {
  return s.replace(/(.)\1+/g, '$1');
}

function cyrWords(lower: string): string[] {
  const mapped = [...lower].map((ch) => TO_CYR[ch] ?? ch).join('');
  return mapped.split(/[^а-я]+/).filter(Boolean).map(squeeze);
}

function latText(lower: string): string {
  const mapped = [...lower].map((ch) => TO_LAT[ch] ?? ch).join('');
  return squeeze(mapped.replace(/[^a-z]+/g, ''));
}

export function isProfane(nick: string): boolean {
  const lower = nick.toLowerCase().replaceAll('ё', 'е');
  if (lower.replace(/\D+/g, '').includes('1488')) return true;
  const words = cyrWords(lower);
  const joined = squeeze(words.join(''));
  if (CYR_ROOTS.some((r) => joined.includes(r))) return true;
  if (words.some((w) => CYR_WORD_STARTS.some((r) => w.startsWith(r)))) return true;
  const lat = latText(lower);
  return LAT_ROOTS.some((r) => lat.includes(r));
}

export function cleanNick(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

// Ключ уникальности: без учёта регистра и разницы «е/ё».
export function nickKey(nick: string): string {
  return cleanNick(nick).toLowerCase().replaceAll('ё', 'е');
}

export type NickCheck = { ok: true; nick: string } | { ok: false; error: string };

export function checkNick(raw: unknown): NickCheck {
  if (typeof raw !== 'string') return { ok: false, error: 'Введи ник' };
  const nick = cleanNick(raw);
  const length = [...nick].length;
  if (length < 2) return { ok: false, error: 'Ник слишком короткий — нужно от 2 символов' };
  if (length > 20) return { ok: false, error: 'Ник слишком длинный — до 20 символов' };
  if (!ALLOWED.test(nick)) return { ok: false, error: 'В нике можно буквы, цифры, пробел, точку, _ и -' };
  if ((nick.match(/[A-Za-zА-Яа-яЁё0-9]/g) ?? []).length < 2) {
    return { ok: false, error: 'В нике нужны хотя бы две буквы или цифры' };
  }
  if (isProfane(nick)) return { ok: false, error: 'Такой ник не подойдёт, придумай другой' };
  return { ok: true, nick };
}
