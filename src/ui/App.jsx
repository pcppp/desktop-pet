import { useEffect, useEffectEvent, useState } from "react";

const IDLE_TIMEOUT_MS = 15000;

export default function App() {
  const [state, setState] = useState("idle");
  const [bubble, setBubble] = useState("Idle");
  const [animationCycle, setAnimationCycle] = useState(0);

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

    const disposeTrigger = window.petBridge.onTrigger((payload) => {
      if (payload.trigger === "reply-finished") {
        showState("reply", "Claude Code reply finished");
      } else if (payload.trigger === "quota-updated") {
        showState("reply", "Quota refreshed");
      }
      scheduleIdle();
    });

    scheduleIdle();

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("keydown", onKeyDown);
      disposeTrigger();
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
    window.petBridge.openContextMenu();
    scheduleIdle();
  };

  return (
    <main id="pet-root">
      <div
        key={animationCycle}
        id="pet"
        className={`state-${state}`}
        title="Desktop Pet"
        onPointerDown={handlePointerDown}
        onContextMenu={handleContextMenu}
      >
        <div className="pet-shadow"></div>
        <div className="pet-body">
          <div className="pet-face">
            <div className="eyes">
              <span className="eye"></span>
              <span className="eye"></span>
            </div>
            <div className="mouth"></div>
          </div>
          <div className="pet-badge">CC</div>
        </div>
        <div className="pet-tail"></div>
      </div>
      <div id="bubble" className={bubble ? "visible" : ""}>
        {bubble}
      </div>
    </main>
  );
}
