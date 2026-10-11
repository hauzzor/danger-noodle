import { Camera } from "./engine/camera";
import { GameLoop } from "./engine/loop";
import { Renderer } from "./render/renderer";
import { Interaction } from "./ui/interaction";
import { createOverlay, type Overlay } from "./ui/overlay";
import { createRadial, type Radial, type RadialItem } from "./ui/radial";
import { createWorld, createStarterCreature } from "./world/generator";
import { createProgress, type Progress } from "./game/state";
import { deserialize, exportSnapshot, importSnapshot, loadSlot, saveSlot, serialize } from "./persistence/save";
import type { World } from "./sim/world";
import type { Vec2 } from "./sim/types";

export class App {
  private world: World;
  private progress: Progress;
  private readonly camera = new Camera();
  private readonly renderer: Renderer;
  private readonly overlay: Overlay;
  private readonly radial: Radial;
  private readonly interaction: Interaction;
  private readonly loop: GameLoop;
  private statusTick = 0;
  private replaceOn = true;
  private menuOn = true;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.progress = createProgress(Math.floor(Math.random() * 1e9));
    this.world = createWorld(this.progress.seed);

    this.renderer = new Renderer(canvas, this.camera);

    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
    );

    this.overlay = createOverlay(uiRoot, {
      onSpeed: (s) => {
        this.loop.speed = s;
      },
      onToggleReplace: () => {
        this.replaceOn = !this.replaceOn;
        this.overlay.setReplace(this.replaceOn);
      },
      onToggleMenu: () => {
        this.menuOn = !this.menuOn;
        this.overlay.setMenu(this.menuOn);
        if (!this.menuOn) this.radial.close();
      },
      onRegenerate: () => this.regenerate(),
      onClear: () => this.clearCreature(),
      onSave: () => this.save(),
      onLoad: () => this.load(),
      onExport: () => exportSnapshot(serialize(this.world, this.progress)),
      onImport: () => {
        void this.importFile();
      },
    });
    this.radial = createRadial(uiRoot);

    this.interaction = new Interaction({
      canvas,
      camera: this.camera,
      getWorld: () => this.world,
      onBlobTap: (blob, screen) => this.openBlobMenu(blob.id, screen),
      uiOpen: () => this.radial.isOpen(),
      onDismissUi: () => this.radial.close(),
      onChange: () => {},
      canDragBlocks: () => this.replaceOn,
    });
  }

  start(): void {
    this.loop.start();
    this.overlay.toast("Drag a loose block onto the body to build");
  }

  private update(dt: number): void {
    this.world.step(dt);
  }

  private render(): void {
    this.interaction.refreshDragPlan();
    this.renderer.draw(this.world, this.interaction.dragRender);
    this.statusTick += 1;
    if (this.statusTick % 10 === 0) {
      this.overlay.setStatus(
        `${this.world.activeBlobs().length} blocks · ${this.world.travellers.length} loose`,
      );
    }
  }

  private openBlobMenu(blobId: number, screen: { x: number; y: number }): void {
    if (!this.menuOn) return;
    const blob = this.world.getBlob(blobId);
    if (!blob) return;
    const items: RadialItem[] = [];
    if (blob.type === "generator") {
      items.push({
        kind: "toggle",
        label: "Emit",
        value: blob.emitOn,
        onChange: (v) => {
          blob.emitOn = v;
        },
      });
      items.push({
        kind: "slider",
        label: "Interval (s)",
        value: blob.emitInterval,
        min: 0.1,
        max: 5,
        step: 0.1,
        onChange: (v) => {
          blob.emitInterval = v;
        },
      });
      items.push({
        kind: "slider",
        label: "Signal speed",
        value: blob.signalSpeed,
        min: 1,
        max: 30,
        step: 1,
        onChange: (v) => {
          blob.signalSpeed = v;
        },
      });
      items.push({
        kind: "slider",
        label: "Max hops",
        value: blob.maxHops,
        min: 1,
        max: 200,
        step: 1,
        onChange: (v) => {
          blob.maxHops = v;
        },
      });
      items.push({
        kind: "slider",
        label: "Colour",
        value: blob.color,
        min: 0,
        max: 360,
        step: 1,
        onChange: (v) => {
          blob.color = v;
        },
      });
    }
    items.push({
      kind: "button",
      label: "Disconnect from structure",
      onClick: () => this.world.disconnectBlob(blob.id),
    });
    this.radial.open(screen.x, screen.y, items);
  }

  private regenerate(): void {
    this.progress = createProgress(Math.floor(Math.random() * 1e9));
    this.world = createWorld(this.progress.seed);
    this.resetView();
    this.overlay.toast("New world generated");
  }

  private clearCreature(): void {
    for (const b of this.world.activeBlobs()) this.world.removeBlob(b.id);
    // Keep scattered loose blocks; only the creature and its riders go.
    this.world.travellers = this.world.travellers.filter((t) => !t.attached);
    createStarterCreature(this.world);
    this.resetView();
    this.overlay.toast("Creature reset to starter");
  }

  private resetView(): void {
    this.camera.x = 0;
    this.camera.y = -8;
    this.camera.zoom = 20;
  }

  private save(): void {
    saveSlot("1", serialize(this.world, this.progress));
    this.overlay.toast("Saved to slot 1");
  }

  private load(): void {
    const data = loadSlot("1");
    if (!data) {
      this.overlay.toast("No save in slot 1");
      return;
    }
    const restored = deserialize(data);
    this.world = restored.world;
    this.progress = restored.progress;
    this.resetView();
    this.overlay.toast("Loaded slot 1");
  }

  private async importFile(): Promise<void> {
    const data = await importSnapshot();
    if (!data) return;
    const restored = deserialize(data);
    this.world = restored.world;
    this.progress = restored.progress;
    this.resetView();
    this.overlay.toast("Imported snapshot");
  }

  debugApi() {
    return {
      getWorld: () => this.world,
      getProgress: () => this.progress,
      getCamera: () => this.camera,
      getLoop: () => this.loop,
      toScreen: (x: number, y: number): Vec2 => this.camera.w2s(x, y),
      setSpeed: (s: number): void => {
        this.loop.speed = s;
      },
      worldSummary: () => ({
        blobs: this.world.activeBlobs().length,
        bonds: this.world.bonds.filter((b) => b.active).length,
        travellers: this.world.travellers.length,
        loose: this.world.travellers.filter((t) => !t.attached).length,
        pulses: this.world.pulses.length,
      }),
      regenerate: (): void => this.regenerate(),
      clearCreature: (): void => this.clearCreature(),
      save: (): void => this.save(),
      load: (): void => this.load(),
    };
  }
}
