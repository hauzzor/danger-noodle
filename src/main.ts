import "./style.css";
import { App } from "./app";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const uiRoot = document.getElementById("ui") as HTMLDivElement;

const app = new App(canvas, uiRoot);
app.start();

if (import.meta.env.DEV) {
  (window as unknown as { __dn: unknown }).__dn = app.debugApi();
}
