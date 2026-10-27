import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// В режиме разработки (npm run dev) запросы к игре уходят в запущенный docker compose.
const backend = 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': backend,
      '/state': backend,
      '/img': backend,
    },
  },
});
