-- Схема создаётся при каждом старте сервера; все команды повторяемые.

create table if not exists players (
  id         serial primary key,
  nick       text not null,
  nick_key   text not null unique,          -- ник без учёта регистра, для уникальности
  token      text not null unique,          -- хранится в браузере участника
  code       text not null,                 -- секретный код для входа с другого устройства
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists questions (
  id        serial primary key,
  game      int not null check (game in (1, 2)),
  position  int not null,
  text      text not null,
  image     text,
  options   jsonb not null,                 -- массив из 2–5 строк
  correct   int not null,                   -- индекс правильного варианта с нуля
  seconds   int not null default 30 check (seconds between 5 and 300),
  double    boolean not null default false,
  opens_at  timestamptz,                    -- момент открытия вариантов (после отсчёта)
  deadline  timestamptz,
  closed_at timestamptz
);
create index if not exists questions_game_position on questions (game, position);

create table if not exists answers (
  player_id   int not null references players (id) on delete cascade,
  question_id int not null references questions (id) on delete cascade,
  option      int not null,
  received_at timestamptz not null default clock_timestamp(),
  primary key (player_id, question_id)      -- один ответ на вопрос
);
create index if not exists answers_question on answers (question_id);

create table if not exists game_state (
  id          int primary key default 1 check (id = 1),
  game        int not null default 1 check (game in (1, 2)),
  phase       text not null default 'lobby' check (phase in ('lobby', 'question', 'revealed', 'finished')),
  question_id int references questions (id) on delete set null,
  updated_at  timestamptz not null default clock_timestamp()
);
insert into game_state (id) values (1) on conflict do nothing;

create table if not exists admin_sessions (
  token      text primary key,
  created_at timestamptz not null default clock_timestamp()
);

-- Журнал только на дописывание: по нему разбираем споры о победителях.
create table if not exists journal (
  id        bigserial primary key,
  at        timestamptz not null default clock_timestamp(),
  kind      text not null,
  player_id int,
  nick      text,
  data      jsonb not null default '{}'
);
create index if not exists journal_player on journal (player_id);

create or replace function journal_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'journal is append-only';
end $$;
drop trigger if exists journal_append_only on journal;
create trigger journal_append_only before update or delete on journal
  for each statement execute function journal_append_only();
