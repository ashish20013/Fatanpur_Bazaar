'use client';

import { ErrorScreen } from '@/components/ErrorScreen';

export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }): React.ReactNode {
  return <ErrorScreen reset={reset} home="/" digest={error.digest} />;
}
