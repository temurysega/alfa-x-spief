FROM node:24.19.0-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
# Папка общего тома: снимки участников и картинки вопросов. nginx читает её же.
RUN mkdir -p /data/state /data/img /data/tmp && chown -R node:node /data
USER node
ENV NODE_ENV=production
CMD ["node", "src/index.ts"]
