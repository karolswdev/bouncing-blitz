/**
 * Error severity levels for game engine
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Structure for error context
 */
interface ErrorContext {
  component: string;
  action: string;
  timestamp: string;
  severity: ErrorSeverity;
  additionalData?: Record<string, unknown>;
}

/**
 * Game engine error with additional context
 */
export class GameEngineError extends Error {
  public context: ErrorContext;

  constructor(message: string, context: Omit<ErrorContext, 'timestamp'>) {
    super(message);
    this.name = 'GameEngineError';
    this.context = {
      ...context,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Error handling service for the game engine
 * Manages error logging, reporting, and recovery mechanisms
 */
class ErrorService {
  private static instance: ErrorService;
  private errors: GameEngineError[] = [];
  private readonly maxStoredErrors = 100;
  private readonly isDevelopment = import.meta.env.DEV;

  private constructor() {
    // Initialize error handling
    window.onerror = (message, source, lineno, colno, error) => {
      if (error instanceof GameEngineError) {
        this.handleError(error);
      } else {
        this.handleError(
          new GameEngineError(
            String(message),
            {
              component: 'Window',
              action: 'globalErrorHandler',
              severity: ErrorSeverity.CRITICAL,
              additionalData: { source, lineno, colno },
            }
          )
        );
      }
    };
  }

  public static getInstance(): ErrorService {
    if (!ErrorService.instance) {
      ErrorService.instance = new ErrorService();
    }
    return ErrorService.instance;
  }

  /**
   * Log and handle an error with context
   */
  public handleError(error: GameEngineError): void {
    // Store error
    this.errors.push(error);
    if (this.errors.length > this.maxStoredErrors) {
      this.errors.shift();
    }

    // Log error with context
    console.error(
      `[${error.context.severity.toUpperCase()}] ${error.context.component}:${error.context.action}`,
      {
        message: error.message,
        context: error.context,
        stack: error.stack,
      }
    );

    // Implement recovery mechanisms based on severity
    this.attemptRecovery(error);

    // Report critical errors
    if (error.context.severity === ErrorSeverity.CRITICAL) {
      this.reportToCentralSystem(error);
    }
  }

  /**
   * Attempt to recover from an error based on its severity and context
   */
  private attemptRecovery(error: GameEngineError): void {
    switch (error.context.severity) {
      case ErrorSeverity.LOW:
        // Log only, no recovery needed
        break;
      case ErrorSeverity.MEDIUM:
        // Attempt state refresh
        this.refreshGameState(error.context.component);
        break;
      case ErrorSeverity.HIGH:
        // Reset component state
        this.resetComponentState(error.context.component);
        break;
      case ErrorSeverity.CRITICAL:
        // Save game state and attempt full reset
        this.handleCriticalError(error);
        break;
    }
  }

  /**
   * Refresh the state of a game component
   */
  private refreshGameState(component: string): void {
    // TODO: Implement state refresh logic
    if (this.isDevelopment) {
      console.log(`Refreshing state for component: ${component}`);
    }
  }

  /**
   * Reset a component's state to its initial values
   */
  private resetComponentState(component: string): void {
    // TODO: Implement component reset logic
    if (this.isDevelopment) {
      console.log(`Resetting state for component: ${component}`);
    }
  }

  /**
   * Handle critical errors that require immediate attention
   */
  private handleCriticalError(error: GameEngineError): void {
    // TODO: Implement critical error handling
    if (this.isDevelopment) {
      console.log('Handling critical error:', error);
    }
  }

  /**
   * Report critical errors to central monitoring system
   */
  private reportToCentralSystem(error: GameEngineError): void {
    // In a production environment, this would send the error to a monitoring service
    if (this.isDevelopment) {
      console.warn('Error reported to monitoring system:', error);
    }
  }

  /**
   * Create a user-friendly error message
   */
  public createUserMessage(error: GameEngineError): string {
    // Create user-friendly messages based on error context
    const messages = {
      [ErrorSeverity.LOW]: 'A minor issue occurred. You can continue playing.',
      [ErrorSeverity.MEDIUM]: 'We encountered an issue. Some features might be temporarily unavailable.',
      [ErrorSeverity.HIGH]: 'We encountered a problem. The game will attempt to recover.',
      [ErrorSeverity.CRITICAL]: 'An unexpected error occurred. Please save your progress and restart the game.',
    };

    return messages[error.context.severity] || 'An unknown error occurred.';
  }

  /**
   * Get all stored errors
   */
  public getErrors(): GameEngineError[] {
    return [...this.errors];
  }

  /**
   * Clear stored errors
   */
  public clearErrors(): void {
    this.errors = [];
  }
}

export default ErrorService;
