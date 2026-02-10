import React, { useEffect } from 'react';
import { useStore } from './store';
import { LayoutDashboard, LineChart, Sliders, Settings as SettingsIcon, WifiOff, Usb } from 'lucide-react';
import clsx from 'clsx';
import { Dashboard } from './components/Dashboard';
import { Charts } from './components/Charts';
import { Controls } from './components/Controls';
import { Settings } from './components/Settings';

function App() {
  const { connect, backendConnected, serialConnected, activeTab, setActiveTab, lastPacketAt } = useStore();

  useEffect(() => {
    connect();
  }, [connect]);

  const isStale = lastPacketAt ? (Date.now() - lastPacketAt > 15000) : false;

  return (
    <div className="flex h-screen bg-background text-text font-sans selection:bg-primary selection:text-background">
      {/* Sidebar / Navigation */}
      <nav className="w-24 bg-surface flex flex-col items-center py-6 border-r border-gray-800 shrink-0">
        <div className="mb-8 p-2 bg-primary/20 rounded-full">
          <div className="w-8 h-8 rounded-full bg-primary" />
        </div>
        
        <div className="flex flex-col gap-6 w-full px-2">
          <NavButton 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
            icon={<LayoutDashboard size={28} />} 
            label="Dash" 
          />
          <NavButton 
            active={activeTab === 'charts'} 
            onClick={() => setActiveTab('charts')} 
            icon={<LineChart size={28} />} 
            label="Charts" 
          />
          <NavButton 
            active={activeTab === 'controls'} 
            onClick={() => setActiveTab('controls')} 
            icon={<Sliders size={28} />} 
            label="Control" 
          />
          <NavButton 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
            icon={<SettingsIcon size={28} />} 
            label="Config" 
          />
        </div>

        <div className="mt-auto flex flex-col gap-4 items-center">
          {!backendConnected && (
             <div className="text-danger animate-pulse"><WifiOff size={24} /></div>
          )}
          {backendConnected && !serialConnected && (
             <div className="text-warning animate-pulse"><Usb size={24} /></div>
          )}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        <div className="h-full p-6 overflow-y-auto">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'charts' && <Charts />}
          {activeTab === 'controls' && <Controls />}
          {activeTab === 'settings' && <Settings />}
        </div>

        {/* Overlays */}
        {(!backendConnected) && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="text-center p-8 bg-surface rounded-xl border border-danger/30 shadow-2xl">
              <WifiOff size={64} className="mx-auto mb-4 text-danger" />
              <h2 className="text-2xl font-bold text-danger mb-2">Disconnected</h2>
              <p className="text-muted">Connecting to backend...</p>
            </div>
          </div>
        )}
        
        {(backendConnected && !serialConnected) && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40">
            <div className="text-center p-8 bg-surface rounded-xl border border-warning/30 shadow-2xl">
              <Usb size={64} className="mx-auto mb-4 text-warning" />
              <h2 className="text-2xl font-bold text-warning mb-2">Controller Offline</h2>
              <p className="text-muted">Waiting for ESP32 connection...</p>
            </div>
          </div>
        )}

        {(backendConnected && serialConnected && isStale) && (
           <div className="absolute top-4 right-4 bg-warning/20 text-warning px-4 py-2 rounded-full border border-warning/50 text-sm font-medium animate-pulse">
             ⚠️ Stale Data ({Math.floor((Date.now() - (lastPacketAt || 0))/1000)}s)
           </div>
        )}
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={clsx(
        "flex flex-col items-center gap-1 p-3 rounded-xl transition-all active:scale-95",
        active 
          ? "bg-primary text-surface font-bold shadow-lg shadow-primary/20" 
          : "text-muted hover:bg-white/5 hover:text-text"
      )}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </button>
  )
}

export default App;
