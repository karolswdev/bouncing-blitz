import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import BaseGameEngine from './core/BaseGameEngine';
import EditorGameEngine from './core/EditorGameEngine';
import ErrorService, { GameEngineError, ErrorSeverity } from './core/services/ErrorService';
import DebugService from './core/services/DebugService';
import LevelService from './core/services/LevelService';
import TrackEditor from './components/TrackEditor';

function App() {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameObjectsRef = useRef<{ [key: string]: THREE.Mesh }>({});
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const errorService = ErrorService.getInstance();
  const debugService = DebugService.getInstance();
  const levelService = LevelService.getInstance();
  const debug = import.meta.env.DEV;

  useEffect(() => {
    debugService.log('App', 'Component mounted');
    debugService.setupKeyboardShortcut();

    if (!gameContainerRef.current) {
      errorService.handleError(
        new GameEngineError(
          'Game container not found',
          {
            component: 'App',
            action: 'initialization',
            severity: ErrorSeverity.CRITICAL,
          }
        )
      );
      return;
    }

    try {
      debugService.log('App', 'Initializing game engine');
      
      // Initialize game engine based on mode
      const gameEngine = isEditorOpen ? EditorGameEngine.getInstance() : BaseGameEngine.getInstance();
      gameEngine.initialize({
        containerId: 'game-container',
      });

      // Create a player ball
      const geometry = new THREE.SphereGeometry(0.5, 32, 32);
      const material = new THREE.MeshPhongMaterial({ 
        color: 0x00ff00,
        shininess: 60,
        emissive: 0x000000,
        specular: 0x666666,
      });
      
      const sphere = new THREE.Mesh(geometry, material);
      sphere.castShadow = true;
      sphere.receiveShadow = true;

      // Position the ball at the start platform
      const platforms = levelService.getPlatforms();
      let startPosition = new THREE.Vector3(0, 5, 0); // Default position

      platforms.forEach((platform, id) => {
        if (platform.getType() === 'start') {
          const pos = platform.getPosition();
          const dims = platform.getDimensions();
          startPosition = new THREE.Vector3(
            pos.x,
            pos.y + dims.height + geometry.parameters.radius + 0.1,
            pos.z
          );
        }
      });

      sphere.position.copy(startPosition);

      // Store reference to the sphere
      gameObjectsRef.current['player-ball'] = sphere;

      debugService.log('App', 'Created sphere', {
        position: sphere.position.toArray(),
        geometry: {
          type: 'SphereGeometry',
          radius: 0.5,
          segments: 32
        },
        material: {
          type: 'MeshPhongMaterial',
          color: 0x00ff00,
          shininess: 60
        }
      });

      // Add sphere with physics properties
      gameEngine.addPhysicsObject(sphere, 'player-ball', {
        mass: 1,
        restitution: 0.7, // Bounciness
        friction: 0.1,
      });

      // Start the game loop
      debugService.log('App', 'Starting game loop');
      gameEngine.start();

      // Cleanup
      return () => {
        debugService.log('App', 'Cleaning up game engine');
        
        // Remove all game objects
        Object.entries(gameObjectsRef.current).forEach(([id, object]) => {
          gameEngine.removePhysicsObject(object, id);
        });
        gameObjectsRef.current = {};

        // Dispose of the game engine
        gameEngine.dispose();
      };
    } catch (error) {
      errorService.handleError(
        new GameEngineError(
          'Failed to initialize game',
          {
            component: 'App',
            action: 'initialization',
            severity: ErrorSeverity.CRITICAL,
            additionalData: { error },
          }
        )
      );
    }
  }, [debug, isEditorOpen]); // Re-run when debug mode or editor mode changes

  const toggleEditor = () => {
    const gameEngine = isEditorOpen ? BaseGameEngine.getInstance() : EditorGameEngine.getInstance();
    gameEngine.setEditorMode(!isEditorOpen);
    setIsEditorOpen(!isEditorOpen);
  };

  return (
    <div className="h-screen w-screen bg-gray-900">
      <div 
        id="game-container" 
        ref={gameContainerRef}
        className="w-full h-full"
        style={{ 
          position: 'relative',
          overflow: 'hidden'
        }}
      />
      {/* Controls UI */}
      <div className="fixed bottom-4 left-4 bg-black bg-opacity-75 text-white p-4 rounded space-y-2">
        <div className="text-lg font-bold mb-2">Controls</div>
        <div>Movement: Arrow Keys or WASD</div>
        <div>Jump: Space</div>
        {isEditorOpen && (
          <>
            <div>Editor Controls:</div>
            <div>Left Click: Place Platform</div>
            <div>Right Click: Delete Platform</div>
            <div>Middle Mouse: Rotate Camera</div>
            <div>Scroll: Zoom</div>
          </>
        )}
      </div>
      {/* Editor Toggle Button */}
      <button
        onClick={toggleEditor}
        className="fixed top-4 right-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
      >
        {isEditorOpen ? 'Exit Editor' : 'Track Editor'}
      </button>
      {/* Debug UI */}
      {debug && (
        <div className="fixed bottom-4 right-4 bg-black bg-opacity-75 text-white p-4 rounded space-y-2">
          <div>
            Press Ctrl+Alt+L to download debug logs
          </div>
          <div>
            Objects: {Object.keys(gameObjectsRef.current).length}
          </div>
        </div>
      )}
      {/* Track Editor Modal */}
      <TrackEditor isOpen={isEditorOpen} onClose={() => setIsEditorOpen(false)} />
    </div>
  );
}

export default App;
