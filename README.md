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
    - NODE_EXPORTER_URL=http://vps-ip:9100/metrics ([install instructions here](https://prometheus.io/docs/guides/node-exporter/))
9. Go to your forked GitHub stats project's Settings, e.g. https://github.com/your-username/stats/settings.
10. Go to Secrets and variables -> Actions and add two repository secrets:
    1. COOLIFY_API_TOKEN to the token you generate at your Coolify dashboard at Keys & Tokens. e.g. http://vps-ip:8000/security/private-key. Make sure to set read and deploy permissions and save this in your notes because you won't see it again!
    2. COOLIFY_WEBHOOK_URL to the URL you can find at your project's Coolify dashboard at the Webhooks tab -> Deploy Webhook.
11. Run the pipeline in GitHub to build and deploy the project to your VPS and website.

For local development:
- Don't forget to set the .env.local environment variables e.g. NEXT_PUBLIC_APP_URL=http://localhost:3000
- Run ```npx @better-auth/cli migrate``` to create the db file locally.
