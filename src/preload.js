const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petBridge", {
  onTrigger: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pet:trigger", listener);
    return () => {
      ipcRenderer.removeListener("pet:trigger", listener);
    };
  },
  onAppearance: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pet:appearance", listener);
    return () => {
      ipcRenderer.removeListener("pet:appearance", listener);
    };
  },
  openContextMenu: () => {
    ipcRenderer.send("pet:open-context-menu");
  },
  getAppearance: () => {
    return ipcRenderer.invoke("pet:get-appearance");
  },
  chooseCustomAppearance: () => {
    return ipcRenderer.invoke("pet:choose-custom-appearance");
  },
  resetAppearance: () => {
    return ipcRenderer.invoke("pet:reset-appearance");
  },
  dragMove: (deltaX, deltaY) => {
    ipcRenderer.send("pet:drag-move", { deltaX, deltaY });
  }
});
