import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Leaf, ArrowRight, CheckCircle2, Users, Zap } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && user) navigate("/dashboard");
  }, [loading, user]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Nav */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Leaf className="w-5 h-5 text-primary" />
          <span className="font-semibold text-foreground text-lg">Offload</span>
        </div>
        <a href={getLoginUrl()} className="text-sm text-primary font-medium hover:underline">
          Sign in
        </a>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center max-w-xl mx-auto space-y-8">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-medium px-3 py-1.5 rounded-full">
            <Leaf className="w-3.5 h-3.5" />
            For busy families
          </div>
          <h1 className="text-4xl font-bold text-foreground leading-tight">
            Stop carrying it all<br />
            <span className="text-primary">in your head.</span>
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Offload captures the mental load of running a household — school notices, party invites,
            medical letters — and routes every task to the right person automatically.
          </p>
        </div>

        {/* Features */}
        <div className="w-full space-y-3 text-left">
          {[
            {
              icon: <Zap className="w-4 h-4 text-primary" />,
              title: "AI extracts tasks from anything",
              desc: "Paste text, upload a photo, or record a voice note.",
            },
            {
              icon: <Users className="w-4 h-4 text-primary" />,
              title: "Routes to the right person",
              desc: "Learns your household's rules and asks when it's unsure.",
            },
            {
              icon: <CheckCircle2 className="w-4 h-4 text-primary" />,
              title: "Shows who's carrying the load",
              desc: "See mental load imbalance as a number, not a feeling.",
            },
          ].map((f, i) => (
            <div key={i} className="flex items-start gap-3 bg-card rounded-xl p-4 border border-border">
              <div className="mt-0.5 shrink-0">{f.icon}</div>
              <div>
                <p className="text-sm font-semibold text-foreground">{f.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <a href={getLoginUrl()} className="w-full">
          <Button size="lg" className="w-full rounded-xl text-base">
            Get started free
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </a>

        <p className="text-xs text-muted-foreground">
          No credit card required. Share with your partner in seconds.
        </p>
      </main>
    </div>
  );
}
