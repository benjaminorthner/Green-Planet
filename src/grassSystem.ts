import * as THREE from 'three';

// Constants for grass generation
const GRASS_BLADES_PER_VERTEX = 200; // Number of grass blades per fertile vertex
const GRASS_BLADE_SEGMENTS = 5; // Number of segments per blade (for bending)
const GRASS_BLADE_HEIGHT = 1; // Height of each grass blade
const GRASS_BLADE_WIDTH = 0.1; // Width of each grass blade

export class GrassSystem {
  private scene: THREE.Scene;
  private worldSphere: THREE.Mesh;
  private grassMesh: THREE.InstancedMesh | null = null;
  private grassGeometry: THREE.BufferGeometry | null = null;
  private grassMaterial: THREE.ShaderMaterial | null = null;
  private grassPositions: Float32Array | null = null;
  private grassNormals: Float32Array | null = null;
  private grassRandoms: Float32Array | null = null;
  private grassCount: number = 0;
  private maxGrassCount: number = 1000000; // Maximum number of grass blades
  private placedGrassBlades: Set<number> = new Set(); // Track indices of vertices that already have grass
  private computeRenderer: THREE.WebGLRenderer | null = null;
  private positionTarget: THREE.WebGLRenderTarget | null = null;
  private computeCamera: THREE.Camera | null = null;
  private computeScene: THREE.Scene | null = null;
  private computeMaterial: THREE.ShaderMaterial | null = null;
  private initialized: boolean = false;

  constructor(scene: THREE.Scene, worldSphere: THREE.Mesh) {
    this.scene = scene;
    this.worldSphere = worldSphere;
    this.initializeGrassSystem();
  }

  private initializeGrassSystem(): void {
    // Create grass blade geometry
    this.grassGeometry = this.createGrassBladeGeometry();

    // Create shader material for grass
    this.grassMaterial = new THREE.ShaderMaterial({
      vertexShader: this.getGrassVertexShader(),
      fragmentShader: this.getGrassFragmentShader(),
      side: THREE.DoubleSide,
      uniforms: {
        time: { value: 0 },
        lightDirection: { value: new THREE.Vector3(0.5, 1.0, 0.5).normalize() }
      }
    });

    // Create instanced mesh for grass
    this.grassMesh = new THREE.InstancedMesh(
      this.grassGeometry,
      this.grassMaterial,
      this.maxGrassCount
    );
    this.grassMesh.frustumCulled = false; // Disable frustum culling for now
    this.grassMesh.castShadow = true;
    this.grassMesh.receiveShadow = true;
    this.scene.add(this.grassMesh);

    // Initialize compute shader setup
    this.initializeComputeShader();

    this.initialized = true;
  }

  private createGrassBladeGeometry(): THREE.BufferGeometry {
    // Create a simple blade geometry (a thin rectangle)
    const geometry = new THREE.BufferGeometry();
    
    // Define vertices for a blade (centered at origin, pointing up along Y axis)
    const vertices = [];
    const uvs = [];
    const vertIndices = [];
    const indices = [];
    
    // Create vertices for each segment of the blade
    for (let i = 0; i <= GRASS_BLADE_SEGMENTS; i++) {
      const heightPercent = i / GRASS_BLADE_SEGMENTS;
      const width = GRASS_BLADE_WIDTH * (1 - heightPercent * 0.8); // Taper the blade
      
      // Left vertex
      vertices.push(-width / 2, heightPercent * GRASS_BLADE_HEIGHT, 0);
      uvs.push(0, heightPercent);
      vertIndices.push(i);
      
      // Right vertex
      vertices.push(width / 2, heightPercent * GRASS_BLADE_HEIGHT, 0);
      uvs.push(1, heightPercent);
      vertIndices.push(i);
    }
    
    // Create indices for triangles
    for (let i = 0; i < GRASS_BLADE_SEGMENTS; i++) {
      const bottomLeft = i * 2;
      const bottomRight = i * 2 + 1;
      const topLeft = (i + 1) * 2;
      const topRight = (i + 1) * 2 + 1;
      
      // First triangle (bottom-left, bottom-right, top-right)
      indices.push(bottomLeft, bottomRight, topRight);
      
      // Second triangle (bottom-left, top-right, top-left)
      indices.push(bottomLeft, topRight, topLeft);
    }
    
    // Set attributes
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('vertIndex', new THREE.Float32BufferAttribute(vertIndices, 1));
    geometry.setIndex(indices);
    
    // Compute normals
    geometry.computeVertexNormals();
    
    return geometry;
  }

  private initializeComputeShader(): void {
    // Initialize compute shader resources
    // This is a placeholder for now - we'll implement the full compute shader later
    // For now, we'll use CPU-based positioning
  }

  public update(fertileVertices: Array<{index: number, position: THREE.Vector3, normal: THREE.Vector3, fertility: number}>): void {
    if (!this.initialized || !this.grassMesh) return;
    
    // Only place new grass blades for newly fertile vertices
    this.placeNewGrassBlades(fertileVertices);
    
    // Update time uniform for animation (wind effect)
    if (this.grassMaterial) {
      this.grassMaterial.uniforms.time.value = performance.now() / 1000;
    }
  }

  private placeNewGrassBlades(fertileVertices: Array<{index: number, position: THREE.Vector3, normal: THREE.Vector3, fertility: number}>): void {
    if (!this.grassMesh) return;
    
    // Create dummy matrix for transformation
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    
    // Track new blades to add
    let newBlades = 0;
    
    // Process each fertile vertex from the list of marked vertices
    // This ensures grass grows on all marked vertices, even if the player moved quickly over them
    for (const vertex of fertileVertices) {
      // Skip if fertility is too low
      if (vertex.fertility < 0.1) continue;
      
      // Skip if we've already placed grass for this vertex
      if (this.placedGrassBlades.has(vertex.index)) continue;
      
      // Number of blades for this vertex based on fertility
      const bladesForVertex = Math.floor(GRASS_BLADES_PER_VERTEX * vertex.fertility);
      
      // Mark this vertex as having grass
      this.placedGrassBlades.add(vertex.index);
      
      // Place grass blades for this vertex
      for (let i = 0; i < bladesForVertex && this.grassCount + newBlades < this.maxGrassCount; i++) {
        // Generate random offset with smaller radius to keep grass blades closer to the vertex
        // This ensures more grass blades are rendered within the visible region
        const randomRadius = 0 + 1 * Math.random(); // Reduced range from 0.1 to 0.4
        const randomAngle = Math.random() * Math.PI * 2;
        
        // Create tangent space for the vertex
        const normal = vertex.normal.clone().normalize();
        const tangent = new THREE.Vector3(1, 0, 0);
        
        // Make sure tangent is perpendicular to normal
        if (Math.abs(normal.y) < 0.99) {
          tangent.set(0, 1, 0);
        }
        
        tangent.crossVectors(tangent, normal).normalize();
        const bitangent = new THREE.Vector3().crossVectors(normal, tangent);
        
        // Calculate offset in tangent space
        const offsetX = Math.cos(randomAngle) * randomRadius;
        const offsetZ = Math.sin(randomAngle) * randomRadius;
        
        // Apply offset in tangent space
        position.copy(vertex.position)
          .addScaledVector(tangent, offsetX)
          .addScaledVector(bitangent, offsetZ);
        
        // Random rotation around normal axis
        const randomRotation = Math.random() * Math.PI * 2;
        quaternion.setFromAxisAngle(normal, randomRotation);
        
        // Create a modified normal that's biased towards the global up direction
        // This ensures grass blades face mostly upwards with only slight angle variation
        const globalUp = new THREE.Vector3(0, 1, 0);
        const modifiedNormal = new THREE.Vector3().copy(normal);
        
        // Blend between the surface normal and global up vector
        // Higher weight for global up (0.7) ensures grass points mostly upwards
        modifiedNormal.lerp(globalUp, 0.0).normalize();
        
        // Align blade with the modified no1al
        const upVector = new THREE.Vector3(0, 1, 0);
        const alignQuat = new THREE.Quaternion().setFromUnitVectors(upVector, modifiedNormal);
        
        // Reset any previous rotation and apply only the alignment to modified normal
        quaternion.copy(alignQuat);
        
        // Then apply a limited random rotation around the normal axis
        // Limit the rotation to a smaller range for more consistent orientation
        const limitedRandomRotation = 0.5*(Math.random() * 0.5 - 0.25) * Math.PI; // -45 to +45 degrees
        const rotationAroundNormal = new THREE.Quaternion().setFromAxisAngle(normal, limitedRandomRotation);
        quaternion.multiply(rotationAroundNormal);
        
        // Random scale variation
        const heightScale = 0.8 + Math.random() * 0.4;
        scale.set(1, heightScale, 1);
        
        // Set matrix
        matrix.compose(position, quaternion, scale);
        this.grassMesh.setMatrixAt(this.grassCount + newBlades, matrix);
        
        newBlades++;
      }
    }
    
    // Update instance count if new blades were added
    if (newBlades > 0) {
      this.grassCount += newBlades;
      this.grassMesh.count = this.grassCount;
      this.grassMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private getGrassVertexShader(): string {
    return `
      attribute float vertIndex;
      
      uniform float time;
      
      varying vec2 vUv;
      varying vec3 vNormal;
      varying float vHeight;
      
      // Function to create a rotation matrix around X axis
      mat3 rotateX(float angle) {
        float s = sin(angle);
        float c = cos(angle);
        return mat3(
          1.0, 0.0, 0.0,
          0.0, c, -s,
          0.0, s, c
        );
      }
      
      // Function to create a rotation matrix around Y axis
      mat3 rotateY(float angle) {
        float s = sin(angle);
        float c = cos(angle);
        return mat3(
          c, 0.0, s,
          0.0, 1.0, 0.0,
          -s, 0.0, c
        );
      }
      
      void main() {
        vUv = uv;
        
        // Calculate height percentage (0 at base, 1 at tip)
        float heightPercent = vertIndex / ${GRASS_BLADE_SEGMENTS.toFixed(1)};
        vHeight = heightPercent;
        
        // Get instance matrix
        mat4 instanceMatrix = instanceMatrix;
        
        // Extract position and normal from instance matrix
        vec3 instancePosition = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        vec3 instanceScale = vec3(
          length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2])),
          length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2])),
          length(vec3(instanceMatrix[2][0], instanceMatrix[2][1], instanceMatrix[2][2]))
        );
        
        // Apply wind effect
        float windStrength = 0.2;
        float windFrequency = 1.5;
        float windEffect = sin(time * windFrequency + instancePosition.x + instancePosition.z) * windStrength;
        
        // Apply bending based on height and wind
        float bendFactor = heightPercent * heightPercent; // Quadratic for more natural bending
        float bend = windEffect * bendFactor;
        
        // Create rotation matrix for bending
        mat3 bendMatrix = rotateX(bend);
        
        // Apply bending transformation
        vec3 transformedPosition = position;
        transformedPosition = bendMatrix * transformedPosition;
        
        // Calculate normals for lighting
        vec3 transformedNormal = normal;
        transformedNormal = bendMatrix * transformedNormal;
        
        // Create rotated normals for curved appearance
        vec3 rotatedNormal1 = rotateY(3.14159 * 0.3) * transformedNormal;
        vec3 rotatedNormal2 = rotateY(3.14159 * -0.3) * transformedNormal;
        
        // Mix normals based on width percentage (U coordinate)
        vNormal = mix(rotatedNormal1, rotatedNormal2, uv.x);
        vNormal = normalize(vNormal);
        
        // Final position
        vec4 worldPosition = instanceMatrix * vec4(transformedPosition, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `;
  }

  private getGrassFragmentShader(): string {
    return `
      uniform vec3 lightDirection;
      
      varying vec2 vUv;
      varying vec3 vNormal;
      varying float vHeight;
      
      void main() {
        // Calculate lighting
        float light = max(0.2, dot(normalize(vNormal), normalize(lightDirection)));
        
        // Base color (darker at bottom, lighter at top)
        vec3 grassColor = mix(
          vec3(0.0, 0.3, 0.0),  // Dark green at base
          vec3(0.2, 0.8, 0.1),  // Light green at tip
          vHeight
        );
        
        // Apply lighting
        vec3 finalColor = grassColor * light;
        
        // Add slight ambient occlusion at the base
        finalColor *= mix(0.7, 1.0, vHeight);
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;
  }

  public dispose(): void {
    // Clean up resources
    if (this.grassGeometry) {
      this.grassGeometry.dispose();
    }
    
    if (this.grassMaterial) {
      this.grassMaterial.dispose();
    }
    
    if (this.grassMesh && this.grassMesh.parent) {
      this.grassMesh.parent.remove(this.grassMesh);
    }
    
    if (this.positionTarget) {
      this.positionTarget.dispose();
    }
    
    if (this.computeMaterial) {
      this.computeMaterial.dispose();
    }
  }
}
