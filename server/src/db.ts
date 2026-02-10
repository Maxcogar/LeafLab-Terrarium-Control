import Database from 'better-sqlite3';
import { TelemetryPacket, DBReading, DBEvent } from './types.js';

const DB_PATH = process.env.DB_PATH || './leaflab.db';

export class StorageManager {
  private db: Database.Database;
  private buffer: { timestamp: number; key: string; value: number }[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private pruneInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
    this.startFlushLoop();
    this.startPruneLoop();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        sensor_key TEXT NOT NULL,
        value REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_time_key ON readings(timestamp, sensor_key);

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        message TEXT NOT NULL,
        severity INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_events_time ON events(timestamp);
    `);
  }

  private startFlushLoop() {
    // Flush every 60 seconds
    this.flushInterval = setInterval(() => this.flush(), 60000);
  }

  private startPruneLoop() {
    // Prune daily
    this.pruneInterval = setInterval(() => this.prune(), 24 * 60 * 60 * 1000);
    // Also prune on startup
    this.prune();
  }

  public stop() {
    if (this.flushInterval) clearInterval(this.flushInterval);
    if (this.pruneInterval) clearInterval(this.pruneInterval);
    this.flush();
    this.db.close();
  }

  public bufferPacket(packet: TelemetryPacket) {
    const ts = Math.floor(Date.now() / 1000);
    const s = packet.sensors;

    const push = (key: string, val: number | undefined) => {
      if (typeof val === 'number') {
        this.buffer.push({ timestamp: ts, key, value: val });
      }
    };

    if (s.airTemp.ok) push('airTempF', s.airTemp.value);
    if (s.airHumidity.ok) push('airHumidity', s.airHumidity.value);
    if (s.light.ok) push('lightLux', s.light.value);
    if (s.soilMoisture1.ok) push('soilMoisture1Pct', s.soilMoisture1.percent);
    if (s.soilMoisture2.ok) push('soilMoisture2Pct', s.soilMoisture2.percent);
    if (s.soilMoisture1.ok) push('soilMoisture1Raw', s.soilMoisture1.raw);
    if (s.soilMoisture2.ok) push('soilMoisture2Raw', s.soilMoisture2.raw);
    if (s.soilTemp.ok) push('soilTempF', s.soilTemp.value);
    if (s.tds.ok) push('tds', s.tds.raw);
    if (s.ph.ok) push('ph', s.ph.raw);
    if (s.heaterTemp.ok) push('heaterTempF', s.heaterTemp.value);
  }

  private flush() {
    if (this.buffer.length === 0) return;

    const batch = this.buffer;
    this.buffer = [];

    const insert = this.db.prepare('INSERT INTO readings (timestamp, sensor_key, value) VALUES (?, ?, ?)');
    const insertMany = this.db.transaction((rows: typeof batch) => {
      for (const row of rows) {
        insert.run(row.timestamp, row.key, row.value);
      }
    });

    try {
      insertMany(batch);
      console.log(`[Storage] Flushed ${batch.length} readings to DB`);
    } catch (err) {
      console.error('[Storage] Flush failed:', err);
      // Potentially re-buffer or drop
    }
  }

  private prune() {
    const cutoff = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    try {
      const res = this.db.prepare('DELETE FROM readings WHERE timestamp < ?').run(cutoff);
      console.log(`[Storage] Pruned ${res.changes} old readings`);
    } catch (err) {
      console.error('[Storage] Prune failed:', err);
    }
  }

  public logEvent(message: string, severity: number = 1) {
    const ts = Math.floor(Date.now() / 1000);
    try {
      this.db.prepare('INSERT INTO events (timestamp, message, severity) VALUES (?, ?, ?)').run(ts, message, severity);
    } catch (err) {
      console.error('[Storage] Log event failed:', err);
    }
  }

  public getEvents(limit: number = 50): DBEvent[] {
    return this.db.prepare('SELECT * FROM events ORDER BY timestamp DESC LIMIT ?').all(limit) as DBEvent[];
  }

  public getHistory(keys: string[], start: number, end: number, points: number = 200) {
    // Basic downsampling: Group by time bucket
    // points is target count. Interval = (end - start) / points
    const interval = Math.max(1, Math.floor((end - start) / points));
    
    // We want to return { [key]: [{t, v}, ...] }
    const result: Record<string, { t: number; v: number }[]> = {};
    keys.forEach(k => result[k] = []);

    if (keys.length === 0) return result;

    const placeholders = keys.map(() => '?').join(',');
    // SQLite query to group by interval and average
    // CAST(timestamp / interval AS INT) * interval as bucket
    
    const sql = `
      SELECT 
        sensor_key,
        (timestamp / ?) * ? as bucket,
        AVG(value) as avg_val
      FROM readings
      WHERE timestamp >= ? AND timestamp <= ? AND sensor_key IN (${placeholders})
      GROUP BY sensor_key, bucket
      ORDER BY bucket ASC
    `;

    try {
      const rows = this.db.prepare(sql).all(interval, interval, start, end, ...keys) as { sensor_key: string, bucket: number, avg_val: number }[];
      
      for (const row of rows) {
        if (result[row.sensor_key]) {
          result[row.sensor_key].push({ t: row.bucket, v: row.avg_val });
        }
      }
    } catch (err) {
      console.error('[Storage] History query failed:', err);
    }

    return result;
  }
}
