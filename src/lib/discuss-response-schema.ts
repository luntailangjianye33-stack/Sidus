export const discussSuggestionResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "discussionId",
    "generatedAt",
    "answer",
    "revisedSuggestion",
    "evidenceNotes",
    "userConfirmationNeeded",
  ],
  properties: {
    discussionId: { type: "string" },
    generatedAt: { type: "string" },
    answer: { type: "string" },
    revisedSuggestion: {
      type: "object",
      additionalProperties: false,
      required: ["title", "rationale", "diffHint"],
      properties: {
        title: { type: "string" },
        rationale: { type: "string" },
        diffHint: {
          type: "object",
          additionalProperties: false,
          required: ["before", "after", "changeSummary"],
          properties: {
            before: { type: "string" },
            after: { type: "string" },
            changeSummary: { type: "string" },
          },
        },
      },
    },
    evidenceNotes: {
      type: "array",
      items: { type: "string" },
    },
    userConfirmationNeeded: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;
