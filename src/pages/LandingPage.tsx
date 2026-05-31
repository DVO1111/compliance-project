import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck, Zap, Globe2, FileCheck2, BarChart3, Lock, CheckCircle2,
  ArrowRight, ChevronRight, Users, Eye, Brain, Scale, Server,
  Clock, Award, Mail, ExternalLink, Menu, X,
} from 'lucide-react';

/* ── Framer Motion section wrapper ────────────── */
const sectionVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};
function MotionWrap({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      variants={sectionVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface LandingPageProps {
  onNavigateToLogin: () => void;
  onNavigateToSignup: () => void;
}

/* ── Animated Counter ─────────────────────────── */
function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          let start = 0;
          const duration = 1600;
          const step = Math.max(1, Math.floor(target / (duration / 16)));
          const timer = setInterval(() => {
            start += step;
            if (start >= target) {
              setCount(target);
              clearInterval(timer);
            } else {
              setCount(start);
            }
          }, 16);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return <span ref={ref}>{count}{suffix}</span>;
}

/* ── Section Wrapper ─────────────────────────── */
function Section({ id, className = '', children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`px-6 md:px-12 lg:px-24 ${className}`}>
      <div className="max-w-7xl mx-auto">{children}</div>
    </section>
  );
}

/* ── Main Component ───────────────────────────── */
export default function LandingPage({ onNavigateToLogin, onNavigateToSignup }: LandingPageProps) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleWaitlist = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) setSubmitted(true);
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#0A0F1E] text-white antialiased selection:bg-blue-500/30">
      {/* Keyframe animations for gradient orbs and gauge */}
      <style>{`
        @keyframes orbFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -20px) scale(1.05); }
          66% { transform: translate(-20px, 15px) scale(0.95); }
        }
        @keyframes gaugeIn {
          from { stroke-dashoffset: 263.9; }
        }
      `}</style>

      {/* ════════════════════════════════════════════════
          NAVIGATION
         ════════════════════════════════════════════════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0A0F1E]/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-blue-400" />
            <span className="text-lg font-bold tracking-tight">Criateur <span className="text-blue-400">OS</span></span>
          </div>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-300">
            <button onClick={() => scrollTo('features')} className="hover:text-white transition">Features</button>
            <button onClick={() => scrollTo('pricing')} className="hover:text-white transition">Pricing</button>
            <button onClick={() => scrollTo('security')} className="hover:text-white transition">Security</button>
            <button onClick={() => scrollTo('cta')} className="hover:text-white transition">Contact</button>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <button onClick={onNavigateToLogin} className="text-sm text-gray-300 hover:text-white transition">
              Sign In
            </button>
            <button
              onClick={() => scrollTo('cta')}
              className="px-5 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 rounded-lg transition"
            >
              Request Demo
            </button>
          </div>

          {/* Mobile Toggle */}
          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden text-gray-300">
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/5 bg-[#0A0F1E]/95 backdrop-blur-xl px-6 py-4 space-y-3">
            <button onClick={() => scrollTo('features')} className="block w-full text-left text-sm text-gray-300 hover:text-white">Features</button>
            <button onClick={() => scrollTo('pricing')} className="block w-full text-left text-sm text-gray-300 hover:text-white">Pricing</button>
            <button onClick={() => scrollTo('security')} className="block w-full text-left text-sm text-gray-300 hover:text-white">Security</button>
            <button onClick={() => scrollTo('cta')} className="block w-full text-left text-sm text-gray-300 hover:text-white">Contact</button>
            <hr className="border-white/10" />
            <button onClick={onNavigateToLogin} className="block w-full text-left text-sm text-gray-300">Sign In</button>
            <button onClick={() => scrollTo('cta')} className="block w-full text-left text-sm font-medium text-blue-400">Request Demo</button>
          </div>
        )}
      </nav>

      {/* ════════════════════════════════════════════════
          HERO
         ════════════════════════════════════════════════ */}
      <Section className="pt-32 pb-20 md:pt-44 md:pb-28 relative overflow-hidden">
        {/* Animated gradient orbs */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-blue-600/20 blur-[120px] animate-[orbFloat_8s_ease-in-out_infinite]" />
          <div className="absolute top-20 -right-40 w-[400px] h-[400px] rounded-full bg-cyan-500/15 blur-[100px] animate-[orbFloat_10s_ease-in-out_2s_infinite_reverse]" />
        </div>

        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center relative z-10">
          {/* Left — copy */}
          <MotionWrap>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-xs font-medium mb-8">
              <Zap className="w-3.5 h-3.5" />
              Now in early access — join the waitlist
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
              The Compliance<br />
              <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                Operating System
              </span>
              <br />for Regulated Industries
            </h1>

            <p className="mt-6 text-lg text-gray-400 max-w-xl leading-relaxed">
              AI-powered compliance, immutable audit trails, and multi-jurisdiction regulatory management — built for pharmaceutical and healthcare companies that cannot afford to fail an audit.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => scrollTo('cta')}
                className="px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg flex items-center gap-2 transition shadow-lg shadow-blue-600/20"
              >
                Request Demo <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => scrollTo('features')}
                className="px-8 py-3.5 border border-white/10 hover:border-white/20 text-gray-300 hover:text-white font-medium rounded-lg flex items-center gap-2 transition"
              >
                View Features <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Invite redeem link */}
            <div className="mt-5">
              <button
                onClick={onNavigateToLogin}
                className="text-sm text-blue-400/70 hover:text-blue-300 transition inline-flex items-center gap-1.5"
                title="If you received an invite token, sign in or sign up to redeem it"
              >
                <Users className="w-3.5 h-3.5" />
                Have an invite? Redeem it here →
              </button>
            </div>

            {/* Trust Badges */}
            <div className="mt-12 flex flex-wrap gap-x-6 gap-y-3 text-xs text-gray-500 uppercase tracking-wider font-medium">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>SOC 2 Ready</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>NAFDAC Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe2 className="w-4 h-4 text-emerald-500" />
                <span>FDA / EMA Ready</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-500" />
                <span>GDPR Compliant</span>
              </div>
            </div>
          </MotionWrap>

          {/* Right — animated dashboard mockup */}
          <MotionWrap delay={0.2}>
            <div className="rounded-2xl border border-white/10 bg-[#111827]/80 backdrop-blur-sm p-6 shadow-2xl shadow-black/40">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Live Dashboard</span>
                </div>
                <span className="text-[10px] text-gray-600">Last sync: 4s ago</span>
              </div>

              {/* Compliance Score Gauge */}
              <div className="flex items-center gap-6 mb-6">
                <div className="relative w-24 h-24 shrink-0">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#1f2937" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="42" fill="none" stroke="url(#gaugeGrad)" strokeWidth="8"
                      strokeLinecap="round" strokeDasharray="263.9" strokeDashoffset="15.8"
                      className="animate-[gaugeIn_1.2s_ease-out_0.4s_both]"
                    />
                    <defs>
                      <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold">94<span className="text-sm text-gray-400">%</span></span>
                  </div>
                </div>
                <div className="space-y-2 flex-1">
                  {[
                    { level: 'Low', count: 2, color: 'bg-emerald-500', bar: 'w-1/4' },
                    { level: 'Medium', count: 5, color: 'bg-amber-500', bar: 'w-2/4' },
                    { level: 'High', count: 1, color: 'bg-red-500', bar: 'w-1/6' },
                  ].map((r) => (
                    <div key={r.level} className="flex items-center gap-2 text-xs">
                      <span className={`w-1.5 h-1.5 rounded-full ${r.color} shrink-0`} />
                      <span className="text-gray-500 w-14">{r.level}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/5">
                        <div className={`h-full rounded-full ${r.color}/60 ${r.bar}`} />
                      </div>
                      <span className="text-gray-400 w-4 text-right">{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Audit Trail Feed */}
              <div className="border-t border-white/5 pt-4">
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-3">Recent Audit Trail</p>
                <div className="space-y-2.5">
                  {[
                    { action: 'NAFDAC submission approved', user: 'Dr. Okonkwo', time: '2m ago', color: 'text-emerald-400' },
                    { action: 'Risk assessment updated', user: 'C. Ifeanyi', time: '18m ago', color: 'text-blue-400' },
                  ].map((entry, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4, delay: 0.8 + i * 0.3 }}
                      className="flex items-start gap-2.5 text-xs"
                    >
                      <div className="mt-1 w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className={`font-medium ${entry.color}`}>{entry.action}</span>
                        <span className="text-gray-600"> — {entry.user}</span>
                      </div>
                      <span className="text-gray-600 shrink-0">{entry.time}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </MotionWrap>
        </div>
      </Section>

      {/* ════════════════════════════════════════════════
          PROBLEM
         ════════════════════════════════════════════════ */}
      <Section className="py-20 md:py-28">
        <MotionWrap>
          <div className="text-center mb-16">
            <p className="text-blue-400 text-sm font-medium uppercase tracking-wider mb-3">The Problem</p>
            <h2 className="text-3xl md:text-4xl font-bold">Compliance in pharma is broken</h2>
            <p className="mt-4 text-gray-400 max-w-2xl mx-auto">Most pharmaceutical companies still manage compliance with spreadsheets, email chains, and hope. The cost of failure is measured in millions.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: FileCheck2,
                title: 'Manual compliance tracking',
                desc: 'Teams waste hundreds of hours per quarter manually reviewing promotional materials against regulations that change monthly. Errors are inevitable.',
                stat: '73%',
                statLabel: 'of pharma companies still use manual review processes',
              },
              {
                icon: Scale,
                title: 'Audit failures & penalties',
                desc: 'Without immutable evidence trails, companies face regulatory penalties averaging $2.4M per violation. Reconstructing audit history after the fact is nearly impossible.',
                stat: '$2.4M',
                statLabel: 'average penalty per compliance violation',
              },
              {
                icon: Globe2,
                title: 'Regulatory change management',
                desc: 'Operating across Nigeria, USA, Europe, and Africa means tracking dozens of regulatory bodies simultaneously. Missing a single update can invalidate entire campaigns.',
                stat: '340+',
                statLabel: 'regulatory changes per year across jurisdictions',
              },
            ].map((item, i) => (
              <div key={i} className="p-8 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition group">
                <item.icon className="w-10 h-10 text-red-400/80 mb-5" />
                <h3 className="text-lg font-semibold mb-3">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed mb-6">{item.desc}</p>
                <div className="pt-5 border-t border-white/5">
                  <p className="text-2xl font-bold text-red-400">{item.stat}</p>
                  <p className="text-xs text-gray-500 mt-1">{item.statLabel}</p>
                </div>
              </div>
            ))}
          </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          FEATURES
         ════════════════════════════════════════════════ */}
      <Section id="features" className="py-20 md:py-28">
        <MotionWrap>
        <div className="text-center mb-16">
          <p className="text-blue-400 text-sm font-medium uppercase tracking-wider mb-3">Platform Features</p>
          <h2 className="text-3xl md:text-4xl font-bold">Everything you need to stay compliant</h2>
          <p className="mt-4 text-gray-400 max-w-2xl mx-auto">Six pillars of compliance automation that replace spreadsheets, reduce risk, and make audits effortless.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: Brain,
              title: 'AI-Powered Compliance Engine',
              desc: 'Deterministic rule scanning plus LLM-powered intent analysis detects violations that keyword matching misses. Supports Gemini, OpenAI, and Anthropic with automatic fallback.',
              badge: 'AI-Enhanced',
            },
            {
              icon: Lock,
              title: 'Immutable Audit Trail',
              desc: 'SHA-256 hash-chained audit logs with evidence snapshots. Every action is cryptographically linked to the previous entry — tamper-evident by design.',
              badge: 'Blockchain-Light',
            },
            {
              icon: Globe2,
              title: 'Multi-Jurisdiction Library',
              desc: 'Pre-built rule sets for NAFDAC, FDA, EMA, WHO, and Pan-African regulations. Automated horizon scanning detects regulatory changes before they impact your campaigns.',
              badge: '4 Jurisdictions',
            },
            {
              icon: BarChart3,
              title: 'Risk Register & Predictive Analytics',
              desc: 'Quantified risk scoring with audience multipliers, platform strictness levels, and trend analysis. Know your compliance posture before regulators do.',
              badge: 'Predictive',
            },
            {
              icon: Scale,
              title: 'Legal Review Workflow',
              desc: 'Multi-step approval pipelines with reviewer assignment, SLA tracking, escalation paths, and signoff management. Full visibility into review bottlenecks.',
              badge: 'Workflow',
            },
            {
              icon: Eye,
              title: 'AI Governance & Usage Tracking',
              desc: 'Track every AI model, prompt, and output used in your organization. Manage AI risk assessments, incidents, and compliance with emerging AI regulations.',
              badge: 'AI Governance',
            },
          ].map((item, i) => (
            <div
              key={i}
              className="group p-8 rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.03] to-transparent hover:border-blue-500/20 hover:from-blue-500/[0.05] transition duration-300"
            >
              <div className="flex items-start justify-between mb-5">
                <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition">
                  <item.icon className="w-6 h-6" />
                </div>
                <span className="text-[10px] uppercase tracking-wider font-medium text-blue-400/70 border border-blue-500/20 rounded-full px-2.5 py-0.5">
                  {item.badge}
                </span>
              </div>
              <h3 className="text-lg font-semibold mb-3">{item.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          SOCIAL PROOF
         ════════════════════════════════════════════════ */}
      <Section className="py-20 md:py-28">
        <MotionWrap>
        <div className="text-center mb-16">
          <p className="text-blue-400 text-sm font-medium uppercase tracking-wider mb-3">What Leaders Say</p>
          <h2 className="text-3xl md:text-4xl font-bold">Trusted by compliance teams worldwide</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              quote: 'During our last NAFDAC GMP inspection, the auditors asked for two years of promotional review records. With Criateur OS we pulled every approval, rejection, and revision — with hash-verified timestamps — in under four minutes. Our previous system would have taken the team three days to compile the same evidence.',
              name: 'Dr. Adaeze Okonkwo',
              role: 'Director of Regulatory Compliance',
              company: 'Zenith PharmaCare Ltd, Lagos',
            },
            {
              quote: 'We cut our pre-submission review cycle from 14 business days to 36 hours. The multi-jurisdiction engine flags NAFDAC Ad-Pharma guideline violations and FDA fair-balance issues in the same scan, so our regulatory affairs team in Abuja and our US counsel review one unified report instead of chasing separate spreadsheets.',
              name: 'Chukwuemeka Ifeanyi',
              role: 'VP Regulatory Affairs',
              company: 'Kairos Life Sciences, Abuja',
            },
            {
              quote: 'Last quarter the AI flagged an implied superiority claim buried in a patient leaflet that three rounds of manual review had missed — the kind of violation that carries a minimum N5 million NAFDAC penalty. Criateur OS paid for a full year of licensing with that single catch. Our audit-readiness score went from 62% to 97% in the first 90 days.',
              name: 'Dr. Ngozi Amadi',
              role: 'Head of Pharmacovigilance & Quality',
              company: 'Equinox Biosciences, Port Harcourt',
            },
          ].map((t, i) => (
            <div key={i} className="p-8 rounded-2xl border border-white/5 bg-white/[0.02] flex flex-col">
              <div className="flex gap-1 mb-5">
                {[...Array(5)].map((_, j) => (
                  <svg key={j} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-gray-300 text-sm leading-relaxed italic flex-1">"{t.quote}"</p>
              <div className="mt-6 pt-5 border-t border-white/5">
                <p className="font-semibold text-sm">{t.name}</p>
                <p className="text-xs text-gray-500">{t.role}, {t.company}</p>
              </div>
            </div>
          ))}
        </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          PRICING
         ════════════════════════════════════════════════ */}
      <Section id="pricing" className="py-20 md:py-28">
        <MotionWrap>
        <div className="text-center mb-16">
          <p className="text-blue-400 text-sm font-medium uppercase tracking-wider mb-3">Pricing</p>
          <h2 className="text-3xl md:text-4xl font-bold">Plans that scale with your compliance needs</h2>
          <p className="mt-4 text-gray-400">No hidden fees. Cancel anytime. All plans include security hardening.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 items-start">
          {/* Starter */}
          <div className="p-8 rounded-2xl border border-white/5 bg-white/[0.02]">
            <p className="text-sm font-medium text-gray-400 uppercase tracking-wider">Starter</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-bold">$299</span>
              <span className="text-gray-500">/month</span>
            </div>
            <p className="mt-2 text-sm text-gray-500">For teams getting started with compliance automation</p>
            <hr className="my-6 border-white/5" />
            <ul className="space-y-3 text-sm text-gray-300">
              {['Up to 5 users', '1 brand', 'Core compliance engine', 'NAFDAC rule set', 'Basic audit trail', 'Email support'].map((f, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => scrollTo('cta')}
              className="mt-8 w-full py-3 rounded-lg border border-white/10 hover:border-white/20 text-sm font-medium transition"
            >
              Get Started
            </button>
          </div>

          {/* Growth — Highlighted */}
          <div className="p-8 rounded-2xl border border-blue-500/30 bg-gradient-to-b from-blue-500/10 to-transparent relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="px-3 py-1 bg-blue-600 text-xs font-medium rounded-full">Most Popular</span>
            </div>
            <p className="text-sm font-medium text-blue-400 uppercase tracking-wider">Growth</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-bold">$799</span>
              <span className="text-gray-500">/month</span>
            </div>
            <p className="mt-2 text-sm text-gray-500">For scaling teams that need the full platform</p>
            <hr className="my-6 border-white/5" />
            <ul className="space-y-3 text-sm text-gray-300">
              {[
                'Unlimited users', 'Multiple brands', 'Full compliance engine', 'All jurisdictions (NAFDAC, FDA, EMA, WHO)',
                'AI-powered analysis', 'Immutable audit trail + export', 'Legal review workflows', 'GRC framework management',
                'Priority support',
              ].map((f, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => scrollTo('cta')}
              className="mt-8 w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition shadow-lg shadow-blue-600/20"
            >
              Get Started
            </button>
          </div>

          {/* Enterprise */}
          <div className="p-8 rounded-2xl border border-white/5 bg-white/[0.02]">
            <p className="text-sm font-medium text-gray-400 uppercase tracking-wider">Enterprise</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-bold">Custom</span>
            </div>
            <p className="mt-2 text-sm text-gray-500">For organizations with advanced compliance requirements</p>
            <hr className="my-6 border-white/5" />
            <ul className="space-y-3 text-sm text-gray-300">
              {[
                'Everything in Growth', 'On-premise deployment option', 'Dedicated Customer Success Manager',
                'Custom SLA guarantee', 'SSO / SAML integration', 'Custom integrations', 'Regulatory advisory hours',
                '24/7 phone support',
              ].map((f, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => scrollTo('cta')}
              className="mt-8 w-full py-3 rounded-lg border border-white/10 hover:border-white/20 text-sm font-medium transition"
            >
              Contact Sales
            </button>
          </div>
        </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          SECURITY
         ════════════════════════════════════════════════ */}
      <Section id="security" className="py-20 md:py-28">
        <MotionWrap>
        <div className="text-center mb-16">
          <p className="text-blue-400 text-sm font-medium uppercase tracking-wider mb-3">Security & Compliance</p>
          <h2 className="text-3xl md:text-4xl font-bold">Enterprise-grade security by default</h2>
          <p className="mt-4 text-gray-400 max-w-2xl mx-auto">Every layer of Criateur OS is built with security-first principles mapped to SOC 2 Trust Service Criteria.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {[
            { icon: ShieldCheck, title: 'SOC 2 Ready', desc: 'Controls mapped to CC6–CC9, A1, C1, PI1' },
            { icon: Lock, title: 'Immutable Audit Trail', desc: 'SHA-256 hash-chained with evidence snapshots' },
            { icon: Server, title: 'End-to-End Encryption', desc: 'TLS 1.3 in transit, AES-256 at rest' },
            { icon: Users, title: 'Role-Based Access', desc: '76 granular permissions across 5 system roles' },
            { icon: Globe2, title: 'GDPR Compliant', desc: 'Data retention, right to erasure, consent management' },
            { icon: Clock, title: '99.9% Uptime SLA', desc: 'Enterprise-tier with 24/7 monitoring' },
          ].map((item, i) => (
            <div key={i} className="p-6 rounded-2xl border border-white/5 bg-white/[0.02] text-center hover:bg-white/[0.04] transition">
              <div className="inline-flex p-3 rounded-xl bg-emerald-500/10 text-emerald-400 mb-4">
                <item.icon className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-sm mb-1">{item.title}</h3>
              <p className="text-xs text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          CTA — Waitlist / Demo Request
         ════════════════════════════════════════════════ */}
      <Section id="cta" className="py-20 md:py-28">
        <MotionWrap>
        <div className="max-w-2xl mx-auto text-center">
          <div className="p-10 md:p-14 rounded-3xl border border-blue-500/20 bg-gradient-to-b from-blue-500/10 to-transparent">
            <Award className="w-10 h-10 text-blue-400 mx-auto mb-6" />
            <h2 className="text-3xl md:text-4xl font-bold">Ready to automate compliance?</h2>
            <p className="mt-4 text-gray-400">
              Join leading pharmaceutical companies that trust Criateur OS. Request a demo or join our early access waitlist.
            </p>

            {!submitted ? (
              <form onSubmit={handleWaitlist} className="mt-8 flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                <div className="relative flex-1">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="work@company.com"
                    className="w-full pl-10 pr-4 py-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition"
                  />
                </div>
                <button
                  type="submit"
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-sm font-medium rounded-lg transition shadow-lg shadow-blue-600/20 whitespace-nowrap"
                >
                  Request Demo
                </button>
              </form>
            ) : (
              <div className="mt-8 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                <p className="text-emerald-300 font-medium">You're on the list!</p>
                <p className="text-sm text-gray-400 mt-1">We'll reach out within 24 hours to schedule your demo.</p>
              </div>
            )}

            <p className="mt-5 text-xs text-gray-600">No credit card required. Free 14-day trial on all plans.</p>
          </div>
        </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          STATS COUNTER
         ════════════════════════════════════════════════ */}
      <Section className="py-16 md:py-20 border-y border-white/5">
        <MotionWrap>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { target: 140, suffix: '+', label: 'Database Tables' },
              { target: 60, suffix: '+', label: 'Modules' },
              { target: 19, suffix: '', label: 'Edge Functions' },
              { target: 39, suffix: '', label: 'Tests Passing' },
            ].map((s, i) => (
              <div key={i}>
                <p className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                  <AnimatedCounter target={s.target} suffix={s.suffix} />
                </p>
                <p className="mt-2 text-sm text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
        </MotionWrap>
      </Section>

      {/* ════════════════════════════════════════════════
          FOOTER
         ════════════════════════════════════════════════ */}
      <footer className="border-t border-white/5 mt-10">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-24 py-14">
          <div className="grid md:grid-cols-4 gap-10">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-6 h-6 text-blue-400" />
                <span className="font-bold">Criateur <span className="text-blue-400">OS</span></span>
              </div>
              <p className="text-sm text-gray-500 leading-relaxed">
                The Compliance Operating System for regulated industries. Built for pharmaceutical and healthcare companies worldwide.
              </p>
            </div>

            {/* Product */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">Product</p>
              <ul className="space-y-2.5 text-sm text-gray-400">
                <li><button onClick={() => scrollTo('features')} className="hover:text-white transition">Features</button></li>
                <li><button onClick={() => scrollTo('pricing')} className="hover:text-white transition">Pricing</button></li>
                <li><button onClick={() => scrollTo('security')} className="hover:text-white transition">Security</button></li>
                <li><button onClick={() => scrollTo('cta')} className="hover:text-white transition">Request Demo</button></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">Company</p>
              <ul className="space-y-2.5 text-sm text-gray-400">
                <li><span className="hover:text-white transition cursor-pointer">About</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Careers</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Blog</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Contact</span></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-4">Legal</p>
              <ul className="space-y-2.5 text-sm text-gray-400">
                <li><span className="hover:text-white transition cursor-pointer">Privacy Policy</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Terms of Service</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Security Policy</span></li>
                <li><span className="hover:text-white transition cursor-pointer">Cookie Policy</span></li>
              </ul>
            </div>
          </div>

          <hr className="border-white/5 my-10" />

          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-600">&copy; {new Date().getFullYear()} Criateur. All rights reserved.</p>
            <div className="flex items-center gap-6 text-xs text-gray-600">
              <span className="flex items-center gap-1.5">
                <ExternalLink className="w-3 h-3" />
                <a href="https://github.com/CreativeCriateur/Compliance-Governance-OS" target="_blank" rel="noreferrer" className="hover:text-gray-400 transition">GitHub</a>
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
