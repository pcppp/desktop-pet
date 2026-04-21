import { useEffect, useEffectEvent, useRef, useState } from "react";

const IDLE_TIMEOUT_MS = 15000;
const PIXEL_WIDTH = 24;
const PIXEL_HEIGHT = 24;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function quantizeChannel(value, levels = 6) {
  if (levels <= 1) {
    return value;
  }

  const step = 255 / (levels - 1);
  return Math.round(Math.round(value / step) * step);
}

function createPixelArtDataUrl(imageSource, size = { width: PIXEL_WIDTH, height: PIXEL_HEIGHT }) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      const targetWidth = size.width;
      const targetHeight = size.height;

      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = targetWidth;
      sampleCanvas.height = targetHeight;
      const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });

      if (!sampleContext) {
        reject(new Error("Canvas is not available"));
        return;
      }

      sampleContext.clearRect(0, 0, targetWidth, targetHeight);
      sampleContext.imageSmoothingEnabled = true;

      const sourceRatio = sourceWidth / sourceHeight;
      const targetRatio = targetWidth / targetHeight;

      let drawWidth = targetWidth;
      let drawHeight = targetHeight;
      let drawX = 0;
      let drawY = 0;

      if (sourceRatio > targetRatio) {
        drawHeight = targetHeight;
        drawWidth = targetHeight * sourceRatio;
        drawX = (targetWidth - drawWidth) / 2;
      } else {
        drawWidth = targetWidth;
        drawHeight = targetWidth / sourceRatio;
        drawY = (targetHeight - drawHeight) / 2;
      }

      sampleContext.drawImage(image, drawX, drawY, drawWidth, drawHeight);

      const imageData = sampleContext.getImageData(0, 0, targetWidth, targetHeight);
      const { data } = imageData;

      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3];

        if (alpha < 24) {
          data[index] = 0;
          data[index + 1] = 0;
          data[index + 2] = 0;
          data[index + 3] = 0;
          continue;
        }

        data[index] = quantizeChannel(data[index], 6);
        data[index + 1] = quantizeChannel(data[index + 1], 6);
        data[index + 2] = quantizeChannel(data[index + 2], 6);
        data[index + 3] = 255;
      }

      sampleContext.putImageData(imageData, 0, 0);

      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = targetWidth;
      outputCanvas.height = targetHeight;
      const outputContext = outputCanvas.getContext("2d");

      if (!outputContext) {
        reject(new Error("Canvas is not available"));
        return;
      }

      outputContext.imageSmoothingEnabled = false;
      outputContext.clearRect(0, 0, targetWidth, targetHeight);
      outputContext.drawImage(sampleCanvas, 0, 0);

      resolve(outputCanvas.toDataURL("image/png"));
    };
    image.onerror = () => {
      reject(new Error("Unable to process the selected image"));
    };
    image.src = imageSource;
  });
}

function DefaultPixelPet() {
  return (
    <div className="pixel-pet-shell">
      <div className="pixel-pet-body">
        <div className="pixel-pet-ears">
          <span className="ear left"></span>
          <span className="ear right"></span>
        </div>
        <div className="pixel-pet-face">
          <span className="pixel-eye left"></span>
          <span className="pixel-eye right"></span>
          <span className="pixel-mouth"></span>
          <span className="pixel-blush left"></span>
          <span className="pixel-blush right"></span>
        </div>
        <div className="pixel-pet-badge">CC</div>
      </div>
      <div className="pixel-pet-tail"></div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState("idle");
  const [bubble, setBubble] = useState("Idle");
  const [animationCycle, setAnimationCycle] = useState(0);
  const [appearance, setAppearance] = useState({
    mode: "default",
    sourceImageLabel: null,
    sourceDataUrl: null
  });
  const [customSpriteUrl, setCustomSpriteUrl] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 24, y: 24 });
  const [isImporting, setIsImporting] = useState(false);
  const [appearanceError, setAppearanceError] = useState("");
  const [quotaState, setQuotaState] = useState({
    quota: null,
    isRefreshing: false
  });
  const latestAppearanceJobRef = useRef(0);
  const lastAppearanceKeyRef = useRef("");
  const menuRef = useRef(null);

  const showState = useEffectEvent((nextState, text, duration = 2200) => {
    setState(nextState);
    setBubble(text);
    setAnimationCycle((cycle) => cycle + 1);

    window.clearTimeout(showState.hideTimer);
    showState.hideTimer = window.setTimeout(() => {
      setBubble("");
    }, duration);
  });

  const scheduleIdle = useEffectEvent(() => {
    window.clearTimeout(scheduleIdle.timer);
    scheduleIdle.timer = window.setTimeout(() => {
      showState("idle", "Idle animation");
    }, IDLE_TIMEOUT_MS);
  });

  useEffect(() => {
    const onMouseMove = () => scheduleIdle();
    const onKeyDown = () => scheduleIdle();

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("keydown", onKeyDown);

    const syncAppearance = async (nextAppearance) => {
      const appearancePayload = nextAppearance || await window.petBridge.getAppearance();
      setAppearance(appearancePayload);

      if (!appearancePayload || appearancePayload.mode !== "custom" || !appearancePayload.sourceDataUrl) {
        lastAppearanceKeyRef.current = "";
        setCustomSpriteUrl(null);
        setAppearanceError("");
        return;
      }

      const nextAppearanceKey = `${appearancePayload.updatedAt || ""}:${appearancePayload.sourceDataUrl}`;
      if (lastAppearanceKeyRef.current === nextAppearanceKey) {
        return;
      }

      lastAppearanceKeyRef.current = nextAppearanceKey;
      setAppearanceError("");

      const jobId = latestAppearanceJobRef.current + 1;
      latestAppearanceJobRef.current = jobId;

      try {
        const pixelArtDataUrl = await createPixelArtDataUrl(appearancePayload.sourceDataUrl);
        if (latestAppearanceJobRef.current !== jobId) {
          return;
        }
        setCustomSpriteUrl(pixelArtDataUrl);
      } catch (error) {
        if (latestAppearanceJobRef.current !== jobId) {
          return;
        }
        setCustomSpriteUrl(null);
        setAppearanceError(error.message);
      }
    };

    const disposeTrigger = window.petBridge.onTrigger((payload) => {
      if (payload.trigger === "reply-finished") {
        showState("reply", "Claude Code reply finished");
      } else if (payload.trigger === "quota-updated") {
        showState("reply", "Quota refreshed");
      }

      void window.petBridge.getQuotaSnapshot().then((snapshot) => {
        setQuotaState(snapshot);
      });
      scheduleIdle();
    });

    const disposeAppearance = window.petBridge.onAppearance((payload) => {
      void syncAppearance(payload);
    });

    void window.petBridge.getQuotaSnapshot().then((snapshot) => {
      setQuotaState(snapshot);
    });
    void syncAppearance();
    scheduleIdle();

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("keydown", onKeyDown);
      disposeTrigger();
      disposeAppearance();
      window.clearTimeout(scheduleIdle.timer);
      window.clearTimeout(showState.hideTimer);
    };
  }, [scheduleIdle, showState]);

  const handleClick = () => {
    showState("click", "Clicked");
    scheduleIdle();
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) {
      return;
    }

    let lastX = event.screenX;
    let lastY = event.screenY;
    let moved = false;

    const onPointerMove = (moveEvent) => {
      const deltaX = moveEvent.screenX - lastX;
      const deltaY = moveEvent.screenY - lastY;

      if (deltaX === 0 && deltaY === 0) {
        return;
      }

      moved = true;
      window.petBridge.dragMove(deltaX, deltaY);
      lastX = moveEvent.screenX;
      lastY = moveEvent.screenY;
      scheduleIdle();
    };

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      if (!moved) {
        handleClick();
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  const handleContextMenu = (event) => {
    event.preventDefault();
    setMenuPosition({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 196)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 236))
    });
    setMenuOpen(true);
    setQuotaState((current) => ({
      ...current,
      isRefreshing: true
    }));
    void window.petBridge.syncQuota()
      .then((snapshot) => {
        setQuotaState(snapshot);
      })
      .catch(() => {
        setQuotaState((current) => ({ ...current, isRefreshing: false }));
      });
    scheduleIdle();
  };

  const handleChooseAppearance = async () => {
    setIsImporting(true);
    setAppearanceError("");

    try {
      const nextAppearance = await window.petBridge.chooseCustomAppearance();
      if (nextAppearance) {
        showState("reply", "Custom pet imported", 1800);
        setMenuOpen(false);
      }
    } catch (error) {
      setAppearanceError(error.message || "Unable to import image");
    } finally {
      setIsImporting(false);
      scheduleIdle();
    }
  };

  const handleResetAppearance = async () => {
    setAppearanceError("");

    try {
      await window.petBridge.resetAppearance();
      showState("click", "Default pixel pet restored", 1800);
      setMenuOpen(false);
    } catch (error) {
      setAppearanceError(error.message || "Unable to reset image");
    } finally {
      scheduleIdle();
    }
  };

  const handleSyncQuota = async () => {
    setQuotaState((current) => ({ ...current, isRefreshing: true }));

    try {
      const snapshot = await window.petBridge.syncQuota();
      setQuotaState(snapshot);
      showState("reply", "Quota refreshed", 1600);
    } catch (error) {
      setQuotaState((current) => ({ ...current, isRefreshing: false }));
      setAppearanceError(error.message || "Unable to sync quota");
    } finally {
      scheduleIdle();
    }
  };

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    const onPointerDown = (event) => {
      if (!menuRef.current || menuRef.current.contains(event.target)) {
        return;
      }

      setMenuOpen(false);
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const pixelScale = appearance.mode === "custom" ? clamp(4.6, 3.8, 5.2) : 1;
  const quota = quotaState.quota;

  return (
    <main id="pet-root">
      <div
        key={animationCycle}
        id="pet"
        className={`state-${state} ${appearance.mode === "custom" ? "is-custom" : "is-default"}`}
        title="Desktop Pet"
        onPointerDown={handlePointerDown}
        onContextMenu={handleContextMenu}
      >
        <div className="pet-shadow"></div>
        {appearance.mode === "custom" && customSpriteUrl ? (
          <div className="custom-pet-shell">
            <img
              className="custom-pet-image"
              src={customSpriteUrl}
              alt={appearance.sourceImageLabel || "Custom pet"}
              style={{ width: `${PIXEL_WIDTH * pixelScale}px`, height: `${PIXEL_HEIGHT * pixelScale}px` }}
            />
            <div className="custom-pet-frame"></div>
          </div>
        ) : (
          <DefaultPixelPet />
        )}
      </div>
      <div id="bubble" className={bubble ? "visible" : ""}>
        {bubble}
      </div>
      {menuOpen ? (
        <section
          id="pet-menu"
          ref={menuRef}
          style={{ left: `${menuPosition.x}px`, top: `${menuPosition.y}px` }}
        >
          <div className="panel-card menu-card">
            <div className="panel-title">Pet Menu</div>
            <div className="panel-section">
              <div className="panel-label">Appearance</div>
              <div className="panel-text">
                {appearance.mode === "custom"
                  ? `Custom sprite: ${appearance.sourceImageLabel || "Imported image"}`
                  : "Default built-in pixel sprite"}
              </div>
              <div className="panel-actions">
                <button type="button" className="panel-button" disabled={isImporting} onClick={handleChooseAppearance}>
                  {isImporting ? "Importing..." : "Import Image"}
                </button>
                <button
                  type="button"
                  className="panel-button secondary"
                  disabled={appearance.mode !== "custom"}
                  onClick={handleResetAppearance}
                >
                  Reset
                </button>
              </div>
              <div className="panel-tip">Images are auto-converted into a pixel-style sprite.</div>
            </div>
            <div className="panel-section">
              <div className="panel-label">Claude Quota</div>
              <div className="panel-text">
                {quotaState.isRefreshing ? "Syncing latest usage..." : "Showing cached usage instantly."}
              </div>
              {quota ? (
                <div className="quota-grid">
                  <div className="quota-row">
                    <span>5h</span>
                    <span>{quota.fiveHour.display}</span>
                  </div>
                  <div className="quota-row subtle">
                    <span>Reset</span>
                    <span>{quota.fiveHour.resetsAt}</span>
                  </div>
                  <div className="quota-row">
                    <span>Week</span>
                    <span>{quota.weekly.display}</span>
                  </div>
                  <div className="quota-row subtle">
                    <span>Reset</span>
                    <span>{quota.weekly.resetsAt}</span>
                  </div>
                </div>
              ) : null}
              <div className="panel-actions">
                <button type="button" className="panel-button" disabled={quotaState.isRefreshing} onClick={handleSyncQuota}>
                  {quotaState.isRefreshing ? "Syncing..." : "Refresh Quota"}
                </button>
                <button type="button" className="panel-button secondary" onClick={() => setMenuOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            {appearanceError ? <div className="panel-error">{appearanceError}</div> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
