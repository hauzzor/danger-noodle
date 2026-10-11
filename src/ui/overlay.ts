export interface OverlayHandlers {
  onSpeed: (speed: number) => void;
  onToggleReplace: () => void;
  onToggleMenu: () => void;
  onRegenerate: () => void;
  onClear: () => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onImport: () => void;
}

export interface Overlay {
  setSpeed: (speed: number) => void;
  setReplace: (on: boolean) => void;
  setMenu: (on: boolean) => void;
  setStatus: (text: string) => void;
  toast: (text: string) => void;
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

  const replaceBtn = document.createElement("button");
  replaceBtn.className = "btn toggle";
  const setReplace = (on: boolean): void => {
    replaceBtn.textContent = `Replace: ${on ? "on" : "off"}`;
    replaceBtn.classList.toggle("active", on);
    replaceBtn.setAttribute("aria-pressed", String(on));
  };
  replaceBtn.addEventListener("click", handlers.onToggleReplace);
  setReplace(false);

  const menuBtn = document.createElement("button");
  menuBtn.className = "btn toggle";
  const setMenu = (on: boolean): void => {
    menuBtn.textContent = `Menu: ${on ? "on" : "off"}`;
    menuBtn.classList.toggle("active", on);
    menuBtn.setAttribute("aria-pressed", String(on));
  };
  menuBtn.addEventListener("click", handlers.onToggleMenu);
  setMenu(true);

  const status = document.createElement("div");
  status.className = "status";

  const actions = document.createElement("div");
  actions.className = "actions";
  const defs: [string, () => void][] = [
    ["Regenerate", handlers.onRegenerate],
    ["Clear", handlers.onClear],
    ["Save", handlers.onSave],
    ["Load", handlers.onLoad],
    ["Export", handlers.onExport],
    ["Import", handlers.onImport],
  ];
  for (const [label, fn] of defs) {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = label;
    btn.addEventListener("click", fn);
    actions.append(btn);
  }

  const toastEl = document.createElement("div");
  toastEl.className = "toast hidden";

  bar.append(title, speedWrap, replaceBtn, menuBtn, status, actions);
  root.append(bar, toastEl);
  applySpeed();

  let toastTimer = 0;
  return {
    setSpeed: (speed: number) => {
      slider.value = String(speed);
      applySpeed();
    },
    setReplace,
    setMenu,
    setStatus: (text: string) => {
      status.textContent = text;
    },
    toast: (text: string) => {
      toastEl.textContent = text;
      toastEl.classList.remove("hidden");
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toastEl.classList.add("hidden"), 2200);
    },
  };
}
