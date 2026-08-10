import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Zap, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Landing() {
  return (
    <div className="min-h-screen">
      <section className="relative overflow-hidden py-20 lg:py-32">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm mb-8">
              <Sparkles className="w-4 h-4" /> Powered by Groq LLaMA 3
            </div>
            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight mb-6">Meet <span className="text-primary">NexusAI</span></h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">Your intelligent AI companion for coding, creativity, and productivity. Free, fast, and privacy-focused.</p>
            <div className="flex gap-4 justify-center">
              <Link to="/register"><Button size="lg" className="gap-2">Get Started Free <ArrowRight className="w-4 h-4" /></Button></Link>
              <Link to="/login"><Button size="lg" variant="outline">Sign In</Button></Link>
            </div>
          </motion.div>
        </div>
      </section>
      <section className="py-20 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            {[{ icon: Zap, title: "Lightning Fast", description: "Powered by Groq's ultra-fast inference. Get responses in milliseconds." }, { icon: Sparkles, title: "Multi-Modal", description: "Chat, generate images, create videos, and process files all in one place." }, { icon: Shield, title: "Privacy First", description: "Your data stays yours. Secure authentication and encrypted connections." }].map((feature, index) => (
              <motion.div key={feature.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }} className="p-6 rounded-xl border border-border bg-card hover:border-primary/50 transition-colors">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4"><feature.icon className="w-6 h-6 text-primary" /></div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
