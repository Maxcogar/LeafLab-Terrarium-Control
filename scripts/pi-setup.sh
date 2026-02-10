#!/bin/bash
set -e

echo "🌱 LeafLab Pi Setup"
echo "==================="

# 1. Install Node.js 20
if ! command -v node &> /dev/null || [[ "$(node -v)" != v20* ]]; then
  echo "📦 Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
  sudo apt-get install -y nodejs
else
  echo "✅ Node.js $(node -v) already installed"
fi

# 2. Install build tools for native modules (better-sqlite3, serialport)
echo "📦 Installing build tools..."
sudo apt-get install -y build-essential python3 git

# 3. Clone or update the repo
DEST="$HOME/leaflab"
REPO="https://github.com/Maxcogar/LeafLab-Terrarium-Control.git"

if [ -d "$DEST/.git" ]; then
  echo "🔄 Updating existing repo..."
  cd "$DEST" && git pull
else
  echo "📥 Cloning repo..."
  git clone "$REPO" "$DEST"
fi

cd "$DEST"

# 4. Install dependencies
echo "📦 Installing dependencies..."
npm install
npm install --prefix server
npm install --prefix client

# 5. Build
echo "🔨 Building..."
npm run build

# 6. Install production server deps
cd "$DEST/server"
npm install --production
cd "$DEST"

# 7. Setup systemd service
echo "⚙️ Setting up auto-start service..."
SERVICE_USER="$(whoami)"
sudo tee /etc/systemd/system/leaflab.service > /dev/null << EOF
[Unit]
Description=LeafLab Companion
After=network.target

[Service]
ExecStart=/usr/bin/node $DEST/server/dist/index.js
WorkingDirectory=$DEST/server
Restart=always
User=$SERVICE_USER
Environment=PORT=3333
Environment=SERIAL_PORT=/dev/ttyUSB0
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable leaflab.service
sudo systemctl start leaflab.service

# 8. Setup kiosk autostart
echo "🖥️ Setting up kiosk mode..."
mkdir -p "$HOME/.config/autostart"
tee "$HOME/.config/autostart/kiosk.desktop" > /dev/null << 'EOF'
[Desktop Entry]
Type=Application
Name=LeafLab Kiosk
Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars --check-for-update-interval=31536000 http://localhost:3333
X-GNOME-Autostart-enabled=true
EOF

echo ""
echo "✅ Setup complete!"
echo "   Service status: sudo systemctl status leaflab"
echo "   Reboot to start kiosk: sudo reboot"
