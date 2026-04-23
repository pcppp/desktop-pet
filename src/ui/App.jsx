import { useEffect, useEffectEvent, useRef, useState } from "react";
import replyFinishedDefaultUrl from "../assets/reply-finished-default.mp3";
import PixelPetCanvas from "./PixelPetCanvas";

const LEGACY_IDLE_TIMEOUT_MS = 15000;
const SLEEP_AFTER_INACTIVITY_MS = 10 * 60 * 1000;
const BLINK_INTERVAL_MIN_MS = 6000;
const BLINK_INTERVAL_MAX_MS = 11000;
const BASE_BLINK_FRAME_MS = 120;
const ATTENTION_FRAME_MS = 150;
const SLEEP_FRAME_MS = 220;
const WAKE_FRAME_MS = 180;
const STRETCH_FRAME_MS = 170;
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

function randomBlinkDelay() {
  return BLINK_INTERVAL_MIN_MS + Math.floor(Math.random() * (BLINK_INTERVAL_MAX_MS - BLINK_INTERVAL_MIN_MS + 1));
}

function reverseFrames(frames) {
  return [...frames].reverse();
}

function createBlinkCycle(frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return [];
  }

  return [...frames, ...reverseFrames(frames)];
}

export default function App() {
  const [legacyState, setLegacyState] = useState("idle");
  const [animationCycle, setAnimationCycle] = useState(0);
  const [appearance, setAppearance] = useState({
    mode: "preset",
    renderMode: "sequence",
    presetId: "shygirl",
    presetLabel: "Story Girl",
    motionModule: "sweet",
    motionModuleLabel: "Sweet",
    sourceImageLabel: null,
    sourceDataUrl: null,
    actionFrames: null
  });
  const [soundSettings, setSoundSettings] = useState(DEFAULT_SOUND_SETTINGS);
  const [sequenceFrame, setSequenceFrame] = useState(null);
  const [sequenceState, setSequenceState] = useState("base");

  const spriteRef = useRef(null);
  const audioContextRef = useRef(null);
  const dragSoundAtRef = useRef(0);
  const customAudioPoolRef = useRef({});

  const legacyIdleTimerRef = useRef(null);
  const legacyHideTimerRef = useRef(null);

  const blinkTimerRef = useRef(null);
  const sleepTimerRef = useRef(null);
  const actionTimerIdsRef = useRef(new Set());
  const sequenceRunIdRef = useRef(0);
  const sequenceModeRef = useRef("base");

  const isSequenceAppearance = appearance.renderMode === "sequence"
    && appearance.actionFrames
    && Array.isArray(appearance.actionFrames.baseBlink)
    && appearance.actionFrames.baseBlink.length > 0;

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

  const clearActionTimers = useEffectEvent(() => {
    for (const timerId of actionTimerIdsRef.current) {
      window.clearTimeout(timerId);
    }
    actionTimerIdsRef.current.clear();
  });

  const waitForActionFrame = useEffectEvent((delayMs) => {
    return new Promise((resolve) => {
      const timerId = window.setTimeout(() => {
        actionTimerIdsRef.current.delete(timerId);
        resolve();
      }, delayMs);
      actionTimerIdsRef.current.add(timerId);
    });
  });

  const clearBlinkTimer = useEffectEvent(() => {
    if (blinkTimerRef.current) {
      window.clearTimeout(blinkTimerRef.current);
      blinkTimerRef.current = null;
    }
  });

  const clearSleepTimer = useEffectEvent(() => {
    if (sleepTimerRef.current) {
      window.clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
  });

  const getFrames = useEffectEvent((actionName) => {
    const frames = appearance.actionFrames?.[actionName];
    return Array.isArray(frames) ? frames.filter(Boolean) : [];
  });

  const getBaseFrame = useEffectEvent(() => {
    const frames = getFrames("baseBlink");
    return frames[0] || appearance.sourceDataUrl || null;
  });

  const resetLegacyHideTimer = useEffectEvent((duration = 2200) => {
    if (legacyHideTimerRef.current) {
      window.clearTimeout(legacyHideTimerRef.current);
    }

    legacyHideTimerRef.current = window.setTimeout(() => {
      setLegacyState("idle");
    }, duration);
  });

  const scheduleLegacyIdle = useEffectEvent(() => {
    if (isSequenceAppearance) {
      return;
    }

    if (legacyIdleTimerRef.current) {
      window.clearTimeout(legacyIdleTimerRef.current);
    }

    legacyIdleTimerRef.current = window.setTimeout(() => {
      setLegacyState("idle");
      void playActionSound("idle");
    }, LEGACY_IDLE_TIMEOUT_MS);
  });

  const playFrames = useEffectEvent(async (frames, frameDelayMs, runId, endMode) => {
    if (!frames.length) {
      return sequenceRunIdRef.current === runId;
    }

    for (const frame of frames) {
      if (sequenceRunIdRef.current !== runId) {
        return false;
      }

      setSequenceFrame(frame);
      if (endMode) {
        setSequenceState(endMode);
      }

      await waitForActionFrame(frameDelayMs);
    }

    return sequenceRunIdRef.current === runId;
  });

  const scheduleSleepTimer = useEffectEvent(() => {
    if (!isSequenceAppearance) {
      return;
    }

    clearSleepTimer();
    sleepTimerRef.current = window.setTimeout(() => {
      void enterSleepSequence();
    }, SLEEP_AFTER_INACTIVITY_MS);
  });

  const scheduleBlinkLoop = useEffectEvent(() => {
    if (!isSequenceAppearance) {
      return;
    }

    clearBlinkTimer();
    blinkTimerRef.current = window.setTimeout(() => {
      void playBaseBlink();
    }, randomBlinkDelay());
  });

  const enterBaseLoop = useEffectEvent(() => {
    if (!isSequenceAppearance) {
      return;
    }

    sequenceModeRef.current = "base";
    setSequenceState("base");
    setSequenceFrame(getBaseFrame());
    scheduleBlinkLoop();
  });

  const playBaseBlink = useEffectEvent(async () => {
    if (!isSequenceAppearance || sequenceModeRef.current !== "base") {
      return;
    }

    const blinkFrames = createBlinkCycle(getFrames("baseBlink"));
    if (!blinkFrames.length) {
      return;
    }

    const runId = sequenceRunIdRef.current + 1;
    sequenceRunIdRef.current = runId;
    sequenceModeRef.current = "blink";
    setSequenceState("blink");

    const completed = await playFrames(blinkFrames, BASE_BLINK_FRAME_MS, runId, "blink");
    if (!completed) {
      return;
    }

    if (sequenceRunIdRef.current !== runId) {
      return;
    }

    enterBaseLoop();
  });

  const enterSleepSequence = useEffectEvent(async () => {
    if (!isSequenceAppearance) {
      return;
    }

    if (sequenceModeRef.current === "sleeping" || sequenceModeRef.current === "entering-sleep") {
      return;
    }

    const frames = getFrames("sleep");
    if (!frames.length) {
      return;
    }

    clearBlinkTimer();
    clearSleepTimer();

    const runId = sequenceRunIdRef.current + 1;
    sequenceRunIdRef.current = runId;
    sequenceModeRef.current = "entering-sleep";
    setSequenceState("entering-sleep");

    const completed = await playFrames(frames, SLEEP_FRAME_MS, runId, "entering-sleep");
    if (!completed || sequenceRunIdRef.current !== runId) {
      return;
    }

    sequenceModeRef.current = "sleeping";
    setSequenceState("sleeping");
    setSequenceFrame(frames[frames.length - 1]);
  });

  const wakeFromSleep = useEffectEvent(async (reason) => {
    if (!isSequenceAppearance) {
      return;
    }

    if (sequenceModeRef.current !== "sleeping" && sequenceModeRef.current !== "entering-sleep") {
      return;
    }

    const sleepFrames = getFrames("sleep");
    const wakeFrames = reverseFrames(sleepFrames);
    const followFrames = reason === "attention" ? getFrames("attention") : getFrames("stretch");

    clearBlinkTimer();
    clearSleepTimer();

    const runId = sequenceRunIdRef.current + 1;
    sequenceRunIdRef.current = runId;
    sequenceModeRef.current = "waking";
    setSequenceState("waking");

    const wakeCompleted = await playFrames(wakeFrames, WAKE_FRAME_MS, runId, "waking");
    if (!wakeCompleted || sequenceRunIdRef.current !== runId) {
      return;
    }

    sequenceModeRef.current = reason === "attention" ? "attention" : "stretch";
    setSequenceState(sequenceModeRef.current);
    const followCompleted = await playFrames(
      followFrames,
      reason === "attention" ? ATTENTION_FRAME_MS : STRETCH_FRAME_MS,
      runId,
      sequenceModeRef.current
    );

    if (!followCompleted || sequenceRunIdRef.current !== runId) {
      return;
    }

    scheduleSleepTimer();
    enterBaseLoop();
  });

  const playAttention = useEffectEvent(async () => {
    if (!isSequenceAppearance) {
      return;
    }

    if (sequenceModeRef.current === "sleeping" || sequenceModeRef.current === "entering-sleep") {
      await wakeFromSleep("attention");
      return;
    }

    const attentionFrames = getFrames("attention");
    if (!attentionFrames.length) {
      enterBaseLoop();
      return;
    }

    clearBlinkTimer();

    const runId = sequenceRunIdRef.current + 1;
    sequenceRunIdRef.current = runId;
    sequenceModeRef.current = "attention";
    setSequenceState("attention");

    const completed = await playFrames(attentionFrames, ATTENTION_FRAME_MS, runId, "attention");
    if (!completed || sequenceRunIdRef.current !== runId) {
      return;
    }

    enterBaseLoop();
  });

  const recordActivity = useEffectEvent((reason) => {
    if (isSequenceAppearance) {
      scheduleSleepTimer();

      if (reason === "reply-finished") {
        void playAttention();
      } else if (sequenceModeRef.current === "sleeping" || sequenceModeRef.current === "entering-sleep") {
        void wakeFromSleep("stretch");
      }

      return;
    }

    scheduleLegacyIdle();
  });

  const handleBridgeTrigger = useEffectEvent((payload) => {
    if (payload.trigger === "reply-finished") {
      void playActionSound("replyFinished");

      if (isSequenceAppearance) {
        recordActivity("reply-finished");
      } else {
        setLegacyState("reply");
        setAnimationCycle((cycle) => cycle + 1);
        resetLegacyHideTimer(820);
        scheduleLegacyIdle();
      }
    } else if (payload.trigger === "quota-updated" && !isSequenceAppearance) {
      setLegacyState("reply");
      setAnimationCycle((cycle) => cycle + 1);
      resetLegacyHideTimer(820);
    }
  });

  useEffect(() => {
    const onMouseMove = () => {
      if (!isSequenceAppearance) {
        scheduleLegacyIdle();
      }
    };
    const onKeyDown = () => {
      if (!isSequenceAppearance) {
        scheduleLegacyIdle();
      }
    };
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
      handleBridgeTrigger(payload);
    });

    const disposeAppearance = window.petBridge.onAppearance((payload) => {
      void syncAppearance(payload);
    });

    const disposeSoundSettings = window.petBridge.onSoundSettings((payload) => {
      void syncSoundSettings(payload);
    });

    void syncAppearance();
    void syncSoundSettings();

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", unlockAudio);
      disposeTrigger();
      disposeAppearance();
      disposeSoundSettings();

      if (legacyIdleTimerRef.current) {
        window.clearTimeout(legacyIdleTimerRef.current);
      }
      if (legacyHideTimerRef.current) {
        window.clearTimeout(legacyHideTimerRef.current);
      }
      clearBlinkTimer();
      clearSleepTimer();
      clearActionTimers();

      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        void audioContextRef.current.close().catch(() => {});
      }

      customAudioPoolRef.current = {};
    };
  }, [isSequenceAppearance]);

  useEffect(() => {
    clearBlinkTimer();
    clearSleepTimer();
    sequenceRunIdRef.current += 1;

    if (isSequenceAppearance) {
      sequenceModeRef.current = "base";
      setSequenceState("base");
      setSequenceFrame(getBaseFrame());
      scheduleSleepTimer();
      void playBaseBlink();
      return;
    }

    setSequenceFrame(null);
    setSequenceState("base");
    setLegacyState("idle");
    scheduleLegacyIdle();
  }, [appearance, isSequenceAppearance]);

  const handleClick = () => {
    window.petBridge.toggleSessionPanel();

    if (isSequenceAppearance) {
      recordActivity("click");
      void playActionSound("click");
      return;
    }

    setLegacyState("click");
    setAnimationCycle((cycle) => cycle + 1);
    resetLegacyHideTimer(420);
    void playActionSound("click");
    scheduleLegacyIdle();
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) {
      return;
    }

    let lastX = event.screenX;
    let lastY = event.screenY;
    let moved = false;
    let dragActivityStarted = false;

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

      if (!dragActivityStarted) {
        dragActivityStarted = true;
        recordActivity("drag");
      }

      if (Date.now() - dragSoundAtRef.current >= DRAG_SOUND_THROTTLE_MS) {
        dragSoundAtRef.current = Date.now();
        void playActionSound("drag");
      }
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

    if (!isSequenceAppearance) {
      scheduleLegacyIdle();
    }
  };

  const rootStateClass = isSequenceAppearance ? "state-sequence" : `state-${legacyState}`;

  return (
    <main id="pet-root">
      <div
        key={isSequenceAppearance ? "sequence-pet" : animationCycle}
        id="pet"
        className={`${rootStateClass} ${appearance.mode === "custom" || appearance.renderMode === "image" || appearance.renderMode === "sequence" ? "is-custom" : "is-preset"} motion-${appearance.motionModule || "sweet"} preset-${appearance.presetId || "default"} action-${sequenceState}`}
        title="Desktop Pet"
        onPointerDown={handlePointerDown}
        onContextMenu={handleContextMenu}
      >
        <div className="pet-shadow"></div>
        {isSequenceAppearance ? (
          <div ref={spriteRef} className="custom-pet-shell sequence-pet-shell">
            <img
              className="custom-pet-image sequence-pet-image"
              src={sequenceFrame || appearance.sourceDataUrl}
              alt={appearance.sourceImageLabel || appearance.presetLabel || "Animated pet"}
              draggable={false}
              onDragStart={(dragEvent) => {
                dragEvent.preventDefault();
              }}
            />
            <div className="custom-pet-frame"></div>
          </div>
        ) : (appearance.mode === "custom" || appearance.renderMode === "image") && appearance.sourceDataUrl ? (
          <div ref={spriteRef} className="custom-pet-shell">
            <img
              className="custom-pet-image"
              src={appearance.sourceDataUrl}
              alt={appearance.sourceImageLabel || "Custom pet"}
              draggable={false}
              onDragStart={(dragEvent) => {
                dragEvent.preventDefault();
              }}
            />
            <div className="custom-pet-frame"></div>
          </div>
        ) : (
          <div ref={spriteRef}>
            <PixelPetCanvas
              presetId={appearance.presetId}
              motionModule={appearance.motionModule}
              state={legacyState}
              animationCycle={animationCycle}
            />
          </div>
        )}
      </div>
    </main>
  );
}
