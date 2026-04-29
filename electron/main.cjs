// ─────────────────────────────────────────────────────────────────────────────
//  electron/main.cjs — Magic Aisles desktop entry point.
//
//  Desktop notifications — Mac + Windows:
//    • Windows: native toast, groups in Action Center under "Magic Aisles".
//    • macOS:   Notification Center alert. App must be installed from .dmg.
//               NSUserNotificationAlertStyle = "alert" in package.json keeps
//               alerts visible until dismissed, like Teams.
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

const isDev = !app.isPackaged;
const isMac = process.platform === "darwin";

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
      // sandbox: true blocks Notification API on macOS — must be false.
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

  // Hide to tray on close instead of quitting.
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

  // macOS menu bar expects a 16×16 template image.
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

// ─── IPC: native desktop notification (Mac + Windows) ────────────────────
//
//  Renderer  →  ipcRenderer.send("notify:show", { title, body, route })
//  Main      →  fires Electron native Notification
//  User clicks toast
//  Main      →  mainWindow.webContents.send("notify:clicked", { route })
//  Renderer  →  navigates to route
//
ipcMain.on("notify:show", (_event, payload) => {
  if (!Notification.isSupported()) return;

  const title = payload?.title || "Magic Aisles";
  const body  = payload?.body  || "";
  const route = payload?.route || "/notifications";

  // macOS: never pass icon — OS uses the .app bundle icon automatically.
  //        Passing a custom nativeImage silently suppresses the notification.
  // Windows: attach favicon as the toast icon.
  const notifOptions = { title, body, timeoutType: "default" };

  if (!isMac) {
    const iconPath = isDev
      ? path.join(__dirname, "..", "public", "favicon.png")
      : path.join(__dirname, "..", "dist", "favicon.png");
    const img = nativeImage.createFromPath(iconPath);
    if (!img.isEmpty()) notifOptions.icon = img;
  }

  let notif;
  try {
    notif = new Notification(notifOptions);
  } catch (err) {
    console.error("[notify] Failed to construct Notification:", err);
    return;
  }

  notif.on("click", () => {
    showMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send("notify:clicked", { route });
    }
  });

  notif.on("failed", (_e, err) => {
    console.error("[notify] Notification.show() failed:", err);
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

// Stay alive in tray — do NOT quit on window-all-closed.
app.on("window-all-closed", () => {});

app.on("before-quit", () => { isQuittingForReal = true; });
