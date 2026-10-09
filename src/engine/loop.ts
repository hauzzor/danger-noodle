export type UpdateFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

export class GameLoop {
  readonly fixedDt: number;
  speed = 1;
  maxStepsPerFrame = 8;

  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  constructor(
    private readonly update: UpdateFn,
    private readonly render: RenderFn,
    hz = 60,
  ) {
    this.fixedDt = 1 / hz;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    let frameTime = (now - this.last) / 1000;
    this.last = now;
    if (frameTime > 0.25) frameTime = 0.25;

    this.acc += frameTime * this.speed;
    let steps = 0;
    while (this.acc >= this.fixedDt && steps < this.maxStepsPerFrame) {
      this.update(this.fixedDt);
      this.acc -= this.fixedDt;
      steps++;
    }
    if (steps === this.maxStepsPerFrame) this.acc = 0;

    this.render(this.acc / this.fixedDt);
    this.raf = requestAnimationFrame(this.tick);
  };
}
