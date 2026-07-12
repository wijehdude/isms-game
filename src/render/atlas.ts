export type SpriteName = "camera" | "lidar" | "robot-dog" | "robot-humanoid" | "drone" | "lighting" | "access-control" | "trooper" | "operator" | "engineer" | "intruder";

type SpriteRect = { x: number; y: number; width: number; height: number };

/** All bitmap art is generated at boot into this offscreen runtime atlas. */
export class RuntimeSpriteAtlas {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly sprites = new Map<SpriteName, SpriteRect>();

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 576;
    this.canvas.height = 48;
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable.");
    this.context = context;
    context.imageSmoothingEnabled = false;
    this.generate();
  }

  draw(target: CanvasRenderingContext2D, name: SpriteName, x: number, y: number, scale = 1, alpha = 1): void {
    const source = this.sprites.get(name);
    if (!source) return;
    target.save();
    target.globalAlpha *= alpha;
    target.imageSmoothingEnabled = false;
    const width = source.width * scale;
    const height = source.height * scale;
    target.drawImage(this.canvas, source.x, source.y, source.width, source.height, Math.round(x - width / 2), Math.round(y - height + 5 * scale), Math.round(width), Math.round(height));
    target.restore();
  }

  private generate(): void {
    const names: SpriteName[] = ["camera", "lidar", "robot-dog", "robot-humanoid", "drone", "lighting", "access-control", "trooper", "operator", "engineer", "intruder"];
    names.forEach((name, index) => {
      const x = index * 48;
      this.sprites.set(name, { x, y: 0, width: 48, height: 48 });
      this.context.save();
      this.context.translate(x, 0);
      this.drawSprite(name);
      this.context.restore();
    });
  }

  private drawSprite(name: SpriteName): void {
    const ctx = this.context;
    const pixel = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    };
    if (name === "camera") {
      pixel(22, 17, 4, 25, "#4d3040"); pixel(18, 40, 12, 4, "#2c1d28");
      pixel(16, 12, 20, 10, "#ff5c9f"); pixel(32, 14, 7, 6, "#27131e"); pixel(12, 15, 5, 4, "#ffd3e5");
    } else if (name === "lidar") {
      pixel(20, 13, 10, 13, "#62dcff"); pixel(18, 16, 14, 6, "#286278"); pixel(22, 26, 5, 7, "#234653");
      pixel(14, 32, 4, 12, "#29404a"); pixel(30, 32, 4, 12, "#29404a"); pixel(22, 31, 4, 13, "#29404a"); pixel(31, 17, 5, 3, "#d9f9ff");
    } else if (name === "robot-dog") {
      pixel(12, 24, 24, 11, "#d9c892"); pixel(32, 20, 10, 11, "#c7b476"); pixel(35, 22, 4, 4, "#1e2a2c");
      pixel(14, 34, 5, 10, "#3e4d48"); pixel(29, 34, 5, 10, "#3e4d48"); pixel(8, 25, 5, 4, "#f0b84d");
    } else if (name === "robot-humanoid") {
      pixel(18, 8, 13, 11, "#d9c892"); pixel(20, 11, 9, 4, "#24363b"); pixel(16, 20, 18, 16, "#637b70");
      pixel(11, 22, 5, 18, "#b7a66f"); pixel(34, 22, 5, 18, "#b7a66f"); pixel(18, 36, 6, 10, "#384943"); pixel(27, 36, 6, 10, "#384943");
    } else if (name === "drone") {
      pixel(18, 20, 13, 9, "#d5ded9"); pixel(4, 15, 15, 4, "#7d928a"); pixel(30, 15, 15, 4, "#7d928a");
      pixel(9, 10, 4, 4, "#273337"); pixel(36, 10, 4, 4, "#273337"); pixel(22, 29, 6, 6, "#29383b"); pixel(24, 31, 3, 3, "#65d6c0");
    } else if (name === "lighting") {
      pixel(22, 14, 4, 29, "#3b4650"); pixel(18, 41, 12, 3, "#222c31"); pixel(16, 10, 18, 9, "#f4e6a5"); pixel(18, 12, 14, 5, "#fff6c7");
    } else if (name === "access-control") {
      // A compact gate pedestal / card-reader: cyan is reserved for access control in the map legend.
      pixel(19, 12, 11, 29, "#344a4c"); pixel(17, 39, 15, 5, "#202d30"); pixel(21, 16, 7, 11, "#75dde1"); pixel(23, 18, 3, 4, "#d9fbf8");
      pixel(12, 19, 5, 3, "#71888a"); pixel(32, 19, 5, 3, "#71888a");
    } else {
      const palettes: Record<string, { torso: string; cap: string }> = {
        trooper: { torso: "#253f54", cap: "#182c3b" }, operator: { torso: "#3f6f68", cap: "#294c47" },
        engineer: { torso: "#d19b42", cap: "#f2c760" }, intruder: { torso: "#633a4b", cap: "#34262c" },
      };
      const palette = palettes[name] ?? palettes.trooper ?? { torso: "#253f54", cap: "#182c3b" };
      pixel(19, 9, 12, 12, "#d8a777"); pixel(17, 7, 16, 6, palette.cap); pixel(17, 21, 16, 16, palette.torso);
      pixel(18, 37, 5, 9, "#20292c"); pixel(27, 37, 5, 9, "#20292c"); pixel(13, 23, 4, 13, "#d8a777"); pixel(33, 23, 4, 13, "#d8a777");
      if (name === "operator") pixel(31, 13, 7, 3, "#5ee3c3");
    }
  }
}
