import { useEffect, useEffectEvent, useRef, useState } from "react";
import replyFinishedDefaultUrl from "../assets/reply-finished-default.mp3";

const IDLE_TIMEOUT_MS = 15000;
const DRAG_SOUND_THROTTLE_MS = 180;
const PIXEL_WIDTH = 34;
const PIXEL_HEIGHT = 34;
const CUSTOM_PIXEL_SCALE = 3.2;
const CUSTOM_PIXEL_COLOR_LEVELS = 5;
const WHITE_BG_THRESHOLD = 246;
const WHITE_BG_MAX_SPREAD = 18;
const DEFAULT_SOUND_SETTINGS = {
  masterMuted: false,
  masterVolume: 75,
  click: { mode: "default", sourceAudioLabel: null, sourceDataUrl: null },
  replyFinished: { mode: "default", sourceAudioLabel: null, sourceDataUrl: null },
  drag: { mode: "silent", sourceAudioLabel: null, sourceDataUrl: null },
  idle: { mode: "silent", sourceAudioLabel: null, sourceDataUrl: null },
  updatedAt: null
};
const DEFAULT_SOUND_PATTERNS = {
  click: [
    { frequency: 880, duration: 0.06, volume: 0.14, type: "square" },
    { frequency: 1240, duration: 0.05, volume: 0.12, type: "square", delay: 0.06 }
  ],
  replyFinished: [
    { frequency: 740, duration: 0.08, volume: 0.14, type: "triangle" },
    { frequency: 988, duration: 0.09, volume: 0.13, type: "triangle", delay: 0.09 },
    { frequency: 1318, duration: 0.11, volume: 0.12, type: "triangle", delay: 0.19 }
  ],
  drag: [
    { frequency: 520, duration: 0.045, volume: 0.09, type: "square" }
  ],
  idle: [
    { frequency: 660, duration: 0.07, volume: 0.08, type: "sine" },
    { frequency: 550, duration: 0.09, volume: 0.065, type: "sine", delay: 0.075 }
  ]
};
const DEFAULT_SOUND_ASSETS = {
  replyFinished: replyFinishedDefaultUrl
};

function quantizeChannel(value, levels = CUSTOM_PIXEL_COLOR_LEVELS) {
  if (levels <= 1) {
    return value;
  }

  const step = 255 / (levels - 1);
  return Math.round(Math.round(value / step) * step);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function isNearWhiteBackground(data, pixelIndex) {
  const red = data[pixelIndex];
  const green = data[pixelIndex + 1];
  const blue = data[pixelIndex + 2];
  const alpha = data[pixelIndex + 3];
  const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
  const brightness = (red + green + blue) / 3;

  return alpha >= 200 && brightness >= WHITE_BG_THRESHOLD && spread <= WHITE_BG_MAX_SPREAD;
}

function removeEdgeConnectedWhiteBackground(imageData, width, height) {
  const { data } = imageData;
  const queue = [];
  const visited = new Uint8Array(width * height);

  const enqueueIfNeeded = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) {
      return;
    }

    const flatIndex = (y * width) + x;
    if (visited[flatIndex] === 1) {
      return;
    }

    const pixelIndex = flatIndex * 4;
    if (!isNearWhiteBackground(data, pixelIndex)) {
      return;
    }

    visited[flatIndex] = 1;
    queue.push(flatIndex);
  };

  for (let x = 0; x < width; x += 1) {
    enqueueIfNeeded(x, 0);
    enqueueIfNeeded(x, height - 1);
  }

  for (let y = 1; y < height - 1; y += 1) {
    enqueueIfNeeded(0, y);
    enqueueIfNeeded(width - 1, y);
  }

  while (queue.length > 0) {
    const flatIndex = queue.shift();
    const x = flatIndex % width;
    const y = Math.floor(flatIndex / width);
    const pixelIndex = flatIndex * 4;

    data[pixelIndex] = 0;
    data[pixelIndex + 1] = 0;
    data[pixelIndex + 2] = 0;
    data[pixelIndex + 3] = 0;

    enqueueIfNeeded(x + 1, y);
    enqueueIfNeeded(x - 1, y);
    enqueueIfNeeded(x, y + 1);
    enqueueIfNeeded(x, y - 1);
  }

  return imageData;
}

function exaggerateHighContrastColor(red, green, blue) {
  const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
  const average = (red + green + blue) / 3;

  if (spread < 42) {
    return { red, green, blue };
  }

  const boost = 1.16 + Math.min(0.42, (spread - 42) / 180);

  return {
    red: clampByte(average + ((red - average) * boost)),
    green: clampByte(average + ((green - average) * boost)),
    blue: clampByte(average + ((blue - average) * boost))
  };
}

function createPixelArtDataUrl(imageSource, size = { width: PIXEL_WIDTH, height: PIXEL_HEIGHT }) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      const targetWidth = size.width;
      const targetHeight = size.height;
      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = sourceWidth;
      sourceCanvas.height = sourceHeight;
      const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });

      if (!sourceContext) {
        reject(new Error("Canvas is not available"));
        return;
      }

      sourceContext.clearRect(0, 0, sourceWidth, sourceHeight);
      sourceContext.imageSmoothingEnabled = false;
      sourceContext.drawImage(image, 0, 0);

      const sourceImageData = removeEdgeConnectedWhiteBackground(
        sourceContext.getImageData(0, 0, sourceWidth, sourceHeight),
        sourceWidth,
        sourceHeight
      );
      sourceContext.putImageData(sourceImageData, 0, 0);
      const sourceBounds = findOpaqueBounds(sourceImageData, sourceWidth, sourceHeight);

      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = targetWidth;
      sampleCanvas.height = targetHeight;
      const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });

      if (!sampleContext) {
        reject(new Error("Canvas is not available"));
        return;
      }

      sampleContext.clearRect(0, 0, targetWidth, targetHeight);
      sampleContext.imageSmoothingEnabled = false;

      const sourceRatio = sourceBounds.width / sourceBounds.height;
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

      sampleContext.drawImage(
        sourceCanvas,
        sourceBounds.x,
        sourceBounds.y,
        sourceBounds.width,
        sourceBounds.height,
        drawX,
        drawY,
        drawWidth,
        drawHeight
      );

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

        const boostedColor = exaggerateHighContrastColor(
          data[index],
          data[index + 1],
          data[index + 2]
        );

        data[index] = quantizeChannel(boostedColor.red, CUSTOM_PIXEL_COLOR_LEVELS);
        data[index + 1] = quantizeChannel(boostedColor.green, CUSTOM_PIXEL_COLOR_LEVELS);
        data[index + 2] = quantizeChannel(boostedColor.blue, CUSTOM_PIXEL_COLOR_LEVELS);
        data[index + 3] = alpha >= 64 ? 255 : 0;
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

function findOpaqueBounds(imageData, width, height) {
  const { data } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[((y * width) + x) * 4 + 3];

      if (alpha < 24) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      x: 0,
      y: 0,
      width,
      height
    };
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, maxY - minY + 1)
  };
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
  const [soundSettings, setSoundSettings] = useState(DEFAULT_SOUND_SETTINGS);
  const latestAppearanceJobRef = useRef(0);
  const lastAppearanceKeyRef = useRef("");
  const spriteRef = useRef(null);
  const audioContextRef = useRef(null);
  const dragSoundAtRef = useRef(0);
  const customAudioPoolRef = useRef({});

  const getAudioContext = useEffectEvent(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    return audioContextRef.current;
  });

  const playDefaultSound = useEffectEvent(async (soundKey) => {
    const context = getAudioContext();
    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        return;
      }
    }

    const pattern = DEFAULT_SOUND_PATTERNS[soundKey];
    if (!pattern) {
      return;
    }
    const masterVolume = (soundSettings.masterVolume ?? 75) / 100;

    const baseTime = context.currentTime + 0.01;

    for (const note of pattern) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = baseTime + (note.delay || 0);
      const endAt = startAt + note.duration;

      oscillator.type = note.type || "sine";
      oscillator.frequency.setValueAtTime(note.frequency, startAt);

      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.linearRampToValueAtTime((note.volume || 0.03) * masterVolume, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.01);
    }
  });

  const playCustomSound = useEffectEvent(async (dataUrl) => {
    if (!dataUrl) {
      return;
    }

    let audio = customAudioPoolRef.current[dataUrl];

    if (!audio) {
      audio = new window.Audio(dataUrl);
      audio.preload = "auto";
      customAudioPoolRef.current[dataUrl] = audio;
    }

    audio.volume = Math.min(1, Math.max(0, (soundSettings.masterVolume ?? 75) / 100));
    audio.currentTime = 0;

    try {
      await audio.play();
    } catch {
      // Ignore playback failures to avoid surfacing noisy UI errors.
    }
  });

  const playActionSound = useEffectEvent(async (soundKey) => {
    if (soundSettings.masterMuted === true || (soundSettings.masterVolume ?? 75) <= 0) {
      return;
    }

    const soundEntry = soundSettings[soundKey];
    if (!soundEntry || soundEntry.mode === "silent") {
      return;
    }

    if (soundEntry.mode === "custom" && soundEntry.sourceDataUrl) {
      await playCustomSound(soundEntry.sourceDataUrl);
      return;
    }

    if (DEFAULT_SOUND_ASSETS[soundKey]) {
      await playCustomSound(DEFAULT_SOUND_ASSETS[soundKey]);
      return;
    }

    await playDefaultSound(soundKey);
  });

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
      void playActionSound("idle");
    }, IDLE_TIMEOUT_MS);
  });

  useEffect(() => {
    const onMouseMove = () => scheduleIdle();
    const onKeyDown = () => scheduleIdle();
    const unlockAudio = () => {
      const context = getAudioContext();
      if (context && context.state === "suspended") {
        void context.resume().catch(() => {});
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", unlockAudio, { passive: true });

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

    const syncSoundSettings = async (nextSoundSettings) => {
      const soundPayload = nextSoundSettings || await window.petBridge.getSoundSettings();
      setSoundSettings({
        ...DEFAULT_SOUND_SETTINGS,
        ...soundPayload
      });
    };

    const disposeTrigger = window.petBridge.onTrigger((payload) => {
      if (payload.trigger === "reply-finished") {
        showState("reply", "Claude Code reply finished");
        void playActionSound("replyFinished");
      } else if (payload.trigger === "quota-updated") {
        showState("reply", "Quota refreshed");
      }
      scheduleIdle();
    });

    const disposeAppearance = window.petBridge.onAppearance((payload) => {
      void syncAppearance(payload);
    });

    const disposeSoundSettings = window.petBridge.onSoundSettings((payload) => {
      void syncSoundSettings(payload);
    });

    void syncAppearance();
    void syncSoundSettings();
    scheduleIdle();

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", unlockAudio);
      disposeTrigger();
      disposeAppearance();
      disposeSoundSettings();
      window.clearTimeout(scheduleIdle.timer);
      window.clearTimeout(showState.hideTimer);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        void audioContextRef.current.close().catch(() => {});
      }
      customAudioPoolRef.current = {};
    };
  }, [getAudioContext, playActionSound, scheduleIdle, showState]);

  const handleClick = () => {
    showState("click", "Clicked");
    void playActionSound("click");
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
      if (Date.now() - dragSoundAtRef.current >= DRAG_SOUND_THROTTLE_MS) {
        dragSoundAtRef.current = Date.now();
        void playActionSound("drag");
      }
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

  const pixelScale = appearance.mode === "custom" ? CUSTOM_PIXEL_SCALE : 1;

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
              draggable={false}
              onDragStart={(event) => {
                event.preventDefault();
              }}
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
