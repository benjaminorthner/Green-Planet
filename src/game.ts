import * as THREE from 'three';
import { Player } from './player';
import { WorldSphere } from './sphere';
import { GrassSystem } from './grassSystem';

export class Game {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera; // Reverted to perspective camera
  private renderer: THREE.WebGLRenderer;
  private player: Player;
  private worldSphere: WorldSphere;
  private grassSystem!: GrassSystem; // Using definite assignment assertion
  private isRunning: boolean = false;
  private sphereRadius: number = 40;
  private coverageProgress: HTMLElement | null = null;
  private keysPressed: { [key: string]: boolean } = {}; // Track which keys are pressed
  private backgroundCanvas: HTMLCanvasElement;
  private backgroundContext: CanvasRenderingContext2D | null;
  private backgroundTexture: THREE.CanvasTexture;
  
  // Day and night gradient colors
  private readonly dayColors = {
    top: '#87CEEB',    // Sky blue
    bottom: '#FFFFFF'  // White
  };
  
  private readonly nightColors = {
    top: '#000002',    // Dark blue
    bottom: '#000000'  // Black
  };
  
  // Interpolation region (in degrees)
  private readonly transitionAngle: number = 30; // 30 degrees transition region

  constructor() {
    // Create scene
    this.scene = new THREE.Scene();
    
    // Initialize background canvas
    this.backgroundCanvas = document.createElement('canvas');
    this.backgroundCanvas.width = 2;
    this.backgroundCanvas.height = 512;
    this.backgroundContext = this.backgroundCanvas.getContext('2d');
    this.backgroundTexture = new THREE.CanvasTexture(this.backgroundCanvas);
    this.scene.background = this.backgroundTexture;

    // Create perspective camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    // Position camera to look down at the player
    this.camera.position.set(0, -5, this.sphereRadius + 5);
    this.camera.lookAt(0, 45, 0);

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true; // Enable shadows
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Use soft, high-quality shadows
    document.body.appendChild(this.renderer.domElement);

    // Create world sphere with larger radius and high segment count for detailed noise
    this.worldSphere = new WorldSphere(this.sphereRadius, 256, 32); // Increased segments for better noise detail
    this.scene.add(this.worldSphere.getMesh());

    // Create player
    this.player = new Player();
    const playerMesh = this.player.getMesh();
    playerMesh.castShadow = true; // Player casts shadows
    this.scene.add(playerMesh);
    
    // Set player position on sphere surface
    this.player.setPosition(0, 1, this.sphereRadius); // Slightly raise player for better visibility

    // Initialize grass system
    this.grassSystem = new GrassSystem(this.scene, this.worldSphere.getMesh());

    // Now that player is initialized, set up the gradient background
    this.setupGradientBackground();

    // Set up coverage UI
    this.setupCoverageUI();

    // Handle window resize
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  start(): void {
    this.isRunning = true;
    this.animate();
    
    // Set up keyboard controls
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    window.addEventListener('keyup', this.handleKeyUp.bind(this));
  }

  stop(): void {
    this.isRunning = false;
    
    // Remove event listeners
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    window.removeEventListener('keyup', this.handleKeyUp.bind(this));
    
    // Clean up resources
    this.grassSystem.dispose();
  }

  private animate(): void {
    if (!this.isRunning) return;
    
    requestAnimationFrame(this.animate.bind(this));

    this.updateMovement();
    this.updateCamera();
    this.updateGradientBackground();
    
    // Update player and world
    this.player.update(this.worldSphere.getMesh());
    this.worldSphere.update(); // This is now a no-op but kept for compatibility
    
    // Mark area around player as visited and get coverage percentage
    const coveragePercentage = this.worldSphere.markVisitedArea(
      this.player.getMesh().position,
      this.player.getColoringRadius()
    );
    
    // Update coverage UI
    this.updateCoverageUI(coveragePercentage);
    
    // Update grass system with fertile vertices
    const fertileVertices = this.worldSphere.getFertileVertices();
    this.grassSystem.update(fertileVertices);
    
    // Update particles in scene
    const particles = this.player.getParticles();
    particles.forEach(particle => {
      if (!this.scene.children.includes(particle)) {
        this.scene.add(particle);
      }
    });
    
    // Render scene
    this.renderer.render(this.scene, this.camera);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) {
      this.keysPressed[key] = true;
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) {
      this.keysPressed[key] = false;
    }
  }

  private updateMovement(): void {
    const moveSpeed = 0.02; // Adjusted for player movement
    
    // Get player position and create tangent space for movement
    const playerPos = this.player.getMesh().position.clone();
    const playerDir = playerPos.clone().normalize();
    
    // Create tangent vectors for movement on the sphere surface
    // Forward direction (tangent to sphere in the direction the camera is facing)
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    
    // Project camera direction onto tangent plane at player position
    const forward = cameraDirection.clone().sub(
      playerDir.clone().multiplyScalar(cameraDirection.dot(playerDir))
    ).normalize();
    
    // Right direction (perpendicular to forward and up)
    const right = new THREE.Vector3().crossVectors(forward, playerDir).normalize();
    
    // Calculate movement force in tangent space
    const force = new THREE.Vector3();
    
    if (this.keysPressed['w']) {
      force.add(forward.clone().multiplyScalar(moveSpeed));
    }
    if (this.keysPressed['s']) {
      force.add(forward.clone().multiplyScalar(-moveSpeed));
    }
    if (this.keysPressed['a']) {
      force.add(right.clone().multiplyScalar(-moveSpeed));
    }
    if (this.keysPressed['d']) {
      force.add(right.clone().multiplyScalar(moveSpeed));
    }
    
    // Apply force to player
    this.player.applyForce(force);
  }
  
  private updateCamera(): void {
    // Get player position and direction
    const playerPos = this.player.getMesh().position.clone();
    const playerDir = playerPos.clone().normalize();
    
    // Calculate camera position behind and above player
    const cameraOffset = new THREE.Vector3(0, 2, -5); // Offset in local space
    
    // Create rotation matrix to align with player's orientation on sphere
    const up = playerDir.clone(); // Up is the direction from center to player (normal to sphere)
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    
    // Project forward onto tangent plane
    forward.sub(up.clone().multiplyScalar(forward.dot(up))).normalize();
    
    // Right is perpendicular to forward and up
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    
    // Apply offset in player's local space
    const worldOffset = new THREE.Vector3()
      .addScaledVector(right, cameraOffset.x)
      .addScaledVector(up, cameraOffset.y)
      .addScaledVector(forward, cameraOffset.z);
    
    // Set camera position
    this.camera.position.copy(playerPos.clone().add(worldOffset));
    
    // Look at player
    this.camera.lookAt(playerPos);
  }

  private setupCoverageUI(): void {
    // Create container
    const uiContainer = document.getElementById('ui-container') || document.body;
    
    // Remove existing coverage display if it exists
    const existingCoverageDisplay = document.getElementById('coverage-container');
    if (existingCoverageDisplay) {
      existingCoverageDisplay.remove();
    }
    
    // Create coverage container
    const coverageContainer = document.createElement('div');
    coverageContainer.id = 'coverage-container';
    coverageContainer.style.position = 'absolute';
    coverageContainer.style.top = '20px'; // Positioned at the top center
    coverageContainer.style.left = '50%';
    coverageContainer.style.transform = 'translateX(-100%)';
    coverageContainer.style.width = '400px'; // Wide container for visibility
    coverageContainer.style.padding = '10px';
    coverageContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)'; // Dark background for contrast
    coverageContainer.style.borderRadius = '10px';
    coverageContainer.style.color = 'white';
    coverageContainer.style.fontFamily = 'Arial, sans-serif';
    coverageContainer.style.textAlign = 'center';
    coverageContainer.style.zIndex = '9999'; // High z-index to ensure it's on top
    coverageContainer.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.5)'; // Shadow for depth
    
    // Create title
    const title = document.createElement('div');
    title.textContent = 'Planet Coverage';
    title.style.fontSize = '18px';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '10px';
    
    // Create percentage text
    const percentageText = document.createElement('div');
    percentageText.id = 'coverage-percentage';
    percentageText.style.fontSize = '16px';
    percentageText.style.fontWeight = 'bold';
    percentageText.style.marginBottom = '10px';
    percentageText.textContent = 'Coverage: 0%';
    
    // Create progress bar container
    const progressContainer = document.createElement('div');
    progressContainer.style.width = '100%';
    progressContainer.style.height = '25px'; // Tall progress bar for visibility
    progressContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'; // Light grey background
    progressContainer.style.borderRadius = '5px';
    progressContainer.style.overflow = 'hidden';
    progressContainer.style.border = '2px solid rgba(255, 255, 255, 0.5)'; // Border for definition
    
    // Create progress bar
    const progressBar = document.createElement('div');
    progressBar.id = 'coverage-progress';
    progressBar.style.width = '0%'; // Start at 0%
    progressBar.style.height = '100%';
    progressBar.style.backgroundColor = '#00FF00'; // Bright green for visibility
    progressBar.style.transition = 'width 0.5s ease-in-out'; // Smooth transition
    progressBar.style.borderRadius = '3px';
    
    // Assemble UI
    progressContainer.appendChild(progressBar);
    coverageContainer.appendChild(title);
    coverageContainer.appendChild(percentageText);
    coverageContainer.appendChild(progressContainer);
    uiContainer.appendChild(coverageContainer);
    
    // Store reference to progress bar
    this.coverageProgress = progressBar;
    
    // Log for debugging
    console.log("Coverage UI setup complete, container added to DOM");
  }
  
  private updateCoverageUI(percentage: number): void {
    // Ensure percentage is a valid number
    if (isNaN(percentage) || percentage < 0) {
      percentage = 0;
    }
    
    // Round to 2 decimal places for display
    const roundedPercentage = Math.round(percentage * 100) / 100;
    
    // Update progress bar width
    if (this.coverageProgress) {
      this.coverageProgress.style.width = `${roundedPercentage}%`;
      
      // Change color based on progress
      if (roundedPercentage < 30) {
        this.coverageProgress.style.backgroundColor = '#4CAF50'; // Green
      } else if (roundedPercentage < 70) {
        this.coverageProgress.style.backgroundColor = '#2196F3'; // Blue
      } else {
        this.coverageProgress.style.backgroundColor = '#9C27B0'; // Purple
      }
    }
    
    // Update percentage text
    const percentageText = document.getElementById('coverage-percentage');
    if (percentageText) {
      percentageText.textContent = `Coverage: ${roundedPercentage.toFixed(2)}%`;
    }
    
    // Log the percentage for debugging
    console.log(`Coverage percentage: ${roundedPercentage}%`);
  }
  
  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private setupGradientBackground(): void {
    if (this.backgroundContext) {
      this.updateGradientBackground();
    }
  }

  private updateGradientBackground(): void {
    if (!this.backgroundContext) return;

    // Get player position
    const playerPos = this.player.getMesh().position.clone().normalize();
    
    // Sun and moon positions are now fixed since the sphere doesn't rotate
    const sunPos = new THREE.Vector3(this.sphereRadius * 2, this.sphereRadius * 2, this.sphereRadius * 2).normalize();
    const moonPos = new THREE.Vector3(-this.sphereRadius * 2, -this.sphereRadius * 2, -this.sphereRadius * 2).normalize();
    
    // Calculate angles between player and sun/moon
    const angleToSun = Math.acos(playerPos.dot(sunPos)) * (180 / Math.PI);
    const angleToMoon = Math.acos(playerPos.dot(moonPos)) * (180 / Math.PI);
    
    // Calculate interpolation factor (0 = full night, 1 = full day)
    let dayFactor = 0;
    
    // Debug logging
    
    // Simplified logic: if closer to sun than moon, it's day
    if (angleToSun < angleToMoon) {
      // We're closer to the sun
      if (angleToSun <= 90 - this.transitionAngle) {
        // Fully in day
        dayFactor = 1;
      } else {
        // In transition region
        dayFactor = 1 - ((angleToSun - (90 - this.transitionAngle)) / (2 * this.transitionAngle));
      }
    } else {
      // We're closer to the moon
      if (angleToMoon <= 90 - this.transitionAngle) {
        // Fully in night
        dayFactor = 0;
      } else {
        // In transition region
        dayFactor = (angleToMoon - (90 - this.transitionAngle)) / (2 * this.transitionAngle);
      }
    }
    
    // Clamp dayFactor between 0 and 1
    dayFactor = Math.max(0, Math.min(1, dayFactor));
    
    
    // Interpolate colors
    const topColor = this.interpolateColor(this.nightColors.top, this.dayColors.top, dayFactor);
    const bottomColor = this.interpolateColor(this.nightColors.bottom, this.dayColors.bottom, dayFactor);
    
    // Create gradient
    const gradient = this.backgroundContext.createLinearGradient(0, 0, 0, this.backgroundCanvas.height);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(1, bottomColor);
    
    this.backgroundContext.fillStyle = gradient;
    this.backgroundContext.fillRect(0, 0, this.backgroundCanvas.width, this.backgroundCanvas.height);
    
    // Update the texture
    this.backgroundTexture.needsUpdate = true;
  }

  private interpolateColor(color1: string, color2: string, factor: number): string {
    // Convert hex to RGB
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);
    
    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);
    
    // Interpolate
    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);
    
    // Convert back to hex
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
}
