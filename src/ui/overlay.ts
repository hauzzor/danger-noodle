export interface OverlayHandlers {
  onSpeed: (speed: number) => void;
}

export interface Overlay {
  setSpeed: (speed: number) => void;
}

export function createOverlay(root: HTMLElement, handlers: OverlayHandlers): Overlay {
  const bar = document.createElement("div");
  bar.className = "overlay-top";

  const title = document.createElement("div");
  title.className = "brand";
  title.textContent = "Danger Noodle";

  const speedWrap = document.createElement("label");
  speedWrap.className = "control speed";
  const speedLabel = document.createElement("span");
  speedLabel.className = "control-label";
  speedLabel.textContent = "Speed";
  const speedValue = document.createElement("span");
  speedValue.className = "control-value";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "4";
  slider.step = "0.25";
  slider.value = "1";
  const applySpeed = (): void => {
    const v = Number(slider.value);
    speedValue.textContent = v === 0 ? "paused" : `${v.toFixed(2)}x`;
    handlers.onSpeed(v);
  };
  slider.addEventListener("input", applySpeed);
  speedWrap.append(speedLabel, slider, speedValue);

  const actions = document.createElement("div");
  actions.className = "actions";
  for (const [label, key] of [
    ["Regenerate", "regen"],
    ["Clear", "clear"],
    ["Save", "save"],
    ["Load", "load"],
  ] as const) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = label;
    btn.dataset.action = key;
    btn.disabled = true;
    actions.append(btn);
  }

  bar.append(title, speedWrap, actions);
  root.append(bar);

  applySpeed();

  return {
    setSpeed: (speed: number) => {
      slider.value = String(speed);
      applySpeed();
    },
  };
}
