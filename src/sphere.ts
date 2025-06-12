import * as THREE from 'three';
import { Vector3 } from 'three';
import { PerlinNoise } from './utils/noise';

// Interface for tracking vertex state
interface VertexState {
  visited: boolean;
  fertility: number;  // 0-1 value for future grass growth
}

export class WorldSphere {
  private mesh: THREE.Mesh;
  private radius: number;
  private segments: number;
  private gridSize: number;
  private noise: PerlinNoise;
  private noiseScale: number = 10.0; // Scale factor for noise
  private noiseStrength: number = 1.0; // Strength of the noise effect
  private sun!: THREE.DirectionalLight; // Using definite assignment assertion
  private moon!: THREE.DirectionalLight; // Using definite assignment assertion
  private clouds!: THREE.Group; // Using definite assignment assertion
  private cloudHeight: number = 1.5; // Height multiplier for clouds above sphere surface
  
  // Properties for visited vertex tracking
  private vertexStates: Map<number, VertexState> = new Map();
  private vertexPositions: Float32Array;
  private vertexColors: Float32Array;
  private visitColor: THREE.Color = new THREE.Color(0x00ff00); // Green color for visited areas
  private originalColor: THREE.Color = new THREE.Color(0xffffff); // White for unvisited areas
  private totalVertices: number = 0;
  private visitedVertexCount: number = 0;
  
  constructor(radius: number, segments: number, gridSize: number) {
    this.radius = radius;
    this.segments = segments;
    this.gridSize = gridSize;
    
    // Initialize noise generator with a random seed
    this.noise = new PerlinNoise(Math.random() * 1000);
    
    // Revert back to sphere geometry with high segment count
    const geometry = new THREE.SphereGeometry(radius, segments, segments);
    
    // Store original vertex positions for visited vertex tracking
    const positionAttribute = geometry.getAttribute('position');
    this.vertexPositions = new Float32Array(positionAttribute.array);
    
    // Initialize vertex colors
    const vertexCount = positionAttribute.count;
    this.totalVertices = vertexCount;
    this.vertexColors = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      this.vertexColors[i * 3] = this.originalColor.r;
      this.vertexColors[i * 3 + 1] = this.originalColor.g;
      this.vertexColors[i * 3 + 2] = this.originalColor.b;
    }
    
    // Add vertex colors to geometry
    geometry.setAttribute('color', new THREE.BufferAttribute(this.vertexColors, 3));
    
    // Apply noise to the geometry
    this.applyNoiseToGeometry(geometry);
    
    // Create material with texture
    const textureLoader = new THREE.TextureLoader();
    const material = new THREE.MeshStandardMaterial({
      wireframe: false,
      roughness: 0.8,
      metalness: 0.1,
      vertexColors: true // Enable vertex colors
    });

    console.log('Attempting to load texture...');
    // Load texture asynchronously
    textureLoader.load(
      './assets/dirt.jpg',  // Updated path to match webpack output
      (texture) => {
        console.log('Texture loaded successfully');
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(32, 32); // Repeat texture 4 times in each direction
        material.map = texture;
        material.needsUpdate = true;
        console.log('Material updated with texture');
      },
      (progress) => {
        console.log('Loading texture:', (progress.loaded / progress.total * 100) + '%');
      },
      (error) => {
        console.error('Error loading texture:', error);
      }
    );
    
    // Create mesh
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    
    // Add celestial objects (sun, moon, clouds)
    this.setupCelestialObjects();
  }
  
  getMesh(): THREE.Mesh {
    return this.mesh;
  }
  
  // Setup sun, moon, and clouds
  private setupCelestialObjects(): void {
    // Create sun (directional light)
    this.sun = new THREE.DirectionalLight(0xffffcc, 1.2); // Warm sunlight color
    this.sun.position.set(this.radius * 2, this.radius * 2, this.radius * 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.width = 2048;
    this.sun.shadow.mapSize.height = 2048;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 500;
    this.sun.shadow.camera.left = -100;
    this.sun.shadow.camera.right = 100;
    this.sun.shadow.camera.top = 100;
    this.sun.shadow.camera.bottom = -100;
    this.sun.shadow.bias = -0.0001;
    this.sun.shadow.radius = 8; // Increased for even softer edges
    this.sun.intensity = 0.6; // Reduced for lighter shadows
    
    // Add a small sphere to represent the sun visually
    const sunSphere = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius * 0.1, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffff99 })
    );
    // Make the sun glow
    sunSphere.material.color.set(0xffff99);
    sunSphere.position.copy(this.sun.position);
    
    // Create moon (directional light) opposite to the sun
    this.moon = new THREE.DirectionalLight(0xaaccff, 0.5); // Pale blue moonlight
    this.moon.position.set(-this.radius * 2, -this.radius * 2, -this.radius * 2);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.width = 2048;
    this.moon.shadow.mapSize.height = 2048;
    this.moon.shadow.camera.near = 0.5;
    this.moon.shadow.camera.far = 500;
    this.moon.shadow.camera.left = -100;
    this.moon.shadow.camera.right = 100;
    this.moon.shadow.camera.top = 100;
    this.moon.shadow.camera.bottom = -100;
    this.moon.shadow.bias = -0.0001;
    this.moon.shadow.radius = 8; // Increased for even softer edges
    this.moon.intensity = 0.2; // Reduced for lighter shadows
    
    // Add a small sphere to represent the moon visually
    const moonSphere = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius * 0.05, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xccddff })
    );
    // Make the moon glow with pale blue
    moonSphere.material.color.set(0xccddff);
    moonSphere.position.copy(this.moon.position);
    
    // Create clouds
    this.clouds = new THREE.Group();
    
    // Create several cloud clusters
    const cloudCount = 40;
    for (let i = 0; i < cloudCount; i++) {
      // Random position on sphere
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * Math.PI;
      
      const x = this.radius * this.cloudHeight * Math.sin(theta) * Math.cos(phi);
      const y = this.radius * this.cloudHeight * Math.cos(theta);
      const z = this.radius * this.cloudHeight * Math.sin(theta) * Math.sin(phi);
      
      const cloudCluster = this.createCloudCluster();
      cloudCluster.position.set(x, y, z);
      
      // Orient cloud to face outward from sphere center
      const normal = new THREE.Vector3(x, y, z).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      cloudCluster.quaternion.setFromUnitVectors(up, normal);
      
      this.clouds.add(cloudCluster);
    }
    
    // Add all celestial objects to the sphere mesh
    this.mesh.add(this.sun);
    this.mesh.add(sunSphere);
    this.mesh.add(this.moon);
    this.mesh.add(moonSphere);
    this.mesh.add(this.clouds);
  }
  
  // Create a single cloud cluster
  private createCloudCluster(): THREE.Group {
    const cluster = new THREE.Group();
    
    // Cloud material - white, semi-transparent
    const cloudMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      emissive: 0x555555,
      emissiveIntensity: 0.3
    });
    
    // Create several overlapping spheres to form a cloud
    const cloudSize = this.radius * 0.1;
    const puffCount = 5 + Math.floor(Math.random() * 5);
    
    for (let i = 0; i < puffCount; i++) {
      const puffSize = cloudSize * (0.5 + Math.random() * 0.5);
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(puffSize, 8, 8),
        cloudMaterial
      );
      
      // Random position within cluster
      puff.position.set(
        (Math.random() - 0.5) * cloudSize * 2,
        (Math.random() - 0.5) * cloudSize,
        (Math.random() - 0.5) * cloudSize * 2
      );
      
      cluster.add(puff);
    }
    
    return cluster;
  }
  
  // No longer need applyRotation as the sphere doesn't rotate anymore

  update(): void {
    // The sphere is now stationary, so no rotation updates needed
    // This method is kept for compatibility with existing code
  }

  // Apply Perlin noise to the sphere geometry to create terrain
  private applyNoiseToGeometry(geometry: THREE.BufferGeometry): void {
    // Get position attribute
    const positionAttribute = geometry.getAttribute('position');
    const positions = positionAttribute.array;
    
    // Calculate original radius from the first vertex
    const originalRadius = Math.sqrt(
      Math.pow(positions[0], 2) + 
      Math.pow(positions[1], 2) + 
      Math.pow(positions[2], 2)
    );
    
    
    // For each vertex
    for (let i = 0; i < positions.length; i += 3) {
      // Get vertex position
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Get normalized direction from center
      const direction = new THREE.Vector3(x, y, z).normalize();
      
      // Get noise value based on position
      // Scale the input coordinates to get more interesting noise patterns
      const noiseValue = this.noise.octaveNoise(
        direction.x * this.noiseScale,
        direction.y * this.noiseScale,
        direction.z * this.noiseScale,
        4, // octaves
        0.5 // persistence
      );
      
      // Apply noise to vertex - displace along normal direction
      // Map noise from [0,1] to [-1,1] and scale by noiseStrength
      const displacement = (noiseValue * 2 - 1) * this.noiseStrength;
      
      // Apply displacement along the normal (direction from center)
      // Calculate new position based on original radius + displacement
      const newRadius = originalRadius + displacement;
      positions[i] = direction.x * newRadius;
      positions[i + 1] = direction.y * newRadius;
      positions[i + 2] = direction.z * newRadius;
    }
    
    // Update normals
    positionAttribute.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  // Method to mark vertices as visited based on player position
  public markVisitedArea(playerPosition: THREE.Vector3, coloringRadius: number): number {
    const geometry = this.mesh.geometry as THREE.BufferGeometry;
    const positionAttribute = geometry.getAttribute('position');
    const colorAttribute = geometry.getAttribute('color');
    
    // Convert player position to local space
    const localPlayerPos = playerPosition.clone();
    this.mesh.worldToLocal(localPlayerPos);
    
    // Get direction from center to player (normalized)
    const centerToPlayer = playerPosition.clone().normalize();
    
    let newlyVisited = 0;
    
    // Check each vertex
    for (let i = 0; i < positionAttribute.count; i++) {
      // Get vertex position in world space
      const vertexPos = new THREE.Vector3(
        positionAttribute.getX(i),
        positionAttribute.getY(i),
        positionAttribute.getZ(i)
      );
      
      // Transform vertex position to world space
      vertexPos.applyMatrix4(this.mesh.matrixWorld);
      
      // Calculate distance from vertex to the line from center to player
      // First, project the vertex onto the line from center to player
      const centerToVertex = vertexPos.clone();
      const projectionLength = centerToVertex.dot(centerToPlayer);
      const projectionPoint = centerToPlayer.clone().multiplyScalar(projectionLength);
      
      // Calculate the perpendicular distance from vertex to the line
      const perpendicularVector = centerToVertex.clone().sub(projectionPoint);
      const distanceToLine = perpendicularVector.length();
      
      // If vertex is within the cylinder defined by the coloring radius, mark it as visited
      if (distanceToLine < coloringRadius) {
        // Get or create vertex state
        let state = this.vertexStates.get(i);
        if (!state) {
          state = { visited: false, fertility: 0 };
          this.vertexStates.set(i, state);
        }
        
        // If not already visited, increment counter
        if (!state.visited) {
          state.visited = true;
          this.visitedVertexCount++;
          newlyVisited++;
          
          // Update vertex color to green
          colorAttribute.setXYZ(
            i,
            this.visitColor.r,
            this.visitColor.g,
            this.visitColor.b
          );
        }
        
        // Gradually increase fertility for future grass growth
        state.fertility = Math.min(1.0, state.fertility + 0.01);
      }
    }
    
    // Update the color attribute if any vertices were newly visited
    if (newlyVisited > 0) {
      colorAttribute.needsUpdate = true;
    }
    
    // Return coverage percentage
    return this.getCoveragePercentage();
  }
  
  // Get the percentage of the sphere that has been visited
  public getCoveragePercentage(): number {
    return (this.visitedVertexCount / this.totalVertices) * 100;
  }
  
  // Method to uncolor vertices (for future use)
  public uncolorVertex(vertexIndex: number): void {
    const state = this.vertexStates.get(vertexIndex);
    if (state && state.visited) {
      state.visited = false;
      state.fertility = 0;
      this.visitedVertexCount--;
      
      // Reset color to original
      const colorAttribute = this.mesh.geometry.getAttribute('color');
      colorAttribute.setXYZ(
        vertexIndex,
        this.originalColor.r,
        this.originalColor.g,
        this.originalColor.b
      );
      colorAttribute.needsUpdate = true;
    }
  }
  
  // Get all fertile vertices for future grass growth
  // Returns ALL vertices that have been marked as visited, not just the ones near the player's current position
  // This ensures grass grows on all visited areas, even if the player moved quickly over them
  public getFertileVertices(): Array<{index: number, position: THREE.Vector3, normal: THREE.Vector3, fertility: number}> {
    const fertileVertices: Array<{index: number, position: THREE.Vector3, normal: THREE.Vector3, fertility: number}> = [];
    const geometry = this.mesh.geometry as THREE.BufferGeometry;
    const positionAttribute = geometry.getAttribute('position');
    const normalAttribute = geometry.getAttribute('normal');
    
    this.vertexStates.forEach((state, index) => {
      if (state.visited) {
        // Get vertex position and normal
        const position = new THREE.Vector3(
          positionAttribute.getX(index),
          positionAttribute.getY(index),
          positionAttribute.getZ(index)
        );
        
        const normal = new THREE.Vector3(
          normalAttribute.getX(index),
          normalAttribute.getY(index),
          normalAttribute.getZ(index)
        );
        
        fertileVertices.push({
          index,
          position: position.clone(),
          normal: normal.clone(),
          fertility: state.fertility
        });
      }
    });
    
    return fertileVertices;
  }
}
