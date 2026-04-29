// ─────────────────────────────────────────────────────────────────────────────
//  electron/main.cjs — Magic Aisles desktop entry point.
//
//  macOS Teams-style popup notifications:
//    - app.setName() BEFORE ready → Notification Center shows "Magic Aisles"
//    - subtitle field → forces ALERT style (persistent popup, not banner)
//    - requestMacNotificationPermission() → triggers one-time OS permission dialog
//    - osascript heredoc fallback → works for unsigned/dev builds
// ─────────────────────────────────────────────────────────────────────────────

const {
  app,
  BrowserWindow,
  shell,
  Menu,
  Tray,
  nativeImage,
  ipcMain,
  Notification,
  systemPreferences,
} = require("electron");
const path = require("path");
const { exec } = require("child_process");

const isDev  = !app.isPackaged;
const isMac  = process.platform === "darwin";

// CRITICAL: set app name BEFORE app.whenReady() so macOS Notification Center
// attributes popups to "Magic Aisles" instead of "Electron".
app.setName("Magic Aisles");

if (!isMac) {
  app.setAppUserModelId("com.magicaisles.app");
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => { showMainWindow(); });
}

let mainWindow        = null;
let tray              = null;
let isQuittingForReal = false;

function showMainWindow() {
  if (!mainWindow) { createWindow(); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Magic Aisles",
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  Menu.setApplicationMenu(null);

  if (isDev) {
    mainWindow.loadURL("http://localhost:8080");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      hash: "/",
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    if (!isQuittingForReal) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

function createTray() {
  const iconPath = isDev
    ? path.join(__dirname, "..", "public", "favicon.png")
    : path.join(__dirname, "..", "dist", "favicon.png");

  let trayIcon = nativeImage.createFromPath(iconPath);
  if (trayIcon.isEmpty()) trayIcon = nativeImage.createEmpty();

  if (isMac && !trayIcon.isEmpty()) {
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
    trayIcon.setTemplateImage(true);
  }

  tray = new Tray(trayIcon);
  tray.setToolTip("Magic Aisles");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Magic Aisles", click: showMainWindow },
    { type: "separator" },
    { label: "Quit Magic Aisles", click: () => { isQuittingForReal = true; app.quit(); } },
  ]));
  tray.on("click", showMainWindow);
  tray.on("double-click", showMainWindow);
}

ipcMain.on("taskflow:focus-window", () => { showMainWindow(); });

// Request macOS notification permission proactively on first launch.
// This shows the one-time OS "Allow Notifications?" dialog.
async function requestMacNotificationPermission() {
  if (!isMac) return;
  try {
    if (typeof systemPreferences.requestNotifications === "function") {
      const granted = await systemPreferences.requestNotifications();
      console.log("[notify] macOS permission:", granted ? "granted" : "denied");
    }
  } catch (err) {
    // Older Electron versions don't have this API; the OS auto-prompts on first show().
    console.log("[notify] requestNotifications unavailable (OK):", err.message);
  }
}

// ── macOS popup notification (Teams-style) ────────────────────────────────
// The `subtitle` field is the KEY to getting persistent alert-style popups.
// Without it macOS shows a transient banner that auto-dismisses in 4 seconds.
// With subtitle = "Magic Aisles", the OS treats it as an alert that stays
// until the user clicks or dismisses it — exactly like Teams/Slack/Messages.
function showMacNotification(title, body, route) {
  if (!Notification.isSupported()) {
    console.warn("[notify] Notification API unavailable, trying osascript");
    showViaOsascript(title, body, route);
    return;
  }

  let notif;
  try {
    notif = new Notification({
      title,
      body,
      subtitle: "Magic Aisles",  // ← forces ALERT style (persistent popup)
      silent: false,              // ← play notification sound
      timeoutType: "default",
    });
  } catch (err) {
    console.error("[notify] Notification() threw:", err);
    showViaOsascript(title, body, route);
    return;
  }

  notif.on("show",  () => console.log("[notify] ✓ macOS popup shown"));
  notif.on("click", () => {
    showMainWindow();
    if (mainWindow) mainWindow.webContents.send("notify:clicked", { route });
  });
  notif.on("failed", (_e, err) => {
    console.error("[notify] failed:", err);
    showViaOsascript(title, body, route);
  });

  notif.show();
}

// Fallback: osascript via heredoc (immune to apostrophe/quote injection bugs).
// Notifications appear under "Script Editor" in Notification Center on older
// macOS; on macOS 13+ they appear under "System Events".
function showViaOsascript(title, body, route) {
  const t = (title || "Magic Aisles").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const b = (body  || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const script = [
    `tell application "System Events"`,
    `  display notification "${b}" with title "${t}" subtitle "Magic Aisles" sound name "Funk"`,
    `end tell`,
  ].join("\n");

  exec(`osascript <<'HEREDOC'\n${script}\nHEREDOC`, (err, _out, stderr) => {
    if (err) {
      console.error("[notify] osascript failed:", stderr || err.message);
    } else {
      console.log("[notify] osascript notification sent");
      app.once("browser-window-focus", () => {
        if (mainWindow) mainWindow.webContents.send("notify:clicked", { route });
      });
    }
  });
}

// ─── IPC handler ─────────────────────────────────────────────────────────
ipcMain.on("notify:show", (_event, payload) => {
  const title = payload?.title || "Magic Aisles";
  const body  = payload?.body  || "";
  const route = payload?.route || "/notifications";

  console.log(`[notify] notify:show received title="${title}"`);

  if (isMac) {
    showMacNotification(title, body, route);
    return;
  }

  // Windows
  if (!Notification.isSupported()) return;

  const iconPath = isDev
    ? path.join(__dirname, "..", "public", "favicon.png")
    : path.join(__dirname, "..", "dist", "favicon.png");

  const opts = { title, body, timeoutType: "default" };
  const img  = nativeImage.createFromPath(iconPath);
  if (!img.isEmpty()) opts.icon = img;

  try {
    const n = new Notification(opts);
    n.on("click", () => {
      showMainWindow();
      if (mainWindow) mainWindow.webContents.send("notify:clicked", { route });
    });
    n.on("failed", (_e, err) => console.error("[notify] Windows failed:", err));
    n.show();
  } catch (err) {
    console.error("[notify] Windows Notification() threw:", err);
  }
});

// ─── App lifecycle ────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createWindow();
  createTray();
  await requestMacNotificationPermission();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showMainWindow();
  });
});

app.on("window-all-closed", () => {});
app.on("before-quit", () => { isQuittingForReal = true; });
