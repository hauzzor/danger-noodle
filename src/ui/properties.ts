import type { ActionKind, Blob, Rule } from "../sim/types";

export interface PropertiesHandlers {
  onChange: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export interface Properties {
  open: (blob: Blob, handlers: PropertiesHandlers) => void;
  close: () => void;
  isOpen: () => boolean;
  refresh: () => void;
}

const TRIGGERS = ["beat", "touch", "goal", "food", "tilt", "stretch"];
const ACTIONS: ActionKind[] = ["grip", "release", "contract", "extend"];

export function createProperties(root: HTMLElement): Properties {
  const el = document.createElement("div");
  el.className = "panel hidden";
  root.append(el);

  let current: Blob | null = null;
  let handlers: PropertiesHandlers | null = null;

  const field = (label: string, node: HTMLElement): HTMLElement => {
    const row = document.createElement("label");
    row.className = "field";
    const span = document.createElement("span");
    span.textContent = label;
    row.append(span, node);
    return row;
  };

  const numberInput = (value: number, step: number, min: number, max: number, onInput: (v: number) => void): HTMLInputElement => {
    const input = document.createElement("input");
    input.type = "number";
    input.value = String(value);
    input.step = String(step);
    input.min = String(min);
    input.max = String(max);
    input.addEventListener("input", () => onInput(Number(input.value)));
    return input;
  };

  const select = (options: string[], value: string, onChange: (v: string) => void): HTMLSelectElement => {
    const sel = document.createElement("select");
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o;
      if (o === value) opt.selected = true;
      sel.append(opt);
    }
    sel.addEventListener("change", () => onChange(sel.value));
    return sel;
  };

  const ruleRow = (rule: Rule): HTMLElement => {
    const row = document.createElement("div");
    row.className = "rule";
    row.append(
      select(TRIGGERS, rule.trigger, (v) => {
        rule.trigger = v;
        changed();
      }),
      select(ACTIONS, rule.action, (v) => {
        rule.action = v as ActionKind;
        changed();
      }),
    );
    const condWrap = document.createElement("div");
    condWrap.className = "inline";
    const condToggle = select(["-", ">", "<", "="], rule.condition ? rule.condition.op : "-", (v) => {
      if (v === "-") rule.condition = null;
      else rule.condition = { op: v as ">" | "<" | "=", value: rule.condition?.value ?? 0 };
      render();
      changed();
    });
    condWrap.append(condToggle);
    if (rule.condition) {
      condWrap.append(
        numberInput(rule.condition.value, 0.1, -10, 10, (v) => {
          if (rule.condition) rule.condition.value = v;
          changed();
        }),
      );
    }
    row.append(condWrap);
    row.append(
      field("delay", numberInput(rule.delay, 0.1, 0, 20, (v) => {
        rule.delay = v;
        changed();
      })),
    );
    row.append(
      field("hold", numberInput(rule.duration, 0.1, 0, 20, (v) => {
        rule.duration = v;
        changed();
      })),
    );
    const del = document.createElement("button");
    del.className = "btn tiny";
    del.textContent = "x";
    del.addEventListener("click", () => {
      if (!current) return;
      current.rules = current.rules.filter((r) => r !== rule);
      render();
      changed();
    });
    row.append(del);
    return row;
  };

  const changed = (): void => {
    handlers?.onChange();
  };

  const render = (): void => {
    if (!current || !handlers) return;
    el.innerHTML = "";
    const head = document.createElement("div");
    head.className = "panel-head";
    const title = document.createElement("div");
    title.className = "panel-title";
    title.textContent = current.sensorKind ? `${current.type} · ${current.sensorKind}` : current.type;
    const close = document.createElement("button");
    close.className = "btn tiny";
    close.textContent = "close";
    close.addEventListener("click", () => handlers?.onClose());
    head.append(title, close);
    el.append(head);

    if (current.type === "sensor" || current.type === "heart") {
      el.append(
        field("interval", numberInput(current.emitInterval, 0.1, 0.2, 20, (v) => {
          current!.emitInterval = v;
          changed();
        })),
      );
    }
    if (current.type === "heart") {
      el.append(
        select(TRIGGERS, current.emitType, (v) => {
          current!.emitType = v;
          changed();
        }),
      );
    }
    if (current.type === "contract") {
      el.append(
        field("amount", numberInput(current.contractAmount, 0.05, 0.2, 1, (v) => {
          current!.contractAmount = v;
          changed();
        })),
      );
    }

    const rulesTitle = document.createElement("div");
    rulesTitle.className = "panel-sub";
    rulesTitle.textContent = "reactions";
    el.append(rulesTitle);

    for (const rule of current.rules) el.append(ruleRow(rule));

    const footer = document.createElement("div");
    footer.className = "panel-foot";
    const add = document.createElement("button");
    add.className = "btn";
    add.textContent = "Add rule";
    add.addEventListener("click", () => {
      if (!current) return;
      current.rules.push({
        id: Math.floor(Math.random() * 1e9),
        trigger: "beat",
        condition: null,
        action: "contract",
        delay: 0,
        duration: 1,
        busyUntil: 0,
      });
      render();
      changed();
    });
    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "Delete block";
    del.addEventListener("click", () => handlers?.onDelete());
    footer.append(add, del);
    el.append(footer);
  };

  const close = (): void => {
    current = null;
    handlers = null;
    el.classList.add("hidden");
  };

  return {
    isOpen: () => !el.classList.contains("hidden"),
    close,
    refresh: render,
    open: (blob, h) => {
      current = blob;
      handlers = h;
      el.classList.remove("hidden");
      render();
    },
  };
}
