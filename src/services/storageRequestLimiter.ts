const MAX_CONCURRENT_SIGNED_URL_REQUESTS = 4;

let activeSignedUrlRequests = 0;
const waitingSignedUrlRequests: Array<() => void> = [];

export async function withSignedUrlRequestLimit<T>(
  request: () => Promise<T>,
): Promise<T> {
  if (activeSignedUrlRequests >= MAX_CONCURRENT_SIGNED_URL_REQUESTS) {
    await new Promise<void>((resolve) => {
      waitingSignedUrlRequests.push(resolve);
    });
  }

  activeSignedUrlRequests += 1;
  try {
    return await request();
  } finally {
    activeSignedUrlRequests -= 1;
    waitingSignedUrlRequests.shift()?.();
  }
}
