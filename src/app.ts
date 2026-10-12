import { Camera } from "./engine/camera";
import { GameLoop } from "./engine/loop";
import { Renderer } from "./render/renderer";
import { Interaction } from "./ui/interaction";
import { createOverlay, type Overlay } from "./ui/overlay";
import { createRadial, type Radial, type RadialItem } from "./ui/radial";
import { createWorld, createStarterCreature } from "./world/generator";
import { createProgress, type Progress } from "./game/state";
import { SIGNAL_PALETTE } from "./sim/palette";
import { deserialize, exportSnapshot, importSnapshot, loadSlot, saveSlot, serialize } from "./persistence/save";
import type { World } from "./sim/world";
import type { Blob, Vec2 } from "./sim/types";

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
  private replaceOn = false;
  private menuOn = true;
  private applyAll = false;
  private cameraLock: number | null = null;

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
      onSpawn: (type) => {
        this.interaction.beginSpawn(type);
        this.overlay.setActiveSpawn(this.interaction.getSpawnType());
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
    if (this.cameraLock != null) {
      const b = this.world.getBlob(this.cameraLock);
      if (b) {
        this.camera.x = b.x;
        this.camera.y = b.y;
        this.camera.angle = this.world.cameraAngle(b);
      } else {
        this.cameraLock = null;
      }
    }
    const corners = [
      this.camera.s2w(0, 0),
      this.camera.s2w(this.camera.vw, 0),
      this.camera.s2w(0, this.camera.vh),
      this.camera.s2w(this.camera.vw, this.camera.vh),
    ];
    const minX = Math.min(...corners.map((c) => c.x)) - 40;
    const minY = Math.min(...corners.map((c) => c.y)) - 40;
    const maxX = Math.max(...corners.map((c) => c.x)) + 40;
    const maxY = Math.max(...corners.map((c) => c.y)) + 40;
    this.world.ensureChunks(minX, minY, maxX, maxY);
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
    items.push({
      kind: "toggle",
      label: `Apply to all ${blob.type}s`,
      value: this.applyAll,
      onChange: (v) => {
        this.applyAll = v;
      },
    });
    if (blob.type === "generator") {
      items.push({
        kind: "toggle",
        label: "Emit",
        value: blob.emitOn,
        onChange: (v) => {
          this.setValue(blob, "emitOn", v);
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
          this.setValue(blob, "emitInterval", v);
        },
      });
      items.push({
        kind: "slider",
        label: "Delay (s)",
        value: blob.emitDelay,
        min: 0,
        max: 5,
        step: 0.1,
        onChange: (v) => {
          this.setValue(blob, "emitDelay", v);
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
          this.setValue(blob, "signalSpeed", v);
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
          this.setValue(blob, "maxHops", v);
        },
      });
      items.push({
        kind: "palette",
        label: "Signal",
        colors: SIGNAL_PALETTE,
        value: [blob.signalColor],
        onChange: (v) => {
          if (v.length > 0) this.setValue(blob, "signalColor", v[v.length - 1]);
        },
      });
    } else if (blob.type === "contractor") {
      items.push({
        kind: "palette",
        label: "Accept",
        colors: SIGNAL_PALETTE,
        value: [...blob.acceptColors],
        multi: true,
        onChange: (v) => {
          this.setValue(blob, "acceptColors", v);
        },
      });
      items.push({
        kind: "slider",
        label: "Contract to",
        value: blob.contractTo,
        min: 0.1,
        max: 1,
        step: 0.05,
        onChange: (v) => {
          this.setValue(blob, "contractTo", v);
        },
      });
      items.push({
        kind: "slider",
        label: "Contract (s)",
        value: blob.contractTime,
        min: 0.1,
        max: 5,
        step: 0.1,
        onChange: (v) => {
          this.setValue(blob, "contractTime", v);
        },
      });
      items.push({
        kind: "slider",
        label: "Release (s)",
        value: blob.releaseTime,
        min: 0.1,
        max: 5,
        step: 0.1,
        onChange: (v) => {
          this.setValue(blob, "releaseTime", v);
        },
      });
    } else if (blob.type === "grabber") {
      items.push({
        kind: "palette",
        label: "Accept",
        colors: SIGNAL_PALETTE,
        value: [...blob.acceptColors],
        multi: true,
        onChange: (v) => {
          this.setValue(blob, "acceptColors", v);
        },
      });
      items.push({
        kind: "slider",
        label: "Grab force",
        value: blob.grabForce,
        min: 0,
        max: 1,
        step: 0.05,
        onChange: (v) => {
          this.setValue(blob, "grabForce", v);
        },
      });
      items.push({
        kind: "slider",
        label: "Duration (s)",
        value: blob.grabTime,
        min: 0.1,
        max: 5,
        step: 0.1,
        onChange: (v) => {
          this.setValue(blob, "grabTime", v);
        },
      });
    } else if (blob.type === "flagella") {
      items.push({
        kind: "slider",
        label: "Angle offset",
        value: Math.round((blob.angle * 180) / Math.PI),
        min: -180,
        max: 180,
        step: 5,
        onChange: (v) => {
          this.setValue(blob, "angle", (v * Math.PI) / 180);
        },
      });
      items.push({
        kind: "slider",
        label: "Impulse",
        value: blob.impulse,
        min: 0,
        max: 2,
        step: 0.05,
        onChange: (v) => {
          this.setValue(blob, "impulse", v);
        },
      });
      items.push({
        kind: "palette",
        label: "Accept",
        colors: SIGNAL_PALETTE,
        value: [...blob.acceptColors],
        multi: true,
        onChange: (v) => {
          this.setValue(blob, "acceptColors", v);
        },
      });
    } else if (blob.type === "camera") {
      items.push({
        kind: "slider",
        label: "Angle offset",
        value: Math.round((blob.angle * 180) / Math.PI),
        min: -180,
        max: 180,
        step: 5,
        onChange: (v) => {
          this.setValue(blob, "angle", (v * Math.PI) / 180);
        },
      });
      const cams = this.world.activeBlobs().filter((b) => b.type === "camera");
      const options = [
        { value: "0", label: "None" },
        ...cams.map((c) => ({ value: String(c.id), label: `Camera #${c.id}` })),
      ];
      items.push({
        kind: "select",
        label: "Lock camera",
        options,
        value: this.cameraLock != null ? String(this.cameraLock) : "0",
        onChange: (v) => {
          const id = Number(v);
          this.cameraLock = id > 0 ? id : null;
        },
      });
    } else if (blob.type === "eye") {
      items.push({
        kind: "slider",
        label: "FOV (deg)",
        value: blob.fov,
        min: 5,
        max: 90,
        step: 1,
        onChange: (v) => {
          this.setValue(blob, "fov", v);
        },
      });
      items.push({
        kind: "slider",
        label: "Range",
        value: blob.range,
        min: 2,
        max: 40,
        step: 1,
        onChange: (v) => {
          this.setValue(blob, "range", v);
        },
      });
      items.push({
        kind: "slider",
        label: "Angle offset",
        value: Math.round((blob.angle * 180) / Math.PI),
        min: -180,
        max: 180,
        step: 5,
        onChange: (v) => {
          this.setValue(blob, "angle", (v * Math.PI) / 180);
        },
      });
      items.push({
        kind: "slider",
        label: "Period (s)",
        value: blob.period,
        min: 0.2,
        max: 5,
        step: 0.1,
        onChange: (v) => {
          this.setValue(blob, "period", v);
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

  // Set a context-menu value on the block. When "Apply to all" is on, the same
  // value is copied to every block of the same type in the structure.
  private setValue(blob: Blob, key: keyof Blob, value: number | boolean | number[]): void {
    const targets = this.applyAll ? this.world.activeBlobs().filter((b) => b.type === blob.type) : [blob];
    for (const b of targets) {
      (b as unknown as Record<string, unknown>)[key] = Array.isArray(value) ? [...value] : value;
    }
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
    this.camera.y = 0;
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
