/**
 * Trigger module types
 */

/**
 * A single trigger action
 */
export type TriggerAction = {
  type: "correct" | "notify" | "log" | "skip" | "custom";
  target?: string;
  config?: Record<string, unknown>;
  delay?: number;
};

/**
 * Result of a single action execution
 */
export interface TriggerActionResult {
  type: string;
  success: boolean;
  result?: string | unknown[];
  error?: Error;
}

/**
 * Legacy trigger config (for convertLegacyConfig)
 */
export interface LegacyTriggerConfig {
  rules?: Array<{
    name?: string;
    enabled?: boolean;
    extensions?: string[];
    eventTypes?: string[];
    severity?: string;
    actions?: Array<{
      type?: string;
      target?: string;
      config?: Record<string, unknown>;
    }>;
  }>;
}
