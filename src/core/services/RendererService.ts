import * as THREE from 'three';
import ErrorService, { GameEngineError, ErrorSeverity } from './ErrorService';
import DebugService from './DebugService';

/**
 * Configuration options for the renderer
 */
interface RendererConfig {
  width: number;
  height: number;
  antialias?: boolean;
  pixelRatio?: number;
}

/**
 * Service responsible for managing Three.js WebGL renderer
 * Handles renderer initialization, resizing, and performance monitoring
 */
class RendererService {
  private static instance: RendererService;
  private renderer!: THREE.WebGLRenderer;
  private errorService: ErrorService;
  private debugService: DebugService;
  private fps: number = 0;
  private frameCount: number = 0;
  private lastTime: number = 0;
  private readonly targetFps: number = 60;
  private isInitialized: boolean = false;
  private readonly debug: boolean = import.meta.env.DEV;

  private constructor() {
    this.errorService = ErrorService.getInstance();
    this.debugService = DebugService.getInstance();
    this.debugService.log('RendererService', 'Instance created');
  }

  public static getInstance(): RendererService {
    if (!RendererService.instance) {
      RendererService.instance = new RendererService();
    }
    return RendererService.instance;
  }

  /**
   * Initialize the WebGL renderer with error handling
   */
  public initializeRenderer(config: RendererConfig): void {
    try {
      this.debugService.log('RendererService', 'Initializing renderer', config);

      // Check for WebGL support
      if (!this.checkWebGLSupport()) {
        throw new GameEngineError(
          'WebGL is not supported in this browser',
          {
            component: 'RendererService',
            action: 'initializeRenderer',
            severity: ErrorSeverity.CRITICAL,
          }
        );
      }

      // Create renderer with specific parameters
      this.renderer = new THREE.WebGLRenderer({
        antialias: config.antialias,
        alpha: false,
        stencil: false,
        precision: 'highp',
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: true,
      });

      // Configure renderer
      this.renderer.setSize(config.width, config.height);
      this.renderer.setPixelRatio(Math.min(config.pixelRatio || window.devicePixelRatio, 2));
      this.renderer.setClearColor(0x87ceeb, 1);
      
      // Enable shadows
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      
      // Configure output encoding
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1;

      // Force the renderer to clear on first frame
      this.renderer.clear();

      // Add performance monitoring
      this.setupPerformanceMonitoring();
      
      this.isInitialized = true;

      this.debugService.log('RendererService', 'Renderer initialized', {
        size: this.renderer.getSize(new THREE.Vector2()),
        pixelRatio: this.renderer.getPixelRatio(),
        shadowsEnabled: this.renderer.shadowMap.enabled,
        colorSpace: this.renderer.outputColorSpace,
        capabilities: {
          maxTextures: this.renderer.capabilities.maxTextures,
          maxAttributes: this.renderer.capabilities.maxAttributes,
          precision: this.renderer.capabilities.precision
        }
      });

    } catch (error) {
      if (error instanceof GameEngineError) {
        this.errorService.handleError(error);
      } else {
        this.errorService.handleError(
          new GameEngineError(
            'Failed to initialize renderer',
            {
              component: 'RendererService',
              action: 'initializeRenderer',
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
   * Check if WebGL is supported in the current browser
   */
  private checkWebGLSupport(): boolean {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const supported = !!gl;
      this.debugService.log('RendererService', 'WebGL support check', {
        supported,
        version: gl?.getParameter(gl.VERSION),
        vendor: gl?.getParameter(gl.VENDOR),
        renderer: gl?.getParameter(gl.RENDERER)
      });
      return supported;
    } catch (e) {
      return false;
    }
  }

  /**
   * Set up FPS monitoring and performance tracking
   */
  private setupPerformanceMonitoring(): void {
    this.lastTime = performance.now();
    this.monitorPerformance();
  }

  /**
   * Monitor renderer performance and FPS
   */
  private monitorPerformance(): void {
    const currentTime = performance.now();
    this.frameCount++;

    if (currentTime - this.lastTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastTime = currentTime;

      if (this.debug) {
        const info = this.renderer.info;
        this.debugService.log('RendererService', 'Performance stats', {
          fps: this.fps,
          drawCalls: info.render.calls,
          triangles: info.render.triangles,
          geometries: info.memory.geometries,
          textures: info.memory.textures
        });
      }
    }

    requestAnimationFrame(() => this.monitorPerformance());
  }

  /**
   * Get the WebGL renderer instance
   */
  public getRenderer(): THREE.WebGLRenderer {
    if (!this.isInitialized) {
      throw new GameEngineError(
        'Renderer not initialized',
        {
          component: 'RendererService',
          action: 'getRenderer',
          severity: ErrorSeverity.CRITICAL,
        }
      );
    }
    return this.renderer;
  }

  /**
   * Render a scene with a camera
   */
  public render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.isInitialized) {
      throw new GameEngineError(
        'Cannot render: Renderer not initialized',
        {
          component: 'RendererService',
          action: 'render',
          severity: ErrorSeverity.CRITICAL,
        }
      );
    }

    try {
      // Ensure scene and camera matrices are up to date
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();

      // Log scene state before rendering (every 60 frames)
      if (this.debug && this.frameCount % 60 === 0) {
        this.debugService.log('RendererService', 'Pre-render state', {
          sceneObjects: scene.children.length,
          cameraPosition: camera.position.toArray(),
          rendererSize: this.renderer.getSize(new THREE.Vector2()),
        });
      }

      // Render the scene
      this.renderer.render(scene, camera);

    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to render scene',
          {
            component: 'RendererService',
            action: 'render',
            severity: ErrorSeverity.HIGH,
            additionalData: { error },
          }
        )
      );
    }
  }

  /**
   * Handle window resize events
   */
  public handleResize(width: number, height: number): void {
    if (!this.isInitialized) {
      throw new GameEngineError(
        'Cannot resize: Renderer not initialized',
        {
          component: 'RendererService',
          action: 'handleResize',
          severity: ErrorSeverity.CRITICAL,
        }
      );
    }

    try {
      this.renderer.setSize(width, height, false);
      this.debugService.log('RendererService', 'Renderer resized', {
        width,
        height,
        pixelRatio: this.renderer.getPixelRatio()
      });
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to resize renderer',
          {
            component: 'RendererService',
            action: 'handleResize',
            severity: ErrorSeverity.MEDIUM,
            additionalData: { width, height, error },
          }
        )
      );
    }
  }

  /**
   * Get current FPS
   */
  public getFPS(): number {
    return this.fps;
  }

  /**
   * Clean up renderer resources
   */
  public dispose(): void {
    if (this.isInitialized && this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.isInitialized = false;
      this.debugService.log('RendererService', 'Renderer disposed');
    }
  }
}

export default RendererService;
