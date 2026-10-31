import { useEffect, useState } from 'react';

/** Creates an object URL for a Blob and revokes it when the Blob changes or the component unmounts. */
export function useObjectUrl(blob: Blob): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const created = URL.createObjectURL(blob);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [blob]);
  return url;
}
