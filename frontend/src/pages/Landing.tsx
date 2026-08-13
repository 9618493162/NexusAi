import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Zap, Shield, Bot, Mic, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NexusCore } from "@/components/ui/nexus-core";

export function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden py-20 lg:py-32">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -top-24 left-1/2 h-80 w-[50rem] -translate-x-1/2 rounded-full bg-primary/12 blur-3xl" />
          <div className="absolute bottom-0 right-10 h-64 w-64 rounded-full bg-indigo-500/8 blur-3xl" />
          <div className="absolute bottom-0 left-10 h-56 w-56 rounded-full bg-cyan-500/6 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}>
            <div className="mb-8 flex justify-center">
              <NexusCore size={132} />
            </div>
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" /> Your all-in-one AI workspace
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              Meet <span className="text-gradient">NexusAI</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground text-balance sm:text-xl">
              Chat with the best AI models, generate images and videos, analyze files, and speak in any language — all in one polished workspace.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
              <Link to="/register">
                <Button size="lg" className="gap-2">
                  Get Started Free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline">Sign In</Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="border-t border-border bg-card/40 py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Zap, title: "Multi-model chat", description: "20+ models across Groq, Gemini, Mistral, OpenRouter and NVIDIA — with smart Auto routing per task." },
              { icon: Bot, title: "Image & video studio", description: "Generate images with FLUX and Gemini, and AI video through one interface — with automatic fallback when a provider runs out of credits." },
              { icon: FileText, title: "File intelligence", description: "Upload PDFs, docs, spreadsheets and more — text is extracted automatically and ready to analyze." },
              { icon: Mic, title: "Voice in any language", description: "Live speech-to-text with Deepgram, replies translated and spoken in 30+ languages." },
              { icon: Shield, title: "Private by design", description: "Supabase authentication, JWT sessions, and keys kept server-side — never in the browser." },
              { icon: Sparkles, title: "Premium experience", description: "A fast, minimal, dark-first interface built for deep work — keyboard-first with ⌘K navigation." },
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08, duration: 0.4, ease: "easeOut" }}
                className="card-surface card-hover p-6"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/20">
                  <feature.icon className="h-5.5 w-5.5" strokeWidth={1.8} />
                </div>
                <h3 className="text-base font-semibold tracking-tight">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 lg:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready to create something?</h2>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">Join NexusAI and put the best AI models to work for you — free.</p>
            <Link to="/register" className="mt-7 inline-block">
              <Button size="lg" className="gap-2">Create your account <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">NexusAI</span> — an intelligent AI workspace.
      </footer>
    </div>
  );
}
