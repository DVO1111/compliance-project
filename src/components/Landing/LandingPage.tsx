import { useState, useEffect } from 'react';
import {
  ShieldCheck, Zap, Globe2, FileCheck2, Building2,
  BarChart3, ArrowRight, CheckCircle2, Users, TrendingUp,
  PieChart, Lock, Clock, Sparkles, ChevronRight,
} from 'lucide-react';

interface LandingPageProps {
  onNavigateToLogin: () => void;
  onNavigateToSignup: () => void;
}

/* ── Animated Counter ─────────────────────────── */
function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const end = target;
    const duration = 1800;
    const step = Math.max(1, Math.floor(end / (duration / 16)));
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(start);
    }, 16);
    return () => clearInterval(timer);
  }, [target]);
  return <>{count.toLocaleString()}{suffix}</>;
}

export default function LandingPage({ onNavigateToLogin, onNavigateToSignup }: LandingPageProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen" style={{ background: '#f0f2f5' }}>

      {/* ═══════════ NAVIGATION ═══════════ */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled
            ? 'bg-white/80 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
            : 'bg-transparent'
          }`}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-accent)] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-[#111827] tracking-tight">Criateur</span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-[#6b7280]">
            <a href="#features" className="hover:text-[var(--color-accent)] transition-colors">Features</a>
            <a href="#stats" className="hover:text-[var(--color-accent)] transition-colors">Why Us</a>
            <a href="#testimonials" className="hover:text-[var(--color-accent)] transition-colors">Testimonials</a>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onNavigateToLogin}
              className="px-5 py-2 text-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)]/5 rounded-xl transition-colors"
            >
              Log In
            </button>
            <button
              onClick={onNavigateToSignup}
              className="px-5 py-2 text-sm font-semibold text-white rounded-xl transition-all hover:shadow-lg hover:shadow-[var(--color-accent)]/25 hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg, var(--color-accent), #2563eb)' }}
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* ═══════════ HERO ═══════════ */}
      <section className="relative pt-28 pb-4 px-6 overflow-hidden">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, var(--color-accent) 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }} />

        <div className="max-w-6xl mx-auto text-center relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--color-accent)]/5 border border-[var(--color-accent)]/10 mb-8">
            <Sparkles className="w-3.5 h-3.5 text-[var(--color-accent)]" />
            <span className="text-xs font-semibold text-[var(--color-accent)] tracking-wide">AI-POWERED COMPLIANCE AUTOMATION</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[64px] font-extrabold text-[#111827] leading-[1.1] tracking-tight mb-6">
            Healthcare Compliance,{' '}
            <span className="bg-gradient-to-r from-[var(--color-accent)] via-[#2563eb] to-[#7c3aed] bg-clip-text text-transparent">
              Simplified.
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-[#6b7280] max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
            Audit marketing content against NAFDAC, FDA, and MDCN standards in seconds.
            Real-time risk scoring, team collaboration, and audit-ready reports.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button
              onClick={onNavigateToSignup}
              className="group px-8 py-3.5 text-white font-semibold rounded-2xl text-sm inline-flex items-center gap-2 transition-all hover:shadow-xl hover:shadow-[var(--color-accent)]/20 hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg, var(--color-accent), #2563eb)' }}
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={onNavigateToLogin}
              className="px-8 py-3.5 font-semibold rounded-2xl text-sm text-[#374151] bg-white border border-[#e5e7eb] hover:border-[#d1d5db] hover:shadow-md transition-all inline-flex items-center gap-2"
            >
              <BarChart3 className="w-4 h-4 text-[var(--color-accent)]" />
              View Live Dashboard
            </button>
          </div>

          {/* ── Dashboard Preview Card ──────────────── */}
          <div className="relative max-w-5xl mx-auto">
            {/* Glow effect */}
            <div className="absolute -inset-4 rounded-[32px] bg-gradient-to-r from-[var(--color-accent)]/10 via-[#2563eb]/10 to-[#7c3aed]/10 blur-2xl" />

            <div className="relative bg-white rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.08)] border border-[#e5e7eb]/60 overflow-hidden">
              {/* Mock browser bar */}
              <div className="flex items-center gap-2 px-5 py-3 bg-[#f9fafb] border-b border-[#e5e7eb]">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#ef4444]/60" />
                  <div className="w-3 h-3 rounded-full bg-[#f59e0b]/60" />
                  <div className="w-3 h-3 rounded-full bg-[#10b981]/60" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-4 py-1 rounded-lg bg-white border border-[#e5e7eb] text-[10px] text-[#9ca3af] font-medium">
                    app.criateur.com/dashboard
                  </div>
                </div>
              </div>

              {/* Dashboard Preview Body */}
              <div className="flex min-h-[340px]">
                {/* Mini Sidebar */}
                <div className="hidden md:flex flex-col w-48 bg-[#f9fafb] border-r border-[#e5e7eb] py-4 px-3 shrink-0">
                  <div className="flex items-center gap-2 px-2 mb-5">
                    <div className="w-6 h-6 rounded-lg bg-[var(--color-accent)] flex items-center justify-center">
                      <ShieldCheck className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-xs font-bold text-[#111827]">Criateur</span>
                  </div>
                  {[
                    { label: 'Dashboard', icon: BarChart3, active: true },
                    { label: 'Submissions', icon: FileCheck2 },
                    { label: 'Legal Review', icon: Lock },
                    { label: 'Calendar', icon: Clock },
                    { label: 'Analytics', icon: TrendingUp },
                    { label: 'Team', icon: Users },
                  ].map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] font-medium mb-0.5 ${item.active
                            ? 'bg-[var(--color-accent)]/8 text-[var(--color-accent)]'
                            : 'text-[#9ca3af] hover:text-[#6b7280]'
                          }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {item.label}
                      </div>
                    );
                  })}
                </div>

                {/* Main dashboard content */}
                <div className="flex-1 p-5 bg-[#f3f4f6]">
                  {/* Metric cards row */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    {[
                      { label: 'Total Submitted', value: '1,247', change: '+12%', color: 'var(--color-accent)' },
                      { label: 'Approval Rate', value: '94%', change: '+3%', color: '#16a34a' },
                      { label: 'In Review', value: '38', change: '-5%', color: '#d97706' },
                      { label: 'Avg Turnaround', value: '2.4h', change: '-18%', color: '#7c3aed' },
                    ].map((m, i) => (
                      <div key={i} className="bg-white rounded-xl p-3 border border-[#e5e7eb]/50">
                        <p className="text-[9px] uppercase tracking-wider text-[#9ca3af] font-semibold mb-1">{m.label}</p>
                        <p className="text-lg font-bold text-[#111827]">{m.value}</p>
                        <span className="text-[9px] font-bold" style={{ color: m.color }}>{m.change}</span>
                      </div>
                    ))}
                  </div>

                  {/* Chart area */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div className="lg:col-span-2 bg-white rounded-xl p-4 border border-[#e5e7eb]/50">
                      <p className="text-[10px] font-semibold text-[#374151] mb-3">Revenue & Compliance Trend</p>
                      {/* Fake sparkline */}
                      <svg viewBox="0 0 400 100" className="w-full h-20" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path d="M0,80 C50,70 80,20 150,40 C220,60 250,10 300,30 C350,50 380,20 400,25 L400,100 L0,100 Z" fill="url(#heroGrad)" />
                        <path d="M0,80 C50,70 80,20 150,40 C220,60 250,10 300,30 C350,50 380,20 400,25" fill="none" stroke="var(--color-accent)" strokeWidth="2" />
                      </svg>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-[#e5e7eb]/50 flex flex-col items-center justify-center">
                      <p className="text-[10px] font-semibold text-[#374151] mb-3">Risk Distribution</p>
                      {/* Fake donut */}
                      <svg viewBox="0 0 100 100" className="w-20 h-20">
                        <circle cx="50" cy="50" r="35" fill="none" stroke="#e5e7eb" strokeWidth="10" />
                        <circle cx="50" cy="50" r="35" fill="none" stroke="#16a34a" strokeWidth="10"
                          strokeDasharray="165 220" strokeDashoffset="0" transform="rotate(-90 50 50)" />
                        <circle cx="50" cy="50" r="35" fill="none" stroke="#d97706" strokeWidth="10"
                          strokeDasharray="33 220" strokeDashoffset="-165" transform="rotate(-90 50 50)" />
                        <circle cx="50" cy="50" r="35" fill="none" stroke="#ef4444" strokeWidth="10"
                          strokeDasharray="22 220" strokeDashoffset="-198" transform="rotate(-90 50 50)" />
                        <text x="50" y="54" textAnchor="middle" className="text-[14px] font-bold fill-[#111827]">94%</text>
                      </svg>
                      <p className="text-[9px] text-[#9ca3af] mt-2 font-medium">Pass Rate</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ TRUSTED BY ═══════════ */}
      <section className="py-14 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-[11px] font-semibold text-[#9ca3af] tracking-[0.2em] uppercase mb-8">
            Trusted by Healthcare Leaders Worldwide
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {['PharmaCorp Global', 'MediTech Solutions', 'BioHealth Industries', 'ClinicalWorks Ltd', 'HealthFirst Partners'].map((co, i) => (
              <div
                key={i}
                className="bg-white/70 backdrop-blur-sm rounded-2xl px-6 py-5 text-center hover:bg-white hover:shadow-md transition-all duration-300 border border-[#e5e7eb]/40 group"
              >
                <Building2 className="w-6 h-6 text-[#d1d5db] group-hover:text-[var(--color-accent)]/40 mx-auto mb-2 transition-colors" />
                <p className="text-xs font-semibold text-[#9ca3af] group-hover:text-[#6b7280] transition-colors">{co}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ STATS ═══════════ */}
      <section id="stats" className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-[28px] shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-[#e5e7eb]/50 p-10 grid grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { value: 50000, suffix: '+', label: 'Content Scanned', icon: FileCheck2 },
              { value: 99, suffix: '%', label: 'Accuracy Rate', icon: CheckCircle2 },
              { value: 120, suffix: '+', label: 'Companies Served', icon: Users },
              { value: 5, suffix: '', label: 'Jurisdictions', icon: Globe2 },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="text-center">
                  <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, rgba(0,74,153,0.08), rgba(37,99,235,0.08))' }}
                  >
                    <Icon className="w-5 h-5 text-[var(--color-accent)]" />
                  </div>
                  <p className="text-3xl font-extrabold text-[#111827] tabular-nums">
                    <AnimatedCounter target={s.value} suffix={s.suffix} />
                  </p>
                  <p className="text-xs font-medium text-[#9ca3af] mt-1">{s.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════ FEATURES ═══════════ */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-accent)]/5 border border-[var(--color-accent)]/10 mb-4 text-xs font-semibold text-[var(--color-accent)]">
              <Zap className="w-3 h-3" /> Core Features
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#111827] tracking-tight mb-3">
              Built for Compliance Professionals
            </h2>
            <p className="text-base text-[#6b7280] max-w-xl mx-auto">
              Everything you need to ensure regulatory compliance across multiple jurisdictions.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: Zap,
                title: 'Real-time Analysis',
                desc: 'Upload marketing materials and receive instant compliance feedback. Our AI engine scans for violations and forbidden claims in seconds.',
                gradient: 'from-[var(--color-accent)] to-[#2563eb]',
              },
              {
                icon: Globe2,
                title: 'Multi-Jurisdiction',
                desc: 'Switch between NAFDAC, FDA, EMA, WHO, and MDCN frameworks with one click. Compare requirements across jurisdictions globally.',
                gradient: 'from-[#7c3aed] to-[#a855f7]',
              },
              {
                icon: FileCheck2,
                title: 'Audit-Ready Reports',
                desc: 'Generate comprehensive compliance reports with detailed findings, timestamps, and sign-offs. Perfect for regulatory submissions.',
                gradient: 'from-[#16a34a] to-[#22c55e]',
              },
              {
                icon: PieChart,
                title: 'Risk Visualization',
                desc: 'Interactive dashboards with bar charts, pie charts, and trend lines. Instantly see your compliance health at a glance.',
                gradient: 'from-[#d97706] to-[#f59e0b]',
              },
              {
                icon: Users,
                title: 'Team Collaboration',
                desc: 'Built-in team chat, role-based access, and review workflows. Legal, marketing, and executive teams collaborate seamlessly.',
                gradient: 'from-[#2563eb] to-[#60a5fa]',
              },
              {
                icon: Lock,
                title: 'Enterprise Security',
                desc: 'Row-level security, encrypted storage, and full audit trails. Your sensitive compliance data is protected at every layer.',
                gradient: 'from-[#dc2626] to-[#f87171]',
              },
            ].map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={i}
                  className="group bg-white rounded-2xl p-7 border border-[#e5e7eb]/50 hover:shadow-xl hover:shadow-[var(--color-accent)]/5 hover:-translate-y-1 transition-all duration-300"
                >
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-[#111827] mb-2">{f.title}</h3>
                  <p className="text-sm text-[#6b7280] leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════ TESTIMONIALS ═══════════ */}
      <section id="testimonials" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#111827] tracking-tight mb-3">
              What Teams Are Saying
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { quote: 'Reduced our compliance review time from days to hours. The AI-powered analysis is remarkably accurate.', name: 'Sarah Chen', role: 'VP Regulatory Affairs', company: 'PharmaCorp Global' },
              { quote: 'The multi-jurisdiction toggle is a game-changer. We can now check NAFDAC and FDA compliance simultaneously.', name: 'Dr. James Adeyemi', role: 'Chief Compliance Officer', company: 'BioHealth Industries' },
              { quote: 'Audit-ready reports have saved us countless hours of manual documentation. Our legal team loves it.', name: 'Emily Rodriguez', role: 'Head of Marketing', company: 'MediTech Solutions' },
            ].map((t, i) => (
              <div key={i} className="bg-white rounded-2xl p-7 border border-[#e5e7eb]/50 hover:shadow-lg transition-all duration-300">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Sparkles key={j} className="w-3.5 h-3.5 text-[#f59e0b]" />
                  ))}
                </div>
                <p className="text-sm text-[#374151] leading-relaxed mb-6 italic">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-accent)] to-[#2563eb] flex items-center justify-center text-white text-sm font-bold">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#111827]">{t.name}</p>
                    <p className="text-[10px] text-[#9ca3af]">{t.role}, {t.company}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ CTA ═══════════ */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="relative rounded-[28px] overflow-hidden p-12 text-center"
            style={{ background: 'linear-gradient(135deg, var(--color-accent), #2563eb, #7c3aed)' }}
          >
            {/* Pattern overlay */}
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
              backgroundSize: '24px 24px',
            }} />

            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 tracking-tight">
                Ready to Automate <br className="hidden sm:block" /> Your Compliance?
              </h2>
              <p className="text-blue-100 text-base max-w-lg mx-auto mb-8 leading-relaxed">
                Join healthcare companies worldwide who trust Criateur to keep their
                marketing materials compliant and audit-ready.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={onNavigateToSignup}
                  className="group px-8 py-3.5 bg-white text-[var(--color-accent)] font-semibold rounded-2xl text-sm inline-flex items-center gap-2 hover:shadow-xl transition-all hover:-translate-y-0.5"
                >
                  Start Free Trial
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                  onClick={onNavigateToSignup}
                  className="px-8 py-3.5 font-semibold rounded-2xl text-sm text-white border-2 border-white/30 hover:bg-white/10 transition-all inline-flex items-center gap-2"
                >
                  Schedule Demo
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="py-12 px-6 border-t border-[#e5e7eb]">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-[var(--color-accent)] flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-[#111827]">Criateur Compliance</span>
              </div>
              <p className="text-[#9ca3af] text-sm leading-relaxed">
                Professional healthcare compliance automation for global pharmaceutical companies.
              </p>
            </div>
            {[
              { title: 'Product', links: ['Features', 'Pricing', 'Integrations', 'API Docs'] },
              { title: 'Company', links: ['About', 'Careers', 'Blog', 'Contact'] },
              { title: 'Legal', links: ['Privacy Policy', 'Terms of Service', 'Security', 'GDPR'] },
            ].map((col, i) => (
              <div key={i}>
                <h4 className="font-semibold text-[#111827] text-sm mb-3">{col.title}</h4>
                <ul className="space-y-2">
                  {col.links.map((link, j) => (
                    <li key={j}>
                      <a href="#" className="text-sm text-[#9ca3af] hover:text-[var(--color-accent)] transition-colors">{link}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="pt-8 border-t border-[#e5e7eb] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-[#9ca3af] text-xs">&copy; 2026 Criateur Compliance. All rights reserved.</p>
            <div className="flex gap-4 text-xs text-[#9ca3af]">
              <a href="#" className="hover:text-[var(--color-accent)] transition-colors">Twitter</a>
              <a href="#" className="hover:text-[var(--color-accent)] transition-colors">LinkedIn</a>
              <a href="#" className="hover:text-[var(--color-accent)] transition-colors">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
