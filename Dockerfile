# Stage 1 — сборка. Vite "запекает" VITE_*-переменные в JS-бандл прямо на этом этапе
# (в отличие от backend, здесь это НЕ рантайм-конфигурация — после сборки поменять их
# можно только пересобрав образ заново).
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Nginx в этом образе раздаёт SPA с корня "/", а не с /pdd-frontend/ (это дефолт только для
# GitHub Pages) — иначе бандл ссылается на /pdd-frontend/assets/... и Nginx отдаёт вместо них
# index.html, страница остаётся пустой.
ARG VITE_BASE_PATH="/"
ARG VITE_API_BASE_URL=""
ARG VITE_USE_MOCK_API="false"
# Способ входа отвязан от источника данных: VITE_MOCK_LOGIN=true — mock-вход при
# VITE_USE_MOCK_API=false (реальные билеты/темы + вход по mock-коду, пока нет OAuth-приложений).
ARG VITE_MOCK_LOGIN="false"
# Публичные client_id OAuth-приложений (не секрет) — нужны только для настоящего OAuth-редиректа
# (VITE_USE_MOCK_API=false и VITE_MOCK_LOGIN не true). Заданы в .env.example, но забыты здесь.
ARG VITE_YANDEX_OAUTH_CLIENT_ID=""
ARG VITE_VK_OAUTH_CLIENT_ID=""
ENV VITE_BASE_PATH=$VITE_BASE_PATH
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_USE_MOCK_API=$VITE_USE_MOCK_API
ENV VITE_MOCK_LOGIN=$VITE_MOCK_LOGIN
ENV VITE_YANDEX_OAUTH_CLIENT_ID=$VITE_YANDEX_OAUTH_CLIENT_ID
ENV VITE_VK_OAUTH_CLIENT_ID=$VITE_VK_OAUTH_CLIENT_ID

# npm run build = vue-tsc -b && vite build — сборка упадёт, если есть ошибки типов.
RUN npm run build

# Stage 2 — рантайм: только собранная статика + Nginx, без Node.js и node_modules.
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
