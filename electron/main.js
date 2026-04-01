const { app, BrowserWindow, shell, dialog } = require("electron");
const { spawn, execSync } = require("child_process");
const path = require("path");
const http = require("http");
const os = require("os");

let mainWindow;
let serverProcess;
let pythonProcess;

// ─── Find bundled executables ─────────────────────────────────────────────────
function getResourcePath(...parts) {
  // In packaged app, resources are in process.resourcesPath
  // In dev, they're relative to project root
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...parts);
  }
  return path.join(__dirname, "..", ...parts);
}

function getPythonPath() {
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, "python", "bin", "python3");
    if (require("fs").existsSync(bundled)) return bundled;
  }
  // Fall back to system Python
  const candidates = ["python3", "python"];
  for (const p of candidates) {
    try { execSync(`${p} --version`, { stdio: "ignore" }); return p; } catch {}
  }
  return null;
}

function getNodePath() {
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, "node", "bin", "node");
    if (require("fs").existsSync(bundled)) return bundled;
  }
  return process.execPath; // Electron ships Node built-in
}

// ─── Wait for server to be ready ─────────────────────────────────────────────
function waitForServer(port, retries = 30) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/quote/AAPL`, res => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        tries++;
        if (tries >= retries) reject(new Error(`Server didn't start on port ${port}`));
        else setTimeout(check, 1000);
      });
      req.setTimeout(1000, () => { req.destroy(); });
    };
    check();
  });
}

// ─── Start backend processes ──────────────────────────────────────────────────
async function startBackend() {
  const serverPath = getResourcePath("dist", "index.cjs");
  const pythonScript = getResourcePath("server", "fundamentals_service.py");
  const pythonBin = getPythonPath();

  // Start Python microservice (port 5001)
  if (pythonBin) {
    pythonProcess = spawn(pythonBin, [pythonScript, "5001"], {
      cwd: getResourcePath(),
      env: { ...process.env },
      stdio: "pipe",
    });
    pythonProcess.on("error", err => console.log("Python error:", err.message));
  }

  // Start Node server (port 5000) — use Electron's built-in Node
  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: getResourcePath(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "5000",
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: "pipe",
  });

  serverProcess.stdout.on("data", d => console.log("[server]", d.toString().trim()));
  serverProcess.stderr.on("data", d => console.log("[server err]", d.toString().trim()));
  serverProcess.on("error", err => console.log("Server error:", err.message));

  // Wait up to 30s for server to be ready
  await waitForServer(5000);
}

// ─── Create window ────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "PitchStock",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: "#0d1117",
    show: false, // show after load
  });

  mainWindow.loadURL("http://127.0.0.1:5000");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Show a loading splash while server starts
  const splash = new BrowserWindow({
    width: 360,
    height: 220,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    backgroundColor: "#0d1117",
    webPreferences: { nodeIntegration: false },
  });

  splash.loadURL(`data:text/html,
    <html>
    <body style="margin:0;background:#0d1117;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;color:#fff;">
      <svg width="48" height="48" viewBox="0 0 36 36" fill="none">
        <rect width="36" height="36" rx="8" fill="rgba(0,212,180,0.12)"/>
        <polyline points="6,26 12,20 18,22 24,12 30,8" stroke="#00d4b4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <circle cx="30" cy="8" r="2" fill="#00d4b4"/>
      </svg>
      <div style="font-size:22px;font-weight:700;margin-top:16px;letter-spacing:-0.5px;">PitchStock</div>
      <div style="font-size:12px;color:#666;margin-top:6px;">Starting up…</div>
      <div style="margin-top:20px;width:180px;height:3px;background:#1a1a2e;border-radius:2px;overflow:hidden;">
        <div id="bar" style="width:0%;height:100%;background:#00d4b4;border-radius:2px;transition:width 0.3s ease;"></div>
      </div>
      <script>
        let w = 0;
        const bar = document.getElementById('bar');
        const iv = setInterval(() => { w = Math.min(w + Math.random() * 8, 90); bar.style.width = w + '%'; }, 300);
      </script>
    </body></html>
  `);

  try {
    await startBackend();
    splash.close();
    createWindow();
  } catch (err) {
    splash.close();
    dialog.showErrorBox("PitchStock failed to start", `Could not start the server.\n\n${err.message}\n\nMake sure no other application is using port 5000.`);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
  if (pythonProcess) pythonProcess.kill();
});
