import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';

type TimeRange = '1h' | '6h' | '24h' | '7d';
type SensorGroup = 'climate' | 'soil' | 'environment';

const RANGES: Record<TimeRange, number> = {
  '1h': 3600,
  '6h': 3600 * 6,
  '24h': 3600 * 24,
  '7d': 3600 * 24 * 7
};

const GROUPS: Record<SensorGroup, { keys: string[], colors: string[] }> = {
  climate: { keys: ['airTempF', 'airHumidity'], colors: ['#f472b6', '#60a5fa'] },
  soil: { keys: ['soilMoisture1Pct', 'soilMoisture2Pct'], colors: ['#4ade80', '#22c55e'] },
  environment: { keys: ['lightLux', 'soilTempF'], colors: ['#facc15', '#a78bfa'] }
};

export function Charts() {
  const [range, setRange] = useState<TimeRange>('1h');
  const [group, setGroup] = useState<SensorGroup>('climate');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [range, group]);

  const fetchData = async () => {
    setLoading(true);
    const end = Math.floor(Date.now() / 1000);
    const start = end - RANGES[range];
    const keys = GROUPS[group].keys.join(',');
    
    try {
      const res = await fetch(`/api/history?keys=${keys}&start=${start}&end=${end}&points=100`);
      const raw: Record<string, { t: number, v: number }[]> = await res.json();

      // Collect all unique timestamps across all keys so charts render
      // even when one sensor in a group is offline (has no data).
      const tsSet = new Set<number>();
      GROUPS[group].keys.forEach(k => {
        raw[k]?.forEach(pt => tsSet.add(pt.t));
      });
      const timestamps = Array.from(tsSet).sort((a, b) => a - b);

      const transformed = timestamps.map(t => {
        const item: any = { time: t * 1000 }; // ms for date formatting
        GROUPS[group].keys.forEach(k => {
          const match = raw[k]?.find(p => Math.abs(p.t - t) < 60); // 60s tolerance
          item[k] = match ? match.v : null;
        });
        return item;
      });

      setData(transformed);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex justify-between items-center bg-surface p-2 rounded-xl">
        <div className="flex gap-2">
          {(['climate', 'soil', 'environment'] as SensorGroup[]).map(g => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`px-4 py-2 rounded-lg text-sm font-bold capitalize transition-colors ${group === g ? 'bg-primary text-background' : 'text-muted hover:bg-white/5'}`}
            >
              {g}
            </button>
          ))}
        </div>
        
        <div className="flex gap-2 bg-black/20 p-1 rounded-lg">
          {(['1h', '6h', '24h', '7d'] as TimeRange[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${range === r ? 'bg-white/10 text-white' : 'text-muted hover:text-white'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-surface rounded-2xl p-4 border border-white/5 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/50 z-10 backdrop-blur-sm rounded-2xl">
            <Loader2 className="animate-spin text-primary" size={32} />
          </div>
        )}
        
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              {GROUPS[group].colors.map((c, i) => (
                <linearGradient key={c} id={`color${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={c} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={c} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
            <XAxis 
              dataKey="time" 
              tickFormatter={(t) => format(t, range === '1h' ? 'HH:mm' : range === '7d' ? 'MM/dd' : 'HH:mm')}
              stroke="#666" 
              fontSize={12}
              tickMargin={10}
            />
            <YAxis stroke="#666" fontSize={12} domain={['auto', 'auto']} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #333', borderRadius: '8px' }}
              labelFormatter={(t) => format(t, 'PP pp')}
            />
            <Legend />
            {GROUPS[group].keys.map((k, i) => (
              <Area
                key={k}
                type="monotone"
                dataKey={k}
                stroke={GROUPS[group].colors[i]}
                fillOpacity={1}
                fill={`url(#color${i})`}
                strokeWidth={2}
                connectNulls
                name={k.replace(/([A-Z])/g, ' $1').trim()} // naive pretty print
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
