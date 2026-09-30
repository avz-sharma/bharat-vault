for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await fetch("http://127.0.0.1:8000/api/v1/health", {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) process.exit(0);
  } catch {
    /* API may still be starting. */
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
throw new Error("Local API did not become healthy");
