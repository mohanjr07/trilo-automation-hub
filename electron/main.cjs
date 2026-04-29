// ─────────────────────────────────────────────────────────────────────────────
//  electron/main.cjs — Magic Aisles desktop entry point.
//
//  Desktop notifications — Mac + Windows:
//    • Windows: native toast, groups in Action Center under "Magic Aisles".
//    • macOS:   Uses Electron Notification API directly (most reliable for
//               unsigned/signed apps on macOS 12+). Falls back to osascript.
//               App must have LSUIElement or run as a proper app bundle.
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
} = require("electron");
const path = require("path");
const { exec } = require("child_process");

const isDev = !app.isPackaged;
const isMac = process.platform === "darwin";

// Set app name BEFORE ready — macOS Notification Center uses this to
// attribute and group notifications under the correct app name (not "Electron").
app.setName("Magic Aisles");

// Windows only — makes toasts show "Magic Aisles" not "Electron".
if (!isMac) {
  app.setAppUserModelId("com.magicaisles.app");
}

// ─── Single-instance lock ─────────────────────────────────────────────────
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => { showMainWindow(); });
}

let mainWindow = null;
let tray = null;
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

// ─── IPC: focus window ────────────────────────────────────────────────────
ipcMain.on("taskflow:focus-window", () => { showMainWindow(); });

// ─── Helpers ──────────────────────────────────────────────────────────────
function getIconPath() {
  const iconFile = isDev
    ? path.join(__dirname, "..", "public", "favicon.png")
    : path.join(__dirname, "..", "dist", "favicon.png");
  return iconFile;
}

// ─── macOS: show a Teams-style alert popup via Electron Notification ──────
//
//  Key insight: on macOS, Electron.Notification works reliably IF:
//    1. The app is launched as a proper .app bundle (not via `electron .`)
//    2. OR app.setName() and app.setAppUserModelId() are called before ready
//    3. The notification has a subtitle to force "alert" presentation style
//
//  For unsigned/dev builds we ALSO try osascript as a second attempt.
//
function showMacNotification(title, body, route) {
  // Strategy 1: Electron Notification API (works in signed + unsigned builds)
  if (Notification.isSupported()) {
    try {
      const notif = new Notification({
        title,
        body,
        subtitle: "Magic Aisles",   // Forces alert style on macOS (not just banner)
        silent: false,               // Play the default macOS notification sound
        timeoutType: "default",
        // urgency is Windows-only; on macOS "alert" style is set via Info.plist
      });

      notif.on("click", () => {
        showMainWindow();
        if (mainWindow) mainWindow.webContents.send("notify:clicked", { route });
      });

      notif.on("show", () => {
        console.log("[notify] macOS notification shown via Electron API");
      });

      notif.on("failed", (_e, err) => {
        console.error("[notify] Electron Notification failed:", err);
        // Cascade to osascript fallback
        showMacNotificationViaOsascript(title, body, route);
      });

      notif.show();
      return;
    } catch (err) {
      console.error("[notify] Electron Notification threw:", err);
    }
  }

  // Strategy 2: osascript (works even for unsigned/dev apps)
  showMacNotificationViaOsascript(title, body, route);
}

function showMacNotificationViaOsascript(title, body, route) {
  // Escape double-quotes and single-quotes for AppleScript safety
  const safeTitle = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const safeBody  = body.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  // Use the `osascript` heredoc form — avoids shell-quoting issues with
  // single quotes inside the body text.
  const script = [
    `tell application "System Events"`,
    `  display notification "${safeBody}" with title "${safeTitle}" subtitle "Magic Aisles" sound name "Funk"`,
    `end tell`,
  ].join("\n");

  exec(`osascript <<'APPLESCRIPT'\n${script}\nAPPLESCRIPT`, (err, stdout, stderr) => {
    if (err) {
      console.error("[notify] osascript failed:", stderr || err.message);
    } else {
      console.log("[notify] macOS notification shown via osascript");
      // osascript notifications don't give us a click callback,
      // so we fire notify:clicked when the user next focuses the app.
      app.once("browser-window-focus", () => {
        if (mainWindow) mainWindow.webContents.send("notify:clicked", { route });
      });
    }
  });
}

// ─── IPC: native desktop notification (Mac + Windows) ────────────────────
ipcMain.on("notify:show", (_event, payload) => {
  const title = payload?.title || "Magic Aisles";
  const body  = payload?.body  || "";
  const route = payload?.route || "/notifications";

  if (isMac) {
    showMacNotification(title, body, route);
    return;
  }

  // ── Windows: attach favicon and fire native toast ──────────────────────
  if (!Notification.isSupported()) {
    console.warn("[notify] Notifications not supported on this platform");
    return;
  }

  const notifOptions = { title, body, timeoutType: "default" };
  const img = nativeImage.createFromPath(getIconPath());
  if (!img.isEmpty()) notifOptions.icon = img;

  let notif;
  try {
    notif = new Notification(notifOptions);
  } catch (err) {
    console.error("[notify] Failed to construct Notification:", err);
    return;
  }

  notif.on("click", () => {
    showMainWindow();
    if (mainWindow) mainWindow.webContents.send("notify:clicked", { route });
  });
  notif.on("failed", (_e, err) => {
    console.error("[notify] Notification failed:", err);
  });
  notif.show();
});

// ─── App lifecycle ────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showMainWindow();
  });
});

app.on("window-all-closed", () => {});
app.on("before-quit", () => { isQuittingForReal = true; });
