#!/bin/sh
set -e

CERT_DIR=/etc/nginx/certs
SERVER_HOSTNAME=$(hostname -f 2>/dev/null || hostname)

mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_DIR/ca.crt" ]; then
    echo "Generating CA and server certificates..."

    openssl genrsa -out "$CERT_DIR/ca.key" 2048
    openssl req -x509 -new -nodes -key "$CERT_DIR/ca.key" \
      -days 3650 -out "$CERT_DIR/ca.crt" \
      -subj "/CN=MediaServer Local CA"

    openssl genrsa -out "$CERT_DIR/$SERVER_HOSTNAME.key" 2048
    openssl req -new -key "$CERT_DIR/$SERVER_HOSTNAME.key" \
      -out "$CERT_DIR/$SERVER_HOSTNAME.csr" \
      -subj "/CN=$SERVER_HOSTNAME"

    openssl x509 -req -in "$CERT_DIR/$SERVER_HOSTNAME.csr" \
      -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" \
      -CAcreateserial -out "$CERT_DIR/$SERVER_HOSTNAME.crt" \
      -days 3650 \
      -extfile <(echo "subjectAltName=DNS:$SERVER_HOSTNAME,DNS:localhost,IP:127.0.0.1")

    rm -f "$CERT_DIR/$SERVER_HOSTNAME.csr"

    echo "Certificates generated."
fi

cp "$CERT_DIR/ca.crt" /usr/share/nginx/html/ca.crt

echo ""
echo "========================================================"
echo "  To install this PWA on your phone:"
echo "  1. Open https://$SERVER_HOSTNAME:3443/ca.crt"
echo "  2. Download and install the CA certificate"
echo "  3. Reload https://$SERVER_HOSTNAME:3443/"
echo "     The 'Not secure' warning will be gone"
echo "  4. Tap Install when prompted"
echo "========================================================"
echo ""

exec nginx -g "daemon off;"
