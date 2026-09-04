#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/paperreader"
SERVICE_NAME="paperreader"

echo "==> Deploy starting at $(date)"

cd "$APP_DIR"

echo "==> Pulling latest code..."
git pull origin main

echo "==> Installing dependencies..."
npm ci --omit=dev

echo "==> Building frontend..."
npm run build

echo "==> Restarting service..."
sudo systemctl restart "$SERVICE_NAME"

echo "==> Deploy complete at $(date)"
