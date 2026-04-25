import { Leaf } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

const LS_TOKEN_KEY = "offload_household_token";

/**
 * Smart entry point — no login, no landing page.
 * - Has a stored household token → /dashboard
 * - No token → /onboarding
 */
export default function Home() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const token = localStorage.getItem(LS_TOKEN_KEY);
    if (token) {
      navigate("/dashboard");
    } else {
      navigate("/onboarding");
    }
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Leaf className="w-8 h-8 text-primary animate-pulse" />
        <p className="text-sm text-muted-foreground">Loading Offload...</p>
      </div>
    </div>
  );
}
