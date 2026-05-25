export function getOpenAIErrorPayload(error: unknown) {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : undefined;
  const message =
    error instanceof Error ? error.message : "OpenAI request failed";

  if (!status) return null;

  return {
    status,
    body: {
      error: message,
      code:
        status === 401
          ? "openai_auth_failed"
          : status === 429
            ? "openai_quota_or_rate_limit"
            : status >= 500
              ? "openai_server_error"
              : "openai_request_failed",
    },
  };
}
