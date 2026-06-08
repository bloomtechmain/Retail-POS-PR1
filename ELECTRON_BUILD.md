# Building RetailPOS as a Windows Installer (.exe)

## Overview

The build process has two separate parts:
1. **License Server** — A separate Node.js app you host on a server/VPS. It generates and verifies license keys.
2. **Electron POS App** — The installable Windows `.exe` that wraps the full POS system.

---

## Step 1: Set Up the License Server

### 1a. Generate Ed25519 Key Pair

```bash
cd license-server
npm install
npm run setup
```

This prints:
- `ED25519_PRIVATE_KEY` — for your `.env` file (keep SECRET)
- `ED25519_PUBLIC_KEY` — for your `.env` file
- The PEM public key — **copy this into `electron/license.js`**

### 1b. Configure License Server

```bash
cp license-server/.env.example license-server/.env
```

Edit `license-server/.env`:
```
PORT=3001
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_strong_password
JWT_SECRET=your_random_64_char_string
ED25519_PRIVATE_KEY=<paste from setup output>
ED25519_PUBLIC_KEY=<paste from setup output>
DB_PATH=./data/licenses.db
SERVER_URL=http://your-server-ip:3001
```

### 1c. Embed Public Key in the Electron App

Open `electron/license.js` and replace the placeholder:
```javascript
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
YOUR_ACTUAL_PUBLIC_KEY_HERE
-----END PUBLIC KEY-----`;
```
The public key PEM is in `license-server/keys/public.pem`.

### 1d. Start the License Server

```bash
cd license-server
npm run build
npm start
```

Or for development:
```bash
npm run dev
```

Admin UI is at: `http://localhost:3001`
Login with your `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

---

## Step 2: Generate License Keys

1. Open the admin UI at your server URL
2. Log in
3. Click **"+ Generate Keys"**
4. Fill in customer name, email (optional), and number of keys
5. Click **Generate** — the keys appear ready to copy
6. Give these keys to your customers

---

## Step 3: Build the Windows Installer

### Prerequisites

- Node.js 18+
- Windows (for building `.exe`) or use a CI/CD service

### Install all dependencies

```bash
# From the Retail_POS root directory:
npm install
npm install --prefix backend
npm install --prefix frontend
```

### Add an app icon (optional but recommended)

Place your icon files in `build-assets/`:
- `icon.ico` (Windows — 256×256 recommended)
- `icon.icns` (macOS)
- `icon.png` (Linux — 512×512)

### Build the installer

```bash
npm run electron:build
```

This will:
1. Compile the TypeScript backend → `backend/dist/`
2. Build the React frontend → `frontend/dist/`
3. Package everything with Electron
4. Create the NSIS installer → `dist-electron/RetailPOS Setup 1.0.0.exe`

---

## How Activation Works

1. **Customer installs RetailPOS** using the `.exe` installer
2. **On first launch**, the activation screen appears
3. Customer enters their **license key** (e.g. `RPOS-A3BCD4E5-F6GHJ7K8-L9MNP2QR-S3TUV4WX`)
4. App contacts the **license server** over the internet
5. Server verifies the key and signs an **activation token** (Ed25519 signature)
6. Token is saved locally in the user's AppData folder
7. **Subsequent launches** verify the token locally — no internet required

### What makes keys secure
- Keys have **160 bits** of entropy — impossible to guess
- Each key is **one-time use** — tied to the machine's hardware fingerprint
- Tokens are signed with **Ed25519** — the app can verify offline without trusting a central server
- The private key **never leaves** your license server

---

## Folder Structure

```
Retail_POS/
├── electron/
│   ├── main.js          — Electron main process
│   ├── license.js       — License verification (embed public key here)
│   ├── activation.html  — Activation screen (first launch)
│   └── splash.html      — Loading screen
├── backend/             — Express API (TypeScript)
├── frontend/            — React app (TypeScript + Vite)
├── license-server/      — Separate license management server
│   ├── src/
│   │   ├── app.ts
│   │   ├── db.ts
│   │   ├── licenseUtils.ts
│   │   ├── routes/
│   │   │   ├── admin.ts
│   │   │   └── verify.ts
│   │   ├── middleware/auth.ts
│   │   └── setup.ts     — Run once to generate keys
│   └── public/
│       └── index.html   — Admin UI
├── build-assets/        — Icons and NSIS script
├── electron-builder.yml — Build configuration
└── package.json         — Root package with build scripts
```

---

## Development Mode (Without Building .exe)

To test the Electron app during development:

```bash
# Build backend and frontend first
npm run build:all

# Then launch Electron
npm run electron:dev
```

The Electron app loads the backend on port 5000, which serves the compiled frontend.
