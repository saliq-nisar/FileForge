import "server-only";
import { serverConfig } from "../config";

/**
 * OPTIONAL AI layer. No core feature depends on this module: PDF, image,
 * document, invoice, resume and ATS features are fully deterministic and work
 * with no AI configuration at all. Adapters (OpenAI, Anthropic, Gemini, local
 * models…) can implement this interface later; until then getAIProvider()
 * returns null and AI-enhanced buttons simply aren't shown.
 *
 * Rule for any future adapter: generate wording only from user-provided facts —
 * never invent employers, degrees, skills, metrics or achievements.
 */
export interface AIProvider {
  readonly id: string;
  generateText(input: string, options?: { maxTokens?: number; system?: string }): Promise<string>;
}

type Factory = () => AIProvider;

const adapters: Record<string, Factory> = {
  // e.g. anthropic: () => new AnthropicProvider(process.env.AI_API_KEY!)
};

export function getAIProvider(): AIProvider | null {
  const id = serverConfig.ai.provider;
  if (!id) return null;
  const factory = adapters[id];
  return factory ? factory() : null;
}
