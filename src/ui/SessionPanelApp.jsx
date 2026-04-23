import { useEffect, useEffectEvent, useMemo, useState } from "react";

const SOURCE_ORDER = ["codex", "claude"];

function formatTime(value) {
  if (!value) {
    return "--";
  }

  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return "--";
  }
}

function groupSessions(sessions) {
  const groups = new Map();

  for (const source of SOURCE_ORDER) {
    groups.set(source, []);
  }

  for (const session of sessions) {
    if (!groups.has(session.source)) {
      groups.set(session.source, []);
    }
    groups.get(session.source).push(session);
  }

  return groups;
}

export default function SessionPanelApp() {
  const [sessions, setSessions] = useState([]);
  const [panelSide, setPanelSide] = useState("right");
  const [activeSource, setActiveSource] = useState("codex");
  const [editingKey, setEditingKey] = useState("");
  const [editingValue, setEditingValue] = useState("");
  const [openingKey, setOpeningKey] = useState("");

  const loadSessions = useEffectEvent(async () => {
    const payload = await window.sessionPanelBridge.listSessions();
    setSessions(Array.isArray(payload?.sessions) ? payload.sessions : []);
  });

  useEffect(() => {
    void loadSessions();

    const offLayout = window.sessionPanelBridge.onLayout((payload) => {
      setPanelSide(payload?.side === "left" ? "left" : "right");
    });

    const offData = window.sessionPanelBridge.onData((payload) => {
      setPanelSide(payload?.side === "left" ? "left" : "right");
      setSessions(Array.isArray(payload?.sessions) ? payload.sessions : []);
    });

    return () => {
      offLayout();
      offData();
    };
  }, []);

  const groupedSessions = useMemo(() => groupSessions(sessions), [sessions]);
  const activeSessions = groupedSessions.get(activeSource) || [];

  useEffect(() => {
    if (SOURCE_ORDER.includes(activeSource)) {
      return;
    }

    setActiveSource("codex");
  }, [activeSource]);

  const handleEditStart = (session) => {
    const key = `${session.source}:${session.sessionId}`;
    setEditingKey(key);
    setEditingValue(session.customTitle || session.title || "");
  };

  const handleEditCancel = () => {
    setEditingKey("");
    setEditingValue("");
  };

  const handleRenameCommit = useEffectEvent(async (session) => {
    const nextTitle = editingValue;
    const response = await window.sessionPanelBridge.renameSession({
      source: session.source,
      sessionId: session.sessionId,
      title: nextTitle
    });

    setSessions(Array.isArray(response?.sessions) ? response.sessions : []);
    setEditingKey("");
    setEditingValue("");
  });

  const handleOpenSession = useEffectEvent(async (session) => {
    const key = `${session.source}:${session.sessionId}`;
    setOpeningKey(key);

    try {
      await window.sessionPanelBridge.openSession({
        source: session.source,
        sessionId: session.sessionId
      });
      window.sessionPanelBridge.hide();
    } finally {
      setOpeningKey("");
    }
  });

  return (
    <main className={`session-panel-shell side-${panelSide}`}>
      <section className="session-panel-card">
        <header className="session-panel-header">
          <div>
            <p className="session-panel-kicker">Manage Sessions</p>
            <h1>本地会话</h1>
          </div>
          <button
            type="button"
            className="session-panel-close"
            onClick={() => {
              window.sessionPanelBridge.hide();
            }}
            aria-label="Close session panel"
          >
            ×
          </button>
        </header>

        <nav className="session-panel-tabs" aria-label="Session Sources">
          {SOURCE_ORDER.map((source) => {
            const sourceLabel = source === "codex" ? "Codex" : "Claude";
            const count = (groupedSessions.get(source) || []).length;
            const isActive = source === activeSource;

            return (
              <button
                key={source}
                type="button"
                className={`session-panel-tab ${isActive ? "is-active" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setActiveSource(source);
                  setEditingKey("");
                  setEditingValue("");
                }}
              >
                <span>{sourceLabel}</span>
                <span className="session-panel-tab-count">{count}</span>
              </button>
            );
          })}
        </nav>

        <div className="session-panel-groups">
          <section className="session-group">
            <div className="session-group-header">
              <span className={`session-group-badge source-${activeSource}`}>
                {activeSource === "codex" ? "Codex" : "Claude"}
              </span>
              <span className="session-group-count">{activeSessions.length}</span>
            </div>

            <div className="session-group-list">
              {activeSessions.map((session) => {
                const key = `${session.source}:${session.sessionId}`;
                const isEditing = editingKey === key;
                const isOpening = openingKey === key;

                return (
                  <article key={key} className="session-item">
                    <button
                      type="button"
                      className="session-open-button"
                      onClick={() => {
                        void handleOpenSession(session);
                      }}
                      disabled={isOpening}
                    >
                      <div className="session-open-topline">
                        <strong>{session.title}</strong>
                        <span>{formatTime(session.updatedAt)}</span>
                      </div>
                      <div className="session-open-meta">
                        <span>{session.cwd || session.filePath}</span>
                      </div>
                      <div className="session-open-foot">
                        <span className="session-id-text">{session.sessionId}</span>
                        <span>{isOpening ? "打开中..." : "打开会话"}</span>
                      </div>
                    </button>

                    <div className="session-item-actions">
                      {isEditing ? (
                        <>
                          <input
                            className="session-rename-input"
                            value={editingValue}
                            onChange={(event) => {
                              setEditingValue(event.target.value);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void handleRenameCommit(session);
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                handleEditCancel();
                              }
                            }}
                            autoFocus
                            placeholder="输入会话名称"
                          />
                          <div className="session-action-buttons">
                            <button
                              type="button"
                              className="session-mini-button primary"
                              onClick={() => {
                                void handleRenameCommit(session);
                              }}
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              className="session-mini-button"
                              onClick={handleEditCancel}
                            >
                              取消
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="session-action-buttons">
                          <button
                            type="button"
                            className="session-mini-button"
                            onClick={() => {
                              handleEditStart(session);
                            }}
                          >
                            改名
                          </button>
                          {session.customTitle ? (
                            <button
                              type="button"
                              className="session-mini-button"
                              onClick={() => {
                                setEditingKey("");
                                setEditingValue("");
                                void window.sessionPanelBridge.renameSession({
                                  source: session.source,
                                  sessionId: session.sessionId,
                                  title: ""
                                }).then((response) => {
                                  setSessions(Array.isArray(response?.sessions) ? response.sessions : []);
                                });
                              }}
                            >
                              重置
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}

              {activeSessions.length === 0 ? (
                <div className="session-empty">
                  暂无 {activeSource === "codex" ? "Codex" : "Claude"} 会话
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
