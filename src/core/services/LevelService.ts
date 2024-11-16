import * as THREE from 'three';
import ErrorService, { GameEngineError, ErrorSeverity } from './ErrorService';
import DebugService from './DebugService';
import Platform, { PlatformConfig, PlatformType } from '../entities/Platform';

/**
 * Track configuration
 */
interface TrackConfig {
  width: number;      // Fixed width of the track
  length: number;     // Length of the track (extends forward)
  gridSize: number;   // Size of grid cells for platform placement
  lanes: number;      // Number of horizontal lanes
  layers: number;     // Number of vertical layers
}

/**
 * Grid position for platform placement
 */
interface GridPosition {
  lane: number;       // Horizontal position (0 to lanes-1)
  section: number;    // Forward position (0 to length/gridSize)
  layer: number;      // Vertical position (0 to layers-1)
}

/**
 * Race track configuration
 */
interface RaceTrackConfig {
  name: string;
  difficulty: 'easy' | 'medium' | 'hard';
  checkpoints: string[];  // Array of platform IDs representing checkpoints in order
  startPlatformId: string;
  finishPlatformId: string;
  trackLength: number;    // Length of the track in grid sections
}

/**
 * Service for managing race track and platforms
 */
class LevelService {
  private static instance: LevelService;
  private errorService: ErrorService;
  private debugService: DebugService;
  private trackConfig: TrackConfig;
  private platforms: Map<string, Platform> = new Map();
  private readonly debug: boolean = import.meta.env.DEV;
  private raceTrackConfig: RaceTrackConfig | null = null;
  private nextCheckpointIndex: number = 0;
  private gridHelper: THREE.GridHelper | null = null;

  private constructor() {
    this.errorService = ErrorService.getInstance();
    this.debugService = DebugService.getInstance();
    
    // Default track configuration
    this.trackConfig = {
      width: 20,          // 20 units wide
      length: 100,        // 100 units long
      gridSize: 2,        // 2x2 grid cells
      lanes: 10,          // 10 lanes across
      layers: 5           // 5 vertical layers
    };

    this.debugService.log('LevelService', 'Service initialized', {
      trackConfig: this.trackConfig
    });
  }

  public static getInstance(): LevelService {
    if (!LevelService.instance) {
      LevelService.instance = new LevelService();
    }
    return LevelService.instance;
  }

  /**
   * Create race track
   */
  public createLevel(scene: THREE.Scene): void {
    try {
      // Create grid helper for visualization
      this.createGridHelper(scene);

      // Create a test track
      this.createTestTrack(scene);

      this.debugService.log('LevelService', 'Track created', {
        config: this.trackConfig,
        platforms: this.platforms.size
      });
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to create track',
          {
            component: 'LevelService',
            action: 'createLevel',
            severity: ErrorSeverity.CRITICAL,
            additionalData: { error },
          }
        )
      );
    }
  }

  /**
   * Create grid helper for visualization
   */
  private createGridHelper(scene: THREE.Scene): void {
    // Remove existing grid helper if any
    if (this.gridHelper) {
      scene.remove(this.gridHelper);
    }

    // Create new grid helper
    this.gridHelper = new THREE.GridHelper(
      Math.max(this.trackConfig.width, this.trackConfig.length),
      Math.max(this.trackConfig.lanes, this.trackConfig.length / this.trackConfig.gridSize),
      0x444444,
      0x888888
    );
    
    // Rotate grid to extend forward
    this.gridHelper.rotation.x = Math.PI / 2;
    this.gridHelper.position.y = 0.01; // Slightly above ground level
    
    scene.add(this.gridHelper);
  }

  /**
   * Convert grid position to world position
   */
  private gridToWorld(gridPos: GridPosition): THREE.Vector3 {
    const x = (gridPos.lane - (this.trackConfig.lanes / 2)) * this.trackConfig.gridSize;
    const y = gridPos.layer * this.trackConfig.gridSize;
    const z = -gridPos.section * this.trackConfig.gridSize; // Negative Z is forward
    return new THREE.Vector3(x, y, z);
  }

  /**
   * Convert world position to grid position
   */
  private worldToGrid(worldPos: THREE.Vector3): GridPosition {
    return {
      lane: Math.round((worldPos.x / this.trackConfig.gridSize) + (this.trackConfig.lanes / 2)),
      layer: Math.round(worldPos.y / this.trackConfig.gridSize),
      section: Math.round(-worldPos.z / this.trackConfig.gridSize)
    };
  }

  /**
   * Create test track with various platform types
   */
  private createTestTrack(scene: THREE.Scene): void {
    // Create a start platform at the beginning
    const startPlatform = new Platform({
      width: this.trackConfig.gridSize * 2,
      height: 0.5,
      depth: this.trackConfig.gridSize,
      position: this.gridToWorld({ lane: 5, section: 1, layer: 0 }),
      type: PlatformType.START
    });
    this.addPlatform('start', startPlatform, scene);

    // Add some normal platforms along the track
    for (let i = 3; i < 10; i += 2) {
      const platform = new Platform({
        width: this.trackConfig.gridSize,
        height: 0.5,
        depth: this.trackConfig.gridSize,
        position: this.gridToWorld({ lane: (i % 7) + 2, section: i, layer: 1 }),
        type: PlatformType.NORMAL
      });
      this.addPlatform(`platform${i}`, platform, scene);
    }

    // Add checkpoints
    const checkpoint1 = new Platform({
      width: this.trackConfig.gridSize * 2,
      height: 0.5,
      depth: this.trackConfig.gridSize,
      position: this.gridToWorld({ lane: 5, section: 15, layer: 1 }),
      type: PlatformType.CHECKPOINT,
      checkpointIndex: 0
    });
    this.addPlatform('checkpoint1', checkpoint1, scene);

    // Add a finish platform at the end
    const finishPlatform = new Platform({
      width: this.trackConfig.gridSize * 2,
      height: 0.5,
      depth: this.trackConfig.gridSize,
      position: this.gridToWorld({ lane: 5, section: 30, layer: 1 }),
      type: PlatformType.FINISH
    });
    this.addPlatform('finish', finishPlatform, scene);

    // Configure the race track
    this.raceTrackConfig = {
      name: 'Test Track',
      difficulty: 'easy',
      startPlatformId: 'start',
      finishPlatformId: 'finish',
      checkpoints: ['checkpoint1'],
      trackLength: 30 * this.trackConfig.gridSize // 30 sections
    };
  }

  /**
   * Add a platform to the track
   */
  public addPlatform(id: string, platform: Platform, scene: THREE.Scene): void {
    try {
      scene.add(platform.getMesh());
      this.platforms.set(id, platform);

      this.debugService.log('LevelService', `Added platform ${id}`, {
        position: platform.getPosition().toArray(),
        gridPosition: this.worldToGrid(platform.getPosition()),
        dimensions: platform.getDimensions(),
        type: platform.getType()
      });
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to add platform',
          {
            component: 'LevelService',
            action: 'addPlatform',
            severity: ErrorSeverity.MEDIUM,
            additionalData: { id, error },
          }
        )
      );
    }
  }

  /**
   * Remove a platform from the track
   */
  public removePlatform(id: string, scene: THREE.Scene): void {
    try {
      const platform = this.platforms.get(id);
      if (platform) {
        scene.remove(platform.getMesh());
        platform.dispose();
        this.platforms.delete(id);
        this.debugService.log('LevelService', `Removed platform ${id}`);
      }
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to remove platform',
          {
            component: 'LevelService',
            action: 'removePlatform',
            severity: ErrorSeverity.MEDIUM,
            additionalData: { id, error },
          }
        )
      );
    }
  }

  /**
   * Update all platforms
   */
  public updatePlatforms(deltaTime: number): void {
    this.platforms.forEach((platform) => {
      platform.update(deltaTime);
    });
  }

  /**
   * Get track configuration
   */
  public getTrackConfig(): TrackConfig {
    return { ...this.trackConfig };
  }

  /**
   * Set track configuration
   */
  public setTrackConfig(config: Partial<TrackConfig>): void {
    this.trackConfig = {
      ...this.trackConfig,
      ...config
    };
    this.debugService.log('LevelService', 'Track config updated', {
      trackConfig: this.trackConfig
    });
  }

  /**
   * Get all platforms
   */
  public getPlatforms(): Map<string, Platform> {
    return this.platforms;
  }

  /**
   * Check if a point is on any platform
   */
  public isPointOnPlatform(point: THREE.Vector3): boolean {
    return Array.from(this.platforms.values()).some(platform => 
      platform.isPointOnPlatform(point)
    );
  }

  /**
   * Constrain a position to track bounds
   */
  public constrainPosition(position: THREE.Vector3): THREE.Vector3 {
    const halfWidth = this.trackConfig.width / 2;
    position.x = Math.max(-halfWidth, Math.min(halfWidth, position.x));
    position.y = Math.max(0, position.y);
    position.z = Math.max(-this.trackConfig.length, Math.min(0, position.z));
    return position;
  }

  /**
   * Get track progress (0 to 1)
   */
  public getTrackProgress(position: THREE.Vector3): number {
    return Math.abs(position.z) / this.trackConfig.length;
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.platforms.forEach((platform) => {
      platform.dispose();
    });
    this.platforms.clear();
    this.raceTrackConfig = null;
    this.debugService.log('LevelService', 'Resources disposed');
  }
}

export default LevelService;
export type { TrackConfig, GridPosition, RaceTrackConfig };
