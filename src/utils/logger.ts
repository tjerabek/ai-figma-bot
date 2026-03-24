type Level = "DEBUG" | "INFO" | "WARN" | "ERROR";

function timestamp(): string {
  return new Date().toISOString();
}

/** Format error objects to include stack trace. */
function formatData(data: unknown): string {
  if (data instanceof Error) {
    return data.stack ?? `${data.name}: ${data.message}`;
  }
  if (data !== undefined) {
    return typeof data === "string" ? data : JSON.stringify(data, null, 2);
  }
  return "";
}

function log(level: Level, message: string, data?: unknown): void {
  const prefix = `[${timestamp()}] [${level}]`;
  const extra = formatData(data);
  const line = extra ? `${prefix} ${message} ${extra}` : `${prefix} ${message}`;

  if (level === "ERROR") {
    console.error(line);
  } else {
    console.log(line);
  }
}

const DEBUG_ENABLED = process.env.DEBUG === "1" || process.env.DEBUG === "true";

export const logger = {
  debug: (message: string, data?: unknown) => {
    if (DEBUG_ENABLED) log("DEBUG", message, data);
  },
  info: (message: string, data?: unknown) => log("INFO", message, data),
  warn: (message: string, data?: unknown) => log("WARN", message, data),
  error: (message: string, data?: unknown) => log("ERROR", message, data),
};
