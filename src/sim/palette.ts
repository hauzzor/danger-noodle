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

export function signalCss(index: number): string {
  return SIGNAL_PALETTE[index]?.css ?? SIGNAL_PALETTE[0].css;
}
