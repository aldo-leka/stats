import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { NodeSSH } from "node-ssh";

// Helper function to parse Prometheus metrics
function parsePrometheusMetrics(text: string): Map<string, number> {
  const metrics = new Map<string, number>();
  const lines = text.split("\n");

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith("#") || !line.trim()) continue;

    // Parse metric line: metric_name{labels} value
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\{([^}]*)\}\s+([0-9.eE+-]+)/);
    if (match) {
      const [, metricName, labels, value] = match;
      const key = `${metricName}{${labels}}`;
      metrics.set(key, parseFloat(value));
    } else {
      // Simple metric without labels
      const simpleMatch = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\s+([0-9.eE+-]+)/);
      if (simpleMatch) {
        const [, metricName, value] = simpleMatch;
        metrics.set(metricName, parseFloat(value));
      }
    }
  }

  return metrics;
}

// Helper function to get metric value by pattern
function getMetricValue(metrics: Map<string, number>, pattern: string): number | null {
  for (const [key, value] of metrics) {
    if (key.includes(pattern)) {
      return value;
    }
  }
  return null;
}

// Helper function to calculate CPU usage from node_exporter
function calculateCpuUsage(metrics: Map<string, number>): number {
  let totalIdle = 0;
  let totalAll = 0;
  let cpuCount = 0;

  for (const [key, value] of metrics) {
    if (key.startsWith("node_cpu_seconds_total")) {
      totalAll += value;
      if (key.includes('mode="idle"')) {
        totalIdle += value;
      }
      if (key.includes('cpu="0"') && key.includes('mode="idle"')) {
        cpuCount++;
      }
    }
  }

  if (totalAll === 0) return 0;

  // Calculate CPU usage as percentage of non-idle time
  const idlePercent = (totalIdle / totalAll) * 100;
  const usage = 100 - idlePercent;

  return Math.max(0, Math.min(100, usage));
}

export async function GET() {
  // Check if user is authenticated
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.email != process.env.GOOGLE_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ssh = new NodeSSH();

  try {
    const sshHost = process.env.SSH_HOST;
    const sshPort = parseInt(process.env.SSH_PORT || "22");
    const sshUser = process.env.SSH_USER;
    const sshPassword = process.env.SSH_PASSWORD;
    const nodeExporterUrl = process.env.NODE_EXPORTER_URL;

    if (!sshHost || !sshUser || !sshPassword) {
      return NextResponse.json(
        { error: "SSH credentials not configured" },
        { status: 500 }
      );
    }

    if (!nodeExporterUrl) {
      return NextResponse.json(
        { error: "NODE_EXPORTER_URL not configured" },
        { status: 500 }
      );
    }

    // Connect to server via SSH (for per-process data only)
    await ssh.connect({
      host: sshHost,
      port: sshPort,
      username: sshUser,
      password: sshPassword,
    });

    // Fetch data in parallel: node_exporter metrics + SSH per-process data
    const [
      metricsResponse,
      dockerCpuResult,
      cpuProcessResult,
      dockerMemResult,
      memProcessResult,
      dockerDiskResult,
      dockerInfoResult,
    ] = await Promise.all([
      // Fetch node_exporter metrics
      fetch(nodeExporterUrl),
      // SSH commands for per-process data
      ssh.execCommand(
        'docker stats --no-stream --format "{{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}" 2>/dev/null || echo ""'
      ),
      ssh.execCommand(
        "ps aux --sort=-%cpu | head -11 | tail -10 | awk '{print $2, $1, $11, $3, $4}'"
      ),
      ssh.execCommand(
        'docker stats --no-stream --format "{{.Name}}\\t{{.MemUsage}}\\t{{.CPUPerc}}" 2>/dev/null || echo ""'
      ),
      ssh.execCommand(
        "ps aux --sort=-%mem | head -11 | tail -10 | awk '{print $2, $1, $11, $4, $3}'"
      ),
      ssh.execCommand(
        'docker stats --no-stream --format "{{.Name}}\\t{{.BlockIO}}" 2>/dev/null || echo ""'
      ),
      ssh.execCommand(
        'docker ps --format "{{.Names}}\\t{{.ID}}\\t{{.Image}}" 2>/dev/null || echo ""'
      ),
    ]);

    if (!metricsResponse.ok) {
      throw new Error(`Failed to fetch node_exporter metrics: ${metricsResponse.status}`);
    }

    const metricsText = await metricsResponse.text();
    const metrics = parsePrometheusMetrics(metricsText);

    // Parse system metrics from node_exporter
    const cpuUsage = calculateCpuUsage(metrics);

    // Memory metrics
    const memTotal = getMetricValue(metrics, "node_memory_MemTotal_bytes") || 0;
    const memAvailable = getMetricValue(metrics, "node_memory_MemAvailable_bytes") || 0;
    const memUsed = memTotal - memAvailable;

    // Disk metrics (for root filesystem)
    let diskTotal = 0;
    let diskAvailable = 0;

    // Get both values first
    for (const [key, value] of metrics) {
      if (key.includes('node_filesystem_size_bytes') && key.includes('mountpoint="/"')) {
        diskTotal = value;
      }
      if (key.includes('node_filesystem_avail_bytes') && key.includes('mountpoint="/"')) {
        diskAvailable = value;
      }
    }

    // Calculate used space
    const diskUsed = diskTotal - diskAvailable;

    // Parse Docker container info (name -> ID and image mapping)
    const dockerContainerInfo = new Map<string, { id: string; image: string }>();
    dockerInfoResult.stdout
      .split("\n")
      .filter((line) => line.trim())
      .forEach((line) => {
        const [name, id, image] = line.split("\t");
        if (name && id && image) {
          dockerContainerInfo.set(name.trim(), {
            id: id.trim().substring(0, 12), // Short container ID
            image: image.trim(),
          });
        }
      });

    // Parse Docker CPU processes
    const dockerCpuProcesses = dockerCpuResult.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [name, cpu, mem] = line.split("\t");
        const containerName = name?.trim() || "unknown";
        const info = dockerContainerInfo.get(containerName);

        // Parse memory value
        const memMatch = mem?.match(/([0-9.]+)([KMG]iB)/);
        let memBytes = 0;
        if (memMatch) {
          memBytes = parseFloat(memMatch[1]);
          const unit = memMatch[2];
          if (unit === "GiB") memBytes *= 1024 * 1024 * 1024;
          else if (unit === "MiB") memBytes *= 1024 * 1024;
          else if (unit === "KiB") memBytes *= 1024;
        }

        return {
          name: `[docker] ${containerName}`,
          value: parseFloat(cpu?.replace("%", "") || "0") || 0,
          pid: info?.id || undefined,
          user: "docker",
          image: info?.image,
          secondaryMetric: memBytes,
        };
      })
      .filter((p) => p.value > 0);

    // Parse system CPU processes
    const systemCpuProcesses = cpuProcessResult.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        // Format: PID USER COMMAND CPU% MEM%
        if (parts.length < 5) return null;
        const pid = parts[0];
        const user = parts[1];
        const memPercent = parseFloat(parts[parts.length - 1]) || 0;
        const cpu = parseFloat(parts[parts.length - 2]) || 0;
        const name = parts.slice(2, -2).join(" ") || "unknown";

        // Convert memory percentage to bytes
        const memBytes = (memPercent / 100) * memTotal;

        return {
          name: name,
          value: cpu,
          pid: pid,
          user: user,
          secondaryMetric: memBytes,
        };
      })
      .filter((p): p is { name: string; value: number; pid: string; user: string; secondaryMetric: number } => {
        if (!p) return false;
        // Filter out monitoring commands and low CPU processes
        const monitoringCommands = ['ps', 'docker', 'awk', 'head', 'tail', 'grep', 'sed', 'sort'];
        const isMonitoringCmd = monitoringCommands.some(cmd => p.name === cmd || p.name.startsWith(cmd + ' '));
        return p.value > 0 && !isMonitoringCmd;
      });

    // Combine and sort both Docker and system processes
    const topCpuProcesses = [...dockerCpuProcesses, ...systemCpuProcesses].sort(
      (a, b) => b.value - a.value
    );

    // Parse Docker memory processes
    const dockerMemProcesses = dockerMemResult.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [name, mem, cpu] = line.split("\t");
        const containerName = name?.trim() || "unknown";
        const info = dockerContainerInfo.get(containerName);

        const memMatch = mem?.match(/([0-9.]+)([KMG]iB)/);
        if (!memMatch) return null;

        let memBytes = parseFloat(memMatch[1]);
        const unit = memMatch[2];

        if (unit === "GiB") memBytes *= 1024 * 1024 * 1024;
        else if (unit === "MiB") memBytes *= 1024 * 1024;
        else if (unit === "KiB") memBytes *= 1024;

        return {
          name: `[docker] ${containerName}`,
          value: memBytes,
          pid: info?.id || undefined,
          user: "docker",
          image: info?.image,
          secondaryMetric: parseFloat(cpu?.replace("%", "") || "0") || 0,
        };
      })
      .filter((p) => p !== null && p.value > 0);

    // Parse system memory processes
    const systemMemProcesses = memProcessResult.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        // Format: PID USER COMMAND MEM% CPU%
        if (parts.length < 5) return null;
        const pid = parts[0];
        const user = parts[1];
        const cpuPercent = parseFloat(parts[parts.length - 1]) || 0;
        const memPercent = parseFloat(parts[parts.length - 2]) || 0;
        const name = parts.slice(2, -2).join(" ") || "unknown";
        // Convert percentage to bytes based on total memory
        const memBytes = (memPercent / 100) * memTotal;
        return {
          name: name,
          value: memBytes,
          pid: pid,
          user: user,
          secondaryMetric: cpuPercent,
        };
      })
      .filter((p) => p !== null && p.value > 0);

    // Combine and sort both Docker and system processes
    const topMemProcesses = [...dockerMemProcesses, ...systemMemProcesses].sort(
      (a, b) => b.value - a.value
    );

    // Parse Docker disk I/O processes
    const dockerDiskProcesses = dockerDiskResult.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [name, blockIO] = line.split("\t");
        const containerName = name?.trim() || "unknown";
        const info = dockerContainerInfo.get(containerName);

        if (!blockIO) return null;
        // BlockIO format is like "1.2MB / 3.4MB" (read / write)
        const ioMatch = blockIO.match(
          /([0-9.]+)([kKMGT]?B)\s*\/\s*([0-9.]+)([kKMGT]?B)/
        );
        if (!ioMatch) return null;

        const readValue = parseFloat(ioMatch[1]);
        const readUnit = ioMatch[2];
        const writeValue = parseFloat(ioMatch[3]);
        const writeUnit = ioMatch[4];

        const convertToBytes = (value: number, unit: string) => {
          if (unit === "TB" || unit === "TiB")
            return value * 1024 * 1024 * 1024 * 1024;
          if (unit === "GB" || unit === "GiB")
            return value * 1024 * 1024 * 1024;
          if (unit === "MB" || unit === "MiB") return value * 1024 * 1024;
          if (unit === "kB" || unit === "KB" || unit === "KiB")
            return value * 1024;
          return value;
        };

        const totalBytes =
          convertToBytes(readValue, readUnit) +
          convertToBytes(writeValue, writeUnit);

        return {
          name: `[docker] ${containerName}`,
          value: totalBytes,
          pid: info?.id || undefined,
          user: "docker",
          image: info?.image,
        };
      })
      .filter(
        (p): p is { name: string; value: number; pid?: string; user: string; image?: string } => p !== null && p.value > 0
      );

    // Note: Getting per-process disk I/O for system processes requires root access
    // Docker stats covers most disk activity on a containerized server
    const topDiskProcesses = dockerDiskProcesses.sort(
      (a, b) => b.value - a.value
    );

    ssh.dispose();

    return NextResponse.json({
      server: {
        name: "VPS Server",
        ip: sshHost,
        description: "Monitored via node_exporter + SSH",
      },
      resources: {
        cpu: cpuUsage,
        memory: {
          used: memUsed,
          total: memTotal,
        },
        disk: {
          used: diskUsed,
          total: diskTotal,
        },
      },
      topProcesses: {
        cpu: topCpuProcesses,
        memory: topMemProcesses,
        disk: topDiskProcesses,
      },
    });
  } catch (error) {
    ssh.dispose();
    console.error("Stats fetch error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch stats",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
