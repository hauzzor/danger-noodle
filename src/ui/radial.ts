export interface RadialItem {
  label: string;
  onClick: () => void;
}

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

  return {
    isOpen: () => open,
    close,
    open: (x: number, y: number, items: RadialItem[]) => {
      el.innerHTML = "";
      items.forEach((item) => {
        const btn = document.createElement("button");
        btn.className = "radial-item";
        btn.textContent = item.label;
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          item.onClick();
          close();
        });
        el.append(btn);
      });
      const pad = 8;
      const w = 132;
      const h = items.length * 40 + pad * 2;
      const left = Math.min(Math.max(x + 16, pad), window.innerWidth - w - pad);
      const top = Math.min(Math.max(y - h / 2, pad), window.innerHeight - h - pad);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.classList.remove("hidden");
      open = true;
    },
  };
}
