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
    cpu: Array<{
      name: string;
      value: number;
      pid?: string;
      user?: string;
      image?: string;
      secondaryMetric?: number;
    }>;
    memory: Array<{
      name: string;
      value: number;
      pid?: string;
      user?: string;
      image?: string;
      secondaryMetric?: number;
    }>;
    disk: Array<{
      name: string;
      value: number;
      pid?: string;
      user?: string;
      image?: string;
    }>;
  };
}

export function StatsDashboard() {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [cpuPage, setCpuPage] = useState(0);
  const [memPage, setMemPage] = useState(0);
  const [diskPage, setDiskPage] = useState(0);
  const itemsPerPage = 5;

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
  }, []); // Only fetch once on mount

  useEffect(() => {
    if (!autoRefresh) return; // Don't set interval if auto-refresh is off

    const interval = setInterval(() => {
      fetchStats();
    }, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [autoRefresh]); // Only re-run when autoRefresh changes

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

  const getPaginatedData = <T extends { name: string; value: number }>(data: Array<T>, page: number) => {
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    return data.slice(start, end);
  };

  const getTotalPages = <T extends { name: string; value: number }>(data: Array<T>) => {
    return Math.ceil(data.length / itemsPerPage);
  };

  return (
    <div className="space-y-6">
      {/* Auto-refresh toggle */}
      <div className="flex justify-end">
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            autoRefresh
              ? "bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30"
              : "bg-gray-700/50 border-gray-600 text-gray-400 hover:bg-gray-700"
          }`}
        >
          <span>{autoRefresh ? "⏸" : "▶"}</span>
          <span>{autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}</span>
        </button>
      </div>

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
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Top CPU Consumers</h3>
                <span className="text-xs text-gray-400">
                  {stats.topProcesses.cpu.length} total
                </span>
              </div>
              <div className="space-y-3">
                {getPaginatedData(stats.topProcesses.cpu, cpuPage).map((proc, idx) => {
                  const actualIdx = cpuPage * itemsPerPage + idx;
                  return (
                    <div key={actualIdx} className="flex flex-col gap-1 p-2 rounded hover:bg-gray-700/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-6 h-6 flex items-center justify-center bg-blue-500/20 rounded text-xs text-blue-400">
                            {actualIdx + 1}
                          </div>
                          <span className="text-sm text-gray-300 truncate" title={proc.name}>{proc.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-blue-400 ml-2">
                          {proc.value.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 ml-8">
                        {proc.pid && <span title={proc.pid.length > 12 ? `Container ID: ${proc.pid}` : `PID: ${proc.pid}`}>ID: {proc.pid}</span>}
                        {proc.user && <span title={`User: ${proc.user}`}>User: {proc.user}</span>}
                        {proc.image && <span className="truncate" title={`Image: ${proc.image}`}>Image: {proc.image}</span>}
                        {proc.secondaryMetric !== undefined && (
                          <span className="text-green-400/70" title={`Memory usage: ${formatBytes(proc.secondaryMetric)}`}>Mem: {formatBytes(proc.secondaryMetric)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {getTotalPages(stats.topProcesses.cpu) > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-gray-700">
                  <button
                    onClick={() => setCpuPage(Math.max(0, cpuPage - 1))}
                    disabled={cpuPage === 0}
                    className="px-3 py-1 rounded bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors text-sm"
                  >
                    ←
                  </button>
                  <span className="text-sm text-gray-400">
                    Page {cpuPage + 1} of {getTotalPages(stats.topProcesses.cpu)}
                  </span>
                  <button
                    onClick={() => setCpuPage(Math.min(getTotalPages(stats.topProcesses!.cpu) - 1, cpuPage + 1))}
                    disabled={cpuPage >= getTotalPages(stats.topProcesses!.cpu) - 1}
                    className="px-3 py-1 rounded bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors text-sm"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Top Memory Processes */}
          {stats.topProcesses.memory.length > 0 && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Top Memory Consumers</h3>
                <span className="text-xs text-gray-400">
                  {stats.topProcesses.memory.length} total
                </span>
              </div>
              <div className="space-y-3">
                {getPaginatedData(stats.topProcesses.memory, memPage).map((proc, idx) => {
                  const actualIdx = memPage * itemsPerPage + idx;
                  return (
                    <div key={actualIdx} className="flex flex-col gap-1 p-2 rounded hover:bg-gray-700/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-6 h-6 flex items-center justify-center bg-green-500/20 rounded text-xs text-green-400">
                            {actualIdx + 1}
                          </div>
                          <span className="text-sm text-gray-300 truncate" title={proc.name}>{proc.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-green-400 ml-2">
                          {formatBytes(proc.value)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 ml-8">
                        {proc.pid && <span title={proc.pid.length > 12 ? `Container ID: ${proc.pid}` : `PID: ${proc.pid}`}>ID: {proc.pid}</span>}
                        {proc.user && <span title={`User: ${proc.user}`}>User: {proc.user}</span>}
                        {proc.image && <span className="truncate" title={`Image: ${proc.image}`}>Image: {proc.image}</span>}
                        {proc.secondaryMetric !== undefined && (
                          <span className="text-blue-400/70" title={`CPU usage: ${proc.secondaryMetric.toFixed(1)}%`}>CPU: {proc.secondaryMetric.toFixed(1)}%</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {getTotalPages(stats.topProcesses.memory) > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-gray-700">
                  <button
                    onClick={() => setMemPage(Math.max(0, memPage - 1))}
                    disabled={memPage === 0}
                    className="px-3 py-1 rounded bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors text-sm"
                  >
                    ←
                  </button>
                  <span className="text-sm text-gray-400">
                    Page {memPage + 1} of {getTotalPages(stats.topProcesses.memory)}
                  </span>
                  <button
                    onClick={() => setMemPage(Math.min(getTotalPages(stats.topProcesses!.memory) - 1, memPage + 1))}
                    disabled={memPage >= getTotalPages(stats.topProcesses!.memory) - 1}
                    className="px-3 py-1 rounded bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors text-sm"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Top Disk I/O Processes */}
          {stats.topProcesses.disk.length > 0 && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Top Disk I/O Consumers</h3>
                <span className="text-xs text-gray-400">
                  {stats.topProcesses.disk.length} total
                </span>
              </div>
              <div className="space-y-3">
                {getPaginatedData(stats.topProcesses.disk, diskPage).map((proc, idx) => {
                  const actualIdx = diskPage * itemsPerPage + idx;
                  return (
                    <div key={actualIdx} className="flex flex-col gap-1 p-2 rounded hover:bg-gray-700/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-6 h-6 flex items-center justify-center bg-purple-500/20 rounded text-xs text-purple-400">
                            {actualIdx + 1}
                          </div>
                          <span className="text-sm text-gray-300 truncate" title={proc.name}>{proc.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-purple-400 ml-2">
                          {formatBytes(proc.value)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 ml-8">
                        {proc.pid && <span title={`Container ID: ${proc.pid}`}>ID: {proc.pid}</span>}
                        {proc.user && <span>User: {proc.user}</span>}
                        {proc.image && <span className="truncate" title={`Image: ${proc.image}`}>Image: {proc.image}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {getTotalPages(stats.topProcesses.disk) > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-gray-700">
                  <button
                    onClick={() => setDiskPage(Math.max(0, diskPage - 1))}
                    disabled={diskPage === 0}
                    className="px-3 py-1 rounded bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors text-sm"
                  >
                    ←
                  </button>
                  <span className="text-sm text-gray-400">
                    Page {diskPage + 1} of {getTotalPages(stats.topProcesses.disk)}
                  </span>
                  <button
                    onClick={() => setDiskPage(Math.min(getTotalPages(stats.topProcesses!.disk) - 1, diskPage + 1))}
                    disabled={diskPage >= getTotalPages(stats.topProcesses!.disk) - 1}
                    className="px-3 py-1 rounded bg-gray-700 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-600 transition-colors text-sm"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
