import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, AlertTriangle, Shield, Server, Wifi,
  Lock, Plus, RefreshCw, Eye, EyeOff,
  Terminal, Cpu, ChevronRight, Radio, Database,
  Power, Zap, PowerOff
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────
interface Connection {
  src_ip: string; src_port: number;
  dst_ip: string; dst_port: number;
  state: string; packets: number; bytes: number;
}
interface Statistics {
  total_connections: number; blocked_ips: number;
  active_connections: number; packets_processed: number;
  dpi_alerts: number; mirror_active: boolean;
  module_status: string; uptime_seconds: number;
}
interface Alert {
  timestamp: string; type: string; source: string;
  destination: string; message: string; severity: string;
}
interface KernelLog { timestamp: string; level: string; message: string; }

// ── Helpers ──────────────────────────────────────────────────
const API = 'http://localhost:8000/api';

const fmtUptime = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
};

const stateColor = (s: string) => {
  const map: Record<string, string> = {
    ESTABLISHED: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    SYN_SENT: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    SYN_RECV: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
    FIN_WAIT1: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    FIN_WAIT2: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    TIME_WAIT: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
    CLOSED: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
  };
  return map[s] ?? 'text-slate-400 bg-slate-500/10 border-slate-500/30';
};

const sevColor = (s: string) => {
  if (s === 'critical') return 'border-l-red-500 bg-red-500/5 text-red-300';
  if (s === 'warning')  return 'border-l-amber-500 bg-amber-500/5 text-amber-300';
  return 'border-l-sky-500 bg-sky-500/5 text-sky-300';
};

const logColor = (l: string) => {
  if (l === 'ERROR')   return 'text-red-400';
  if (l === 'WARNING') return 'text-amber-400';
  return 'text-emerald-400';
};

// ── StatCard ─────────────────────────────────────────────────
const StatCard = ({ label, value, sub, icon: Icon, color, glow }: {
  label: string; value: React.ReactNode; sub: string;
  icon: React.ElementType; color: string; glow: string;
}) => (
  <div className={`stat-card glass rounded-2xl p-5 ${glow} relative overflow-hidden`}>
    <div className="absolute inset-0 opacity-5" style={{
      background: `radial-gradient(circle at 80% 20%, ${color}, transparent 60%)`
    }} />
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
        <div className="p-2 rounded-lg" style={{ background: `${color}15` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      <div className="text-xs text-slate-500">{sub}</div>
    </div>
  </div>
);

// ── Main Component ───────────────────────────────────────────
const FirewallDashboard: React.FC = () => {
  const [stats, setStats] = useState<Statistics>({
    total_connections: 0, blocked_ips: 0, active_connections: 0,
    packets_processed: 0, dpi_alerts: 0, mirror_active: false,
    module_status: 'Loading...', uptime_seconds: 0
  });
  const [connections, setConnections] = useState<Connection[]>([]);
  const [alerts, setAlerts]           = useState<Alert[]>([]);
  const [logs, setLogs]               = useState<KernelLog[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [mirrorActive, setMirrorActive] = useState(false);
  const [blacklistIP, setBlacklistIP] = useState('');
  const [blacklistPort, setBlacklistPort] = useState('0');
  const [loading, setLoading]         = useState(false);
  const [moduleLoading, setModuleLoading] = useState(false);
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const [message, setMessage]         = useState('');
  const [toast, setToast]             = useState<{text: string; ok: boolean} | null>(null);
  const [activeTab, setActiveTab]     = useState<'connections'|'alerts'|'logs'>('connections');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const controlModule = async (action: 'load' | 'unload') => {
    setModuleLoading(true);
    try {
      const r = await fetch(`${API}/module/${action}`, { method: 'POST' });
      const d = await r.json();
      showToast(d.message, d.success);
      setTimeout(fetchAll, 800);
    } catch {
      showToast('Backend unreachable', false);
    } finally {
      setModuleLoading(false);
    }
  };

  const toggleMirror = async () => {
    setMirrorLoading(true);
    const next = !mirrorActive;
    try {
      const r = await fetch(`${API}/mirror/toggle?enable=${next}`, { method: 'POST' });
      const d = await r.json();
      if (d.success) setMirrorActive(next);
      showToast(d.message, d.success);
    } catch {
      showToast('Backend unreachable', false);
    } finally {
      setMirrorLoading(false);
    }
  };


  const fetchAll = useCallback(async () => {
    const safe = async (url: string) => {
      try { const r = await fetch(url); return r.ok ? r.json() : null; }
      catch { return null; }
    };
    const [s, c, a, l] = await Promise.all([
      safe(`${API}/statistics`),
      safe(`${API}/connections`),
      safe(`${API}/alerts?limit=10`),
      safe(`${API}/logs?lines=30`),
    ]);
    if (s) setStats(s);
    if (c) setConnections(c);
    if (a) setAlerts(a);
    if (l) setLogs(l);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    fetchAll();
    if (!autoRefresh) return;
    const id = setInterval(fetchAll, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchAll]);

  const addToBlacklist = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      const r = await fetch(`${API}/blacklist/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: blacklistIP, port: parseInt(blacklistPort) || 0, reason: 'Manual' })
      });
      const d = await r.json();
      setMessage(r.ok ? `✓ Blocked ${blacklistIP}:${blacklistPort}` : `✗ ${d.message}`);
      if (r.ok) { setBlacklistIP(''); setBlacklistPort('0'); fetchAll(); }
    } catch (err) {
      setMessage(`✗ Connection refused`);
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const isActive = stats.module_status === 'Active';

  return (
    <div className="min-h-screen bg-[#020817] bg-grid text-slate-100">
      {/* Scan line */}
      <div className="scan-line" />

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl backdrop-blur-xl border transition-all ${
          toast.ok
            ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300'
            : 'bg-red-950/90 border-red-500/30 text-red-300'
        }`}>
          <span className="text-lg">{toast.ok ? '✓' : '✗'}</span>
          <span className="text-sm font-medium">{toast.text}</span>
        </div>
      )}

      {/* Header */}
      <header className="glass-bright sticky top-0 z-50 border-b border-sky-500/10">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="animated-border">
              <div className="bg-[#020817] rounded-xl p-2">
                <Shield className="w-6 h-6 text-sky-400" />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold gradient-text leading-none">KernelGuard</h1>
              <p className="text-xs text-slate-500 mt-0.5">ARM64 Linux Firewall Dashboard</p>
            </div>
          </div>

          {/* Center: status */}
          <div className="hidden md:flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className={`relative w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-red-400'}`}>
                {isActive && <div className="status-active absolute inset-0 rounded-full bg-emerald-400" />}
              </div>
              <span className={`text-sm font-medium ${isActive ? 'text-emerald-400' : 'text-red-400'}`}>
                {stats.module_status}
              </span>
            </div>
            <div className="text-xs text-slate-500 font-mono">
              Uptime: {fmtUptime(stats.uptime_seconds)}
            </div>
            <div className="text-xs text-slate-600 font-mono">
              {lastUpdated.toLocaleTimeString()}
            </div>
          </div>

          {/* Right: controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAll}
              title="Refresh now"
              className="p-2.5 glass rounded-xl text-slate-400 hover:text-sky-400 hover:border-sky-500/30 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setAutoRefresh(a => !a)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                autoRefresh
                  ? 'bg-sky-500/15 text-sky-400 border border-sky-500/25'
                  : 'glass text-slate-500 hover:text-slate-300'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${autoRefresh ? 'spin-slow' : ''}`} />
              {autoRefresh ? 'Live' : 'Paused'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-6 py-8 space-y-8">

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Connections" value={stats.total_connections}
            sub={`${stats.active_connections} established`}
            icon={Wifi} color="#38bdf8" glow="glow-blue" />
          <StatCard label="Active Sessions" value={stats.active_connections}
            sub="Real-time ESTABLISHED"
            icon={Activity} color="#34d399" glow="glow-green" />
          <StatCard label="Blocked IPs" value={stats.blocked_ips}
            sub="In blacklist"
            icon={Lock} color="#f87171" glow="glow-red" />
          <StatCard label="DPI Alerts" value={stats.dpi_alerts}
            sub="Pattern matches"
            icon={AlertTriangle} color="#fbbf24" glow="glow-amber" />
        </div>

        {/* ── Module Control Bar ── */}
        <div className="glass rounded-2xl p-4 flex flex-wrap items-center gap-4">
          {/* Module status indicator */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`p-2.5 rounded-xl ${isActive ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <Shield className={`w-5 h-5 ${isActive ? 'text-emerald-400' : 'text-red-400'}`} />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-500">Kernel Module</div>
              <div className={`text-sm font-bold ${isActive ? 'text-emerald-400' : 'text-slate-400'}`}>
                {stats.module_status}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px h-8 bg-slate-800" />

          {/* Load / Unload buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => controlModule('load')}
              disabled={moduleLoading || isActive}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Power className="w-4 h-4" />
              Load Module
            </button>
            <button
              onClick={() => controlModule('unload')}
              disabled={moduleLoading || !isActive}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <PowerOff className="w-4 h-4" />
              Unload
            </button>
          </div>

          {/* Divider */}
          <div className="hidden md:block w-px h-8 bg-slate-800" />

          {/* Mirror toggle */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {mirrorActive ? <Eye className="w-4 h-4 text-emerald-400" /> : <EyeOff className="w-4 h-4 text-slate-500" />}
              <span className="text-xs text-slate-400">Packet Mirror</span>
            </div>
            <button
              onClick={toggleMirror}
              disabled={mirrorLoading || !isActive}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                mirrorActive
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25'
                  : 'bg-slate-700/60 text-slate-400 border border-slate-700 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              {mirrorLoading ? 'Working...' : mirrorActive ? 'Stop Mirror' : 'Start Mirror'}
            </button>
          </div>

          {/* Packets */}
          <div className="hidden lg:flex items-center gap-2 ml-auto">
            <Cpu className="w-4 h-4 text-violet-400" />
            <div>
              <div className="text-xs text-slate-500">Packets</div>
              <div className="text-sm font-bold text-white font-mono">{stats.packets_processed.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* ── Main Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: tabbed panel */}
          <div className="lg:col-span-2 glass rounded-2xl overflow-hidden">
            {/* Tabs */}
            <div className="flex items-center border-b border-slate-800/60 px-4 pt-2 gap-1">
              {(['connections','alerts','logs'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-sm font-medium rounded-t-lg capitalize transition-all relative ${
                    activeTab === tab
                      ? 'text-sky-400 bg-sky-500/8'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tab}
                  {activeTab === tab && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-400 rounded-full" />
                  )}
                  {tab === 'alerts' && alerts.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400 font-mono">
                      {alerts.length}
                    </span>
                  )}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2 pb-2">
                <Server className="w-3.5 h-3.5 text-slate-600" />
                <span className="text-xs text-slate-600 font-mono">
                  {activeTab === 'connections' ? connections.length :
                   activeTab === 'alerts' ? alerts.length : logs.length} entries
                </span>
              </div>
            </div>

            {/* Connections */}
            {activeTab === 'connections' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800/60">
                      <th className="px-5 py-3 text-left font-medium">Source</th>
                      <th className="px-5 py-3 text-left font-medium">Destination</th>
                      <th className="px-5 py-3 text-left font-medium">State</th>
                      <th className="px-5 py-3 text-right font-medium">Packets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connections.length > 0 ? connections.slice(0, 12).map((c, i) => (
                      <tr key={i} className="table-row-hover border-b border-slate-800/30 last:border-0">
                        <td className="px-5 py-3 font-mono text-sky-300 text-xs">
                          {c.src_ip}<span className="text-slate-600">:{c.src_port}</span>
                        </td>
                        <td className="px-5 py-3 font-mono text-slate-300 text-xs">
                          {c.dst_ip}<span className="text-slate-600">:{c.dst_port}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${stateColor(c.state)}`}>
                            {c.state}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-slate-400">
                          {c.packets}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4} className="px-5 py-16 text-center">
                          <Server className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                          <p className="text-slate-600 text-sm">No active connections</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {connections.length > 12 && (
                  <div className="px-5 py-3 border-t border-slate-800/60 flex items-center gap-1 text-xs text-slate-600">
                    <ChevronRight className="w-3 h-3" />
                    {connections.length - 12} more connections
                  </div>
                )}
              </div>
            )}

            {/* Alerts */}
            {activeTab === 'alerts' && (
              <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
                {alerts.length > 0 ? alerts.map((a, i) => (
                  <div key={i} className={`p-4 rounded-xl border-l-2 ${sevColor(a.severity)}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold uppercase tracking-wider">{a.type}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            a.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                            a.severity === 'warning'  ? 'bg-amber-500/20 text-amber-400' :
                                                        'bg-sky-500/20 text-sky-400'
                          }`}>{a.severity}</span>
                        </div>
                        <p className="text-xs text-slate-400 mb-1.5">{a.message}</p>
                        <p className="text-xs text-slate-600 font-mono">{a.source} → {a.destination}</p>
                      </div>
                      {a.severity === 'critical' && <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />}
                    </div>
                  </div>
                )) : (
                  <div className="py-16 text-center">
                    <Shield className="w-8 h-8 text-emerald-700 mx-auto mb-2" />
                    <p className="text-slate-600 text-sm">No security alerts</p>
                  </div>
                )}
              </div>
            )}

            {/* Logs */}
            {activeTab === 'logs' && (
              <div className="p-4 max-h-[500px] overflow-y-auto space-y-1">
                {logs.length > 0 ? logs.slice(0, 30).map((log, i) => (
                  <div key={i} className="log-entry flex items-start gap-2 py-1 text-xs font-mono opacity-80 hover:opacity-100 transition-opacity">
                    <span className={`flex-shrink-0 ${logColor(log.level)}`}>[{log.level}]</span>
                    <span className="text-slate-400 break-all">{log.message}</span>
                  </div>
                )) : (
                  <div className="py-16 text-center">
                    <Terminal className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-600 text-sm">No kernel logs</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="space-y-5">
            {/* Blacklist form */}
            <div className="glass rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
                <Lock className="w-4 h-4 text-red-400" />
                Add to Blacklist
              </h2>
              <form onSubmit={addToBlacklist} className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5 font-medium">IP Address</label>
                  <input
                    type="text" placeholder="192.168.1.100"
                    value={blacklistIP}
                    onChange={e => setBlacklistIP(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-slate-100 text-sm font-mono placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500/50 focus:border-sky-500/50 transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5 font-medium">Port <span className="text-slate-600">(0 = all)</span></label>
                  <input
                    type="number" placeholder="0" min="0" max="65535"
                    value={blacklistPort}
                    onChange={e => setBlacklistPort(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-slate-100 text-sm font-mono placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500/50 focus:border-sky-500/50 transition-all"
                  />
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:opacity-50 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-900/20"
                >
                  <Plus className="w-4 h-4" />
                  {loading ? 'Blocking...' : 'Block IP'}
                </button>
              </form>
              {message && (
                <div className={`mt-3 p-3 rounded-xl text-xs font-mono ${
                  message.startsWith('✓') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {message}
                </div>
              )}
            </div>

            {/* Quick stats */}
            <div className="glass rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-sky-400" />
                System Info
              </h2>
              <div className="space-y-3">
                {[
                  { label: 'Module', value: stats.module_status, color: isActive ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'Uptime', value: fmtUptime(stats.uptime_seconds), color: 'text-slate-300' },
                  { label: 'Mirror', value: mirrorActive ? 'Active' : 'Inactive', color: mirrorActive ? 'text-emerald-400' : 'text-slate-500' },
                  { label: 'API', value: 'localhost:8000', color: 'text-sky-400' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between py-2 border-b border-slate-800/40 last:border-0">
                    <span className="text-xs text-slate-600">{item.label}</span>
                    <span className={`text-xs font-mono font-medium ${item.color}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mini log preview */}
            <div className="glass rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                <Terminal className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-semibold text-slate-400">Kernel Log</span>
                <div className="ml-auto flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-red-500/60" />
                  <div className="w-2 h-2 rounded-full bg-amber-500/60" />
                  <div className="w-2 h-2 rounded-full bg-emerald-500/60" />
                </div>
              </div>
              <div className="p-3 max-h-52 overflow-y-auto space-y-1">
                {logs.length > 0 ? logs.slice(0, 10).map((log, i) => (
                  <div key={i} className="text-xs font-mono flex gap-2 items-start">
                    <span className={`flex-shrink-0 text-[10px] ${logColor(log.level)}`}>{log.level[0]}</span>
                    <span className="text-slate-500 truncate">{log.message.slice(0, 60)}{log.message.length > 60 ? '…' : ''}</span>
                  </div>
                )) : (
                  <p className="text-xs text-slate-700 py-4 text-center">No logs</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/40 mt-8 py-4 px-6">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between text-xs text-slate-700">
          <span>KernelGuard · ARM64 Linux Firewall Module</span>
          <span className="font-mono">API: {API}</span>
        </div>
      </footer>
    </div>
  );
};

export default FirewallDashboard;
