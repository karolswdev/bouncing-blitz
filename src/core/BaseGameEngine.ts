import GameEngine from './GameEngine';

/**
 * Concrete implementation of the base game engine
 * Handles standard game functionality without editor features
 */
class BaseGameEngine extends GameEngine {
  protected static override instance: BaseGameEngine | null = null;

  protected constructor() {
    super();
  }

  public static override getInstance(): BaseGameEngine {
    if (!BaseGameEngine.instance) {
      BaseGameEngine.instance = new BaseGameEngine();
    }
    return BaseGameEngine.instance;
  }
}

export default BaseGameEngine;
