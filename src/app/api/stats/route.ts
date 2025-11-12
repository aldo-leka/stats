import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { NodeSSH } from "node-ssh";

export async function GET() {
  // Check if user is authenticated
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
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

    // Get CPU usage
    const cpuResult = await ssh.execCommand(
      "top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'"
    );
    const cpuUsage = parseFloat(cpuResult.stdout.trim()) || 0;

    // Get memory usage
    const memResult = await ssh.execCommand("free -m");
    const memLines = memResult.stdout.split("\n");
    const memLine = memLines[1].split(/\s+/);
    const memTotal = parseInt(memLine[1]) || 0;
    const memUsed = parseInt(memLine[2]) || 0;

    // Get disk usage
    const diskResult = await ssh.execCommand("df -BG / | tail -1");
    const diskLine = diskResult.stdout.split(/\s+/);
    const diskTotal = parseInt(diskLine[1].replace("G", "")) || 0;
    const diskUsed = parseInt(diskLine[2].replace("G", "")) || 0;

    // Get top CPU processes from Docker
    const dockerCpuResult = await ssh.execCommand(
      'docker stats --no-stream --format "{{.Name}}\\t{{.CPUPerc}}" | sort -k2 -rn | head -5'
    );
    console.log("Docker CPU output:", dockerCpuResult.stdout);
    console.log("Docker CPU error:", dockerCpuResult.stderr);

    const topCpuProcesses = dockerCpuResult.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [name, cpu] = line.split("\t");
        return {
          name: name.trim(),
          value: parseFloat(cpu.replace("%", "")) || 0,
        };
      })
      .filter((p) => p.value > 0);

    console.log("Parsed CPU processes:", topCpuProcesses);

    // Get top memory processes from Docker
    const dockerMemResult = await ssh.execCommand(
      'docker stats --no-stream --format "{{.Name}}\\t{{.MemUsage}}" | head -5'
    );
    console.log("Docker Mem output:", dockerMemResult.stdout);
    console.log("Docker Mem error:", dockerMemResult.stderr);

    const topMemProcesses = dockerMemResult.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [name, mem] = line.split("\t");
        const memMatch = mem.match(/([0-9.]+)([KMG]iB)/);
        if (!memMatch) return null;

        let memBytes = parseFloat(memMatch[1]);
        const unit = memMatch[2];

        if (unit === "GiB") memBytes *= 1024 * 1024 * 1024;
        else if (unit === "MiB") memBytes *= 1024 * 1024;
        else if (unit === "KiB") memBytes *= 1024;

        return {
          name: name.trim(),
          value: memBytes,
        };
      })
      .filter((p) => p !== null)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5) as Array<{ name: string; value: number }>;

    console.log("Parsed Mem processes:", topMemProcesses);

    // Get disk I/O from Docker containers
    const dockerDiskResult = await ssh.execCommand(
      'docker stats --no-stream --format "{{.Name}}\\t{{.BlockIO}}"'
    );
    console.log("Docker Disk output:", dockerDiskResult.stdout);
    console.log("Docker Disk error:", dockerDiskResult.stderr);

    const topDiskProcesses = (dockerDiskResult.stdout
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [name, blockIO] = line.split("\t");
        // BlockIO format is like "1.2MB / 3.4MB" (read / write)
        const ioMatch = blockIO?.match(/([0-9.]+)([kKMGT]?B)\s*\/\s*([0-9.]+)([kKMGT]?B)/);
        if (!ioMatch) return null;

        const readValue = parseFloat(ioMatch[1]);
        const readUnit = ioMatch[2];
        const writeValue = parseFloat(ioMatch[3]);
        const writeUnit = ioMatch[4];

        // Convert to bytes and sum read + write
        const convertToBytes = (value: number, unit: string) => {
          if (unit === "TB") return value * 1024 * 1024 * 1024 * 1024;
          if (unit === "GB") return value * 1024 * 1024 * 1024;
          if (unit === "MB") return value * 1024 * 1024;
          if (unit === "kB" || unit === "KB") return value * 1024;
          return value; // Assume bytes
        };

        const totalBytes = convertToBytes(readValue, readUnit) + convertToBytes(writeValue, writeUnit);

        return {
          name: name.trim(),
          value: totalBytes,
        };
      })
      .filter((p): p is { name: string; value: number } => p !== null && p.value > 0) as Array<{ name: string; value: number }>)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    console.log("Parsed Disk processes:", topDiskProcesses);

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
    console.error("Error fetching stats via SSH:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats via SSH" },
      { status: 500 }
    );
  }
}
