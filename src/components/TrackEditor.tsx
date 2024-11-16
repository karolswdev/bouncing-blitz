import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import TrackEditorService, { EditorMode, EditorState } from '../core/services/TrackEditorService';
import { PlatformType } from '../core/entities/Platform';
import InputService from '../core/services/InputService';

interface TrackEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

const TrackEditor: React.FC<TrackEditorProps> = ({ isOpen, onClose }) => {
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [trackName, setTrackName] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('easy');
  const [rotationAngle, setRotationAngle] = useState<number>(0); // New state for rotation
  const editorService = TrackEditorService.getInstance();
  const inputService = InputService.getInstance();

  useEffect(() => {
    if (isOpen) {
      setEditorState(editorService.getState());
      inputService.setEditorModalOpen(true);
    } else {
      inputService.setEditorModalOpen(false);
    }

    // Cleanup when component unmounts or modal closes
    return () => {
      inputService.setEditorModalOpen(false);
    };
  }, [isOpen]);

  if (!isOpen || !editorState) return null;

  const handleModeChange = (mode: EditorMode) => {
    editorService.setMode(mode);
    setEditorState(editorService.getState());
  };

  const handlePlatformTypeChange = (type: PlatformType) => {
    editorService.setSelectedPlatformType(type);
    setEditorState(editorService.getState());
  };

  const handleRotationChange = (angle: number) => {
    setRotationAngle(angle);
    editorService.setPlatformRotation(angle);
  };

  const handleSave = () => {
    if (!trackName) {
      alert('Please enter a track name');
      return;
    }

    if (!editorService.validateTrack()) {
      alert('Track validation failed. Make sure you have a start, finish, and at least one checkpoint.');
      return;
    }

    editorService.saveTrack(trackName, difficulty);
    inputService.setEditorModalOpen(false);
    onClose();
  };

  const handleLoad = () => {
    if (!trackName) {
      alert('Please enter a track name to load');
      return;
    }

    editorService.loadTrack(trackName);
    setEditorState(editorService.getState());
  };

  const handleClose = () => {
    inputService.setEditorModalOpen(false);
    onClose();
  };

  // Prevent game input when clicking in modal
  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div 
        className="bg-gray-800 text-white p-6 rounded-lg shadow-lg w-96"
        onClick={handleModalClick}
      >
        <h2 className="text-2xl font-bold mb-4">Track Editor</h2>
        
        {/* Track Name Input */}
        <div className="mb-4">
          <label className="block mb-2">Track Name</label>
          <input
            type="text"
            value={trackName}
            onChange={(e) => setTrackName(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 rounded text-white"
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Difficulty Selection */}
        <div className="mb-4">
          <label className="block mb-2">Difficulty</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
            className="w-full px-3 py-2 bg-gray-700 rounded text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        {/* Editor Mode Selection */}
        <div className="mb-4">
          <label className="block mb-2">Editor Mode</label>
          <div className="flex gap-2">
            <button
              onClick={() => handleModeChange(EditorMode.PLACE)}
              className={`px-3 py-1 rounded ${
                editorState.mode === EditorMode.PLACE ? 'bg-blue-500' : 'bg-gray-700'
              }`}
            >
              Place
            </button>
            <button
              onClick={() => handleModeChange(EditorMode.EDIT)}
              className={`px-3 py-1 rounded ${
                editorState.mode === EditorMode.EDIT ? 'bg-blue-500' : 'bg-gray-700'
              }`}
            >
              Edit
            </button>
            <button
              onClick={() => handleModeChange(EditorMode.DELETE)}
              className={`px-3 py-1 rounded ${
                editorState.mode === EditorMode.DELETE ? 'bg-blue-500' : 'bg-gray-700'
              }`}
            >
              Delete
            </button>
          </div>
        </div>

        {/* Platform Type Selection */}
        <div className="mb-4">
          <label className="block mb-2">Platform Type</label>
          <select
            value={editorState.selectedPlatformType}
            onChange={(e) => handlePlatformTypeChange(e.target.value as PlatformType)}
            className="w-full px-3 py-2 bg-gray-700 rounded text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <option value={PlatformType.NORMAL}>Normal</option>
            <option value={PlatformType.START}>Start</option>
            <option value={PlatformType.FINISH}>Finish</option>
            <option value={PlatformType.CHECKPOINT}>Checkpoint</option>
            <option value={PlatformType.BOOST}>Boost</option>
            <option value={PlatformType.BOUNCE}>Bounce</option>
            <option value={PlatformType.OBSTACLE}>Obstacle</option>
          </select>
        </div>

        {/* Platform Rotation Controls */}
        <div className="mb-4">
          <label className="block mb-2">Platform Rotation (Degrees)</label>
          <input
            type="number"
            value={rotationAngle}
            onChange={(e) => handleRotationChange(Number(e.target.value))}
            className="w-full px-3 py-2 bg-gray-700 rounded text-white"
            min="0"
            max="360"
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        {/* Editor Controls Help */}
        <div className="mb-4 text-sm text-gray-400">
          <h3 className="font-bold mb-1">Controls:</h3>
          <ul className="list-disc list-inside">
            <li>Left Click: Place/Select Platform</li>
            <li>Right Click: Delete Platform</li>
            <li>Hold Middle Mouse: Rotate Camera</li>
            <li>Scroll: Zoom In/Out</li>
            <li>ESC: Close Editor</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 transition-colors"
          >
            Save Track
          </button>
          <button
            onClick={handleLoad}
            className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 transition-colors"
          >
            Load Track
          </button>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-red-600 rounded hover:bg-red-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrackEditor;
