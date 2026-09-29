/**
 * Terminal statuses are those from which an outbox event will not
 * transition again under normal operation.  Recovery tooling and the
 * publisher rely on this classification to decide whether an event is
 * eligible for retry, reinjection, or cleanup.
 */
export const TERMINAL_OUTBOX_STATUSES: ReadonlyArray<OutboxEventStatus> = [
  'published',
  'dead_letter',
]

/**
 * Domain event stored in the outbox table.
 */
export interface OutboxEvent {
  id: bigint
  aggregateType: string
  aggregateId: string
  eventType: string
  payload: Record<string, unknown>
  rawPayload?: string
  payloadParseError?: string
  status: OutboxEventStatus
  retryCount: number
  maxRetries: number
  consumerId?: string | null
  leaseExpiresAt?: Date | null
  createdAt: Date
  processedAt: Date | null
  errorMessage: string | null
  traceId?: string | null
  spanId?: string | null
  tracestate?: string | null
  shardCount?: number | null
  shardId?: number | null
  /**
   * Application-level correlation id (distinct from the OTel trace/span
   * ids above) captured from the originating HTTP request's tracing
   * context at emit time. Restored into the tracing context when this
   * event is published so downstream logs and outbound webhook requests
   * can be tied back to the request that caused them.
   */
  correlationId?: string | null
  /**
   * Set before publishing to prevent duplicate emissions if the worker
   * crashes mid-batch.  When present the publisher treats the event as
   * already delivered and skips straight to markPublished.
   */
  publishIdempotencyKey?: string | null
  /**
   * Timestamp of the most recent publish attempt.  Used by recovery
   * tooling to detect stale `processing` rows whose lease has expired
   * and to compute retry backoff without relying on wall-clock drift
   * between the worker and the database.
   */
  lastAttemptAt?: Date | null
}

export type OutboxEventStatus = 'pending' | 'processing' | 'published' | 'failed' | 'dead_letter'

export type OutboxQuarantineReason =
  | 'malformed_json'
  | 'schema_invalid'
  | 'oversized_payload'
  | 'unknown_event_type'

/**
 * Reasons an outbox event may be recovered from a non-terminal state.
 * Kept as a closed union so callers cannot silently introduce new
 * recovery paths without updating downstream metrics and audit logs.
 */
export type OutboxRecoveryReason =
  | 'lease_expired'
  | 'stale_processing'
  | 'retry_exhausted'
  | 'manual_reinject'

export interface OutboxQuarantineEntry {
  id: bigint
  originalEventId: bigint
  aggregateType: string
  aggregateId: string
  eventType: string
  payload: Record<string, unknown> | string | null
  reason: OutboxQuarantineReason
  errorMessage: string
  retryCount: number
  maxRetries: number
  quarantinedAt: Date
  reinjectedAt: Date | null
  reinjectedBy: string | null
  /**
   * Reason the entry was quarantined.  Mirrors `reason` but is nullable
   * for rows written before the reason column was introduced, so
   * recovery tooling can distinguish legacy rows from new ones.
   */
  recoveryReason?: OutboxRecoveryReason | null
}

/**
 * Input for creating a new outbox event.
 */
export interface CreateOutboxEvent {
  aggregateType: string
  aggregateId: string
  eventType: string
  payload: Record<string, unknown>
  maxRetries?: number
  /**
   * Optional idempotency key supplied by the caller.  When present the
   * publisher will reuse it instead of generating a fresh one, which
   * lets callers safely retry event creation without duplicating
   * downstream side effects.
   */
  publishIdempotencyKey?: string | null
  traceId?: string | null
  spanId?: string | null
  tracestate?: string | null
  correlationId?: string | null
}

/**
 * Configuration for outbox cleanup policy.
 */
export interface OutboxCleanupConfig {
  /** Delete published events older than this many days. Default: 7 */
  publishedRetentionDays: number
  /** Delete failed events older than this many days. Default: 30 */
  failedRetentionDays: number
  /**
   * Delete dead-letter events older than this many days.  Defaults to
   * `failedRetentionDays` when omitted so existing callers keep their
   * current behavior while new callers can tune dead-letter retention
   * independently.
   */
  deadLetterRetentionDays?: number
}
