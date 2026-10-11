export type RadialItem =
  | { kind?: "button"; label: string; onClick: () => void }
  | { kind: "toggle"; label: string; value: boolean; onChange: (v: boolean) => void }
  | { kind: "slider"; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void };

export interface Radial {
  open: (x: number, y: number, items: RadialItem[]) => void;
  close: () => void;
  isOpen: () => boolean;
}

export function createRadial(root: HTMLElement): Radial {
  const el = document.createElement("div");
  el.className = "radial hidden";
  root.append(el);
  let open = false;

  const close = (): void => {
    open = false;
    el.classList.add("hidden");
    el.innerHTML = "";
  };

  const row = (label: string, control: HTMLElement): HTMLElement => {
    const r = document.createElement("div");
    r.className = "radial-row";
    const span = document.createElement("span");
    span.className = "radial-label";
    span.textContent = label;
    r.append(span, control);
    return r;
  };

  return {
    isOpen: () => open,
    close,
    open: (x: number, y: number, items: RadialItem[]) => {
      el.innerHTML = "";
      for (const item of items) {
        if (item.kind === "toggle") {
          const input = document.createElement("input");
          input.type = "checkbox";
          input.checked = item.value;
          input.addEventListener("change", () => item.onChange(input.checked));
          el.append(row(item.label, input));
        } else if (item.kind === "slider") {
          const input = document.createElement("input");
          input.type = "range";
          input.min = String(item.min);
          input.max = String(item.max);
          input.step = String(item.step);
          input.value = String(item.value);
          input.addEventListener("input", () => item.onChange(Number(input.value)));
          el.append(row(item.label, input));
        } else {
          const btn = document.createElement("button");
          btn.className = "radial-item";
          btn.textContent = item.label;
          btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            item.onClick();
            close();
          });
          el.append(btn);
        }
      }
      const pad = 8;
      const w = 176;
      const h = el.offsetHeight || items.length * 40 + pad * 2;
      const left = Math.min(Math.max(x + 16, pad), window.innerWidth - w - pad);
      const top = Math.min(Math.max(y - h / 2, pad), window.innerHeight - h - pad);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.classList.remove("hidden");
      open = true;
    },
  };
}
