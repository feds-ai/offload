/**
 * Offload uses no-registration token-based access.
 * This stub exists only for compatibility with any residual imports.
 * All auth state is managed via HouseholdContext.
 */
export function useAuth() {
  return {
    user: null,
    loading: false,
    error: null,
    isAuthenticated: false,
    logout: async () => {},
    refresh: async () => {},
  };
}
