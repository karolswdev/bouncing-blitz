import * as THREE from 'three';

/**
 * Enum for different platform types in race tracks
 */
export enum PlatformType {
  NORMAL = 'normal',
  START = 'start',
  FINISH = 'finish',
  CHECKPOINT = 'checkpoint',
  BOOST = 'boost',
  OBSTACLE = 'obstacle',
  BOUNCE = 'bounce'
}

export interface PlatformConfig {
  width: number;
  depth: number;
  height: number;
  position: THREE.Vector3;
  color?: number;
  isMoving?: boolean;
  moveSpeed?: number;
  moveDistance?: number;
  moveAxis?: 'x' | 'y' | 'z';
  type?: PlatformType;
  boostForce?: number;  // Force multiplier for boost platforms
  bounceForce?: number; // Force multiplier for bounce platforms
  checkpointIndex?: number; // Index for checkpoint platforms
  isActive?: boolean;   // For checkpoints and other stateful platforms
}

export interface CollisionResult {
  collides: boolean;
  normal?: THREE.Vector3;
  penetration?: number;
  time?: number;  // Time of impact for continuous collision
  point?: THREE.Vector3;  // Point of impact
  platformType?: PlatformType; // Type of platform collided with
  platformEffect?: {      // Additional effects based on platform type
    boostForce?: number;
    bounceForce?: number;
    checkpointIndex?: number;
  };
}

/**
 * Platform class for creating and managing game platforms
 */
class Platform {
  private mesh: THREE.Mesh;
  private readonly isMoving: boolean;
  private readonly moveSpeed: number;
  private readonly moveDistance: number;
  private readonly moveAxis: 'x' | 'y' | 'z';
  private initialPosition: THREE.Vector3;
  private readonly fixedTimeStep: number = 1 / 60;
  private accumulatedTime: number = 0;
  private boundingBox: THREE.Box3;
  private previousPosition: THREE.Vector3;
  private velocity: THREE.Vector3;
  private type: PlatformType;
  private boostForce: number;
  private bounceForce: number;
  private checkpointIndex: number;
  private isActive: boolean;
  private readonly maxPenetration: number = 0.1; // Maximum allowed penetration

  constructor(config: PlatformConfig) {
    // Create platform geometry
    const geometry = new THREE.BoxGeometry(
      config.width,
      config.height,
      config.depth
    );

    // Set platform type and properties
    this.type = config.type || PlatformType.NORMAL;
    this.boostForce = config.boostForce || 1.5;
    this.bounceForce = config.bounceForce || 1.5;
    this.checkpointIndex = config.checkpointIndex || -1;
    this.isActive = config.isActive ?? true;

    // Create platform material with color based on type
    const material = new THREE.MeshPhongMaterial({
      color: config.color || this.getColorForType(),
      shininess: 30,
      specular: 0x444444
    });

    // Create mesh
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(config.position);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    // Store initial position for movement calculations
    this.initialPosition = config.position.clone();
    this.previousPosition = config.position.clone();
    this.velocity = new THREE.Vector3();

    // Movement properties
    this.isMoving = config.isMoving || false;
    this.moveSpeed = config.moveSpeed || 2;
    this.moveDistance = config.moveDistance || 2;
    this.moveAxis = config.moveAxis || 'y';

    // Initialize bounding box
    this.boundingBox = new THREE.Box3();
    this.updateBoundingBox();
  }

  /**
   * Get default color based on platform type
   */
  private getColorForType(): number {
    switch (this.type) {
      case PlatformType.START:
        return 0x00ff00; // Green
      case PlatformType.FINISH:
        return 0xff0000; // Red
      case PlatformType.CHECKPOINT:
        return this.isActive ? 0xffff00 : 0x808080; // Yellow when active, gray when passed
      case PlatformType.BOOST:
        return 0x00ffff; // Cyan
      case PlatformType.OBSTACLE:
        return 0xff00ff; // Magenta
      case PlatformType.BOUNCE:
        return 0xff8800; // Orange
      default:
        return 0x808080; // Gray for normal platforms
    }
  }

  /**
   * Update platform state and calculate velocity
   */
  public update(deltaTime: number): void {
    if (!this.isMoving) return;

    // Store current position for velocity calculation
    this.previousPosition.copy(this.mesh.position);

    // Accumulate time
    this.accumulatedTime += deltaTime;

    // Calculate smooth movement using cosine for continuous motion
    const offset = Math.cos(this.accumulatedTime * this.moveSpeed) * this.moveDistance;
    const newPosition = this.initialPosition.clone();

    // Apply offset to the appropriate axis
    switch (this.moveAxis) {
      case 'x':
        newPosition.x += offset;
        break;
      case 'y':
        newPosition.y += offset;
        break;
      case 'z':
        newPosition.z += offset;
        break;
    }

    // Update mesh position with interpolation for smoother movement
    this.mesh.position.lerp(newPosition, 0.1);

    // Calculate platform velocity
    this.velocity.subVectors(this.mesh.position, this.previousPosition).divideScalar(deltaTime);

    // Update bounding box
    this.updateBoundingBox();

    // Update material color for checkpoints
    if (this.type === PlatformType.CHECKPOINT) {
      (this.mesh.material as THREE.MeshPhongMaterial).color.setHex(
        this.isActive ? 0xffff00 : 0x808080
      );
    }
  }

  /**
   * Check if a point is on the platform
   */
  public isPointOnPlatform(point: THREE.Vector3, threshold: number = 0.1): boolean {
    const dimensions = this.getDimensions();
    const position = this.getPosition();

    return (
      point.x >= position.x - dimensions.width/2 - threshold &&
      point.x <= position.x + dimensions.width/2 + threshold &&
      point.y >= position.y &&
      point.y <= position.y + dimensions.height + threshold &&
      point.z >= position.z - dimensions.depth/2 - threshold &&
      point.z <= position.z + dimensions.depth/2 + threshold
    );
  }

  /**
   * Check collision with a moving sphere using continuous collision detection
   */
  public checkSphereCollision(
    spherePosition: THREE.Vector3,
    sphereRadius: number,
    sphereVelocity: THREE.Vector3,
    deltaTime: number
  ): CollisionResult {
    // Early exit for static collision check
    if (sphereVelocity.lengthSq() < 0.0001 && !this.isMoving) {
      return this.checkStaticSphereCollision(spherePosition, sphereRadius);
    }

    // Get the relative velocity between sphere and platform
    const relativeVelocity = sphereVelocity.clone().sub(this.velocity);
    
    // Calculate the swept sphere path
    const spherePath = relativeVelocity.clone().multiplyScalar(deltaTime);
    const sphereStart = spherePosition.clone();
    const sphereEnd = spherePosition.clone().add(spherePath);

    // Expand bounding box by sphere radius
    const expandedBox = this.boundingBox.clone();
    expandedBox.expandByScalar(sphereRadius);

    // Check if sphere path intersects with expanded box
    const ray = new THREE.Ray(sphereStart, spherePath.normalize());
    const intersectionPoint = new THREE.Vector3();
    
    // Check both current and next frame positions
    const hasIntersection = ray.intersectBox(expandedBox, intersectionPoint);
    
    if (!hasIntersection) {
      // Check if sphere is already inside the box (tunneling case)
      if (expandedBox.containsPoint(sphereStart)) {
        return this.handlePenetration(sphereStart, sphereRadius);
      }
      return { collides: false };
    }

    // Calculate time of impact
    const pathLength = spherePath.length();
    if (pathLength < 0.0001) return { collides: false };
    
    const timeOfImpact = sphereStart.distanceTo(intersectionPoint) / pathLength;
    
    // Validate time of impact
    if (timeOfImpact > 1.0 || timeOfImpact < 0) {
      return { collides: false };
    }

    // Calculate actual collision point
    const impactPoint = intersectionPoint.clone();
    
    // Calculate collision normal and penetration
    const normal = this.calculateCollisionNormal(impactPoint);
    const penetration = this.calculatePenetration(impactPoint, sphereRadius, normal);

    // Add platform-specific effects
    const platformEffect: CollisionResult['platformEffect'] = {};
    
    switch (this.type) {
      case PlatformType.BOOST:
        platformEffect.boostForce = this.boostForce;
        break;
      case PlatformType.BOUNCE:
        platformEffect.bounceForce = this.bounceForce;
        break;
      case PlatformType.CHECKPOINT:
        platformEffect.checkpointIndex = this.checkpointIndex;
        break;
    }

    return {
      collides: true,
      normal,
      penetration: Math.min(penetration, this.maxPenetration), // Limit penetration
      time: timeOfImpact,
      point: impactPoint,
      platformType: this.type,
      platformEffect
    };
  }

  /**
   * Handle penetration case for tunneling prevention
   */
  private handlePenetration(
    spherePosition: THREE.Vector3,
    sphereRadius: number
  ): CollisionResult {
    const center = this.boundingBox.getCenter(new THREE.Vector3());
    const normal = spherePosition.clone().sub(center).normalize();
    const penetration = sphereRadius + 0.01; // Small offset to ensure separation

    return {
      collides: true,
      normal,
      penetration,
      point: spherePosition.clone(),
      platformType: this.type,
      platformEffect: this.getPlatformEffect()
    };
  }

  /**
   * Check static sphere collision (no movement)
   */
  private checkStaticSphereCollision(
    spherePosition: THREE.Vector3,
    sphereRadius: number
  ): CollisionResult {
    const expandedBox = this.boundingBox.clone();
    expandedBox.expandByScalar(sphereRadius);

    if (!expandedBox.containsPoint(spherePosition)) {
      return { collides: false };
    }

    const normal = this.calculateCollisionNormal(spherePosition);
    const penetration = this.calculatePenetration(spherePosition, sphereRadius, normal);

    return {
      collides: true,
      normal,
      penetration: Math.min(penetration, this.maxPenetration),
      point: spherePosition.clone(),
      platformType: this.type,
      platformEffect: this.getPlatformEffect()
    };
  }

  /**
   * Calculate penetration depth
   */
  private calculatePenetration(
    point: THREE.Vector3,
    radius: number,
    normal: THREE.Vector3
  ): number {
    const size = this.boundingBox.getSize(new THREE.Vector3());
    const center = this.boundingBox.getCenter(new THREE.Vector3());
    
    // Project point onto normal axis
    const projected = point.clone().sub(center).dot(normal);
    const penetration = radius - Math.abs(projected);

    return Math.max(0, penetration);
  }

  /**
   * Get platform-specific effects
   */
  private getPlatformEffect(): CollisionResult['platformEffect'] {
    const effect: CollisionResult['platformEffect'] = {};
    
    switch (this.type) {
      case PlatformType.BOOST:
        effect.boostForce = this.boostForce;
        break;
      case PlatformType.BOUNCE:
        effect.bounceForce = this.bounceForce;
        break;
      case PlatformType.CHECKPOINT:
        effect.checkpointIndex = this.checkpointIndex;
        break;
    }
    
    return effect;
  }

  /**
   * Calculate collision normal based on impact point
   */
  private calculateCollisionNormal(impactPoint: THREE.Vector3): THREE.Vector3 {
    const center = this.boundingBox.getCenter(new THREE.Vector3());
    const size = this.boundingBox.getSize(new THREE.Vector3());
    const normal = new THREE.Vector3();

    // Calculate distances to each face
    const dx = Math.min(
      Math.abs(impactPoint.x - (center.x - size.x/2)),
      Math.abs(impactPoint.x - (center.x + size.x/2))
    );
    const dy = Math.min(
      Math.abs(impactPoint.y - (center.y - size.y/2)),
      Math.abs(impactPoint.y - (center.y + size.y/2))
    );
    const dz = Math.min(
      Math.abs(impactPoint.z - (center.z - size.z/2)),
      Math.abs(impactPoint.z - (center.z + size.z/2))
    );

    // Set normal based on smallest distance
    if (dx < dy && dx < dz) {
      normal.x = Math.sign(impactPoint.x - center.x);
    } else if (dy < dx && dy < dz) {
      normal.y = Math.sign(impactPoint.y - center.y);
    } else {
      normal.z = Math.sign(impactPoint.z - center.z);
    }

    return normal.normalize();
  }

  public getVelocity(): THREE.Vector3 {
    return this.velocity.clone();
  }

  public getMesh(): THREE.Mesh {
    return this.mesh;
  }

  public getPosition(): THREE.Vector3 {
    return this.mesh.position.clone();
  }

  public getDimensions(): { width: number; height: number; depth: number } {
    const geometry = this.mesh.geometry as THREE.BoxGeometry;
    return {
      width: geometry.parameters.width,
      height: geometry.parameters.height,
      depth: geometry.parameters.depth
    };
  }

  public getType(): PlatformType {
    return this.type;
  }

  public setActive(active: boolean): void {
    this.isActive = active;
    if (this.type === PlatformType.CHECKPOINT) {
      (this.mesh.material as THREE.MeshPhongMaterial).color.setHex(
        active ? 0xffff00 : 0x808080
      );
    }
  }

  public isActiveState(): boolean {
    return this.isActive;
  }

  private updateBoundingBox(): void {
    this.boundingBox.setFromObject(this.mesh);
  }

  public getBoundingBox(): THREE.Box3 {
    return this.boundingBox.clone();
  }

  /**
   * Set rotation angle of the platform
   * @param angle Rotation angle in degrees
   */
  public setRotation(angle: number): void {
    this.mesh.rotation.y = THREE.MathUtils.degToRad(angle);
  }

  public dispose(): void {
    if (this.mesh) {
      if (this.mesh.geometry) {
        this.mesh.geometry.dispose();
      }
      if (this.mesh.material && Array.isArray(this.mesh.material)) {
        this.mesh.material.forEach(material => material.dispose());
      } else if (this.mesh.material) {
        (this.mesh.material as THREE.Material).dispose();
      }
    }
  }
}

export default Platform;
export type { PlatformConfig, CollisionResult };
export { PlatformType };
