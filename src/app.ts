import { Camera } from "./engine/camera";
import { GameLoop } from "./engine/loop";
import { Renderer } from "./render/renderer";
import { Interaction } from "./ui/interaction";
import { createOverlay, type Overlay } from "./ui/overlay";
import { createRadial, type Radial } from "./ui/radial";
import { createProperties, type Properties } from "./ui/properties";
import { createWorld, createStarterCreature } from "./world/generator";
import { createProgress, grantReward, setGoal, type Progress } from "./game/state";
import { deserialize, exportSnapshot, importSnapshot, loadSlot, saveSlot, serialize } from "./persistence/save";
import type { World } from "./sim/world";

export class App {
  private world: World;
  private progress: Progress;
  private readonly camera = new Camera();
  private readonly renderer: Renderer;
  private readonly overlay: Overlay;
  private readonly radial: Radial;
  private readonly properties: Properties;
  private readonly interaction: Interaction;
  private readonly loop: GameLoop;
  private statusTick = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.progress = createProgress(Math.floor(Math.random() * 1e9));
    this.world = createWorld(this.progress.seed);
    setGoal(this.world, 0);

    this.renderer = new Renderer(canvas, this.camera);

    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render(),
    );

    this.overlay = createOverlay(uiRoot, {
      onSpeed: (s) => {
        this.loop.speed = s;
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
    this.properties = createProperties(uiRoot);

    this.interaction = new Interaction({
      canvas,
      camera: this.camera,
      getWorld: () => this.world,
      onBlobTap: (blob, screen) => this.openBlobMenu(blob.id, screen),
      uiOpen: () => this.radial.isOpen() || this.properties.isOpen(),
      onChange: () => this.properties.refresh(),
    });
  }

  start(): void {
    this.loop.start();
  }

  private update(dt: number): void {
    this.world.step(dt);
    if (this.world.goalReached) {
      this.progress.level += 1;
      grantReward(this.world);
      setGoal(this.world, this.progress.level);
      this.overlay.toast(`Goal reached! Level ${this.progress.level} — new parts granted`);
    }
  }

  private render(): void {
    this.renderer.draw(this.world, this.interaction.dragRender);
    this.statusTick += 1;
    if (this.statusTick % 10 === 0) {
      const dist = this.nearestDistance();
      this.overlay.setStatus(
        `Level ${this.progress.level} · goal ${dist.toFixed(0)}u · ${this.world.activeBlobs().length} blocks`,
      );
    }
  }

  private nearestDistance(): number {
    let best = Infinity;
    for (const b of this.world.activeBlobs()) {
      best = Math.min(best, Math.hypot(b.x - this.world.goal.x, b.y - this.world.goal.y));
    }
    return best === Infinity ? 0 : best;
  }

  private openBlobMenu(blobId: number, screen: { x: number; y: number }): void {
    const blob = this.world.getBlob(blobId);
    if (!blob) return;
    this.radial.open(screen.x, screen.y, [
      {
        label: "Properties",
        onClick: () => {
          this.properties.open(blob, {
            onChange: () => {},
            onDelete: () => {
              this.world.removeBlob(blob.id);
              this.properties.close();
            },
            onClose: () => this.properties.close(),
          });
        },
      },
      {
        label: "Delete",
        onClick: () => this.world.removeBlob(blob.id),
      },
    ]);
  }

  private regenerate(): void {
    this.progress = createProgress(Math.floor(Math.random() * 1e9));
    this.world = createWorld(this.progress.seed);
    setGoal(this.world, 0);
    this.resetView();
    this.overlay.toast("New world generated");
  }

  private clearCreature(): void {
    for (const b of this.world.activeBlobs()) this.world.removeBlob(b.id);
    this.world.travellers = [];
    createStarterCreature(this.world);
    this.resetView();
    this.overlay.toast("Creature reset to starter");
  }

  private resetView(): void {
    this.camera.x = 0;
    this.camera.y = -4;
    this.camera.zoom = 40;
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
    setGoal(this.world, this.progress.level);
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
}
