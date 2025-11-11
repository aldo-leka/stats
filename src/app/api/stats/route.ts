import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  // Check if user is authenticated
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const netdataUrl = process.env.NETDATA_URL;

    if (!netdataUrl) {
      return NextResponse.json(
        { error: "Netdata URL not configured" },
        { status: 500 }
      );
    }

    // First, get list of available charts to find disk chart
    const chartsResponse = await fetch(`${netdataUrl}/api/v1/charts`);
    const chartsData = await chartsResponse.json();

    // Find disk space chart - it could be disk_space._ or disk_space./
    const diskChartKey = Object.keys(chartsData.charts || {}).find(
      (key) => key.startsWith("disk_space.")
    ) || "disk_space._";

    console.log("Found disk chart:", diskChartKey);

    // Fetch CPU usage from Netdata API
    const cpuResponse = await fetch(
      `${netdataUrl}/api/v1/data?chart=system.cpu&after=-1&format=json`
    );

    // Fetch Memory usage
    const memoryResponse = await fetch(
      `${netdataUrl}/api/v1/data?chart=system.ram&after=-1&format=json`
    );

    // Fetch Disk usage with the correct chart name
    const diskResponse = await fetch(
      `${netdataUrl}/api/v1/data?chart=${diskChartKey}&after=-1&format=json`
    );

    if (!cpuResponse.ok || !memoryResponse.ok || !diskResponse.ok) {
      throw new Error(`Failed to fetch from Netdata - CPU: ${cpuResponse.status}, Memory: ${memoryResponse.status}, Disk: ${diskResponse.status}`);
    }

    const cpuData = await cpuResponse.json();
    const memoryData = await memoryResponse.json();
    const diskData = await diskResponse.json();

    // Parse CPU usage - sum all CPU usage fields (excluding 'time')
    const cpuLabels = cpuData.labels || [];
    const cpuValues = cpuData.data?.[0] || [];

    // Sum all CPU usage values (skip first value which is 'time')
    let cpuUsage = 0;
    for (let i = 1; i < cpuLabels.length; i++) {
      cpuUsage += cpuValues[i] || 0;
    }

    // Parse Memory usage - values are already in MB
    const memoryLabels = memoryData.labels || [];
    const memoryValues = memoryData.data?.[0] || [];
    const memFreeIndex = memoryLabels.indexOf("free");
    const memUsedIndex = memoryLabels.indexOf("used");
    const memCachedIndex = memoryLabels.indexOf("cached");
    const memBuffersIndex = memoryLabels.indexOf("buffers");

    const memoryFree = (memFreeIndex >= 0 ? memoryValues[memFreeIndex] : 0) || 0;
    const memoryUsed = (memUsedIndex >= 0 ? memoryValues[memUsedIndex] : 0) || 0;
    const memoryCached = (memCachedIndex >= 0 ? memoryValues[memCachedIndex] : 0) || 0;
    const memoryBuffers = (memBuffersIndex >= 0 ? memoryValues[memBuffersIndex] : 0) || 0;

    // Total memory = free + used + cached + buffers
    const memoryTotal = memoryFree + memoryUsed + memoryCached + memoryBuffers;

    // Parse Disk usage
    const diskLabels = diskData.labels || [];
    const diskValues = diskData.data?.[0] || [];
    const availIndex = diskLabels.indexOf("avail");
    const diskUsedIndex = diskLabels.indexOf("used");

    const diskAvail = (availIndex >= 0 ? diskValues[availIndex] : 0) || 0;
    const diskUsed = (diskUsedIndex >= 0 ? diskValues[diskUsedIndex] : 0) || 0;
    const diskTotal = diskUsed + diskAvail;

    return NextResponse.json({
      server: {
        name: "VPS Server",
        ip: "157.180.42.62",
        description: "Monitored by Netdata",
      },
      resources: {
        cpu: cpuUsage,
        memory: {
          used: memoryUsed * 1024 * 1024, // Convert MB to bytes
          total: memoryTotal * 1024 * 1024,
        },
        disk: {
          used: diskUsed * 1024 * 1024 * 1024, // Convert GB to bytes
          total: diskTotal * 1024 * 1024 * 1024,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
