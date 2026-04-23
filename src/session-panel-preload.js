const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sessionPanelBridge", {
  onLayout: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("session-panel:layout", listener);
    return () => {
      ipcRenderer.removeListener("session-panel:layout", listener);
    };
  },
  onData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("session-panel:data", listener);
    return () => {
      ipcRenderer.removeListener("session-panel:data", listener);
    };
  },
  listSessions: () => {
    return ipcRenderer.invoke("pet:list-sessions");
  },
  renameSession: (payload) => {
    return ipcRenderer.invoke("pet:rename-session", payload);
  },
  openSession: (payload) => {
    return ipcRenderer.invoke("pet:open-session", payload);
  },
  hide: () => {
    ipcRenderer.send("session-panel:hide");
  }
});
