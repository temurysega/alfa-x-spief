function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  adminPassword: required('ADMIN_PASSWORD'),
  dataDir: process.env.DATA_DIR ?? './data',
  // Отсчёт перед вопросом: за это время снимок успевают забрать все (ТЗ, п. 7).
  countdownSeconds: 5,
  // Допуск на сеть после дедлайна (ТЗ, п. 8).
  graceSeconds: 1,
};
