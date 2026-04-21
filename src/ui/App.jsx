import { useEffect, useEffectEvent, useRef, useState } from "react";
import replyFinishedDefaultUrl from "../assets/reply-finished-default.mp3";

const IDLE_TIMEOUT_MS = 15000;
const DRAG_SOUND_THROTTLE_MS = 180;
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

function PresetPixelPet({ presetId }) {
  const presetClassName = `preset-${presetId || "default"}`;
  return (
    <div className={`pixel-girl-shell ${presetClassName}`}>
      <div className="pixel-girl-back-hair"></div>
      <div className="pixel-girl-hair-bob left"></div>
      <div className="pixel-girl-hair-bob right"></div>
      <div className="pixel-girl-ribbon left"></div>
      <div className="pixel-girl-ribbon right"></div>
      <div className="pixel-pet-body">
        <div className="pixel-pet-face">
          <span className="pixel-eye left"></span>
          <span className="pixel-eye right"></span>
          <span className="pixel-mouth"></span>
          <span className="pixel-blush left"></span>
          <span className="pixel-blush right"></span>
        </div>
        <div className="pixel-girl-fringe"></div>
        <div className="pixel-girl-collar"></div>
        <div className="pixel-girl-badge">
          {presetId === "moonlight" ? "ME" : presetId === "mint" ? "MN" : presetId === "sakura" ? "SK" : "CC"}
        </div>
      </div>
      <div className="pixel-girl-skirt"></div>
      <div className="pixel-girl-sleeve left"></div>
      <div className="pixel-girl-sleeve right"></div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState("idle");
  const [bubble, setBubble] = useState("Idle");
  const [animationCycle, setAnimationCycle] = useState(0);
  const [appearance, setAppearance] = useState({
    mode: "preset",
    presetId: "default",
    presetLabel: "Default Pixel Pet",
    motionModule: "sweet",
    motionModuleLabel: "Sweet",
    sourceImageLabel: null,
    sourceDataUrl: null
  });
  const [soundSettings, setSoundSettings] = useState(DEFAULT_SOUND_SETTINGS);
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
      leftX: rect.left - 2,
      rightX: rect.right + 2,
      y: rect.top + (rect.height / 2)
    });
    scheduleIdle();
  };

  return (
    <main id="pet-root">
      <div
        key={animationCycle}
        id="pet"
        className={`state-${state} ${appearance.mode === "custom" ? "is-custom" : "is-preset"} motion-${appearance.motionModule || "sweet"} preset-${appearance.presetId || "default"}`}
        title="Desktop Pet"
        onPointerDown={handlePointerDown}
        onContextMenu={handleContextMenu}
      >
        <div className="pet-shadow"></div>
        {appearance.mode === "custom" && appearance.sourceDataUrl ? (
          <div ref={spriteRef} className="custom-pet-shell">
            <img
              className="custom-pet-image"
              src={appearance.sourceDataUrl}
              alt={appearance.sourceImageLabel || "Custom pet"}
              draggable={false}
              onDragStart={(event) => {
                event.preventDefault();
              }}
            />
            <div className="custom-pet-frame"></div>
          </div>
        ) : (
          <div ref={spriteRef}>
            <PresetPixelPet presetId={appearance.presetId} />
          </div>
        )}
      </div>
      <div id="bubble" className={bubble ? "visible" : ""}>
        {bubble}
      </div>
    </main>
  );
}
