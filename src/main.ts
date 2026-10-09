import "./style.css";
import { GameLoop } from "./engine/loop";
import { Camera } from "./engine/camera";
import { InputController } from "./engine/input";
import { Renderer } from "./render/renderer";
import { createOverlay } from "./ui/overlay";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const uiRoot = document.getElementById("ui") as HTMLDivElement;

const camera = new Camera();
const renderer = new Renderer(canvas, camera);
new InputController(canvas, camera);

let time = 0;
const loop = new GameLoop(
  (dt) => {
    time += dt;
  },
  () => {
    renderer.draw(time);
  },
);

createOverlay(uiRoot, {
  onSpeed: (speed) => {
    loop.speed = speed;
  },
});

loop.start();
