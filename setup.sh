#!/usr/bin/env bash
set -euo pipefail

echo "==> Setting up PaperReader server..."

echo "==> Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "==> Installing build essentials..."
sudo apt-get install -y build-essential

echo "==> Creating app directory..."
sudo mkdir -p /opt/paperreader
sudo chown ubuntu:ubuntu /opt/paperreader

echo "==> Cloning repo..."
git clone git@github.com:AndrewwBC/paperreader.git /opt/paperreader

echo "==> Installing dependencies..."
cd /opt/paperreader
npm ci --omit=dev

echo "==> Building frontend..."
npm run build

echo "==> Setting up systemd service..."
sudo cp /opt/paperreader/paperreader.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable paperreader
sudo systemctl start paperreader

echo "==> Setting up firewall..."
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "==> Setup complete!"
echo "==> Service status:"
sudo systemctl status paperreader --no-pager
