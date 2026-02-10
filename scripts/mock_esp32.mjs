
const API_URL = 'http://localhost:3333/api/_mock/telemetry';
const INTERVAL = 10000;

let packet = {
  sensors: {
    soilMoisture1: { percent: 60, raw: 2500, ok: true },
    soilMoisture2: { percent: 62, raw: 2450, ok: true },
    airTemp: { value: 75.5, ok: true },
    airHumidity: { value: 55.0, ok: true },
    light: { value: 1200, ok: true },
    soilTemp: { value: 72.0, ok: true },
    tds: { raw: 450, ok: true },
    ph: { raw: 2000, ok: true },
    heaterTemp: { value: 85.0, ok: true }
  },
  outputs: {
    fanSpeed: 128,
    heaterPower: 0,
    servo1Angle: 0,
    servo2Angle: 0,
    growLights: true,
    waterPump: false,
    humidifier1: false,
    humidifier2: false
  },
  system: {
    uptime: 0,
    freeHeap: 150000,
    wifiRssi: -65,
    wifiConnected: true,
    mqttConnected: true,
    ntpSynced: true,
    currentHour: 12,
    firmwareVersion: "1.0.0-mock"
  },
  control: {
    ventMode: 0,
    pumpRunning: false,
    manualOverride: false,
    loopCount: 0
  },
  config: {
    heaterTarget: 78,
    heaterHysteresis: 2,
    humidityLow: 50,
    humidityHigh: 70,
    humidityReturn: 60,
    tempVentTrigger: 82,
    tempVentReturn: 78,
    soilMoistureLow: 40,
    soilMoistureHigh: 80,
    lightsOnHour: 8,
    lightsOffHour: 20,
    overrideTimeoutMs: 60000,
    loopIntervalMs: 1000
  }
};

function randomWalk(val, min, max, step) {
  let change = (Math.random() - 0.5) * step;
  let newVal = val + change;
  return Math.max(min, Math.min(max, newVal));
}

function updatePacket() {
  const p = packet;
  p.sensors.airTemp.value = randomWalk(p.sensors.airTemp.value, 60, 90, 0.5);
  p.sensors.airHumidity.value = randomWalk(p.sensors.airHumidity.value, 30, 90, 1.0);
  p.sensors.soilMoisture1.percent = randomWalk(p.sensors.soilMoisture1.percent, 0, 100, 0.2);
  p.sensors.soilMoisture2.percent = randomWalk(p.sensors.soilMoisture2.percent, 0, 100, 0.2);
  p.sensors.light.value = randomWalk(p.sensors.light.value, 0, 2000, 50);
  p.sensors.soilTemp.value = randomWalk(p.sensors.soilTemp.value, 60, 80, 0.1);
  
  p.system.uptime += 10000;
  p.control.loopCount += 10;
  
  // Simulate lights based on hour (very basic)
  const hour = new Date().getHours();
  p.system.currentHour = hour;
  // p.outputs.growLights = hour >= p.config.lightsOnHour && hour < p.config.lightsOffHour;
  
  return p;
}

async function send() {
  const p = updatePacket();
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p)
    });
    if (res.ok) console.log(`[Mock] Sent telemetry packet. Temp: ${p.sensors.airTemp.value.toFixed(1)}`);
    else console.error(`[Mock] Failed to send: ${res.statusText}`);
  } catch (err) {
    console.error(`[Mock] Error: ${err.message}`);
  }
}

console.log('[Mock] Starting ESP32 simulator...');
setInterval(send, INTERVAL);
send();
