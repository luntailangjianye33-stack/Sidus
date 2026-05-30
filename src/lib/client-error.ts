type ApiErrorBody = {
  code?: string;
  error?: string;
};

const friendlyMessages: Record<string, string> = {
  openai_quota_or_rate_limit:
    "OpenAI APIの利用上限または課金枠に達しています。Billing、Project予算、Rate limitを確認してから再実行してください。",
  openai_auth_failed:
    "OpenAI APIキーの認証に失敗しました。ローテーション済みの正しいキーが.env.localに設定されているか確認してください。",
  openai_empty_response:
    "OpenAIから空の応答が返りました。少し待ってから再実行してください。",
  openai_invalid_json:
    "OpenAIの応答形式が想定と異なりました。プロンプトまたはスキーマ調整が必要です。",
  openai_server_error:
    "OpenAI側で一時的なサーバーエラーが発生しました。少し待ってから再実行してください。",
  openai_request_failed:
    "OpenAI APIリクエストに失敗しました。入力内容、モデル名、API設定を確認してください。",
  company_research_timeout:
    "企業情報のAI調査がタイムアウトしました。参考URLを減らすか、少し待って再実行してください。",
  benchmark_research_timeout:
    "参考ESベンチマークの生成がタイムアウトしました。少し待ってから再実行してください。",
  openai_timeout:
    "AIレビューがタイムアウトしました。ES本文や参考情報を短くして再実行してください。",
  discussion_timeout:
    "提案の再検討がタイムアウトしました。質問を短くして再実行してください。",
};

export function createClientErrorMessage(
  errorBody: ApiErrorBody | null,
  fallback: string,
) {
  if (errorBody?.code && friendlyMessages[errorBody.code]) {
    return friendlyMessages[errorBody.code];
  }

  if (errorBody?.code) {
    return errorBody.error
      ? `${fallback} ${errorBody.error}（${errorBody.code}）`
      : `${fallback}（${errorBody.code}）`;
  }

  return errorBody?.error ?? fallback;
}
