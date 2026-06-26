FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM nginx:alpine
RUN apk add --no-cache openssl && \
    mkdir -p /etc/nginx/certs && \
    openssl genrsa -out /etc/nginx/certs/ca.key 2048 && \
    openssl req -x509 -new -nodes -key /etc/nginx/certs/ca.key \
      -days 3650 -out /etc/nginx/certs/ca.crt \
      -subj "/CN=MediaServer Local CA" && \
    openssl genrsa -out /etc/nginx/certs/homeserver.key 2048 && \
    openssl req -new -key /etc/nginx/certs/homeserver.key \
      -out /etc/nginx/certs/homeserver.csr \
      -subj "/CN=homeserver.local" && \
    openssl x509 -req -in /etc/nginx/certs/homeserver.csr \
      -CA /etc/nginx/certs/ca.crt -CAkey /etc/nginx/certs/ca.key \
      -CAcreateserial -out /etc/nginx/certs/homeserver.crt \
      -days 3650 \
      -extfile <(echo "subjectAltName=DNS:homeserver.local,DNS:localhost,IP:127.0.0.1") && \
    rm -f /etc/nginx/certs/homeserver.csr
COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
RUN cp /etc/nginx/certs/ca.crt /usr/share/nginx/html/ca.crt && \
    echo "" && \
    echo "========================================================" && \
    echo "  To install this PWA on your phone:" && \
    echo "  1. Open https://homeserver.local:3443/ca.crt" && \
    echo "     on your phone browser" && \
    echo "  2. Download and install the CA certificate" && \
    echo "  3. Reload https://homeserver.local:3443/" && \
    echo "     The 'Not secure' warning will be gone" && \
    echo "  4. Tap Install when prompted" && \
    echo "========================================================" && \
    echo ""
