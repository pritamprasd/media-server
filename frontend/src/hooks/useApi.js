import { useState, useEffect, useCallback } from "react";

export function useApi(requestFn, immediate = true) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);

  const execute = useCallback(
    async (...args) => {
      setLoading(true);
      setError(null);
      try {
        const result = await requestFn(...args);
        setData(result);
        return result;
      } catch (err) {
        const message = err.response?.data?.message || err.message;
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [requestFn],
  );

  useEffect(() => {
    if (immediate) execute();
  }, [execute, immediate]);

  return { data, loading, error, execute };
}
