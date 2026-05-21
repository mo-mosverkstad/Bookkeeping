# Webapp Environment Setup

## Project Stack

| Tool | Version | Role |
|------|---------|------|
| Node.js | LTS | Runtime + npm |
| npm | bundled with Node | Package manager |
| TypeScript | ~6.0.2 | Language (local dev dependency) |
| Vite | ^8.0.12 | Dev server + bundler |

TypeScript and Vite are declared as local `devDependencies` in `package.json` — no global installs required beyond Node.js.

---

## Windows Host vs WSL Ubuntu — Recommendation

**WSL Ubuntu (no desktop) is preferred** over installing directly on the Windows host for the following reasons:

- No permission or PATH issues — npm global installs and file operations work without admin prompts or `EACCES` errors
- Vite's file watcher (`chokidar`) is more reliable on Linux than on Windows
- `npm install` is significantly faster on Linux — Windows Defender scans every file written into `node_modules` on the Windows filesystem
- This project lives under `OneDrive` on the Windows host. OneDrive's background sync can lock files inside `node_modules`, causing install failures and watcher conflicts. On WSL, the project is copied to a native Linux path, completely outside OneDrive's reach

VS Code bridges into WSL transparently via the **WSL extension** — the UI runs on Windows while the terminal, compiler, and dev server all run inside Ubuntu.

---

## Setup: WSL Ubuntu (Recommended)

### 1. Enable WSL and install Ubuntu

In PowerShell (as Administrator):
```powershell
wsl --install
```
Reboot when prompted. Ubuntu will be available from the Start menu.

### 2. Install Node.js via nvm

Inside the Ubuntu terminal:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install --lts
```

Verify:
```bash
node -v
npm -v
```

### 3. (Optional) Copy the project to the native Linux filesystem

Working from `/mnt/c/...` is perfectly viable — especially if your git repository lives on Windows and you want a single source of truth. Skip this step if that is your preference.

The tradeoff:
- **Skip (work from `/mnt/c/...`)** — git stays on Windows, no duplication. `npm install` is slower due to Windows Defender scanning `node_modules`, and Vite's hot reload may be slightly sluggish. Mitigate the OneDrive conflict risk by excluding `node_modules` from OneDrive sync (OneDrive Settings → Backup → Manage backup)
- **Copy to native Linux path** — faster installs and file watching, but you maintain two copies and must sync changes manually or re-clone inside WSL

To copy:
```bash
cp -r /mnt/c/<path/to/dir>/Bookkeeping ~/projects/Bookkeeping
```

### 4. Install dependencies and run

From the native Linux path (if copied):
```bash
cd ~/projects/Bookkeeping/Webapp
npm install
npm run dev
```

Or directly from the Windows filesystem (if skipping step 3):
```bash
cd /mnt/c/<path/to/dir>/Bookkeeping/Webapp
npm install
npm run dev
```

Vite will print a local URL (e.g. `http://localhost:5173`). Open it in your Windows browser.

### 5. Connect VS Code to WSL

- Install the **WSL** extension in VS Code (`ms-vscode-remote.remote-wsl`)
- Press `Ctrl+Shift+P` → `WSL: Connect to WSL`
- Open the project folder (either the native Linux path or the `/mnt/c/...` path)
- The integrated terminal will run inside Ubuntu — use it to run `npm run dev` directly from VS Code

---

## Setup: Windows Host (Alternative)

If WSL is not available, install directly on Windows. Be aware of the caveats above (OneDrive conflicts, slower installs).

### 1. Install Node.js

Download the LTS installer from https://nodejs.org and run it. It adds `node` and `npm` to the system PATH automatically.

Verify in a terminal:
```
node -v
npm -v
```

### 2. Move the project out of OneDrive (strongly recommended)

Copy the project to a path not managed by OneDrive, e.g.:
```
C:\projects\Bookkeeping\Webapp
```

### 3. Install dependencies and run

```
cd C:\projects\Bookkeeping\Webapp
npm install
npm run dev
```

---

## Available Scripts

Defined in `package.json`:

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with hot reload |
| `npm run build` | Type-check with `tsc` then bundle for production |
| `npm run preview` | Serve the production build locally |

---

## Notes

- TypeScript is configured in `tsconfig.json` targeting `ES2023` with strict linting (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)
- `noEmit: true` means `tsc` only type-checks — Vite handles the actual transpilation
- Source files are under `src/`, entry point is `src/main.ts`
