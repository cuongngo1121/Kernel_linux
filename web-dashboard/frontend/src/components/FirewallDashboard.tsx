"""
React + Tailwind + Lucide Icons Dashboard
This component should be placed in your React project at: src/components/FirewallDashboard.tsx
"""

import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  Shield,
  Server,
  Wifi,
  BarChart3,
  Clock,
  Lock,
  Trash2,
  Plus,
  RefreshCw,
  Moon,
  Sun,
  Eye,
  EyeOff,
  Check,
  X,
  Info
} from 'lucide-react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Connection {
  src_ip: string;
  src_port: number;
  dst_ip: string;
  dst_port: number;
  state: string;
  packets: number;
  bytes: number;
}

interface BlacklistEntry {
  ip: string;
  port: number;
  reason?: string;
}

interface Statistics {
  total_connections: number;
  blocked_ips: number;
  active_connections: number;
  packets_processed: number;
  dpi_alerts: number;
  mirror_active: boolean;
  module_status: string;
  uptime_seconds: number;
}

interface Alert {
  timestamp: string;
  type: string;
  source: string;
  destination: string;
  message: string;
  severity: string;
}

interface KernelLog {
  timestamp: string;
  level: string;
  message: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const FirewallDashboard: React.FC = () => {
  // State
  const [darkMode, setDarkMode] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [mirrorActive, setMirrorActive] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(5000);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [statistics, setStatistics] = useState<Statistics>({
    total_connections: 0,
    blocked_ips: 0,
    active_connections: 0,
    packets_processed: 0,
    dpi_alerts: 0,
    mirror_active: false,
    module_status: 'Loading...',
    uptime_seconds: 0
  });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [logs, setLogs] = useState<KernelLog[]>([]);

  const [blacklistIP, setBlacklistIP] = useState('');
  const [blacklistPort, setBlacklistPort] = useState('0');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // API Base URL
  const API_BASE = 'http://localhost:8000/api';

  // ========================================================================
  // API CALLS
  // ========================================================================

  const fetchStatistics = async () => {
    try {
      const response = await fetch(`${API_BASE}/statistics`);
      if (response.ok) {
        const data = await response.json();
        setStatistics(data);
      }
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };

  const fetchConnections = async () => {
    try {
      const response = await fetch(`${API_BASE}/connections`);
      if (response.ok) {
        const data = await response.json();
        setConnections(data);
      }
    } catch (error) {
      console.error('Error fetching connections:', error);
    }
  };

  const fetchAlerts = async () => {
    try {
      const response = await fetch(`${API_BASE}/alerts?limit=10`);
      if (response.ok) {
        const data = await response.json();
        setAlerts(data);
      }
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  };

  const fetchLogs = async () => {
    try {
      const response = await fetch(`${API_BASE}/logs?lines=30`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  const addToBlacklist = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/blacklist/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ip: blacklistIP,
          port: parseInt(blacklistPort) || 0,
          reason: 'Manual blacklist'
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`✓ Added ${blacklistIP}:${blacklistPort} to blacklist`);
        setBlacklistIP('');
        setBlacklistPort('0');
        setTimeout(() => setMessage(''), 3000);
        fetchStatistics();
      } else {
        setMessage(`✗ Error: ${data.message}`);
      }
    } catch (error) {
      setMessage(`✗ Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // ========================================================================
  // EFFECTS
  // ========================================================================

  useEffect(() => {
    // Initial fetch
    fetchStatistics();
    fetchConnections();
    fetchAlerts();
    fetchLogs();

    // Set up auto-refresh
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchStatistics();
        fetchConnections();
        fetchAlerts();
        fetchLogs();
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  // ========================================================================
  // RENDER HELPERS
  // ========================================================================

  const getStateColor = (state: string): string => {
    switch (state) {
      case 'ESTABLISHED':
        return 'text-green-400 bg-green-900/20';
      case 'SYN_SENT':
        return 'text-yellow-400 bg-yellow-900/20';
      case 'SYN_RECV':
        return 'text-blue-400 bg-blue-900/20';
      case 'FIN_WAIT1':
      case 'FIN_WAIT2':
        return 'text-orange-400 bg-orange-900/20';
      case 'TIME_WAIT':
      case 'CLOSED':
        return 'text-gray-400 bg-gray-900/20';
      default:
        return 'text-gray-400 bg-gray-900/20';
    }
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical':
        return 'text-red-400 bg-red-900/20 border-l-4 border-red-600';
      case 'warning':
        return 'text-yellow-400 bg-yellow-900/20 border-l-4 border-yellow-600';
      case 'info':
      default:
        return 'text-blue-400 bg-blue-900/20 border-l-4 border-blue-600';
    }
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  const bgClass = darkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200';
  const inputClass = darkMode
    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500';

  return (
    <div className={`min-h-screen ${bgClass} transition-colors`}>
      {/* Header */}
      <header className={`border-b ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200'} sticky top-0 z-50`}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-blue-500" />
            <h1 className="text-2xl font-bold">Firewall Dashboard</h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Status Badge */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{
              backgroundColor: statistics.module_status === 'Active' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'
            }}>
              <Activity className={`w-4 h-4 ${statistics.module_status === 'Active' ? 'text-green-500' : 'text-red-500'}`} />
              <span className="text-sm font-medium">{statistics.module_status}</span>
            </div>

            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`p-2 rounded-lg transition ${autoRefresh
                ? darkMode ? 'bg-blue-900/50 text-blue-400' : 'bg-blue-100 text-blue-600'
                : darkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-600'
              }`}
              title="Toggle auto-refresh"
            >
              <RefreshCw className={`w-5 h-5 ${autoRefresh ? 'animate-spin' : ''}`} />
            </button>

            {/* Dark mode toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg transition ${darkMode ? 'bg-gray-700 text-yellow-400' : 'bg-gray-200 text-gray-600'}`}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Statistics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Total Connections */}
          <div className={`border rounded-lg p-6 ${cardClass}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-70">Total Connections</span>
              <Wifi className="w-5 h-5 text-blue-500" />
            </div>
            <div className="text-3xl font-bold">{statistics.total_connections}</div>
            <div className="text-xs opacity-50 mt-2">
              {statistics.active_connections} active
            </div>
          </div>

          {/* Active Connections */}
          <div className={`border rounded-lg p-6 ${cardClass}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-70">Active (ESTABLISHED)</span>
              <Activity className="w-5 h-5 text-green-500" />
            </div>
            <div className="text-3xl font-bold text-green-400">{statistics.active_connections}</div>
            <div className="text-xs opacity-50 mt-2">
              Real-time connections
            </div>
          </div>

          {/* Blocked IPs */}
          <div className={`border rounded-lg p-6 ${cardClass}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-70">Blocked IPs</span>
              <Lock className="w-5 h-5 text-red-500" />
            </div>
            <div className="text-3xl font-bold text-red-400">{statistics.blocked_ips}</div>
            <div className="text-xs opacity-50 mt-2">
              In blacklist
            </div>
          </div>

          {/* DPI Alerts */}
          <div className={`border rounded-lg p-6 ${cardClass}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-70">DPI Alerts</span>
              <AlertTriangle className="w-5 h-5 text-orange-500" />
            </div>
            <div className="text-3xl font-bold text-orange-400">{statistics.dpi_alerts}</div>
            <div className="text-xs opacity-50 mt-2">
              Pattern matches
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content - Left (2 cols) */}
          <div className="lg:col-span-2 space-y-8">
            {/* Mirror Traffic Toggle */}
            <div className={`border rounded-lg p-6 ${cardClass}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg" style={{
                    backgroundColor: mirrorActive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(107, 114, 128, 0.1)'
                  }}>
                    {mirrorActive ? (
                      <Eye className={`w-6 h-6 text-green-500`} />
                    ) : (
                      <EyeOff className={`w-6 h-6 text-gray-500`} />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold">Packet Mirroring (vdev0)</h3>
                    <p className="text-xs opacity-60">
                      {mirrorActive ? 'Active - Mirroring to virtual interface' : 'Inactive'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setMirrorActive(!mirrorActive)}
                  className={`px-4 py-2 rounded-lg font-medium transition ${mirrorActive
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                  }`}
                >
                  {mirrorActive ? 'Stop' : 'Start'}
                </button>
              </div>
            </div>

            {/* Connections Table */}
            <div className={`border rounded-lg overflow-hidden ${cardClass}`}>
              <div className="p-6 border-b border-gray-700">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Server className="w-5 h-5" />
                  Active Connections
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className={`${darkMode ? 'bg-gray-700' : 'bg-gray-100'} border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold">Source</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold">Destination</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold">State</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold">Packets</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {connections.length > 0 ? (
                      connections.slice(0, 10).map((conn, idx) => (
                        <tr key={idx} className={`hover:${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'} transition`}>
                          <td className="px-6 py-4 text-sm font-mono">
                            {conn.src_ip}:{conn.src_port}
                          </td>
                          <td className="px-6 py-4 text-sm font-mono">
                            {conn.dst_ip}:{conn.dst_port}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStateColor(conn.state)}`}>
                              {conn.state}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-right">
                            {conn.packets}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-sm opacity-50">
                          No active connections
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {connections.length > 10 && (
                <div className="px-6 py-4 border-t border-gray-700 text-xs opacity-60">
                  Showing 10 of {connections.length} connections
                </div>
              )}
            </div>

            {/* Security Alerts */}
            {alerts.length > 0 && (
              <div className={`border rounded-lg overflow-hidden ${cardClass}`}>
                <div className="p-6 border-b border-gray-700">
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-500" />
                    Recent Security Alerts
                  </h2>
                </div>

                <div className="space-y-3 p-6">
                  {alerts.slice(0, 5).map((alert, idx) => (
                    <div key={idx} className={`p-4 rounded-lg ${getSeverityColor(alert.severity)}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-semibold text-sm">{alert.type.toUpperCase()}</div>
                          <div className="text-xs mt-1 opacity-80">{alert.message}</div>
                          <div className="text-xs mt-2 opacity-60">
                            {alert.source} → {alert.destination}
                          </div>
                        </div>
                        {alert.severity === 'critical' && (
                          <AlertTriangle className="w-5 h-5 flex-shrink-0 ml-2" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar - Right (1 col) */}
          <div className="space-y-8">
            {/* Blacklist Management */}
            <div className={`border rounded-lg p-6 ${cardClass}`}>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Add to Blacklist
              </h2>

              <form onSubmit={addToBlacklist} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">IP Address</label>
                  <input
                    type="text"
                    placeholder="192.168.1.100"
                    value={blacklistIP}
                    onChange={(e) => setBlacklistIP(e.target.value)}
                    className={`w-full px-4 py-2 rounded-lg border ${inputClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Port (optional)</label>
                  <input
                    type="number"
                    placeholder="0 (all ports)"
                    value={blacklistPort}
                    onChange={(e) => setBlacklistPort(e.target.value)}
                    min="0"
                    max="65535"
                    className={`w-full px-4 py-2 rounded-lg border ${inputClass} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add to Blacklist
                </button>
              </form>

              {message && (
                <div className={`mt-4 p-3 rounded-lg text-sm ${message.includes('✓') ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                  {message}
                </div>
              )}
            </div>

            {/* Recent Logs */}
            <div className={`border rounded-lg overflow-hidden ${cardClass}`}>
              <div className="p-4 border-b border-gray-700">
                <h3 className="font-bold text-sm">Recent Kernel Logs</h3>
              </div>

              <div className="max-h-96 overflow-y-auto">
                <div className="p-4 space-y-2 text-xs font-mono">
                  {logs.slice(0, 15).map((log, idx) => (
                    <div key={idx} className="opacity-70 hover:opacity-100 transition">
                      <span className={`${log.level === 'ERROR'
                        ? 'text-red-400'
                        : log.level === 'WARNING'
                          ? 'text-yellow-400'
                          : 'text-green-400'
                      }`}>
                        [{log.level}]
                      </span>
                      {' '}
                      <span className="text-gray-400 truncate">{log.message}</span>
                    </div>
                  ))}

                  {logs.length === 0 && (
                    <div className="text-gray-500">No logs available</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default FirewallDashboard;
