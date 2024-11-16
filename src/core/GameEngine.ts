import * as THREE from 'three';
import ErrorService, { GameEngineError, ErrorSeverity } from './services/ErrorService';
import RendererService from './services/RendererService';
import PhysicsService from './services/PhysicsService';
import DebugService from './services/DebugService';
import InputService from './services/InputService';
import LevelService from './services/LevelService';
import Platform from './entities/Platform';
import TrackEditorService from './services/TrackEditorService';

/**
 * Game engine configuration options
 */
interface GameEngineConfig {
  containerId: string;
  width?: number;
  height?: number;
}

/**
 * Movement configuration
 */
interface MovementConfig {
  moveForce: number;
  jumpForce: number;
  airControl: number;
}

/**
 * Physics object type
 */
interface PhysicsObject {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  restitution: number;
}

/**
 * Main game engine class
 * Manages the game loop, scene, and coordinates all game systems
 */
abstract class GameEngine {
  protected static instance: GameEngine | null = null;
  protected errorService: ErrorService;
  protected rendererService: RendererService;
  protected physicsService: PhysicsService;
  protected debugService: DebugService;
  protected inputService: InputService;
  protected levelService: LevelService;
  protected trackEditorService: TrackEditorService;
  protected scene: THREE.Scene;
  protected camera: THREE.PerspectiveCamera;
  protected container: HTMLElement | null = null;
  protected isRunning: boolean = false;
  protected lastFrameTime: number = 0;
  protected readonly fixedTimeStep: number = 1 / 60;
  protected accumulator: number = 0;
  protected readonly debug: boolean = import.meta.env.DEV;
  protected frameCount: number = 0;
  protected domElement: HTMLElement | null = null;
  protected objects: Map<string, PhysicsObject> = new Map();
  protected isEditorMode: boolean = false;

  // Movement configuration
  protected readonly movementConfig: MovementConfig = {
    moveForce: 5,
    jumpForce: 5, // Increased from 3 to 5 for higher jumps
    airControl: 0.3
  };

  protected constructor() {
    this.errorService = ErrorService.getInstance();
    this.rendererService = RendererService.getInstance();
    this.physicsService = PhysicsService.getInstance();
    this.debugService = DebugService.getInstance();
    this.inputService = InputService.getInstance();
    this.levelService = LevelService.getInstance();
    this.trackEditorService = TrackEditorService.getInstance();
    
    // Initialize scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Sky blue background
    
    // Initialize camera with better default position
    this.camera = new THREE.PerspectiveCamera(
      75, // Field of view
      window.innerWidth / window.innerHeight,
      0.1, // Near plane
      1000 // Far plane
    );
    
    // Position camera to view the scene from a good angle
    this.camera.position.set(0, 10, 15);
    this.camera.lookAt(0, 0, 0);

    this.debugService.log('GameEngine', 'Constructor completed', {
      camera: {
        position: this.camera.position.toArray(),
        rotation: this.camera.rotation.toArray(),
        fov: this.camera.fov,
        aspect: this.camera.aspect
      },
      scene: {
        background: (this.scene.background as THREE.Color).getHexString()
      }
    });
  }

  /**
   * Set editor mode
   */
  public setEditorMode(enabled: boolean): void {
    this.isEditorMode = enabled;
    if (enabled) {
      this.trackEditorService.initialize(this.scene);
      // Move camera to editor position
      this.camera.position.set(0, 15, 20);
      this.camera.lookAt(0, 0, 0);
    } else {
      // Reset camera to game position
      this.camera.position.set(0, 10, 15);
      this.camera.lookAt(0, 0, 0);
    }
    this.debugService.log('GameEngine', 'Editor mode changed', { enabled });
  }

  /**
   * Initialize the game engine
   */
  public initialize(config: GameEngineConfig): void {
    try {
      this.debugService.log('GameEngine', 'Initializing', { config });

      // Get container element
      this.container = document.getElementById(config.containerId);
      if (!this.container) {
        throw new GameEngineError(
          `Container element with id '${config.containerId}' not found`,
          {
            component: 'GameEngine',
            action: 'initialize',
            severity: ErrorSeverity.CRITICAL,
          }
        );
      }

      // Clear any existing content
      this.container.innerHTML = '';

      // Initialize renderer with container dimensions
      const width = config.width || this.container.clientWidth;
      const height = config.height || this.container.clientHeight;

      this.debugService.log('GameEngine', 'Container dimensions', { width, height });

      // Update camera aspect ratio based on container size
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();

      // Initialize renderer
      this.rendererService.initializeRenderer({
        width,
        height,
        antialias: true,
      });

      // Enable input handling
      this.inputService.enable();

      // Set up scene
      this.setupScene();

      // Add renderer to container
      const renderer = this.rendererService.getRenderer();
      this.domElement = renderer.domElement;
      this.container.appendChild(this.domElement);

      // Set up event listeners
      this.setupEventListeners();

      // Create level
      this.levelService.createLevel(this.scene);

      // Add debug helpers
      if (this.debug) {
        // Grid helper
        const gridHelper = new THREE.GridHelper(20, 20, 0x000000, 0x000000);
        this.scene.add(gridHelper);

        // Axes helper
        const axesHelper = new THREE.AxesHelper(5);
        this.scene.add(axesHelper);

        this.debugService.log('GameEngine', 'Debug helpers added', {
          helpers: ['grid', 'axes']
        });
      }

      this.debugService.log('GameEngine', 'Initialization complete', {
        sceneObjects: this.scene.children.length,
        rendererInitialized: !!this.domElement,
        containerSize: {
          width: this.container.clientWidth,
          height: this.container.clientHeight
        },
        domElement: {
          width: this.domElement.clientWidth,
          height: this.domElement.clientHeight
        }
      });

    } catch (error) {
      if (error instanceof GameEngineError) {
        this.errorService.handleError(error);
      } else {
        this.errorService.handleError(
          new GameEngineError(
            'Failed to initialize game engine',
            {
              component: 'GameEngine',
              action: 'initialize',
              severity: ErrorSeverity.CRITICAL,
              additionalData: { error },
            }
          )
        );
      }
      throw error;
    }
  }

  /**
   * Start the game loop
   */
  public start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.debugService.log('GameEngine', 'Starting game loop');
    this.gameLoop();
  }

  /**
   * Stop the game loop
   */
  public stop(): void {
    this.debugService.log('GameEngine', 'Stopping game loop');
    this.isRunning = false;
  }

  /**
   * Main game loop using fixed time step
   */
  private gameLoop(): void {
    if (!this.isRunning) return;

    this.frameCount++;
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastFrameTime) / 1000;
    this.lastFrameTime = currentTime;

    this.accumulator += deltaTime;

    try {
      // Update game state with fixed time step
      while (this.accumulator >= this.fixedTimeStep) {
        this.update(this.fixedTimeStep);
        this.accumulator -= this.fixedTimeStep;
      }

      // Render the scene
      this.render();

      // Log every 60 frames
      if (this.debug && this.frameCount % 60 === 0) {
        this.debugService.log('GameEngine', 'Game loop cycle', {
          frameCount: this.frameCount,
          deltaTime,
          accumulator: this.accumulator,
          isRunning: this.isRunning,
          sceneObjects: this.scene.children.length,
          cameraPosition: this.camera.position.toArray(),
          input: this.inputService.getState()
        });
      }

      // Schedule next frame
      requestAnimationFrame(() => this.gameLoop());

    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Game loop error',
          {
            component: 'GameEngine',
            action: 'gameLoop',
            severity: ErrorSeverity.HIGH,
            additionalData: { error },
          }
        )
      );
      this.stop();
    }
  }

  /**
   * Update game state
   */
  private update(deltaTime: number): void {
    // Cap deltaTime to prevent large jumps
    const cappedDeltaTime = Math.min(deltaTime, 0.1);
    
    // Update platforms with capped deltaTime
    this.levelService.updatePlatforms(cappedDeltaTime);
    
    // Handle input
    this.handleInput(cappedDeltaTime);
    
    // Update physics
    this.physicsService.update(cappedDeltaTime);

    // Constrain objects to level bounds and handle platform collisions
    this.objects.forEach((object: PhysicsObject, id: string) => {
      const position = object.mesh.position.clone();
      const geometry = object.mesh.geometry as THREE.SphereGeometry;
      const radius = geometry.parameters.radius;

      // Check platform collisions
      const platforms = this.levelService.getPlatforms();
      let isOnPlatform = false;

      platforms.forEach(platform => {
        const collision = platform.checkSphereCollision(
          position,
          radius,
          object.velocity,
          cappedDeltaTime
        );
        
        if (collision.collides && collision.normal) {
          isOnPlatform = collision.normal.y > 0.5; // Top collision

          // Handle platform-specific effects
          if (collision.platformEffect) {
            const { boostForce, bounceForce } = collision.platformEffect;
            
            if (boostForce) {
              // Apply boost in the direction the player is moving
              const moveDir = object.velocity.clone().normalize();
              object.velocity.add(moveDir.multiplyScalar(boostForce * 10));
              this.debugService.log('GameEngine', 'Boost applied', {
                force: boostForce,
                velocity: object.velocity.toArray()
              });
            }
            
            if (bounceForce) {
              // Enhanced bounce effect
              object.velocity.y = Math.abs(object.velocity.y) * bounceForce * 2;
              this.debugService.log('GameEngine', 'Bounce applied', {
                force: bounceForce,
                velocity: object.velocity.toArray()
              });
            }
          }

          // Calculate reflection vector
          const dot = object.velocity.dot(collision.normal);
          if (dot < 0) { // Only reflect if moving towards the platform
            const reflection = new THREE.Vector3();
            reflection.copy(collision.normal).multiplyScalar(-2 * dot);
            object.velocity.add(reflection);
            object.velocity.multiplyScalar(object.restitution);

            // Resolve penetration
            if (collision.penetration) {
              const resolution = collision.normal.clone().multiplyScalar(collision.penetration);
              object.mesh.position.add(resolution);
            }

            // Apply platform velocity for moving platforms
            const platformVel = platform.getVelocity();
            if (platformVel.length() > 0) {
              object.velocity.add(platformVel.multiplyScalar(0.8));
            }

            // Apply friction to horizontal velocity components
            if (isOnPlatform) {
              object.velocity.x *= 0.8;
              object.velocity.z *= 0.8;
            }
          }
        }
      });

      // Check level bounds
      const constrainedPosition = this.levelService.constrainPosition(position);
      if (!position.equals(constrainedPosition)) {
        object.mesh.position.copy(constrainedPosition);
        // Reflect velocity when hitting bounds
        if (position.x !== constrainedPosition.x) {
          object.velocity.x *= -object.restitution;
        }
        if (position.y !== constrainedPosition.y) {
          object.velocity.y *= -object.restitution;
        }
        if (position.z !== constrainedPosition.z) {
          object.velocity.z *= -object.restitution;
        }
      }
    });
    
    // Force scene update
    this.scene.updateMatrixWorld(true);
  }

  /**
   * Handle player input
   */
  private handleInput(deltaTime: number): void {
    const input = this.inputService.getState();
    const moveForce = this.movementConfig.moveForce * deltaTime;
    const jumpForce = this.movementConfig.jumpForce;

    // Get player ball
    const playerBall = this.objects.get('player-ball');
    if (!playerBall) return;

    const position = playerBall.mesh.position;
    const geometry = playerBall.mesh.geometry as THREE.SphereGeometry;
    const radius = geometry.parameters.radius;

    // Check ground and platform collisions for grounded state
    let isGrounded = false;

    // Ground check using sphere collision
    if (position.y <= radius + 0.1) {
      isGrounded = true;
    } else {
      // Platform check using new collision detection
      const platforms = this.levelService.getPlatforms();
      platforms.forEach(platform => {
        const collision = platform.checkSphereCollision(
          position,
          radius,
          playerBall.velocity,
          deltaTime
        );
        
        if (collision.collides && collision.normal && collision.normal.y > 0.5) {
          isGrounded = true;
        }
      });
    }

    // Apply horizontal movement with air control
    const controlMultiplier = isGrounded ? 1 : this.movementConfig.airControl;
    if (input.left) {
      this.applyImpulse('player-ball', new THREE.Vector3(-moveForce * controlMultiplier, 0, 0));
    }
    if (input.right) {
      this.applyImpulse('player-ball', new THREE.Vector3(moveForce * controlMultiplier, 0, 0));
    }

    // Apply forward/backward movement
    if (input.up) {
      this.applyImpulse('player-ball', new THREE.Vector3(0, 0, -moveForce * controlMultiplier));
    }
    if (input.down) {
      this.applyImpulse('player-ball', new THREE.Vector3(0, 0, moveForce * controlMultiplier));
    }

    // Apply jump force only when grounded
    if (input.jump && isGrounded) {
      this.applyImpulse('player-ball', new THREE.Vector3(0, jumpForce, 0));
      
      if (this.debug) {
        this.debugService.log('GameEngine', 'Jump applied', {
          position: position.toArray(),
          force: jumpForce,
          isGrounded
        });
      }
    }
  }

  /**
   * Render the current frame
   */
  private render(): void {
    if (!this.domElement || !this.domElement.isConnected) {
      this.debugService.log('GameEngine', 'Render skipped - DOM element not connected');
      return;
    }
    this.rendererService.render(this.scene, this.camera);
  }

  /**
   * Add an object to the scene with physics
   */
  public addPhysicsObject(
    object: THREE.Mesh,
    id: string,
    options: {
      mass?: number;
      restitution?: number;
      friction?: number;
    } = {}
  ): void {
    try {
      object.castShadow = true;
      object.receiveShadow = true;
      this.scene.add(object);
      this.physicsService.addObject(id, object, options);
      
      // Add to tracked objects
      this.objects.set(id, {
        mesh: object,
        velocity: new THREE.Vector3(),
        restitution: options.restitution ?? 0.5
      });
      
      this.debugService.log('GameEngine', `Added physics object ${id}`, {
        position: object.position.toArray(),
        options,
        sceneObjects: this.scene.children.length
      });
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to add physics object',
          {
            component: 'GameEngine',
            action: 'addPhysicsObject',
            severity: ErrorSeverity.MEDIUM,
            additionalData: { error },
          }
        )
      );
    }
  }

  /**
   * Get instance of the game engine
   * This method should be overridden by child classes
   */
  public static getInstance(): GameEngine {
    throw new Error('getInstance must be implemented by child class');
  }

  /**
   * Remove an object from the scene and physics system
   */
  public removePhysicsObject(object: THREE.Mesh, id: string): void {
    try {
      this.scene.remove(object);
      this.physicsService.removeObject(id);
      this.objects.delete(id);
      this.debugService.log('GameEngine', `Removed physics object: ${id}`);
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to remove physics object',
          {
            component: 'GameEngine',
            action: 'removePhysicsObject',
            severity: ErrorSeverity.MEDIUM,
            additionalData: { error },
          }
        )
      );
    }
  }

  /**
   * Apply an impulse force to a physics object
   */
  public applyImpulse(id: string, force: THREE.Vector3): void {
    this.debugService.log('GameEngine', `Applying impulse to ${id}`, {
      force: force.toArray()
    });
    this.physicsService.applyImpulse(id, force);
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.stop();
    this.rendererService.dispose();
    this.inputService.dispose();
    this.levelService.dispose();
    window.removeEventListener('resize', this.handleResize.bind(this));
    if (this.container && this.domElement) {
      this.container.removeChild(this.domElement);
    }
    this.debugService.log('GameEngine', 'Game engine disposed');
  }

  /**
   * Set up event listeners for window resize
   */
  private setupEventListeners(): void {
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  /**
   * Handle window resize events
   */
  private handleResize(): void {
    if (!this.container) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.rendererService.handleResize(width, height);
  }

  /**
   * Set up the Three.js scene with basic elements
   */
  private setupScene(): void {
    try {
      // Add ambient light with reduced intensity for better shadow contrast
      const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
      this.scene.add(ambientLight);

      // Add directional light with shadow
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
      directionalLight.position.set(5, 15, 5);
      directionalLight.castShadow = true;
      
      // Configure shadow properties
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = 2048;
      directionalLight.shadow.camera.near = 0.5;
      directionalLight.shadow.camera.far = 50;
      directionalLight.shadow.camera.left = -10;
      directionalLight.shadow.camera.right = 10;
      directionalLight.shadow.camera.top = 10;
      directionalLight.shadow.camera.bottom = -10;
      directionalLight.shadow.bias = -0.001;
      
      this.scene.add(directionalLight);

      this.debugService.log('GameEngine', 'Scene lighting setup', {
        ambientLight: {
          color: ambientLight.color.getHexString(),
          intensity: ambientLight.intensity
        },
        directionalLight: {
          position: directionalLight.position.toArray(),
          intensity: directionalLight.intensity,
          shadowMapSize: {
            width: directionalLight.shadow.mapSize.width,
            height: directionalLight.shadow.mapSize.height
          }
        }
      });

      // Add light helpers only in debug mode
      if (this.debug) {
        // Add light helper
        const lightHelper = new THREE.DirectionalLightHelper(directionalLight, 5);
        this.scene.add(lightHelper);

        // Add shadow camera helper
        const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
        this.scene.add(shadowHelper);

        this.debugService.log('GameEngine', 'Light helpers added');
      }

    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to setup scene',
          {
            component: 'GameEngine',
            action: 'setupScene',
            severity: ErrorSeverity.HIGH,
            additionalData: { error },
          }
        )
      );
    }
  }
}

export default GameEngine;
