import type { Job, JobResult, JobStatus } from '../types';
import { writeLog } from '../connectionStore';

/* ═══════════════════════════════════════════════════════════════
   Job Runner — Retryable sync task abstraction
   ═══════════════════════════════════════════════════════════════
   A lightweight, in-memory job queue with exponential backoff
   retry logic. Designed for integration sync tasks like:

   - Syncing documents to Google Drive
   - Posting compliance reports to Slack
   - Pulling board data from Trello

   In production, this could be backed by a persistent queue
   (Supabase Edge Functions + pg_cron, BullMQ, etc.).
   For now, it provides the abstraction layer.
   ═══════════════════════════════════════════════════════════════ */

/** Function signature for a job executor */
export type JobExecutor<TPayload = unknown, TResult = unknown> = (
    job: Job<TPayload>,
) => Promise<JobResult<TResult>>;

// ── Job Queue ────────────────────────────────────────────────

const jobQueue = new Map<string, Job>();
const executors = new Map<string, JobExecutor<any, any>>();

/** Register a named job executor */
export function registerExecutor<TPayload = unknown, TResult = unknown>(
    name: string,
    executor: JobExecutor<TPayload, TResult>,
): void {
    executors.set(name, executor);
}

/** Create and enqueue a job */
export function enqueueJob<TPayload = unknown>(opts: {
    name: string;
    connectionId: string;
    payload: TPayload;
    maxAttempts?: number;
    retryDelayMs?: number;
}): Job<TPayload> {
    const job: Job<TPayload> = {
        id: crypto.randomUUID(),
        name: opts.name,
        connection_id: opts.connectionId,
        status: 'pending',
        payload: opts.payload,
        attempts: 0,
        max_attempts: opts.maxAttempts ?? 3,
        last_error: null,
        retry_delay_ms: opts.retryDelayMs ?? 1000,
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
    };
    jobQueue.set(job.id, job);
    return job;
}

/** Run a specific job with retry logic */
export async function runJob(
    jobId: string,
    companyId: string,
): Promise<JobResult> {
    const job = jobQueue.get(jobId);
    if (!job) return { success: false, error: 'Job not found' };

    const executor = executors.get(job.name);
    if (!executor) return { success: false, error: `No executor registered for "${job.name}"` };

    setJobStatus(job, 'running');
    await writeLog(companyId, job.connection_id, 'job.started', 'info',
        `Job "${job.name}" started (attempt ${job.attempts + 1}/${job.max_attempts})`);

    while (job.attempts < job.max_attempts) {
        job.attempts++;
        try {
            const result = await executor(job);
            if (result.success) {
                setJobStatus(job, 'completed');
                await writeLog(companyId, job.connection_id, 'job.completed', 'info',
                    `Job "${job.name}" completed after ${job.attempts} attempt(s)`);
                return result;
            }
            // Executor returned failure but didn't throw
            job.last_error = result.error ?? 'Unknown error';
        } catch (err: any) {
            job.last_error = err.message ?? 'Unknown error';
        }

        // Should we retry?
        if (job.attempts < job.max_attempts) {
            const delay = job.retry_delay_ms * Math.pow(2, job.attempts - 1); // exponential backoff
            await writeLog(companyId, job.connection_id, 'job.retried', 'warn',
                `Job "${job.name}" failed (attempt ${job.attempts}), retrying in ${delay}ms: ${job.last_error}`);
            await sleep(delay);
        }
    }

    // All attempts exhausted
    setJobStatus(job, 'failed');
    await writeLog(companyId, job.connection_id, 'job.failed', 'error',
        `Job "${job.name}" failed after ${job.max_attempts} attempts: ${job.last_error}`);
    return { success: false, error: job.last_error ?? 'Max attempts exhausted' };
}

/** Cancel a pending/running job */
export function cancelJob(jobId: string): boolean {
    const job = jobQueue.get(jobId);
    if (!job || job.status === 'completed' || job.status === 'failed') return false;
    setJobStatus(job, 'cancelled');
    return true;
}

/** Get current state of all jobs (for debugging/monitoring) */
export function getJobQueue(): Job[] {
    return Array.from(jobQueue.values());
}

/** Get a specific job */
export function getJob(jobId: string): Job | undefined {
    return jobQueue.get(jobId);
}

/** Process all pending jobs sequentially */
export async function processQueue(companyId: string): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    for (const job of jobQueue.values()) {
        if (job.status !== 'pending') continue;
        const result = await runJob(job.id, companyId);
        if (result.success) processed++;
        else failed++;
    }

    return { processed, failed };
}

// ── Helpers ──────────────────────────────────────────────────

function setJobStatus(job: Job, status: JobStatus): void {
    job.status = status;
    if (status === 'running') job.started_at = new Date().toISOString();
    if (status === 'completed' || status === 'failed') job.completed_at = new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
