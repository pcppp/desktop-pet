const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("replyBubbleBridge", {
  onShow: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("reply-bubble:show", listener);
    return () => {
      ipcRenderer.removeListener("reply-bubble:show", listener);
    };
  },
  onHide: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("reply-bubble:hide", listener);
    return () => {
      ipcRenderer.removeListener("reply-bubble:hide", listener);
    };
  },
  onLayout: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("reply-bubble:layout", listener);
    return () => {
      ipcRenderer.removeListener("reply-bubble:layout", listener);
    };
  },
  hovered: (hovered) => {
    ipcRenderer.send("reply-bubble:hovered", { hovered });
  }
});
