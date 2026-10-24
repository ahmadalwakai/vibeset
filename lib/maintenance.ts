/** Internal-only narrowing for isolated fixtures or deliberate maintenance backfills. */
export interface MaintenanceScope {
  themeIds: readonly string[];
  uploadIds: readonly string[];
  appRateKeys: readonly string[];
  authRateKeys: readonly string[];
}
export interface MaintenanceOptions {
  asOf?: string;
  scope?: MaintenanceScope;
}
export interface MaintenanceSummary {
  popularityChecked: number;
  popularityUpdated: number;
  popularityRetried: number;
  popularityPending: number;
  countersChecked: number;
  countersUpdated: number;
  countersRetried: number;
  countersPending: number;
  cleanupRetried: number;
  cleanupPending: number;
  appRateLimitsDeleted: number;
  authRateLimitsDeleted: number;
  uploadsRejected: number;
}
export type MaintenancePhase = 'popularity' | 'counters' | 'cleanup';
export interface MaintenanceUpdateCount {
  checked: number;
  updated: number;
  retried: number;
}
export interface MaintenanceCleanupCount {
  appRateLimitsDeleted: number;
  authRateLimitsDeleted: number;
  uploadsRejected: number;
}
