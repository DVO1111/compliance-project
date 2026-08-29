import { useState } from 'react';
import { submitWaitlist, type WaitlistEntry, type WaitlistSource } from '../../lib/waitlist';

export type SubmitStatus = 'idle' | 'sending' | 'done' | 'error';

/**
 * Submission state for a marketing page's waitlist CTA.
 *
 * All five pages need the same four states — idle, in flight, recorded,
 * failed — so they share this rather than each keeping a `submitted` boolean
 * that lies about whether anything was actually saved.
 */
export function useWaitlistSubmit(source: WaitlistSource) {
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const send = async (entry: Omit<WaitlistEntry, 'source'>): Promise<boolean> => {
    setStatus('sending');
    setError(null);

    const result = await submitWaitlist({ ...entry, source });
    if (result.ok) {
      setStatus('done');
      return true;
    }

    setError(result.message);
    setStatus('error');
    return false;
  };

  return {
    send,
    status,
    error,
    /** True only once the row is actually in the database. */
    submitted: status === 'done',
    sending: status === 'sending',
  };
}
