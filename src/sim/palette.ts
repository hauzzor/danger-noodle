export interface SignalColor {
  name: string;
  css: string;
}

// The palette of signal colours. Generators pick one to emit; contractors pick
// any subset to accept.
export const SIGNAL_PALETTE: SignalColor[] = [
  { name: "red", css: "#ff5b4a" },
  { name: "orange", css: "#ff9f43" },
  { name: "yellow", css: "#ffe15c" },
  { name: "green", css: "#57d977" },
  { name: "cyan", css: "#43d0d0" },
  { name: "blue", css: "#5b9cff" },
  { name: "purple", css: "#b07be0" },
  { name: "pink", css: "#ff6bc1" },
];

// A dedicated signal colour used only by autonomous basic-blob NPCs. Their
// eyes emit it when they spot the player's structure and only their own
// flagella accept it, so the signal stays local to the NPC (it never crosses
// structures). Not offered to generators/contractors.
export const ALERT_SIGNAL_COLOR = SIGNAL_PALETTE.length;
export const ALERT_SIGNAL_CSS = "#ffffff";

export function signalCss(index: number): string {
  if (index === ALERT_SIGNAL_COLOR) return ALERT_SIGNAL_CSS;
  return SIGNAL_PALETTE[index]?.css ?? SIGNAL_PALETTE[0].css;
}

// The signal colour an eye emits when it sees a block of a given type.
export const TYPE_SIGNAL_COLOR: Record<string, number> = {
  basic: 3,
  generator: 0,
  contractor: 5,
  grabber: 1,
  flagella: 6,
  camera: 2,
  eye: 4,
};
