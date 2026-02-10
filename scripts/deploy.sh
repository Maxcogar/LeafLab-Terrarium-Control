#!/bin/bash
set -e

# Configuration
RPI_USER="pi"
RPI_HOST="raspberrypi.local"
DEST_DIR="/home/pi/leaflab"

echo "🌱 Deploying to $RPI_USER@$RPI_HOST..."

# 1. Build Client & Server
echo "Building Frontend & Backend..."
npm run build --prefix client
npm run build --prefix server

# 2. Sync Files
echo "Syncing files..."
# Exclude node_modules, .git, database, logs
rsync -avz --delete 
  --exclude 'node_modules' 
  --exclude '.git' 
  --exclude 'leaflab.db*' 
  --exclude '*.log' 
  --exclude 'client/src' 
  --exclude 'client/node_modules' 
  ./ "$RPI_USER@$RPI_HOST:$DEST_DIR"

# 3. Remote Setup
echo "Running remote setup..."
ssh "$RPI_USER@$RPI_HOST" "bash -s" << EOF
  set -e
  
  # Install Server Deps
  cd $DEST_DIR/server
  npm install --production

  # Compile Server (if not checked in, but we handle build locally or remotely? PRD says 'install production dependencies on RPi'. 
  # Server is TS, so we need to build it or run with ts-node/tsx. 
  # PRD 4.1 says 'tsc + node (prod)'. So we should build server locally too.)
  
  # Setup Systemd Service
  sudo tee /etc/systemd/system/leaflab.service > /dev/null << SERVICE
[Unit]
Description=LeafLab Companion
After=network.target

[Service]
ExecStart=/usr/bin/node $DEST_DIR/server/dist/index.js
WorkingDirectory=$DEST_DIR/server
Restart=always
User=$RPI_USER
Environment=PORT=3333
Environment=SERIAL_PORT=/dev/ttyUSB0
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICE

  sudo systemctl daemon-reload
  sudo systemctl enable leaflab.service
  sudo systemctl restart leaflab.service

  # Setup Kiosk Autostart (LXDE/Wayfire dependent, assuming standard RPi OS Desktop)
  mkdir -p /home/$RPI_USER/.config/autostart
  tee /home/$RPI_USER/.config/autostart/kiosk.desktop > /dev/null << KIOSK
[Desktop Entry]
Type=Application
Name=LeafLab Kiosk
Exec=chromium-browser --kiosk --noerrdialogs --disable-infobars --check-for-update-interval=31536000 http://localhost:3333
X-GNOME-Autostart-enabled=true
KIOSK

  echo "✅ Remote setup complete."
EOF

echo "🚀 Deployment finished!"
