/**
 * Lightweight real-time computer vision frame differencing
 * Runs on a downscaled offscreen canvas to minimize CPU usage while detecting motion.
 */

export class MotionDetector {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private prevFrameData: Uint8ClampedArray | null = null;
  private width = 160;
  private height = 90;
  private lastCheckedTime = 0;
  private checkIntervalMs = 150; // ~6.6 FPS check rate is ideal for surveillance
  private smoothedScore = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  /**
   * Evaluates motion between current frame and previous frame.
   * Returns a score from 0 to 100 representing motion intensity.
   */
  public analyze(source: CanvasImageSource, sensitivity: number): { score: number; isMotion: boolean } {
    const now = Date.now();
    if (now - this.lastCheckedTime < this.checkIntervalMs && this.prevFrameData !== null) {
      return {
        score: Math.round(this.smoothedScore),
        isMotion: this.smoothedScore >= (105 - sensitivity),
      };
    }
    this.lastCheckedTime = now;

    if (!this.ctx) {
      return { score: 0, isMotion: false };
    }

    try {
      this.ctx.drawImage(source, 0, 0, this.width, this.height);
      const currentFrame = this.ctx.getImageData(0, 0, this.width, this.height);
      const data = currentFrame.data;

      if (!this.prevFrameData) {
        this.prevFrameData = new Uint8ClampedArray(data);
        return { score: 0, isMotion: false };
      }

      let diffCount = 0;
      const totalPixels = this.width * this.height;
      const prevData = this.prevFrameData;
      // Per-pixel channel delta threshold
      const pixelDiffThreshold = 25;

      for (let i = 0; i < data.length; i += 4) {
        // Luminance difference calculation
        const rDiff = Math.abs(data[i] - prevData[i]);
        const gDiff = Math.abs(data[i + 1] - prevData[i + 1]);
        const bDiff = Math.abs(data[i + 2] - prevData[i + 2]);

        const avgDiff = (rDiff + gDiff + bDiff) / 3;
        if (avgDiff > pixelDiffThreshold) {
          diffCount++;
        }
      }

      // Store current as previous for next run
      this.prevFrameData.set(data);

      // Raw percentage of screen with movement
      const rawPercentage = (diffCount / totalPixels) * 100;

      // Scale to 0-100 range (normally 5-15% pixel change is a significant person/car walking past)
      const rawScore = Math.min(100, rawPercentage * 6.5);

      // Smooth score to avoid jitter
      this.smoothedScore = this.smoothedScore * 0.4 + rawScore * 0.6;

      // The higher sensitivity (1-100), the lower the threshold needed
      // sensitivity=50 -> threshold=55, sensitivity=80 -> threshold=25
      const threshold = Math.max(10, 105 - sensitivity);
      const isMotion = this.smoothedScore >= threshold;

      return {
        score: Math.min(100, Math.round(this.smoothedScore)),
        isMotion,
      };
    } catch {
      return { score: 0, isMotion: false };
    }
  }

  public reset(): void {
    this.prevFrameData = null;
    this.smoothedScore = 0;
  }
}
