import { app, BrowserWindow, Menu, dialog, type MenuItemConstructorOptions } from "electron";

function sendNavigate(path: string) {
  BrowserWindow.getFocusedWindow()?.webContents.send("menu:navigate", path);
}

function showAbout() {
  dialog.showMessageBox({
    type: "info",
    title: "About MeetingPrep AI",
    message: "MeetingPrep AI",
    detail: `Version ${app.getVersion()}\nMeeting preparation, technical practice, and coding practice — powered by Gemini, OpenAI, or Anthropic.`,
  });
}

export function buildAppMenu() {
  const isMac = process.platform === "darwin";

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { label: "About MeetingPrep AI", click: showAbout },
              { type: "separator" },
              { label: "Settings…", accelerator: "Cmd+,", click: () => sendNavigate("/settings") },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: "File",
      submenu: [
        { label: "New Practice Session", accelerator: "CmdOrCtrl+N", click: () => sendNavigate("/practice") },
        {
          label: "New Coding Session",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => sendNavigate("/coding-lab"),
        },
        { type: "separator" },
        ...(isMac
          ? []
          : ([
              { label: "Settings…", accelerator: "Ctrl+,", click: () => sendNavigate("/settings") },
              { type: "separator" },
            ] as MenuItemConstructorOptions[])),
        { role: isMac ? "close" : "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        {
          label: "Toggle Capture Shield",
          accelerator: "CmdOrCtrl+Shift+H",
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send("menu:toggleStealth"),
        },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Go",
      submenu: [
        { label: "Dashboard", click: () => sendNavigate("/") },
        { label: "Prep Room", click: () => sendNavigate("/prep-room") },
        { label: "Setup Guide", click: () => sendNavigate("/setup-guide") },
        { label: "Practice", click: () => sendNavigate("/practice") },
        { label: "Coding Lab", click: () => sendNavigate("/coding-lab") },
        { label: "Mock Interview", click: () => sendNavigate("/mock-interview") },
        { label: "Question Analyzer", click: () => sendNavigate("/analyzer") },
        { label: "Resume Context", click: () => sendNavigate("/resume") },
        { label: "Resume Tailoring", click: () => sendNavigate("/resume-tailoring") },
        { label: "Resources", click: () => sendNavigate("/resources") },
        { label: "Meeting Notes", click: () => sendNavigate("/meeting-notes") },
        { label: "History", click: () => sendNavigate("/history") },
        { label: "Favorites", click: () => sendNavigate("/favorites") },
        { label: "Review", click: () => sendNavigate("/review") },
        { label: "Insights", click: () => sendNavigate("/insights") },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
    {
      label: "Help",
      submenu: [{ label: "About MeetingPrep AI", click: showAbout }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
