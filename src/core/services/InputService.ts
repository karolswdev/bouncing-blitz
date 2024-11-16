import ErrorService, { GameEngineError, ErrorSeverity } from './ErrorService';
import DebugService from './DebugService';

/**
 * Input state interface
 */
interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
}

/**
 * Input configuration
 */
interface InputConfig {
  keyBindings: {
    left: string[];
    right: string[];
    up: string[];
    down: string[];
    jump: string[];
  };
}

/**
 * Service for handling user input
 */
class InputService {
  private static instance: InputService;
  private errorService: ErrorService;
  private debugService: DebugService;
  private state: InputState;
  private config: InputConfig;
  private isEnabled: boolean = false;
  private readonly debug: boolean = import.meta.env.DEV;
  private isEditorModalOpen: boolean = false;
  private boundHandleKeyDown: (event: KeyboardEvent) => void;
  private boundHandleKeyUp: (event: KeyboardEvent) => void;

  private constructor() {
    this.errorService = ErrorService.getInstance();
    this.debugService = DebugService.getInstance();
    
    // Initialize input state
    this.state = {
      left: false,
      right: false,
      up: false,
      down: false,
      jump: false,
    };

    // Default key bindings
    this.config = {
      keyBindings: {
        left: ['ArrowLeft', 'a', 'A'],
        right: ['ArrowRight', 'd', 'D'],
        up: ['ArrowUp', 'w', 'W'],
        down: ['ArrowDown', 's', 'S'],
        jump: ['Space', ' '],
      },
    };

    // Bind event handlers to maintain context
    this.boundHandleKeyDown = this.handleKeyDown.bind(this);
    this.boundHandleKeyUp = this.handleKeyUp.bind(this);

    this.debugService.log('InputService', 'Service initialized', {
      keyBindings: this.config.keyBindings
    });
  }

  public static getInstance(): InputService {
    if (!InputService.instance) {
      InputService.instance = new InputService();
    }
    return InputService.instance;
  }

  /**
   * Enable input handling
   */
  public enable(): void {
    if (this.isEnabled) return;

    window.addEventListener('keydown', this.boundHandleKeyDown);
    window.addEventListener('keyup', this.boundHandleKeyUp);
    this.isEnabled = true;

    this.debugService.log('InputService', 'Input handling enabled');
  }

  /**
   * Disable input handling
   */
  public disable(): void {
    if (!this.isEnabled) return;

    window.removeEventListener('keydown', this.boundHandleKeyDown);
    window.removeEventListener('keyup', this.boundHandleKeyUp);
    this.isEnabled = false;

    // Reset state
    this.resetState();

    this.debugService.log('InputService', 'Input handling disabled');
  }

  /**
   * Set editor modal state
   */
  public setEditorModalOpen(isOpen: boolean): void {
    this.isEditorModalOpen = isOpen;
    if (isOpen) {
      // Reset all game controls when modal opens
      this.resetState();
    }
    this.debugService.log('InputService', 'Editor modal state changed', { isOpen });
  }

  /**
   * Handle keydown events
   */
  private handleKeyDown(event: KeyboardEvent): void {
    try {
      // If editor modal is open, only handle editor-specific keys
      if (this.isEditorModalOpen) {
        // Allow only specific keys when modal is open (e.g., Escape to close)
        if (event.key === 'Escape') {
          this.debugService.log('InputService', 'Editor modal key handled', { key: event.key });
          return;
        }
        // Ignore all other keys
        return;
      }

      // Prevent default for game controls
      if (this.isGameControl(event.key)) {
        event.preventDefault();
      }

      // Update state based on key
      this.updateState(event.key, true);

      if (this.debug) {
        this.debugService.log('InputService', 'Key down', {
          key: event.key,
          state: { ...this.state },
          editorModalOpen: this.isEditorModalOpen
        });
      }
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to handle keydown',
          {
            component: 'InputService',
            action: 'handleKeyDown',
            severity: ErrorSeverity.MEDIUM,
            additionalData: { key: event.key, error },
          }
        )
      );
    }
  }

  /**
   * Handle keyup events
   */
  private handleKeyUp(event: KeyboardEvent): void {
    try {
      // If editor modal is open, ignore game controls
      if (this.isEditorModalOpen) {
        return;
      }

      // Update state based on key
      this.updateState(event.key, false);

      if (this.debug) {
        this.debugService.log('InputService', 'Key up', {
          key: event.key,
          state: { ...this.state },
          editorModalOpen: this.isEditorModalOpen
        });
      }
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to handle keyup',
          {
            component: 'InputService',
            action: 'handleKeyUp',
            severity: ErrorSeverity.MEDIUM,
            additionalData: { key: event.key, error },
          }
        )
      );
    }
  }

  /**
   * Update input state based on key
   */
  private updateState(key: string, isDown: boolean): void {
    Object.entries(this.config.keyBindings).forEach(([action, keys]) => {
      if (keys.includes(key)) {
        this.state[action as keyof InputState] = isDown;
      }
    });
  }

  /**
   * Reset input state
   */
  private resetState(): void {
    Object.keys(this.state).forEach(key => {
      this.state[key as keyof InputState] = false;
    });
    this.debugService.log('InputService', 'Input state reset');
  }

  /**
   * Check if a key is used for game controls
   */
  private isGameControl(key: string): boolean {
    return Object.values(this.config.keyBindings)
      .some(keys => keys.includes(key));
  }

  /**
   * Get current input state
   */
  public getState(): InputState {
    // If editor modal is open, return inactive state
    if (this.isEditorModalOpen) {
      return {
        left: false,
        right: false,
        up: false,
        down: false,
        jump: false,
      };
    }
    return { ...this.state };
  }

  /**
   * Check if a specific input is active
   */
  public isActive(input: keyof InputState): boolean {
    // If editor modal is open, all game controls are inactive
    if (this.isEditorModalOpen) {
      return false;
    }
    return this.state[input];
  }

  /**
   * Update key bindings
   */
  public updateKeyBindings(newBindings: Partial<InputConfig['keyBindings']>): void {
    try {
      this.config.keyBindings = {
        ...this.config.keyBindings,
        ...newBindings,
      };

      this.debugService.log('InputService', 'Key bindings updated', {
        keyBindings: this.config.keyBindings
      });
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to update key bindings',
          {
            component: 'InputService',
            action: 'updateKeyBindings',
            severity: ErrorSeverity.MEDIUM,
            additionalData: { newBindings, error },
          }
        )
      );
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.disable();
    this.debugService.log('InputService', 'Service disposed');
  }
}

export default InputService;
