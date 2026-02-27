/** Base rotation provider interface. */

export interface RotationResult {
  success: boolean;
  newSecret: string;
  error: string;
  metadata: Record<string, unknown>;
}

/**
 * Abstract base for secret rotation providers.
 *
 * Subclasses implement the actual API calls to rotate secrets
 * at the provider (OpenAI, GitHub, etc.).
 */
export abstract class RotationProvider {
  abstract readonly name: string;
  protected config: Record<string, unknown>;

  constructor(config?: Record<string, unknown>) {
    this.config = config ?? {};
  }

  /**
   * Rotate the secret at the provider.
   *
   * @param currentSecret The current plaintext secret value.
   * @returns RotationResult with the new secret value on success.
   */
  abstract rotate(currentSecret: string): Promise<RotationResult>;

  /**
   * Validate that a secret is still working at the provider.
   * Default implementation returns true (no validation).
   */
  async validate(secret: string): Promise<boolean> {
    return true;
  }
}
