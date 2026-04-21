const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petBridge", {
  onTrigger: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pet:trigger", listener);
    return () => {
      ipcRenderer.removeListener("pet:trigger", listener);
    };
  },
  openContextMenu: () => {
    ipcRenderer.send("pet:open-context-menu");
  },
  dragMove: (deltaX, deltaY) => {
    ipcRenderer.send("pet:drag-move", { deltaX, deltaY });
  }
});
