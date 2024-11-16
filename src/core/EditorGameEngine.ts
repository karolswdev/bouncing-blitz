import * as THREE from 'three';
import BaseGameEngine from './BaseGameEngine';
import { GameEngineError, ErrorSeverity } from './services/ErrorService';

/**
 * Editor-specific controls state
 */
interface EditorControls {
  isDragging: boolean;
  previousMousePosition: { x: number; y: number };
}

/**
 * Editor-specific game engine that extends the base game engine
 * with track editing capabilities
 */
class EditorGameEngine extends BaseGameEngine {
  protected static override instance: EditorGameEngine | null = null;
  private editorControls: EditorControls = {
    isDragging: false,
    previousMousePosition: { x: 0, y: 0 }
  };

  protected constructor() {
    super();
  }

  public static override getInstance(): EditorGameEngine {
    if (!EditorGameEngine.instance) {
      EditorGameEngine.instance = new EditorGameEngine();
    }
    return EditorGameEngine.instance;
  }

  /**
   * Override setEditorMode to add editor-specific controls
   */
  public override setEditorMode(enabled: boolean): void {
    super.setEditorMode(enabled);
    if (enabled) {
      this.setupEditorControls();
    } else {
      this.removeEditorControls();
    }
  }

  /**
   * Setup editor controls
   */
  private setupEditorControls(): void {
    if (!this.domElement) return;

    this.domElement.addEventListener('mousedown', this.handleEditorMouseDown);
    this.domElement.addEventListener('mousemove', this.handleEditorMouseMove);
    this.domElement.addEventListener('mouseup', this.handleEditorMouseUp);
    this.domElement.addEventListener('wheel', this.handleEditorWheel);
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Remove editor controls
   */
  private removeEditorControls(): void {
    if (!this.domElement) return;

    this.domElement.removeEventListener('mousedown', this.handleEditorMouseDown);
    this.domElement.removeEventListener('mousemove', this.handleEditorMouseMove);
    this.domElement.removeEventListener('mouseup', this.handleEditorMouseUp);
    this.domElement.removeEventListener('wheel', this.handleEditorWheel);
  }

  private handleEditorMouseDown = (event: MouseEvent): void => {
    if (!this.isEditorMode) return;

    if (event.button === 1) { // Middle mouse button
      this.editorControls.isDragging = true;
      this.editorControls.previousMousePosition = {
        x: event.clientX,
        y: event.clientY
      };
    } else if (event.button === 0) { // Left click
      this.handleEditorClick(event);
    } else if (event.button === 2) { // Right click
      this.handleEditorRightClick(event);
    }
  };

  private handleEditorMouseMove = (event: MouseEvent): void => {
    if (!this.isEditorMode || !this.editorControls.isDragging) return;

    const deltaX = event.clientX - this.editorControls.previousMousePosition.x;
    const deltaY = event.clientY - this.editorControls.previousMousePosition.y;

    // Rotate camera around center point
    const rotationSpeed = 0.01;
    this.camera.position.x = this.camera.position.x * Math.cos(deltaX * rotationSpeed) - 
                            this.camera.position.z * Math.sin(deltaX * rotationSpeed);
    this.camera.position.z = this.camera.position.x * Math.sin(deltaX * rotationSpeed) + 
                            this.camera.position.z * Math.cos(deltaX * rotationSpeed);

    // Update camera height
    this.camera.position.y = Math.max(5, Math.min(30, this.camera.position.y - deltaY * 0.1));

    this.camera.lookAt(0, 0, 0);

    this.editorControls.previousMousePosition = {
      x: event.clientX,
      y: event.clientY
    };
  };

  private handleEditorMouseUp = (): void => {
    this.editorControls.isDragging = false;
  };

  private handleEditorWheel = (event: WheelEvent): void => {
    if (!this.isEditorMode) return;

    // Zoom camera
    const zoomSpeed = 0.001;
    const distance = this.camera.position.length();
    const delta = event.deltaY * zoomSpeed * distance;

    // Calculate new position
    const direction = this.camera.position.clone().normalize();
    const newDistance = Math.max(5, Math.min(40, distance + delta));
    this.camera.position.copy(direction.multiplyScalar(newDistance));
  };

  private handleEditorClick(event: MouseEvent): void {
    if (!this.domElement) return;

    try {
      // Calculate mouse position in normalized device coordinates (-1 to +1)
      const rect = this.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Create raycaster
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);

      // Create a plane at y=0 for intersection
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersectionPoint = new THREE.Vector3();

      // Find intersection point with plane
      if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
        this.trackEditorService.createPlatform(intersectionPoint);
      }
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to handle editor click',
          {
            component: 'EditorGameEngine',
            action: 'handleEditorClick',
            severity: ErrorSeverity.MEDIUM,
            additionalData: { error },
          }
        )
      );
    }
  }

  private handleEditorRightClick(event: MouseEvent): void {
    if (!this.domElement) return;

    try {
      event.preventDefault();

      // Calculate mouse position in normalized device coordinates (-1 to +1)
      const rect = this.domElement.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Create raycaster
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);

      // Get all platforms
      const platforms = Array.from(this.levelService.getPlatforms().values()).map(p => p.getMesh());
      
      // Find intersections
      const intersects = raycaster.intersectObjects(platforms);
      
      if (intersects.length > 0) {
        // Find the platform ID from the mesh
        const platformId = Array.from(this.levelService.getPlatforms().entries())
          .find(([_, platform]) => platform.getMesh() === intersects[0].object)?.[0];

        if (platformId) {
          this.trackEditorService.deletePlatform(platformId);
        }
      }
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to handle editor right click',
          {
            component: 'EditorGameEngine',
            action: 'handleEditorRightClick',
            severity: ErrorSeverity.MEDIUM,
            additionalData: { error },
          }
        )
      );
    }
  }

  /**
   * Override dispose to clean up editor-specific resources
   */
  public override dispose(): void {
    this.removeEditorControls();
    super.dispose();
  }
}

export default EditorGameEngine;
