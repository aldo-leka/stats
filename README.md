# VPS Stats

Fork this repo to get stats over your server such as CPU utilization, RAM usage and disk usage and their consumers ordered by high to low and paginated. Secured auth for one Gmail account at the moment so only you can access the stats.

![Demo video](/demo/stats.gif)

To follow the steps, I assume you have:
- A VPS, by Hetzner for example.
- Coolify installed on your VPS.

Steps to use this project:
1. Create the stats project on your Coolify dashboard: http://vps-ip:8000/projects.
2. Add a new resource.
3. Select Docker Based -> Docker Image.
4. Paste your forked repo image url like so:
e.g. ghcr.io/your-username/stats:latest
5. On the Coolify dashboard, set your domain where you will access the stats from.
6. Go to Persistent Storage tab, and Add a Directory Mount. Leave the source path as is. Set the destination path as ```/app/data```. 
7. Go to Google Cloud Console and add a project and create an OAuth 2.0 client.
Make sure to copy the client id and client secret somewhere safe.
8. (For prod) Set environment variables:
    - NEXT_PUBLIC_APP_URL=domain_set_before
    - GOOGLE_CLIENT_ID=google_client_id
    - GOOGLE_CLIENT_SECRET=google_client_secret
    - BETTER_AUTH_SECRET=generate_from_[better_auth_website](https://www.better-auth.com/docs/installation#set-environment-variables)
    - SSH_HOST=vps_ip
    - SSH_PORT=port
    - SSH_USER=user
    - SSH_PASSWORD=pwd
    - GOOGLE_EMAIL=allowed_access_google_email
    - NODE_EXPORTER_URL=http://DOCKER_GATEWAY_IP:9100/metrics (see node_exporter setup below)
9. Go to your forked GitHub stats project's Settings, e.g. https://github.com/your-username/stats/settings.
10. Go to Secrets and variables -> Actions and add two repository secrets:
    1. COOLIFY_API_TOKEN to the token you generate at your Coolify dashboard at Keys & Tokens. e.g. http://vps-ip:8000/security/private-key. Make sure to set read and deploy permissions and save this in your notes because you won't see it again!
    2. COOLIFY_WEBHOOK_URL to the URL you can find at your project's Coolify dashboard at the Webhooks tab -> Deploy Webhook.
11. Run the pipeline in GitHub to build and deploy the project to your VPS and website.

## Setting up node_exporter

SSH into your VPS and run these commands:

```bash
# Download and install node_exporter
cd /tmp
wget https://github.com/prometheus/node_exporter/releases/download/v1.8.2/node_exporter-1.8.2.linux-amd64.tar.gz
tar xvfz node_exporter-1.8.2.linux-amd64.tar.gz
sudo mv node_exporter-1.8.2.linux-amd64/node_exporter /usr/local/bin/
sudo chmod +x /usr/local/bin/node_exporter
rm -rf node_exporter-1.8.2.linux-amd64*

# Create systemd service (listens on all interfaces for Docker access)
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

# Start and enable the service
sudo systemctl daemon-reload
sudo systemctl enable node_exporter
sudo systemctl start node_exporter

# Find your Docker gateway IP
docker network inspect bridge | grep Gateway
# Output will show something like: "Gateway": "10.0.0.1"

# Test it works
curl http://localhost:9100/metrics
```

Use the Gateway IP in your `NODE_EXPORTER_URL` environment variable:
```
NODE_EXPORTER_URL=http://10.0.0.1:9100/metrics
```

For local development:
- Don't forget to set the .env.local environment variables e.g. NEXT_PUBLIC_APP_URL=http://localhost:3000
- Run ```npx @better-auth/cli migrate``` to create the db file locally.
