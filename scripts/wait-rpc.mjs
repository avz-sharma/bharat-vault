for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await fetch("http://127.0.0.1:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
    });
    if ((await response.json()).result === "0x7a69") process.exit(0);
  } catch {
    /* bounded readiness retry */
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
throw new Error("Local chain did not become ready.");
