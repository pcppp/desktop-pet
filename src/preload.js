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
  onSoundSettings: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pet:sound-settings", listener);
    return () => {
      ipcRenderer.removeListener("pet:sound-settings", listener);
    };
  },
  openContextMenu: (anchor) => {
    ipcRenderer.send("pet:open-context-menu", anchor);
  },
  getAppearance: () => {
    return ipcRenderer.invoke("pet:get-appearance");
  },
  getSoundSettings: () => {
    return ipcRenderer.invoke("pet:get-sound-settings");
  },
  chooseCustomAppearance: () => {
    return ipcRenderer.invoke("pet:choose-custom-appearance");
  },
  chooseCustomSound: (soundKey) => {
    return ipcRenderer.invoke("pet:choose-custom-sound", soundKey);
  },
  setSoundMode: (soundKey, mode) => {
    return ipcRenderer.invoke("pet:set-sound-mode", soundKey, mode);
  },
  resetAppearance: () => {
    return ipcRenderer.invoke("pet:reset-appearance");
  },
  dragMove: (deltaX, deltaY) => {
    ipcRenderer.send("pet:drag-move", { deltaX, deltaY });
  }
});
