"use client";

import { useEffect, useState } from "react";

interface ServerStats {
  server: {
    name: string;
    ip: string;
    description: string;
  };
  resources: {
    cpu: number | null;
    memory: {
      used: number;
      total: number;
    } | null;
    disk: {
      used: number;
      total: number;
    } | null;
  };
  topProcesses?: {
    cpu: Array<{ name: string; value: number }>;
    memory: Array<{ name: string; value: number }>;
    disk: Array<{ name: string; value: number }>;
  };
}

export function StatsDashboard() {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/stats");
      if (!response.ok) {
        throw new Error("Failed to fetch stats");
      }
      const data = await response.json();
      console.log("API Response:", data);
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-400">Loading stats...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        <p className="text-red-400">Error: {error}</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
        <p className="text-yellow-400">No stats available</p>
      </div>
    );
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getPercentage = (used: number, total: number) => {
    return ((used / total) * 100).toFixed(1);
  };

  return (
    <div className="space-y-6">
      {/* Server Info */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Server Information</h2>
        <div className="space-y-2 text-gray-300">
          <p><span className="text-gray-400">Name:</span> {stats.server.name}</p>
          <p><span className="text-gray-400">IP:</span> {stats.server.ip}</p>
          {stats.server.description && (
            <p><span className="text-gray-400">Description:</span> {stats.server.description}</p>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* CPU Usage */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">CPU Usage</h3>
          {stats.resources.cpu !== null ? (
            <div className="space-y-2">
              <div className="text-3xl font-bold text-blue-400">
                {stats.resources.cpu.toFixed(1)}%
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${stats.resources.cpu}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-gray-500">N/A</p>
          )}
        </div>

        {/* Memory Usage */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Memory Usage</h3>
          {stats.resources.memory ? (
            <div className="space-y-2">
              <div className="text-3xl font-bold text-green-400">
                {getPercentage(stats.resources.memory.used, stats.resources.memory.total)}%
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${getPercentage(stats.resources.memory.used, stats.resources.memory.total)}%`,
                  }}
                />
              </div>
              <p className="text-sm text-gray-400">
                {formatBytes(stats.resources.memory.used)} / {formatBytes(stats.resources.memory.total)}
              </p>
            </div>
          ) : (
            <p className="text-gray-500">N/A</p>
          )}
        </div>

        {/* Disk Usage */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Disk Usage</h3>
          {stats.resources.disk ? (
            <div className="space-y-2">
              <div className="text-3xl font-bold text-purple-400">
                {getPercentage(stats.resources.disk.used, stats.resources.disk.total)}%
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${getPercentage(stats.resources.disk.used, stats.resources.disk.total)}%`,
                  }}
                />
              </div>
              <p className="text-sm text-gray-400">
                {formatBytes(stats.resources.disk.used)} / {formatBytes(stats.resources.disk.total)}
              </p>
            </div>
          ) : (
            <p className="text-gray-500">N/A</p>
          )}
        </div>
      </div>

      {/* Top Processes */}
      {stats.topProcesses && (stats.topProcesses.cpu.length > 0 || stats.topProcesses.memory.length > 0 || stats.topProcesses.disk.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {/* Top CPU Processes */}
          {stats.topProcesses.cpu.length > 0 && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Top CPU Consumers</h3>
              <div className="space-y-3">
                {stats.topProcesses.cpu.map((proc, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-6 h-6 flex items-center justify-center bg-blue-500/20 rounded text-xs text-blue-400">
                        {idx + 1}
                      </div>
                      <span className="text-sm text-gray-300 truncate">{proc.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-blue-400 ml-2">
                      {proc.value.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Memory Processes */}
          {stats.topProcesses.memory.length > 0 && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Top Memory Consumers</h3>
              <div className="space-y-3">
                {stats.topProcesses.memory.map((proc, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-6 h-6 flex items-center justify-center bg-green-500/20 rounded text-xs text-green-400">
                        {idx + 1}
                      </div>
                      <span className="text-sm text-gray-300 truncate">{proc.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-green-400 ml-2">
                      {formatBytes(proc.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Disk I/O Processes */}
          {stats.topProcesses.disk.length > 0 && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Top Disk I/O Consumers</h3>
              <div className="space-y-3">
                {stats.topProcesses.disk.map((proc, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-6 h-6 flex items-center justify-center bg-purple-500/20 rounded text-xs text-purple-400">
                        {idx + 1}
                      </div>
                      <span className="text-sm text-gray-300 truncate">{proc.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-purple-400 ml-2">
                      {formatBytes(proc.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
