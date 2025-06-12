/**
 * A simple implementation of Perlin noise for terrain generation
 */
export class PerlinNoise {
  private perm: number[] = [];
  
  constructor(seed = Math.random() * 10000) {
    // Initialize permutation table with a simple hash of the seed
    this.perm = new Array(512);
    const simpleSeed = Math.floor(seed) % 256;
    
    for (let i = 0; i < 256; i++) {
      this.perm[i] = this.perm[i + 256] = (i + simpleSeed) % 256;
    }
  }
  
  // Linear interpolation
  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }
  
  // Fade function as defined by Ken Perlin
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  
  // Gradient function
  private grad(hash: number, x: number, y: number, z: number): number {
    // Convert low 4 bits of hash code into 12 gradient directions
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  
  // 3D Perlin noise
  noise(x: number, y: number, z: number): number {
    // Find unit cube that contains point
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    
    // Find relative x, y, z of point in cube
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    
    // Compute fade curves for each of x, y, z
    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);
    
    // Hash coordinates of the 8 cube corners
    const A = this.perm[X] + Y;
    const AA = this.perm[A] + Z;
    const AB = this.perm[A + 1] + Z;
    const B = this.perm[X + 1] + Y;
    const BA = this.perm[B] + Z;
    const BB = this.perm[B + 1] + Z;
    
    // Add blended results from 8 corners of cube
    return this.lerp(
      this.lerp(
        this.lerp(
          this.grad(this.perm[AA], x, y, z),
          this.grad(this.perm[BA], x - 1, y, z),
          u
        ),
        this.lerp(
          this.grad(this.perm[AB], x, y - 1, z),
          this.grad(this.perm[BB], x - 1, y - 1, z),
          u
        ),
        v
      ),
      this.lerp(
        this.lerp(
          this.grad(this.perm[AA + 1], x, y, z - 1),
          this.grad(this.perm[BA + 1], x - 1, y, z - 1),
          u
        ),
        this.lerp(
          this.grad(this.perm[AB + 1], x, y - 1, z - 1),
          this.grad(this.perm[BB + 1], x - 1, y - 1, z - 1),
          u
        ),
        v
      ),
      w
    );
  }
  
  // Get noise value in range [0, 1] instead of [-1, 1]
  get(x: number, y: number, z: number): number {
    return (this.noise(x, y, z) + 1) * 0.5;
  }
  
  // Get noise with multiple octaves for more natural looking terrain
  octaveNoise(x: number, y: number, z: number, octaves: number, persistence: number): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, y * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    
    return (total / maxValue + 1) * 0.5;
  }
}
