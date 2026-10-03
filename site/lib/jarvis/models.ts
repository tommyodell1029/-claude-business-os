// TypeScript mirror of lib/lp/config.py: model IDs come only from config/models.yaml (via models.generated.ts),
// and each component may use only the roles listed under `allowed`.
import { MODELS_CONFIG } from "./models.generated.ts";

type Cfg = { models: Record<string, string>; allowed: Record<string, readonly string[]>; tts?: Record<string, string> };

export function model(role: string, component: string, cfg: Cfg = MODELS_CONFIG): string {
  if (!(cfg.allowed[component] ?? []).includes(role)) {
    throw new Error(`component ${JSON.stringify(component)} may not use model role ${JSON.stringify(role)}`);
  }
  const id = cfg.models[role];
  if (!id) throw new Error(`no model configured for role ${JSON.stringify(role)}`);
  return id;
}

export function ttsModel(provider: string, cfg: Cfg = MODELS_CONFIG): string | null {
  return cfg.tts?.[provider] ?? null;
}

/** Same lookup order as lp.config.anthropic_api_key(). */
export function anthropicKey(env: Record<string, string | undefined>): string | null {
  for (const name of ["ANTHROPIC_API_KEY", "LP_ANTHROPIC_API_KEY"]) {
    const v = env[name]?.trim();
    if (v) return v;
  }
  return null;
}
