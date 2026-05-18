const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddy', {
  getSnapshot: () => ipcRenderer.invoke('tasks:snapshot'),
  runCommand: (payload) => ipcRenderer.invoke('tasks:run-command', payload),
  stopCommand: (id) => ipcRenderer.invoke('tasks:stop-command', id),
  settingsSnapshot: () => ipcRenderer.invoke('settings:snapshot'),
  settingsSave: (payload) => ipcRenderer.invoke('settings:save', payload),
  settingsReset: () => ipcRenderer.invoke('settings:reset'),
  assistantSnapshot: () => ipcRenderer.invoke('assistant:snapshot'),
  assistantMessage: (payload) => ipcRenderer.invoke('assistant:message', payload),
  assistantThought: () => ipcRenderer.invoke('assistant:thought'),
  assistantReminderDone: (id) => ipcRenderer.invoke('assistant:reminder-done', id),
  windowAction: (action) => ipcRenderer.invoke('window:action', action),
  onTasksChanged: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('tasks:changed', listener);
    return () => ipcRenderer.off('tasks:changed', listener);
  },
  onAgentAlert: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('agent:alert', listener);
    return () => ipcRenderer.off('agent:alert', listener);
  },
  onSettingsChanged: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('settings:changed', listener);
    return () => ipcRenderer.off('settings:changed', listener);
  },
  onOpenSettings: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('settings:open', listener);
    return () => ipcRenderer.off('settings:open', listener);
  }
});
