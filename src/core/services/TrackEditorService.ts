import * as THREE from 'three';
import ErrorService, { GameEngineError, ErrorSeverity } from './ErrorService';
import DebugService from './DebugService';
import LevelService, { RaceTrackConfig } from './LevelService';
import Platform, { PlatformConfig, PlatformType } from '../entities/Platform';

/**
 * Track editor mode
 */
export enum EditorMode {
  PLACE = 'place',
  EDIT = 'edit',
  DELETE = 'delete'
}

/**
 * Track editor state
 */
export interface EditorState {
  mode: EditorMode;
  selectedPlatformType: PlatformType;
  selectedPlatform: string | null;
  isModified: boolean;
}

/**
 * Track save data
 */
export interface TrackSaveData {
  name: string;
  difficulty: 'easy' | 'medium' | 'hard';
  platforms: {
    id: string;
    config: PlatformConfig;
    type: PlatformType;
  }[];
  checkpoints: string[];
  startPlatformId: string;
  finishPlatformId: string;
  version: string;
}

/**
 * Service for creating and editing race tracks
 */
class TrackEditorService {
  private static instance: TrackEditorService;
  private errorService: ErrorService;
  private debugService: DebugService;
  private levelService: LevelService;
  private scene: THREE.Scene | null = null;
  private state: EditorState = {
    mode: EditorMode.PLACE,
    selectedPlatformType: PlatformType.NORMAL,
    selectedPlatform: null,
    isModified: false
  };
  private readonly debug: boolean = import.meta.env.DEV;
  private nextPlatformId: number = 0;

  private constructor() {
    this.errorService = ErrorService.getInstance();
    this.debugService = DebugService.getInstance();
    this.levelService = LevelService.getInstance();
  }

  public static getInstance(): TrackEditorService {
    if (!TrackEditorService.instance) {
      TrackEditorService.instance = new TrackEditorService();
    }
    return TrackEditorService.instance;
  }

  /**
   * Initialize the track editor
   */
  public initialize(scene: THREE.Scene): void {
    this.scene = scene;
    this.debugService.log('TrackEditorService', 'Editor initialized');
  }

  /**
   * Set editor mode
   */
  public setMode(mode: EditorMode): void {
    this.state.mode = mode;
    this.debugService.log('TrackEditorService', 'Mode changed', { mode });
  }

  /**
   * Set selected platform type
   */
  public setSelectedPlatformType(type: PlatformType): void {
    this.state.selectedPlatformType = type;
    this.debugService.log('TrackEditorService', 'Platform type selected', { type });
  }

  /**
   * Set platform rotation
   */
  public setPlatformRotation(angle: number): void {
    const selectedPlatformId = this.state.selectedPlatform;
    if (!selectedPlatformId) {
      this.errorService.handleError(new GameEngineError(
        'No platform selected',
        {
          component: 'TrackEditorService',
          action: 'setPlatformRotation',
          severity: ErrorSeverity.MEDIUM
        }
      ));
      return;
    }
    const platform = this.levelService.getPlatforms().get(selectedPlatformId);
    if (!platform) {
      this.errorService.handleError(new GameEngineError(
        'Platform with ID not found',
        {
          component: 'TrackEditorService',
          action: 'setPlatformRotation',
          severity: ErrorSeverity.MEDIUM
        }
      ));
      return;
    }
    platform.setRotation(angle);
    this.state.isModified = true;
    this.debugService.log('TrackEditorService', 'Platform rotation set', { platformId: selectedPlatformId, angle });
  }

  /**
   * Create platform at position
   */
  public createPlatform(position: THREE.Vector3): void {
    if (!this.scene) {
      this.errorService.handleError(
        new GameEngineError(
          'Scene not initialized',
          {
            component: 'TrackEditorService',
            action: 'createPlatform',
            severity: ErrorSeverity.HIGH,
          }
        )
      );
      return;
    }

    try {
      const platformId = `platform_${this.nextPlatformId++}`;
      const platform = new Platform({
        width: 3,
        height: 0.5,
        depth: 3,
        position: position,
        type: this.state.selectedPlatformType
      });

      this.levelService.addPlatform(platformId, platform, this.scene);
      this.state.isModified = true;

      this.debugService.log('TrackEditorService', 'Platform created', {
        id: platformId,
        type: this.state.selectedPlatformType,
        position: position.toArray()
      });
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to create platform',
          {
            component: 'TrackEditorService',
            action: 'createPlatform',
            severity: ErrorSeverity.MEDIUM,
            additionalData: { error },
          }
        )
      );
    }
  }

  /**
   * Delete platform by ID
   */
  public deletePlatform(platformId: string): void {
    if (!this.scene) return;

    try {
      this.levelService.removePlatform(platformId, this.scene);
      if (this.state.selectedPlatform === platformId) {
        this.state.selectedPlatform = null;
      }
      this.state.isModified = true;

      this.debugService.log('TrackEditorService', 'Platform deleted', { platformId });
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to delete platform',
          {
            component: 'TrackEditorService',
            action: 'deletePlatform',
            severity: ErrorSeverity.MEDIUM,
            additionalData: { error, platformId },
          }
        )
      );
    }
  }

  /**
   * Save track to local storage
   */
  public saveTrack(name: string, difficulty: 'easy' | 'medium' | 'hard'): void {
    try {
      const platforms = this.levelService.getPlatforms();
      const saveData: TrackSaveData = {
        name,
        difficulty,
        platforms: [],
        checkpoints: [],
        startPlatformId: '',
        finishPlatformId: '',
        version: '1.0'
      };

      // Save platform data
      platforms.forEach((platform, id) => {
        const config = {
          width: platform.getDimensions().width,
          height: platform.getDimensions().height,
          depth: platform.getDimensions().depth,
          position: platform.getPosition(),
          type: platform.getType()
        };

        saveData.platforms.push({
          id,
          config,
          type: platform.getType()
        });

        // Track special platforms
        switch (platform.getType()) {
          case PlatformType.START:
            saveData.startPlatformId = id;
            break;
          case PlatformType.FINISH:
            saveData.finishPlatformId = id;
            break;
          case PlatformType.CHECKPOINT:
            saveData.checkpoints.push(id);
            break;
        }
      });

      // Save to local storage
      const key = `track_${name.toLowerCase().replace(/\s+/g, '_')}`;
      localStorage.setItem(key, JSON.stringify(saveData));
      this.state.isModified = false;

      this.debugService.log('TrackEditorService', 'Track saved', {
        name,
        platformCount: saveData.platforms.length
      });
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to save track',
          {
            component: 'TrackEditorService',
            action: 'saveTrack',
            severity: ErrorSeverity.HIGH,
            additionalData: { error },
          }
        )
      );
    }
  }

  /**
   * Load track from local storage
   */
  public loadTrack(name: string): void {
    if (!this.scene) return;

    try {
      const key = `track_${name.toLowerCase().replace(/\s+/g, '_')}`;
      const saveData = localStorage.getItem(key);
      
      if (!saveData) {
        throw new Error(`Track '${name}' not found`);
      }

      const trackData: TrackSaveData = JSON.parse(saveData);

      // Clear existing platforms
      this.levelService.getPlatforms().forEach((_, id) => {
        this.levelService.removePlatform(id, this.scene!);
      });

      // Create platforms from save data
      trackData.platforms.forEach(({ id, config }) => {
        const platform = new Platform(config);
        this.levelService.addPlatform(id, platform, this.scene!);
      });

      this.state.isModified = false;

      this.debugService.log('TrackEditorService', 'Track loaded', {
        name,
        platformCount: trackData.platforms.length
      });
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to load track',
          {
            component: 'TrackEditorService',
            action: 'loadTrack',
            severity: ErrorSeverity.HIGH,
            additionalData: { error },
          }
        )
      );
    }
  }

  /**
   * Validate track layout
   */
  public validateTrack(): boolean {
    try {
      const platforms = this.levelService.getPlatforms();
      let hasStart = false;
      let hasFinish = false;
      const checkpoints: string[] = [];

      // Check for required platform types
      platforms.forEach((platform, id) => {
        switch (platform.getType()) {
          case PlatformType.START:
            hasStart = true;
            break;
          case PlatformType.FINISH:
            hasFinish = true;
            break;
          case PlatformType.CHECKPOINT:
            checkpoints.push(id);
            break;
        }
      });

      // Validate track requirements
      const isValid = hasStart && hasFinish && checkpoints.length > 0;

      this.debugService.log('TrackEditorService', 'Track validation', {
        isValid,
        hasStart,
        hasFinish,
        checkpointCount: checkpoints.length
      });

      return isValid;
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to validate track',
          {
            component: 'TrackEditorService',
            action: 'validateTrack',
            severity: ErrorSeverity.MEDIUM,
            additionalData: { error },
          }
        )
      );
      return false;
    }
  }

  /**
   * Get editor state
   */
  public getState(): EditorState {
    return { ...this.state };
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.scene = null;
    this.state = {
      mode: EditorMode.PLACE,
      selectedPlatformType: PlatformType.NORMAL,
      selectedPlatform: null,
      isModified: false
    };
    this.debugService.log('TrackEditorService', 'Resources disposed');
  }
}

export default TrackEditorService;
export { EditorMode, EditorState, TrackSaveData };
