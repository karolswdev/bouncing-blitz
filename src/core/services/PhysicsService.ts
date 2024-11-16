import * as THREE from 'three';
import ErrorService, { GameEngineError, ErrorSeverity } from './ErrorService';
import DebugService from './DebugService';

interface PhysicsObject {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  acceleration: THREE.Vector3;
  mass: number;
  restitution: number;
  friction: number;
  // Add velocity history for continuous collision detection
  previousPosition: THREE.Vector3;
  previousVelocity: THREE.Vector3;
}

interface PhysicsConfig {
  gravity: number;
  maxVelocity: number;
  minBounceVelocity: number;
  maxPredictionSteps: number; // Added for continuous collision
}

class PhysicsService {
  private static instance: PhysicsService;
  private errorService: ErrorService;
  private debugService: DebugService;
  private objects: Map<string, PhysicsObject> = new Map();
  private config: PhysicsConfig;
  private readonly debug: boolean = import.meta.env.DEV;

  private constructor() {
    this.errorService = ErrorService.getInstance();
    this.debugService = DebugService.getInstance();
    this.config = {
      gravity: 20,
      maxVelocity: 30,
      minBounceVelocity: 0.1,
      maxPredictionSteps: 3 // Number of steps for continuous collision detection
    };
    if (this.debug) {
      this.debugService.log('PhysicsService', 'Service initialized', {
        config: this.config
      });
    }
  }

  public static getInstance(): PhysicsService {
    if (!PhysicsService.instance) {
      PhysicsService.instance = new PhysicsService();
    }
    return PhysicsService.instance;
  }

  /**
   * Add an object to the physics system
   */
  public addObject(
    id: string,
    mesh: THREE.Mesh,
    options: {
      mass?: number;
      restitution?: number;
      friction?: number;
    } = {}
  ): void {
    try {
      const object: PhysicsObject = {
        mesh,
        velocity: new THREE.Vector3(0, 0, 0),
        acceleration: new THREE.Vector3(0, -this.config.gravity, 0),
        mass: options.mass ?? 1,
        restitution: options.restitution ?? 0.5,
        friction: options.friction ?? 0.2,
        previousPosition: mesh.position.clone(),
        previousVelocity: new THREE.Vector3(0, 0, 0)
      };

      this.objects.set(id, object);
      
      if (this.debug) {
        this.debugService.log('PhysicsService', `Added object ${id}`, {
          object: {
            position: object.mesh.position.toArray(),
            mass: object.mass,
            restitution: object.restitution,
            friction: object.friction
          }
        });
      }
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to add physics object',
          {
            component: 'PhysicsService',
            action: 'addObject',
            severity: ErrorSeverity.HIGH,
            additionalData: { id, error },
          }
        )
      );
    }
  }

  /**
   * Remove an object from the physics system
   */
  public removeObject(id: string): void {
    try {
      if (!this.objects.has(id)) {
        this.errorService.handleError(
          new GameEngineError(
            'Object not found for removal',
            {
              component: 'PhysicsService',
              action: 'removeObject',
              severity: ErrorSeverity.LOW,
              additionalData: { id },
            }
          )
        );
        return;
      }

      this.objects.delete(id);
      
      if (this.debug) {
        this.debugService.log('PhysicsService', `Removed object ${id}`);
      }
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Failed to remove physics object',
          {
            component: 'PhysicsService',
            action: 'removeObject',
            severity: ErrorSeverity.MEDIUM,
            additionalData: { id, error },
          }
        )
      );
    }
  }

  /**
   * Update physics for all objects with continuous collision detection
   */
  public update(deltaTime: number): void {
    try {
      this.objects.forEach((object, id) => {
        // Store current state for continuous collision detection
        object.previousPosition.copy(object.mesh.position);
        object.previousVelocity.copy(object.velocity);

        // Perform sub-steps for continuous collision detection
        const subSteps = Math.min(
          Math.ceil(object.velocity.length() * deltaTime),
          this.config.maxPredictionSteps
        );
        const subDelta = deltaTime / subSteps;

        for (let step = 0; step < subSteps; step++) {
          this.updateObject(object, subDelta);
          this.checkBounds(object, id);
        }

        if (this.debug) {
          const newPosition = object.mesh.position;
          const delta = newPosition.clone().sub(object.previousPosition);
          if (delta.length() > 0.001) {
            this.debugService.log('PhysicsService', `Object ${id} updated`, {
              delta: delta.toArray(),
              velocity: object.velocity.toArray(),
              acceleration: object.acceleration.toArray(),
              subSteps
            });
          }
        }
      });
    } catch (error) {
      this.errorService.handleError(
        new GameEngineError(
          'Physics update failed',
          {
            component: 'PhysicsService',
            action: 'update',
            severity: ErrorSeverity.HIGH,
            additionalData: { error },
          }
        )
      );
    }
  }

  /**
   * Update physics for a single object
   */
  private updateObject(object: PhysicsObject, deltaTime: number): void {
    // Update velocity with acceleration
    object.velocity.add(object.acceleration.clone().multiplyScalar(deltaTime));

    // Apply velocity limits
    if (object.velocity.length() > this.config.maxVelocity) {
      object.velocity.normalize().multiplyScalar(this.config.maxVelocity);
    }

    // Update position
    const deltaPosition = object.velocity.clone().multiplyScalar(deltaTime);
    object.mesh.position.add(deltaPosition);
  }

  /**
   * Check if object is within bounds and handle bouncing
   */
  private checkBounds(object: PhysicsObject, id: string): void {
    const position = object.mesh.position;
    const radius = (object.mesh.geometry as THREE.SphereGeometry).parameters.radius;

    // Check floor collision (y = 0)
    if (position.y - radius < 0) {
      position.y = radius; // Reset position to prevent clipping

      // Only bounce if velocity is above minimum threshold
      if (Math.abs(object.velocity.y) > this.config.minBounceVelocity) {
        object.velocity.y = Math.abs(object.velocity.y) * object.restitution;
        
        // Apply friction to x and z velocities
        object.velocity.x *= (1 - object.friction);
        object.velocity.z *= (1 - object.friction);

        if (this.debug) {
          this.debugService.log('PhysicsService', `Bounce applied for ${id}`, {
            velocity: object.velocity.toArray(),
            restitution: object.restitution,
            friction: object.friction
          });
        }
      } else {
        // Stop vertical movement if below threshold
        object.velocity.y = 0;
        position.y = radius;
      }
    }

    // Add bounds for x and z axes (temporary for testing)
    const bounds = 10;
    if (Math.abs(position.x) > bounds) {
      position.x = Math.sign(position.x) * bounds;
      object.velocity.x *= -object.restitution;
    }
    if (Math.abs(position.z) > bounds) {
      position.z = Math.sign(position.z) * bounds;
      object.velocity.z *= -object.restitution;
    }
  }

  /**
   * Get predicted position after time interval
   */
  public getPredictedPosition(id: string, timeAhead: number): THREE.Vector3 | null {
    const object = this.objects.get(id);
    if (!object) return null;

    const predictedPosition = object.mesh.position.clone();
    const predictedVelocity = object.velocity.clone();
    
    // Apply acceleration and velocity
    predictedVelocity.add(object.acceleration.clone().multiplyScalar(timeAhead));
    predictedPosition.add(predictedVelocity.multiplyScalar(timeAhead));

    return predictedPosition;
  }

  /**
   * Apply an impulse force to an object
   */
  public applyImpulse(id: string, force: THREE.Vector3): void {
    const object = this.objects.get(id);
    if (!object) {
      this.errorService.handleError(
        new GameEngineError(
          'Object not found',
          {
            component: 'PhysicsService',
            action: 'applyImpulse',
            severity: ErrorSeverity.MEDIUM,
            additionalData: { id },
          }
        )
      );
      return;
    }

    const impulse = force.multiplyScalar(1 / object.mass);
    object.velocity.add(impulse);

    if (this.debug) {
      this.debugService.log('PhysicsService', `Impulse applied to ${id}`, {
        force: force.toArray(),
        mass: object.mass,
        resultingVelocity: object.velocity.toArray()
      });
    }
  }

  /**
   * Set the gravity value
   */
  public setGravity(gravity: number): void {
    this.config.gravity = gravity;
    this.objects.forEach(object => {
      object.acceleration.y = -gravity;
    });
    if (this.debug) {
      this.debugService.log('PhysicsService', 'Gravity updated', { gravity });
    }
  }

  /**
   * Get an object's current velocity
   */
  public getVelocity(id: string): THREE.Vector3 | null {
    const object = this.objects.get(id);
    return object ? object.velocity.clone() : null;
  }

  /**
   * Reset an object's physics state
   */
  public resetObject(id: string): void {
    const object = this.objects.get(id);
    if (object) {
      object.velocity.set(0, 0, 0);
      object.acceleration.set(0, -this.config.gravity, 0);
      if (this.debug) {
        this.debugService.log('PhysicsService', `Reset physics state for ${id}`);
      }
    }
  }
}

export default PhysicsService;
