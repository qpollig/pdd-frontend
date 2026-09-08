# Stage 1 — сборка. Vite "запекает" VITE_*-переменные в JS-бандл прямо на этом этапе
# (в отличие от backend, здесь это НЕ рантайм-конфигурация — после сборки поменять их
# можно только пересобрав образ заново).
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=""
ARG VITE_USE_MOCK_API="false"
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_USE_MOCK_API=$VITE_USE_MOCK_API

# npm run build = vue-tsc -b && vite build — сборка упадёт, если есть ошибки типов.
RUN npm run build

# Stage 2 — рантайм: только собранная статика + Nginx, без Node.js и node_modules.
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
