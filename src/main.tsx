import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Clear any existing game engine state
const gameContainer = document.getElementById('game-container');
if (gameContainer) {
  gameContainer.innerHTML = '';
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  // Removed StrictMode to prevent double mounting
  <App />
);
