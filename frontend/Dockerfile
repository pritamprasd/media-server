FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM nginx:alpine
RUN apk add --no-cache openssl && \
    mkdir -p /etc/nginx/certs && \
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout /etc/nginx/certs/homeserver.key \
      -out /etc/nginx/certs/homeserver.crt \
      -subj "/CN=homeserver.local" \
      -addext "subjectAltName=DNS:homeserver.local,DNS:localhost,IP:127.0.0.1"
COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
