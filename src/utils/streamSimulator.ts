import { SimulationPreset } from '../types/camera';

/**
 * Procedural security camera stream generator.
 * Renders an authentic CCTV camera scene with periodic movement (cars, walking people, trees, light changes)
 * and outputs a live MediaStream via canvas.captureStream().
 */
export class StreamSimulator {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animFrameId: number | null = null;
  private preset: SimulationPreset;
  private width = 640;
  private height = 360;
  private stream: MediaStream | null = null;

  // Animation state
  private carX = -120;
  private carSpeed = 1.4;
  private personX = 150;
  private personDir = 1;
  private treeSway = 0;
  private timeOffset = 0;
  private manualMotionTriggered = false;
  private manualMotionTimer = 0;

  constructor(preset: SimulationPreset = 'entrance') {
    this.preset = preset;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D context');
    this.ctx = context;

    this.startRendering();
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public getStream(): MediaStream {
    if (!this.stream) {
      this.stream = this.canvas.captureStream(30);
    }
    return this.stream;
  }

  public triggerMotion(durationMs = 4000): void {
    this.manualMotionTriggered = true;
    this.manualMotionTimer = Date.now() + durationMs;
  }

  private startRendering(): void {
    const render = () => {
      this.timeOffset += 0.03;
      this.drawScene();
      this.animFrameId = requestAnimationFrame(render);
    };
    this.animFrameId = requestAnimationFrame(render);
  }

  private drawScene(): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Check manual motion timeout
    if (this.manualMotionTriggered && Date.now() > this.manualMotionTimer) {
      this.manualMotionTriggered = false;
    }

    if (this.preset === 'entrance' || this.preset === 'perimeter') {
      this.drawOutdoorScene(ctx, w, h);
    } else if (this.preset === 'parking') {
      this.drawParkingScene(ctx, w, h);
    } else {
      this.drawHallwayScene(ctx, w, h);
    }

    // Add subtle CCTV analog scanline effect & noise
    this.drawCCTVOverlay(ctx, w, h);
  }

  private drawOutdoorScene(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Sky gradient (dusk / twilight surveillance atmosphere)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    skyGrad.addColorStop(0, '#101726');
    skyGrad.addColorStop(1, '#20293d');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h * 0.55);

    // Ground / Driveway
    ctx.fillStyle = '#1c222d';
    ctx.fillRect(0, h * 0.55, w, h * 0.45);

    // Distant perimeter wall & buildings
    ctx.fillStyle = '#0f141c';
    ctx.fillRect(40, h * 0.32, 180, h * 0.23);
    ctx.fillRect(240, h * 0.28, 140, h * 0.27);
    ctx.fillRect(400, h * 0.35, 200, h * 0.20);

    // Subtle building windows with dim warm light
    ctx.fillStyle = '#d9770633';
    for (let bx = 60; bx < 200; bx += 30) {
      for (let by = h * 0.35; by < h * 0.5; by += 22) {
        ctx.fillRect(bx, by, 14, 12);
      }
    }

    // Asphalt driveway perspective lines
    ctx.strokeStyle = '#2d3748';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.2, h);
    ctx.lineTo(w * 0.38, h * 0.55);
    ctx.moveTo(w * 0.8, h);
    ctx.lineTo(w * 0.62, h * 0.55);
    ctx.stroke();

    // Metal sliding security gate
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.strokeRect(w * 0.38, h * 0.45, w * 0.24, h * 0.12);
    for (let gx = w * 0.38 + 10; gx < w * 0.62; gx += 14) {
      ctx.beginPath();
      ctx.moveTo(gx, h * 0.45);
      ctx.lineTo(gx, h * 0.57);
      ctx.stroke();
    }

    // Security Floodlight beam
    const lightGrad = ctx.createRadialGradient(w * 0.85, h * 0.3, 10, w * 0.5, h * 0.7, 180);
    lightGrad.addColorStop(0, 'rgba(254, 240, 138, 0.25)');
    lightGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
    ctx.fillStyle = lightGrad;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.7, 180, 0, Math.PI * 2);
    ctx.fill();

    // Moving element 1: Tree branches swaying in wind
    this.treeSway = Math.sin(this.timeOffset * 1.5) * 6;
    ctx.fillStyle = '#141c26';
    ctx.beginPath();
    ctx.arc(60 + this.treeSway, h * 0.45, 45, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(90 + this.treeSway * 0.8, h * 0.42, 35, 0, Math.PI * 2);
    ctx.fill();

    // Moving element 2: Vehicle driving or person walking
    const isManual = this.manualMotionTriggered;
    const speed = isManual ? 4.5 : this.carSpeed;
    this.carX += speed;
    if (this.carX > w + 160) {
      this.carX = -180;
    }

    if (this.carX > -150 && this.carX < w + 100) {
      // Draw simulated vehicle
      const cx = this.carX;
      const cy = h * 0.68;

      ctx.fillStyle = '#0f172a';
      // Car body
      ctx.beginPath();
      ctx.roundRect(cx, cy, 110, 34, 6);
      ctx.fill();
      ctx.roundRect(cx + 25, cy - 20, 60, 24, 4);
      ctx.fill();

      // Wheels
      ctx.fillStyle = '#05070a';
      ctx.beginPath();
      ctx.arc(cx + 25, cy + 34, 10, 0, Math.PI * 2);
      ctx.arc(cx + 85, cy + 34, 10, 0, Math.PI * 2);
      ctx.fill();

      // Headlights / taillights
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(cx + 108, cy + 12, 4, 8);
      // Headlight glow cone
      const glow = ctx.createLinearGradient(cx + 112, cy + 16, cx + 220, cy + 16);
      glow.addColorStop(0, 'rgba(254, 240, 138, 0.4)');
      glow.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.moveTo(cx + 112, cy + 10);
      ctx.lineTo(cx + 220, cy - 20);
      ctx.lineTo(cx + 220, cy + 60);
      ctx.lineTo(cx + 112, cy + 22);
      ctx.fill();

      // Taillights
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(cx - 2, cy + 12, 4, 8);
    }

    // Walking person occasionally
    if (this.carX < -50 || this.carX > w) {
      this.personX += 0.8 * this.personDir;
      if (this.personX > w * 0.7) this.personDir = -1;
      if (this.personX < w * 0.25) this.personDir = 1;

      const px = this.personX;
      const py = h * 0.58;
      // Head
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(px, py - 22, 6, 0, Math.PI * 2);
      ctx.fill();
      // Body & jacket
      ctx.fillRect(px - 5, py - 16, 10, 20);
      // Walking legs oscillation
      const legStride = Math.sin(this.timeOffset * 6) * 5;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px - 2, py + 4);
      ctx.lineTo(px - 2 + legStride, py + 22);
      ctx.moveTo(px + 2, py + 4);
      ctx.lineTo(px + 2 - legStride, py + 22);
      ctx.stroke();
    }
  }

  private drawParkingScene(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Indoor/outdoor parking garage
    ctx.fillStyle = '#171e2c';
    ctx.fillRect(0, 0, w, h);

    // Ceiling beams
    ctx.fillStyle = '#0f141e';
    for (let y = 0; y < h * 0.35; y += 30) {
      ctx.fillRect(0, y, w, 12);
    }

    // Parking spaces lines
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2;
    for (let x = 80; x < w - 60; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, h * 0.45);
      ctx.lineTo(x - 30, h);
      ctx.stroke();
    }

    // Parked cars
    ctx.fillStyle = '#334155';
    ctx.fillRect(100, h * 0.55, 75, 45);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(340, h * 0.55, 75, 45);

    // Moving person across parking
    this.personX += 1.2 * this.personDir;
    if (this.personX > w - 100) this.personDir = -1;
    if (this.personX < 100) this.personDir = 1;

    const px = this.personX;
    const py = h * 0.52;
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(px, py - 18, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(px - 4, py - 13, 8, 16);
    const leg = Math.sin(this.timeOffset * 5) * 4;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - 2, py + 3);
    ctx.lineTo(px - 2 + leg, py + 18);
    ctx.moveTo(px + 2, py + 3);
    ctx.lineTo(px + 2 - leg, py + 18);
    ctx.stroke();
  }

  private drawHallwayScene(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Interior hallway corridor with perspective
    ctx.fillStyle = '#141a24';
    ctx.fillRect(0, 0, w, h);

    // End of hallway wall
    ctx.fillStyle = '#0f141d';
    ctx.fillRect(w * 0.35, h * 0.25, w * 0.3, h * 0.5);

    // Door at end
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(w * 0.44, h * 0.32, w * 0.12, h * 0.43);

    // Walls perspective
    ctx.fillStyle = '#1c2433';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w * 0.35, h * 0.25);
    ctx.lineTo(w * 0.35, h * 0.75);
    ctx.lineTo(0, h);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(w, 0);
    ctx.lineTo(w * 0.65, h * 0.25);
    ctx.lineTo(w * 0.65, h * 0.75);
    ctx.lineTo(w, h);
    ctx.fill();

    // Overhead fluorescent light strip
    const lightIntensity = 0.8 + Math.sin(this.timeOffset * 8) * 0.05;
    ctx.fillStyle = `rgba(241, 245, 249, ${lightIntensity})`;
    ctx.fillRect(w * 0.42, 10, w * 0.16, 8);

    // Moving silhouette in hallway
    const bob = Math.sin(this.timeOffset * 4) * 2;
    const px = w * 0.5 + Math.sin(this.timeOffset * 0.8) * 40;
    const py = h * 0.48 + bob;

    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.arc(px, py - 20, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(px - 6, py - 13, 12, 28);
  }

  private drawCCTVOverlay(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Scanlines
    ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1);
    }

    // Subtle grain noise
    const noiseCount = 150;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    for (let i = 0; i < noiseCount; i++) {
      const rx = Math.random() * w;
      const ry = Math.random() * h;
      ctx.fillRect(rx, ry, 1.5, 1.5);
    }
  }

  public destroy(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }
}
