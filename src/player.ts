import * as THREE from 'three';

export class Player {
  private mesh: THREE.Mesh;
  private targetHeight: number = 0.6; // Distance from bottom of player to surface
  private radius: number = 0.5; // Size of the player orb
  private floatTime: number = 0; // Time counter for floating animation
  private floatSpeed: number = 3; // Speed of floating animation
  private floatAmplitude: number = 0.1; // How high the floating motion goes
  private lerpFactor: number = 0.05; // Lower value = smoother movement
  
  // Movement properties
  private velocity: THREE.Vector3 = new THREE.Vector3(); // For momentum-based movement
  private dampingFactor: number = 0.95; // For slowing down movement
  
  // Coloring properties
  private coloringRadius: number = 2.2; // Radius around player that colors the sphere
  
  // Particle system properties
  private particles: THREE.Mesh[] = [];
  private particleGeometry: THREE.SphereGeometry;
  private particleMaterial: THREE.MeshStandardMaterial;
  private emissionRate: number = 10; // Particles per frame
  private emissionTimer: number = 0;
  private gravity: number = 0.01;
  private particleLifetime: number = 200; // Frames before particle is removed
  
  constructor() {
    // Create a sphere for the player
    const geometry = new THREE.SphereGeometry(this.radius, 32, 32);
    
    // Create soft matte material
    const material = new THREE.MeshStandardMaterial({
      color: 0x88ff88,
      metalness: 0.1,
      roughness: 0.7,
    });
    
    this.mesh = new THREE.Mesh(geometry, material);
    
    // Enable shadow casting
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    // Initialize particle system
    this.particleGeometry = new THREE.SphereGeometry(0.05, 8, 8); // Tiny spheres
    this.particleMaterial = new THREE.MeshStandardMaterial({
      color: 0x0088FF, // Blue color for water-like effect
      roughness: 0.5, // Reduced roughness for a more watery appearance
      metalness: 0.7 // Increased metalness for a reflective look
    });
  }
  
  getMesh(): THREE.Mesh {
    return this.mesh;
  }
  
  getParticles(): THREE.Mesh[] {
    return this.particles;
  }
  
  setPosition(x: number, y: number, z: number): void {
    this.mesh.position.set(x, y, z);
  }
  
  getPosition(): THREE.Vector3 {
    return this.mesh.position.clone();
  }
  
  // Apply a force to the player (for movement)
  applyForce(force: THREE.Vector3): void {
    this.velocity.add(force);
  }
  
  // Get the coloring radius
  getColoringRadius(): number {
    return this.coloringRadius;
  }
  
  // Set the coloring radius
  setColoringRadius(radius: number): void {
    this.coloringRadius = radius;
  }

  private getTerrainHeight(worldSphere: THREE.Mesh, direction: THREE.Vector3): number {
    // Get the sphere's geometry
    const geometry = worldSphere.geometry as THREE.BufferGeometry;
    const positionAttribute = geometry.getAttribute('position');
    const vertices = positionAttribute.array;
    
    // Create inverse matrix to transform player position into sphere's local space
    const inverseMatrix = new THREE.Matrix4().copy(worldSphere.matrixWorld).invert();
    const localPlayerPos = this.mesh.position.clone().applyMatrix4(inverseMatrix);
    const localPlayerDir = localPlayerPos.clone().normalize();
    
    // Find the closest vertex to our direction in local space
    let closestVertex = new THREE.Vector3();
    let minAngle = Infinity;
    
    for (let i = 0; i < vertices.length; i += 3) {
      const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
      const vertexDirection = vertex.clone().normalize();
      const angle = localPlayerDir.angleTo(vertexDirection);
      
      if (angle < minAngle) {
        minAngle = angle;
        closestVertex.copy(vertex);
      }
    }
    
    // Transform the closest vertex back to world space
    const worldClosestVertex = closestVertex.clone().applyMatrix4(worldSphere.matrixWorld);
    
    // Return the actual height (magnitude) of the closest vertex in world space
    return worldClosestVertex.length();
  }
  
  private emitParticle(): void {
    // Create a new particle
    const particle = new THREE.Mesh(this.particleGeometry, this.particleMaterial);
    
    // Get random point on player's surface
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const x = Math.sin(phi) * Math.cos(theta) * this.radius;
    const y = Math.sin(phi) * Math.sin(theta) * this.radius;
    const z = Math.cos(phi) * this.radius;
    
    // Calculate surface normal (direction from center to surface point)
    const normal = new THREE.Vector3(x, y, z).normalize();
    
    // Set particle position relative to player
    particle.position.copy(this.mesh.position).add(new THREE.Vector3(x, y, z));
    
    // Add initial velocity along surface normal with some randomness
    const baseSpeed = 0.05;
    const randomFactor = 0.02;
    particle.userData.velocity = normal.clone()
      .multiplyScalar(baseSpeed)
      .add(new THREE.Vector3(
        (Math.random() - 0.5) * randomFactor,
        (Math.random() - 0.5) * randomFactor,
        (Math.random() - 0.5) * randomFactor
      ));
    
    // Add lifetime counter
    particle.userData.lifetime = 0;
    
    // Add to particles array
    this.particles.push(particle);
  }

  private updateParticles(worldSphere: THREE.Mesh): void {
    // Emit new particles
    this.emissionTimer += this.emissionRate;
    while (this.emissionTimer >= 1) {
      this.emitParticle();
      this.emissionTimer -= 1;
    }
    
    // Update existing particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      
      // Update lifetime
      particle.userData.lifetime++;
      
      // Apply gravity towards world sphere center
      const toCenter = new THREE.Vector3().subVectors(
        worldSphere.position,
        particle.position
      ).normalize();
      
      particle.userData.velocity.add(toCenter.multiplyScalar(this.gravity));
      
      // Update position
      particle.position.add(particle.userData.velocity);
      
      // Check for collision with world sphere
      const distanceToCenter = particle.position.distanceTo(worldSphere.position);
      const sphereRadius = (worldSphere.geometry as THREE.SphereGeometry).parameters.radius;
      
      // Remove particle if it hits the sphere or exceeds lifetime
      if (distanceToCenter <= sphereRadius + 0.1 || particle.userData.lifetime > this.particleLifetime) {
        // Remove from scene
        if (particle.parent) {
          particle.parent.remove(particle);
        }
        // Dispose of resources
        particle.geometry.dispose();
        (particle.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  update(worldSphere: THREE.Mesh): void {
    // Apply velocity to position (move the player)
    this.mesh.position.add(this.velocity);
    
    // Update floating animation time
    this.floatTime += 0.016 * this.floatSpeed;
    
    // Get current position after applying velocity
    const currentPos = this.mesh.position.clone();
    
    // Calculate direction from center
    const direction = currentPos.clone().normalize();
    
    // Get the actual terrain height at this position
    const terrainHeight = this.getTerrainHeight(worldSphere, direction);
    
    // Calculate base height (terrain height + target height + radius)
    const baseHeight = terrainHeight + this.targetHeight + this.radius;
    
    // Calculate floating offset using sine wave
    const floatOffset = Math.sin(this.floatTime) * this.floatAmplitude;
    
    // Calculate final target position on sphere surface
    const targetPos = direction.multiplyScalar(baseHeight + floatOffset);
    
    // Smoothly move towards target position with reduced lerp factor
    this.mesh.position.lerp(targetPos, this.lerpFactor);
    
    // Apply damping to velocity (slow down over time)
    this.velocity.multiplyScalar(this.dampingFactor);

    // Update particles
    this.updateParticles(worldSphere);
  }
}
