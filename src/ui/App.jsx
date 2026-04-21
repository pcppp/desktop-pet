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
  const [appearanceError, setAppearanceError] = useState("");
  const latestAppearanceJobRef = useRef(0);
  const lastAppearanceKeyRef = useRef("");
  const spriteRef = useRef(null);

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
      scheduleIdle();
    });

    const disposeAppearance = window.petBridge.onAppearance((payload) => {
      void syncAppearance(payload);
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
    const rect = (spriteRef.current || event.currentTarget).getBoundingClientRect();
    window.petBridge.openContextMenu({
      x: rect.right + 2,
      y: rect.top + (rect.height / 2)
    });
    scheduleIdle();
  };

  const pixelScale = appearance.mode === "custom" ? clamp(4.6, 3.8, 5.2) : 1;

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
          <div ref={spriteRef} className="custom-pet-shell">
            <img
              className="custom-pet-image"
              src={customSpriteUrl}
              alt={appearance.sourceImageLabel || "Custom pet"}
              style={{ width: `${PIXEL_WIDTH * pixelScale}px`, height: `${PIXEL_HEIGHT * pixelScale}px` }}
            />
            <div className="custom-pet-frame"></div>
          </div>
        ) : (
          <div ref={spriteRef}>
            <DefaultPixelPet />
          </div>
        )}
      </div>
      <div id="bubble" className={bubble ? "visible" : ""}>
        {bubble}
      </div>
      {appearanceError ? <div id="appearance-error">{appearanceError}</div> : null}
    </main>
  );
}
