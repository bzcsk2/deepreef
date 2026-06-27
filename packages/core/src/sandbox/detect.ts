import type { SandboxCapabilities, EvalEnvironmentId } from "./types";
import { detectBestProvider } from "./provider-registry";

export interface EnvironmentDiagnostics {
  environmentId: EvalEnvironmentId;
  providerId: string;
  official: boolean;
  available: boolean;
  reason?: string;
}

export async function diagnoseEnvironment(environmentId: EvalEnvironmentId): Promise<EnvironmentDiagnostics> {
  try {
    const { provider, capabilities } = await detectBestProvider(environmentId);
    return {
      environmentId,
      providerId: provider.id,
      official: capabilities.official,
      available: capabilities.available,
      reason: capabilities.reason,
    };
  } catch (err) {
    return {
      environmentId,
      providerId: "none",
      official: false,
      available: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
