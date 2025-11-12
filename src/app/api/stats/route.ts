import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { NodeSSH } from "node-ssh";

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

    if (!sshHost || !sshUser || !sshPassword) {
      return NextResponse.json(
        { error: "SSH credentials not configured" },
        { status: 500 }
      );
    }

    // Connect to server via SSH
    await ssh.connect({
      host: sshHost,
      port: sshPort,
      username: sshUser,
      password: sshPassword,
    });

    // Run all SSH commands in parallel for speed
    const [
      cpuResult,
      memResult,
      diskResult,
      dockerCpuResult,
      cpuProcessResult,
      dockerMemResult,
      memProcessResult,
      dockerDiskResult
    ] = await Promise.all([
      ssh.execCommand(
        "top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'"
      ),
      ssh.execCommand("free -m"),
      ssh.execCommand("df -BG / | tail -1"),
      ssh.execCommand(
        'docker stats --no-stream --format "{{.Name}}\\t{{.CPUPerc}}" 2>/dev/null || echo ""'
      ),
      ssh.execCommand(
        "ps aux --sort=-%cpu | head -11 | tail -10 | awk '{print $11, $3}'"
      ),
      ssh.execCommand(
        'docker stats --no-stream --format "{{.Name}}\\t{{.MemUsage}}" 2>/dev/null || echo ""'
      ),
      ssh.execCommand(
        "ps aux --sort=-%mem | head -11 | tail -10 | awk '{print $11, $4}'"
      ),
      ssh.execCommand(
        'docker stats --no-stream --format "{{.Name}}\\t{{.BlockIO}}" 2>/dev/null || echo ""'
      ),
    ]);

    // Parse CPU usage
    const cpuUsage = parseFloat(cpuResult.stdout.trim()) || 0;

    // Parse memory usage
    const memLines = memResult.stdout.split("\n");
    const memLine = memLines[1].split(/\s+/);
    const memTotal = parseInt(memLine[1]) || 0;
    const memUsed = parseInt(memLine[2]) || 0;

    // Parse disk usage
    const diskLine = diskResult.stdout.split(/\s+/);
    const diskTotal = parseInt(diskLine[1].replace("G", "")) || 0;
    const diskUsed = parseInt(diskLine[2].replace("G", "")) || 0;

    // Parse Docker CPU processes
    const dockerCpuProcesses = dockerCpuResult.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [name, cpu] = line.split("\t");
        return {
          name: `[docker] ${name?.trim() || "unknown"}`,
          value: parseFloat(cpu?.replace("%", "") || "0") || 0,
        };
      })
      .filter((p) => p.value > 0);

    // Parse system CPU processes
    const systemCpuProcesses = cpuProcessResult.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        const cpu = parseFloat(parts[parts.length - 1]) || 0;
        const name = parts.slice(0, -1).join(" ") || "unknown";
        return {
          name: name,
          value: cpu,
        };
      })
      .filter((p) => p.value > 0);

    // Combine and sort both Docker and system processes
    const topCpuProcesses = [...dockerCpuProcesses, ...systemCpuProcesses]
      .sort((a, b) => b.value - a.value);

    // Parse Docker memory processes
    const dockerMemProcesses = dockerMemResult.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [name, mem] = line.split("\t");
        const memMatch = mem?.match(/([0-9.]+)([KMG]iB)/);
        if (!memMatch) return null;

        let memBytes = parseFloat(memMatch[1]);
        const unit = memMatch[2];

        if (unit === "GiB") memBytes *= 1024 * 1024 * 1024;
        else if (unit === "MiB") memBytes *= 1024 * 1024;
        else if (unit === "KiB") memBytes *= 1024;

        return {
          name: `[docker] ${name?.trim() || "unknown"}`,
          value: memBytes,
        };
      })
      .filter((p): p is { name: string; value: number } => p !== null && p.value > 0);

    // Parse system memory processes
    const systemMemProcesses = memProcessResult.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        const memPercent = parseFloat(parts[parts.length - 1]) || 0;
        const name = parts.slice(0, -1).join(" ") || "unknown";
        // Convert percentage to bytes based on total memory
        const memBytes = (memPercent / 100) * (memTotal * 1024 * 1024);
        return {
          name: name,
          value: memBytes,
        };
      })
      .filter((p) => p.value > 0);

    // Combine and sort both Docker and system processes
    const topMemProcesses = [...dockerMemProcesses, ...systemMemProcesses]
      .sort((a, b) => b.value - a.value);

    // Parse Docker disk I/O processes
    const dockerDiskProcesses = dockerDiskResult.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [name, blockIO] = line.split("\t");
        if (!blockIO) return null;
        // BlockIO format is like "1.2MB / 3.4MB" (read / write)
        const ioMatch = blockIO.match(/([0-9.]+)([kKMGT]?B)\s*\/\s*([0-9.]+)([kKMGT]?B)/);
        if (!ioMatch) return null;

        const readValue = parseFloat(ioMatch[1]);
        const readUnit = ioMatch[2];
        const writeValue = parseFloat(ioMatch[3]);
        const writeUnit = ioMatch[4];

        const convertToBytes = (value: number, unit: string) => {
          if (unit === "TB" || unit === "TiB") return value * 1024 * 1024 * 1024 * 1024;
          if (unit === "GB" || unit === "GiB") return value * 1024 * 1024 * 1024;
          if (unit === "MB" || unit === "MiB") return value * 1024 * 1024;
          if (unit === "kB" || unit === "KB" || unit === "KiB") return value * 1024;
          return value;
        };

        const totalBytes = convertToBytes(readValue, readUnit) + convertToBytes(writeValue, writeUnit);

        return {
          name: `[docker] ${name?.trim() || "unknown"}`,
          value: totalBytes,
        };
      })
      .filter((p): p is { name: string; value: number } => p !== null && p.value > 0);

    // Note: Getting per-process disk I/O for system processes requires root access
    // Docker stats covers most disk activity on a containerized server
    const topDiskProcesses = dockerDiskProcesses
      .sort((a, b) => b.value - a.value);

    ssh.dispose();

    return NextResponse.json({
      server: {
        name: "VPS Server",
        ip: sshHost,
        description: "Monitored via SSH",
      },
      resources: {
        cpu: cpuUsage,
        memory: {
          used: memUsed * 1024 * 1024, // Convert MB to bytes
          total: memTotal * 1024 * 1024,
        },
        disk: {
          used: diskUsed * 1024 * 1024 * 1024, // Convert GB to bytes
          total: diskTotal * 1024 * 1024 * 1024,
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
    return NextResponse.json(
      { error: "Failed to fetch stats via SSH" },
      { status: 500 }
    );
  }
}
