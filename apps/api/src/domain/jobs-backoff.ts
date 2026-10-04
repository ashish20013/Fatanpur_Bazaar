/**
 * A26 retry policy: attempts+1; ≥ max → failed; else run_after = now + 2^attempts minutes.
 * The claim must also be released (locked_by = NULL) or the same worker re-grabs the
 * failed job immediately and burns every retry in one run.
 */
export interface JobFailureOutcome {
  attempts: number;
  failed: boolean;
  retryAfterMinutes: number | null;
  release: { locked_at: null; locked_by: null };
}
export function onJobFailure(prevAttempts: number, maxAttempts: number): JobFailureOutcome {
  const attempts = prevAttempts + 1;
  const failed = attempts >= maxAttempts;
  return { attempts, failed, retryAfterMinutes: failed ? null : 2 ** attempts, release: { locked_at: null, locked_by: null } };
}
