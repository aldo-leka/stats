# VPS Stats

Monitor your VPS server with real-time stats for CPU utilization, RAM usage, disk usage, and top resource consumers. Features secure authentication restricted to a single Gmail account.

![Demo video](/demo/stats.gif)

## Prerequisites

- A VPS (e.g., Hetzner)
- [Coolify](https://coolify.io/) installed on your VPS

## Setup Guide

### 1. Configure Coolify Project

1. Navigate to your Coolify dashboard at `http://vps-ip:8000/projects`
2. Create a new stats project
3. Add a new resource: **Docker Based → Docker Image**
4. Paste your forked repo image URL:
   ```
   ghcr.io/your-username/stats:latest
   ```
5. Set your domain where you'll access the stats
6. Go to **Persistent Storage** tab:
   - Add a Directory Mount
   - Leave the source path as default
   - Set destination path: `/app/data`

### 2. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Create an OAuth 2.0 client
4. Save the **Client ID** and **Client Secret** securely

### 3. Set Environment Variables

In your Coolify dashboard, configure these environment variables:

**Application Settings:**
```env
NEXT_PUBLIC_APP_URL=https://your-domain.com
GOOGLE_EMAIL=your-allowed-email@gmail.com
```

**Google OAuth:**
```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

**Authentication:**
```env
BETTER_AUTH_SECRET=generate_from_better_auth
```
> Generate at [Better Auth Documentation](https://www.better-auth.com/docs/installation#set-environment-variables)

**SSH Configuration:**
```env
SSH_HOST=your_vps_ip
SSH_PORT=22
SSH_USER=your_ssh_user
SSH_PASSWORD=your_ssh_password
```

**Node Exporter:**
```env
NODE_EXPORTER_URL=http://DOCKER_GATEWAY_IP:9100/metrics
```
> See [node_exporter setup](#setting-up-node_exporter) below for installation

### 4. Configure GitHub Secrets

1. Go to your forked repo: `https://github.com/your-username/stats/settings`
2. Navigate to **Secrets and variables → Actions**
3. Add two repository secrets:

   **`COOLIFY_API_TOKEN`**
   - Generate at Coolify: `http://vps-ip:8000/security/private-key`
   - Enable **read** and **deploy** permissions
   - Save this token securely (you won't see it again!)

   **`COOLIFY_WEBHOOK_URL`**
   - Find at your Coolify project dashboard under **Webhooks → Deploy Webhook**

### 5. Deploy

Run the GitHub Actions pipeline to build and deploy your application to the VPS.

## Setting up node_exporter

Node Exporter provides system metrics in Prometheus format. SSH into your VPS and run:

### Installation

```bash
# Download and install node_exporter
cd /tmp
wget https://github.com/prometheus/node_exporter/releases/download/v1.8.2/node_exporter-1.8.2.linux-amd64.tar.gz
tar xvfz node_exporter-1.8.2.linux-amd64.tar.gz
sudo mv node_exporter-1.8.2.linux-amd64/node_exporter /usr/local/bin/
sudo chmod +x /usr/local/bin/node_exporter
rm -rf node_exporter-1.8.2.linux-amd64*
```

### Create systemd service

```bash
sudo tee /etc/systemd/system/node_exporter.service > /dev/null <<EOF
[Unit]
Description=Node Exporter
After=network.target

[Service]
Type=simple
User=nobody
ExecStart=/usr/local/bin/node_exporter --web.listen-address=0.0.0.0:9100
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
```

> **Note:** Configured to listen on `0.0.0.0:9100` for Docker container access

### Start the service

```bash
sudo systemctl daemon-reload
sudo systemctl enable node_exporter
sudo systemctl start node_exporter
```

### Find Docker gateway IP

```bash
docker network inspect bridge | grep Gateway
```

Expected output:
```json
"Gateway": "10.0.0.1"
```

Use this IP in your `NODE_EXPORTER_URL` environment variable:
```env
NODE_EXPORTER_URL=http://10.0.0.1:9100/metrics
```

### Test

Verify node_exporter is working:
```bash
curl http://localhost:9100/metrics
```

You should see Prometheus metrics output.

## Local Development

1. Create a `.env.local` file with required environment variables:
   ```env
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   BETTER_AUTH_SECRET=your_secret
   SSH_HOST=your_vps_ip
   SSH_PORT=22
   SSH_USER=your_user
   SSH_PASSWORD=your_password
   GOOGLE_EMAIL=your_email@gmail.com
   NODE_EXPORTER_URL=http://your_vps_ip:9100/metrics
   ```

2. Initialize the database:
   ```bash
   npx @better-auth/cli migrate
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```
