# Gradient Bang Monkey 🐒

A professional-grade automation and telemetry suite for Gradient Bang. This project features a tactical userscript for autonomous gameplay and a Cloudflare Worker for remote monitoring.

## 🚀 Features

- **Autonomous Gameplay**: Automated login, character selection, and command execution.
- **Neural Command Loop**: Intelligent idle detection and automated repositioning/farming.
- **Live Telemetry HUD**: Real-time tracking of Bank Credits, On Hand Credits, and Fuel Capacity.
- **Remote Monitoring**: Periodic telemetry sync to Cloudflare Workers for monitoring status from any device.
- **Tactical UI**: A sleek, minimal dashboard integrated directly into the game interface.

## 🛠️ Components

1. **`space_monkey.user.js`**: The Tampermonkey userscript that powers the automation and UI.
2. **`worker.js`**: A Cloudflare Worker script that acts as a remote data store for your ship status.

## 📦 Deployment Guide

### 1. Userscript Setup
1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension.
2. Create a new script and paste the contents of [`space_monkey.user.js`](./space_monkey.user.js).
3. Update your credentials and character name in the **SETUP** section of the HUD.

### 2. Remote Telemetry Worker
To enable remote monitoring on your phone or other devices:

#### Prerequisites
- A Cloudflare account.
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) CLI installed (`npm install -g wrangler`).

#### Deployment Steps
1. **Login to Cloudflare**:
   ```bash
   npx wrangler login
   ```
2. **Create D1 Database**:
   Run the following command to create your database:
   ```bash
   npx wrangler d1 create gb-telemetry
   ```
3. **Configure `wrangler.toml`**:
   Copy the provided code snippet (including `database_id`) into your `wrangler.toml`.
4. **Deploy**:
   ```bash
   npx wrangler deploy
   ```
5. **Connect**:
   Copy your Worker's `.workers.dev` URL and paste it into the **Remote Webhook URL** field in the userscript's HUD.

## 📱 Remote Access
Once deployed, you can access your telemetry data via:
- **Latest Status**: `https://your-worker.workers.dev/`
- **History (JSON)**: `https://your-worker.workers.dev/?char=YourCharacterName`

## ⚖️ License
MIT
