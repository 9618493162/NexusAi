import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, Sparkles, Zap, Shield, Bot, Mic, FileText, MessageSquare, Cpu,
  FolderKanban, Workflow, LayoutDashboard, Image as ImageIcon, Video,
  Database, Compass, Brain, History as HistoryIcon, Star, BarChart3,
  Presentation, TrendingUp, Search, KeyRound, Users, ChevronRight, Key, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NexusCore } from "@/components/ui/nexus-core";

// Capability nodes orbiting the Nexus Core — each maps to a real NexusAI tool.
const ORBIT_NODES = [
  { icon: MessageSquare, label: "Chat", pos: "left-1/2 -top-7 -translate-x-1/2", del: 0 },
  { icon: Bot, label: "Agents", pos: "right-0 top-1/4 translate-x-1/2 -translate-y-1/2", del: 0.6 },
  { icon: FileText, label: "Files", pos: "right-2 bottom-2", del: 1.2 },
  { icon: Cpu, label: "Models", pos: "left-2 bottom-2", del: 1.8 },
  { icon: Workflow, label: "Workflows", pos: "left-0 top-1/4 -translate-x-1/2 -translate-y-1/2", del: 2.4 },
  { icon: FolderKanban, label: "Projects", pos: "left-1/2 -bottom-7 -translate-x-1/2", del: 3 },
];

// Workspace families — every entry links to a real NexusAI route.
const CAPABILITIES = [
  {
    icon: LayoutDashboard,
    title: "Workspace",
    description: "One command surface for everything NexusAI can do.",
    accent: "from-primary/25 to-indigo-500/5 text-primary ring-primary/20",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/command", icon: Sparkles, label: "Command Center" },
      { to: "/chat", icon: MessageSquare, label: "Chats" },
      { to: "/agents", icon: Bot, label: "Agents" },
      { to: "/models", icon: Cpu, label: "AI Models" },
    ],
  },
  {
    icon: Zap,
    title: "Create",
    description: "Generate images, video, voice, decks and documents.",
    accent: "from-pink-500/25 to-rose-500/5 text-pink-500 ring-pink-500/20",
    items: [
      { to: "/image-studio", icon: ImageIcon, label: "Image Studio" },
      { to: "/video-studio", icon: Video, label: "Video Studio" },
      { to: "/voice", icon: Mic, label: "Voice" },
      { to: "/documents", icon: Presentation, label: "Documents & Decks" },
      { to: "/workflows", icon: Workflow, label: "Workflows" },
    ],
  },
  {
    icon: Brain,
    title: "Intelligence",
    description: "Understand files, datasets, research and memory.",
    accent: "from-emerald-500/25 to-teal-500/5 text-emerald-500 ring-emerald-500/20",
    items: [
      { to: "/files", icon: FileText, label: "File Intelligence" },
      { to: "/data-lab", icon: Database, label: "Data Lab" },
      { to: "/research", icon: Compass, label: "Research Studio" },
      { to: "/markets", icon: TrendingUp, label: "Markets" },
      { to: "/memory", icon: Brain, label: "Memory" },
    ],
  },
  {
    icon: Users,
    title: "Collaborate",
    description: "Meet, build and keep everything organized.",
    accent: "from-cyan-500/25 to-sky-500/5 text-cyan-500 ring-cyan-500/20",
    items: [
      { to: "/meetings", icon: Mic, label: "Meetings" },
      { to: "/projects", icon: FolderKanban, label: "Projects" },
      { to: "/history", icon: HistoryIcon, label: "History" },
      { to: "/favorites", icon: Star, label: "Favorites" },
    ],
  },
  {
    icon: BarChart3,
    title: "Understand",
    description: "See how you use NexusAI, search everything, keep control.",
    accent: "from-amber-500/25 to-orange-500/5 text-amber-500 ring-amber-500/20",
    items: [
      { to: "/analytics", icon: BarChart3, label: "Analytics" },
      { to: "/search", icon: Search, label: "Search" },
      { to: "/settings", icon: KeyRound, label: "Settings & API Keys" },
      { to: "/profile", icon: Users, label: "Profile" },
    ],
  },
];

const FEATURES = [
  { icon: Zap, title: "Multi-model chat", description: "Groq, Gemini, Mistral, OpenRouter and NVIDIA — with smart Auto routing that picks the best provider per task." },
  { icon: Bot, title: "Image & video studio", description: "Generate images with FLUX and Gemini, and AI video through one interface — with automatic fallback when a provider runs out of credits." },
  { icon: FileText, title: "File intelligence", description: "Upload PDFs, docs, spreadsheets and more — text is extracted automatically and ready to analyze or ask questions about." },
  { icon: Database, title: "Data Lab", description: "Analyze CSVs, Excel and JSON with real statistics, charts and natural-language questions backed by actual computation." },
  { icon: Compass, title: "Deep research", description: "Search the web and your own files, compare sources, and get a cited synthesis — never fabricated findings." },
  { icon: Mic, title: "Voice in any language", description: "Live speech-to-text with Deepgram, replies translated and spoken in 30+ languages." },
  { icon: Shield, title: "Private by design", description: "Supabase authentication, JWT sessions, and keys kept server-side — never in the browser." },
  { icon: Sparkles, title: "Premium experience", description: "A fast, spatial, dark-first interface built for deep work — keyboard-first with ⌘K navigation." },
];

const PROVIDERS = ["Groq", "Google Gemini", "Mistral", "OpenRouter", "NVIDIA", "Deepgram", "MagicSlides", "Massive"];

export function Landing() {
  const reduced = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Glass top nav — compact on scroll */}
      <header className={`sticky top-0 z-50 border-b transition-all duration-300 ${scrolled ? "border-border/60 bg-background/80 shadow-popover backdrop-blur-2xl backdrop-saturate-150" : "border-transparent bg-background/60 backdrop-blur-xl backdrop-saturate-150"}`}>
        <div className={`mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 transition-all duration-300 ${scrolled ? "h-14" : "h-16"}`}>
          <Link to="/" className="flex items-center gap-2.5" aria-label="NexusAI home">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary to-indigo-500 text-primary-foreground shadow-sm">
              <Sparkles className="h-4 w-4" strokeWidth={2} />
            </div>
            <span className="text-lg font-bold tracking-tight">
              Nexus<span className="text-gradient">AI</span>
            </span>
          </Link>
          <div className="flex items-center gap-2.5">
            <Link to="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/register">
              <Button size="sm" className="gap-1.5">
                Get Started <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden py-20 lg:py-32">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -top-24 left-1/2 h-80 w-[50rem] -translate-x-1/2 rounded-full bg-primary/12 blur-3xl" />
          <div className="absolute bottom-0 right-10 h-64 w-64 rounded-full bg-indigo-500/8 blur-3xl" />
          <div className="absolute bottom-0 left-10 h-56 w-56 rounded-full bg-cyan-500/6 blur-3xl" />
          <div className="spatial-grid opacity-40" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
          {/* Floating Nexus Core with orbiting capability nodes */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 18 }}
            className="relative mx-auto mb-10 h-52 w-52"
            aria-hidden="true"
          >
            <NexusCore size={180} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
            {!reduced &&
              ORBIT_NODES.map((node) => (
                <motion.div
                  key={node.label}
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 5 + node.del, repeat: Infinity, ease: "easeInOut", delay: node.del }}
                  className={`absolute z-10 ${node.pos}`}
                >
                  <div className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card/85 px-3 py-1.5 text-xs font-medium shadow-popover backdrop-blur">
                    <node.icon className="h-3.5 w-3.5 text-primary" strokeWidth={2} />
                    {node.label}
                  </div>
                </motion.div>
              ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-5 py-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <Sparkles className="h-4 w-4" /> Your all-in-one AI workspace
            </div>
            <h1 className="display-tight text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              Meet <span className="text-aurora">NexusAI</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground text-balance sm:text-xl">
              One intelligent system for chat, creation, analysis and research — powered by your own AI providers, with every result real and every key kept server-side.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
              <Link to="/register">
                <Button size="lg" className="gap-2 glow-primary">
                  Get Started Free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline">Sign In</Button>
              </Link>
            </div>

            {/* Real provider strip */}
            <div className="mt-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">Runs on the providers you already trust</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {PROVIDERS.map((p) => (
                  <span key={p} className="rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>

          {/* ── Chat Preview Mockup ── */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
            className="mx-auto mt-16 max-w-3xl"
          >
            <div className="relative rounded-2xl border border-border/50 bg-card/70 shadow-2xl backdrop-blur-xl overflow-hidden">
              {/* Window chrome */}
              <div className="flex items-center gap-2 border-b border-border/40 bg-card/90 px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-border/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-border/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-border/60" />
                </div>
                <span className="ml-2 text-[11px] font-medium text-muted-foreground/60">NexusAI Chat</span>
              </div>
              {/* Mock conversation */}
              <div className="space-y-4 p-5">
                {/* User message */}
                <div className="flex justify-end">
                  <div className="max-w-[70%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                    Explain the difference between REST and GraphQL APIs
                  </div>
                </div>
                {/* AI response */}
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-muted/60 px-4 py-3 text-sm leading-relaxed text-foreground/90">
                    <p className="mb-2"><strong>REST</strong> uses fixed endpoints (GET, POST, PUT, DELETE) where each URL maps to a resource. The server decides what data to return.</p>
                    <p><strong>GraphQL</strong> uses a single endpoint where the client specifies exactly what data it needs using a query language.</p>
                  </div>
                </div>
                {/* Code block in AI response */}
                <div className="flex justify-start">
                  <div className="max-w-[80%] overflow-hidden rounded-2xl rounded-bl-md bg-muted/60 text-sm">
                    <div className="flex items-center justify-between border-b border-border/30 bg-card/50 px-4 py-1.5">
                      <span className="text-[10px] font-medium text-muted-foreground">REST</span>
                      <span className="text-[10px] text-muted-foreground/60">vs</span>
                      <span className="text-[10px] font-medium text-muted-foreground">GraphQL</span>
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-border/30">
                      <div className="px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                        <code className="text-primary/80">GET /api/users/123</code>
                        <p className="mt-1">Fixed response shape</p>
                      </div>
                      <div className="px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                        <code className="text-primary/80">query {'{'} user(id: 123) {'}'}</code>
                        <p className="mt-1">Client chooses fields</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Composer bar */}
              <div className="border-t border-border/40 bg-card/90 px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary/50" />
                  </div>
                  <div className="flex-1 rounded-xl border border-border/50 bg-background/50 px-4 py-2 text-sm text-muted-foreground/50 backdrop-blur">
                    Ask NexusAI anything...
                  </div>
                  <Button size="sm" className="gap-1.5 opacity-40" tabIndex={-1}>
                    Send <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Capability families — every tile links to a real page ── */}
      <section className="border-t border-border bg-card/40 py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="mb-10 max-w-2xl"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Capabilities</p>
            <h2 className="display-tight mt-2 text-2xl font-bold tracking-tight sm:text-4xl">
              One workspace. <span className="text-gradient">Every tool.</span>
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Chat, create, analyze, research, meet and build — all part of one intelligent system that shares your files, memory and projects.
            </p>
          </motion.div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((fam, index) => (
              <motion.div
                key={fam.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: index * 0.06, type: "spring", stiffness: 90, damping: 16 }}
                className="card-surface card-hover group relative overflow-hidden p-6"
              >
                <div aria-hidden className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-gradient-to-br from-primary/10 to-transparent blur-2xl transition-transform duration-500 group-hover:scale-125" />
                <div className="relative">
                  <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ring-1 transition-transform duration-300 ease-fluid group-hover:scale-110 ${fam.accent}`}>
                    <fam.icon className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  <h3 className="text-base font-semibold tracking-tight">{fam.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{fam.description}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {fam.items.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-card/70 px-2.5 py-1 text-xs font-medium text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        <item.icon className="h-3 w-3" strokeWidth={1.9} />
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}

            {/* The "how it connects" tile — closes the family grid */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: 0.3, type: "spring", stiffness: 90, damping: 16 }}
              className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary/12 via-primary/5 to-transparent p-6"
            >
              <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
              <div className="relative">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Connected by design</p>
                <h3 className="mt-2 text-base font-semibold tracking-tight">From raw idea to finished work</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  A meeting becomes a summary, a summary becomes a report, a dataset becomes a chart, research becomes a cited deck — context flows across the workspace.
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs font-medium text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>File → Analyze → Research → Report → Present</span>
                </div>
              </div>
              <Link to="/register" className="relative mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary-hover">
                Try it free <ChevronRight className="h-4 w-4" />
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Feature grid ── */}
      <section className="border-t border-border py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="mb-10 max-w-2xl"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">What you can do</p>
            <h2 className="display-tight mt-2 text-2xl font-bold tracking-tight sm:text-4xl">
              Real features, <span className="text-gradient">real results</span>
            </h2>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: index * 0.05, type: "spring", stiffness: 90, damping: 16 }}
                className="card-surface card-hover group p-5"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/20 transition-transform duration-300 ease-fluid group-hover:scale-110">
                  <feature.icon className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <h3 className="text-sm font-semibold tracking-tight">{feature.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BYOK / Security section ── */}
      <section className="border-t border-border bg-card/40 py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Bring Your Own AI</p>
              <h2 className="display-tight mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
                Your keys. Your models. <span className="text-gradient">Your control.</span>
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Connect your own API keys from Groq, Gemini, Mistral, OpenRouter, NVIDIA and more. Your keys are encrypted server-side with AES-256 and never exposed to the browser.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  { icon: Key, text: "Add any supported provider key" },
                  { icon: Lock, text: "AES-256 encrypted, server-side only" },
                  { icon: Shield, text: "Test connections before using" },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm text-foreground/80">{item.text}</span>
                  </div>
                ))}
              </div>
              <Link to="/register" className="mt-7 inline-block">
                <Button size="lg" className="gap-2">Get started <ArrowRight className="h-4 w-4" /></Button>
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: 0.1, ease: "easeOut" }}
              className="relative"
            >
              <div className="rounded-2xl border border-border/50 bg-card/70 p-6 shadow-xl backdrop-blur-xl">
                <div className="space-y-3">
                  {[{ name: "Groq", status: "Connected", color: "bg-success" }, { name: "Gemini", status: "Connected", color: "bg-success" }, { name: "Mistral", status: "Server key", color: "bg-info" }, { name: "OpenRouter", status: "Add key", color: "bg-muted-foreground/40" }].map((p) => (
                    <div key={p.name} className="flex items-center justify-between rounded-xl border border-border/40 bg-background/50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                          {p.name[0]}
                        </span>
                        <span className="text-sm font-medium">{p.name}</span>
                      </div>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className={`h-2 w-2 rounded-full ${p.color}`} />
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium text-primary">All keys encrypted with AES-256</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative overflow-hidden py-20 lg:py-32">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute left-1/2 top-1/2 h-72 w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <NexusCore size={64} className="mx-auto mb-6" />
            <h2 className="display-tight text-3xl font-bold tracking-tight sm:text-4xl">Your AI workspace<br className="hidden sm:block" /> starts here.</h2>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">Join NexusAI and put the best AI models to work for you — free.</p>
            <Link to="/register" className="mt-7 inline-block">
              <Button size="lg" className="gap-2 glow-primary">Create your account <ArrowRight className="h-4 w-4" /></Button>
            </Link>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10 text-center text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">NexusAI</span> — an intelligent AI workspace.
        <span className="mx-2 text-border">·</span>
        <Link to="/login" className="transition-colors hover:text-foreground">Sign in</Link>
        <span className="mx-2 text-border">·</span>
        <Link to="/register" className="transition-colors hover:text-foreground">Create account</Link>
      </footer>
    </div>
  );
}
