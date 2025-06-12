import * as THREE from 'three';

export class HomeScreen {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private sphere: THREE.Object3D; // Changed to Object3D to support both Mesh and LineSegments
  private container: HTMLElement | null;
  private homeScreen: HTMLElement | null;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.sphere = new THREE.Mesh();
    this.container = document.getElementById('sphere-container');
    this.homeScreen = document.getElementById('home-screen');
  }

  init(): void {
    // Set up renderer
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);
    if (this.container) {
      this.container.appendChild(this.renderer.domElement);
    }

    // Create custom sphere with only latitude lines
    const radius = 2;
    const latitudeCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    
    // Create latitude lines
    for (let i = 0; i < latitudeCount; i++) {
      const phi = Math.PI * i / (latitudeCount - 1);
      const segments = 64;
      
      for (let j = 0; j <= segments; j++) {
        const theta = 2 * Math.PI * j / segments;
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi);
        const z = radius * Math.sin(phi) * Math.sin(theta);
        
        positions.push(x, y, z);
        
        // Connect to next point (except for the last point)
        if (j < segments) {
          const nextTheta = 2 * Math.PI * (j + 1) / segments;
          const nextX = radius * Math.sin(phi) * Math.cos(nextTheta);
          const nextY = radius * Math.cos(phi);
          const nextZ = radius * Math.sin(phi) * Math.sin(nextTheta);
          
          positions.push(nextX, nextY, nextZ);
        }
      }
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    // Dark green material
    const material = new THREE.LineBasicMaterial({
      color: 0x006400,
      linewidth: 1
    });
    
    this.sphere = new THREE.LineSegments(geometry, material);
    this.scene.add(this.sphere);

    // Position camera
    this.camera.position.z = 5;

    // Handle window resize
    window.addEventListener('resize', this.onWindowResize.bind(this));

    // Start animation loop
    this.animate();
  }

  animate(): void {
    requestAnimationFrame(this.animate.bind(this));

    // Rotate sphere
    this.sphere.rotation.x += 0.005;
    this.sphere.rotation.y += 0.01;

    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  hide(): void {
    if (this.homeScreen) {
      this.homeScreen.style.display = 'none';
    }
    // Stop rendering the home screen
    this.renderer.setAnimationLoop(null);
  }
}
