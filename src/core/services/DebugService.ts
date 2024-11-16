/**
 * Debug log entry structure
 */
interface DebugLogEntry {
  timestamp: number;
  component: string;
  message: string;
  data?: any;
}

/**
 * Service for collecting and managing debug logs
 */
class DebugService {
  private static instance: DebugService;
  private logs: DebugLogEntry[] = [];
  private readonly maxLogs: number = 1000;
  private startTime: number;

  private constructor() {
    this.startTime = performance.now();
    this.log('DebugService', 'Debug service initialized');
  }

  public static getInstance(): DebugService {
    if (!DebugService.instance) {
      DebugService.instance = new DebugService();
    }
    return DebugService.instance;
  }

  /**
   * Add a log entry
   */
  public log(component: string, message: string, data?: any): void {
    // Add log to our collection
    this.logs.push({
      timestamp: performance.now() - this.startTime,
      component,
      message,
      data
    });

    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Also log to console for immediate feedback
    if (data) {
      console.log(`[${component}] ${message}`, data);
    } else {
      console.log(`[${component}] ${message}`);
    }
  }

  /**
   * Get all collected logs
   */
  public getLogs(): DebugLogEntry[] {
    return this.logs;
  }

  /**
   * Get logs for a specific component
   */
  public getComponentLogs(component: string): DebugLogEntry[] {
    return this.logs.filter(log => log.component === component);
  }

  /**
   * Clear all logs
   */
  public clearLogs(): void {
    this.logs = [];
    this.startTime = performance.now();
    this.log('DebugService', 'Logs cleared');
  }

  /**
   * Export logs as formatted string
   */
  public exportLogs(): string {
    return this.logs.map(log => 
      `[${log.timestamp.toFixed(2)}ms] [${log.component}] ${log.message}${log.data ? '\n' + JSON.stringify(log.data, null, 2) : ''}`
    ).join('\n');
  }

  /**
   * Download logs as a text file
   */
  public downloadLogs(): void {
    const content = this.exportLogs();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debug-logs-${new Date().toISOString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Add keyboard shortcut for downloading logs
   */
  public setupKeyboardShortcut(): void {
    window.addEventListener('keydown', (event) => {
      // Ctrl + Alt + L to download logs
      if (event.ctrlKey && event.altKey && event.key === 'l') {
        this.downloadLogs();
      }
    });
    this.log('DebugService', 'Keyboard shortcut (Ctrl+Alt+L) enabled for log download');
  }
}

export default DebugService;
