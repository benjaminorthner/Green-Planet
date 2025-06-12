import * as THREE from 'three';

// Constants for grass generation
const GRASS_BLADES_PER_VERTEX = 150; // Number of grass blades per fertile vertex
const GRASS_BLADE_SEGMENTS = 5; // Number of segments per blade (for bending)
const GRASS_BLADE_HEIGHT = 1; // Height of each grass blade
const GRASS_BLADE_WIDTH = 0.1; // Width of each grass blade

export class GrassSystem {
  private scene: THREE.Scene;
  private worldSphere: THREE.Mesh;
  private grassMesh: THREE.InstancedMesh | null = null;
  private grassGeometry: THREE.BufferGeometry | null = null;
  private grassMaterial: THREE.ShaderMaterial | null = null;
  private sunPosition: THREE.Vector3 = new THREE.Vector3(1, 1, 1).normalize();
  private sunColor: THREE.Color = new THREE.Color(0xffffcc);
  private moonPosition: THREE.Vector3 = new THREE.Vector3(-1, -1, -1).normalize();
  private moonColor: THREE.Color = new THREE.Color(0xaaccff);
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
        sunDirection: { value: this.sunPosition.clone() },
        sunColor: { value: this.sunColor.clone() },
        moonDirection: { value: this.moonPosition.clone() },
        moonColor: { value: this.moonColor.clone() },
        vertexPosition: { value: new THREE.Vector3() },
        grassWidth: { value: GRASS_BLADE_WIDTH }
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
      
      // Update sun and moon positions from the worldSphere
      if (this.worldSphere.children && this.worldSphere.children.length > 0) {
        // Find sun and moon directional lights
        this.worldSphere.children.forEach(child => {
          if (child instanceof THREE.DirectionalLight) {
            if (child.position.x > 0) { // Sun is in the positive direction
              this.sunPosition.copy(child.position.clone().normalize());
              this.grassMaterial!.uniforms.sunDirection.value = this.sunPosition;
              this.sunColor.copy(new THREE.Color(child.color));
              this.grassMaterial!.uniforms.sunColor.value = this.sunColor;
            } else { // Moon is in the negative direction
              this.moonPosition.copy(child.position.clone().normalize());
              this.grassMaterial!.uniforms.moonDirection.value = this.moonPosition;
              this.moonColor.copy(new THREE.Color(child.color));
              this.grassMaterial!.uniforms.moonColor.value = this.moonColor;
            }
          }
        });
      }
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
        const randomRadius = Math.random(); // Reduced range from 0.1 to 0.4
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
        
        // Make grass grow straight out of the surface (perpendicular to the sphere)
        // This is the most natural orientation for grass on a sphere
        const modifiedNormal = new THREE.Vector3().copy(normal);
        
        // Align blade with the surface normal
        const upVector = new THREE.Vector3(0, 1, 0);
        const alignQuat = new THREE.Quaternion().setFromUnitVectors(upVector, modifiedNormal);
        
        // Reset any previous rotation and apply only the alignment to modified normal
        quaternion.copy(alignQuat);
        
        // Apply a small random rotation around the normal axis
        // This creates natural variation in the grass orientation
        const randomRotationAngle = (Math.random() * 0.3 - 0.15) * Math.PI; // -27 to +27 degrees
        const rotationAroundNormal = new THREE.Quaternion().setFromAxisAngle(normal, randomRotationAngle);
        quaternion.multiply(rotationAroundNormal);
        
        // Apply a small random bending in a random direction
        // This makes the grass look more natural with slight bending
        const bendAxis = new THREE.Vector3(
          Math.random() * 2 - 1,
          0,
          Math.random() * 2 - 1
        ).normalize();
        const bendAngle = Math.random() * 0.2; // 0 to 0.2 radians (0 to ~11.5 degrees)
        const bendQuat = new THREE.Quaternion().setFromAxisAngle(bendAxis, bendAngle);
        quaternion.multiply(bendQuat);
        
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
      uniform vec3 sunDirection;
      uniform vec3 moonDirection;
      uniform float grassWidth;
      
      varying vec2 vUv;
      varying vec3 vNormal;
      varying float vHeight;
      varying vec3 vWorldPosition;
      
      // Helper function for easing out (similar to the one in the provided code)
      float easeOut(float x, float power) {
        return 1.0 - pow(1.0 - x, power);
      }
      
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
        
        // Convert to model-view space for view-dependent effects
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(transformedPosition, 1.0);
        
        // Calculate view direction in model-view space
        vec3 viewDir = normalize(-mvPosition.xyz);
        
        // Calculate grass face normal in model-view space
        // We use the cross product of the blade's up direction and right direction
        vec3 grassUpDir = normalize(mat3(modelViewMatrix * instanceMatrix) * vec3(0.0, 1.0, 0.0));
        vec3 grassRightDir = normalize(mat3(modelViewMatrix * instanceMatrix) * vec3(1.0, 0.0, 0.0));
        vec3 grassFaceNormal = normalize(cross(grassUpDir, grassRightDir));
        
        // Calculate the dot product of view direction and grass normal
        // We use the xz components to focus on the horizontal plane
        float viewDotNormal = max(0.0, dot(normalize(grassFaceNormal.xy), normalize(viewDir.xy)));
        
        // Calculate the view-space thicken factor (reduced power from 4.0 to 2.0 for a more subtle effect)
        float viewSpaceThickenFactor = easeOut(1.0 - viewDotNormal, 2.0);
        
        // Allow thinning when blade is nearly orthogonal to view (widened range for smoother transition)
        viewSpaceThickenFactor *= smoothstep(0.0, 0.3, viewDotNormal);
        
        // Scale down the overall effect to make it more subtle (reduce by 60%)
        viewSpaceThickenFactor *= 0.4;
        
        // Apply view-space width adjustment based on uv.x (left/right side of blade)
        float xDirection = (uv.x - 0.5) * 2.0; // -1 to 1
        
        // Scale the thickening factor based on height to preserve the pointed tip
        // Gradually reduce the effect as we approach the tip
        float tipTaper = 1.0 - pow(heightPercent, 2.0); // Quadratic falloff towards tip
        
        // Apply the view-space adjustment with a more subtle effect
        // Preserve the pointed tip by scaling the effect
        mvPosition.xy += viewSpaceThickenFactor * xDirection * grassWidth * tipTaper * vec2(grassRightDir.xy);
        
        // Convert back to clip space
        vec4 worldPosition = instanceMatrix * vec4(transformedPosition, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
        
        // Override with the adjusted position
        gl_Position = projectionMatrix * mvPosition;
      }
    `;
  }

  private getGrassFragmentShader(): string {
    return `
      uniform vec3 sunDirection;
      uniform vec3 sunColor;
      uniform vec3 moonDirection;
      uniform vec3 moonColor;
      
      varying vec2 vUv;
      varying vec3 vNormal;
      varying float vHeight;
      varying vec3 vWorldPosition;
      
      void main() {
        vec3 normal = normalize(vNormal);
        
        // Calculate sun lighting
        float sunDot = max(0.0, dot(normal, normalize(sunDirection)));
        float sunLight = 0.2 + 0.8 * sunDot; // Ambient + diffuse
        
        // Calculate moon lighting
        float moonDot = max(0.0, dot(normal, normalize(moonDirection)));
        float moonLight = 0.1 + 0.4 * moonDot; // Ambient + diffuse (moon is dimmer)
        
        // Base color (darker at bottom, lighter at top)
        vec3 grassColor = mix(
          vec3(0.0, 0.3, 0.0),  // Dark green at base
          vec3(0.2, 0.8, 0.1),  // Light green at tip
          vHeight
        );
        
        // Calculate the angle between the vertex position and sun/moon
        // This helps determine if we're on the day or night side of the planet
        vec3 vertexDir = normalize(vWorldPosition);
        float sunSide = dot(vertexDir, normalize(sunDirection));
        float moonSide = dot(vertexDir, normalize(moonDirection));
        
        // Blend between sun and moon lighting based on which side we're on
        // Use a smooth transition between day and night
        float dayFactor = smoothstep(-0.2, 0.2, sunSide - moonSide);
        
        // Apply sun lighting with sun color
        vec3 sunLit = grassColor * sunLight * sunColor;
        
        // Apply moon lighting with moon color
        vec3 moonLit = grassColor * moonLight * moonColor;
        
        // Blend between sun and moon lighting
        vec3 finalColor = mix(moonLit, sunLit, dayFactor);
        
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
