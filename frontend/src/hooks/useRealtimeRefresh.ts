import { useEffect } from 'react';

/**
 * Custom hook to trigger a refresh function when the browser tab
 * becomes visible and optionally at a fixed interval.
 * 
 * @param refreshFn - The function to call when refreshing
 * @param intervalMs - Optional interval in milliseconds (default 0 = disabled)
 */
export function useRealtimeRefresh(refreshFn: () => void, intervalMs: number = 0) {
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshFn();
      }
    };

    // Refresh when tab becomes visible
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Optional periodic refresh
    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (intervalMs > 0) {
      intervalId = setInterval(() => {
        refreshFn();
      }, intervalMs);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (intervalId) clearInterval(intervalId);
    };
  }, [refreshFn]);
}
