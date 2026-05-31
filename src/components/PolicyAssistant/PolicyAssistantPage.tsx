import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { generatePolicyDraft, savePolicyDraft } from '../../lib/policyAssistantService';
import { Bot, Send, FileText, Download, Save, RefreshCw, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function PolicyAssistantPage() {
    const { profile } = useAuth();
    const companyId = (profile as any)?.company_id || '00000000-0000-0000-0000-000000000000';

    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [draft, setDraft] = useState<{ title: string; content: string } | null>(null);
    const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
    const [category, setCategory] = useState('privacy');
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    async function handleSend() {
        if (!prompt.trim() || isGenerating) return;

        const userMsg = prompt;
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setPrompt('');
        setIsGenerating(true);

        const result = await generatePolicyDraft(userMsg, category);

        if (result) {
            setDraft(result);
            setMessages(prev => [...prev, { role: 'ai', text: `I've drafted the "${result.title}" based on current 2026 regulations. You can review and save it in the preview panel.` }]);
        } else {
            setMessages(prev => [...prev, { role: 'ai', text: "I encountered an error while synthesizing the policy. Please try again." }]);
        }

        setIsGenerating(false);
    }

    async function handleSave() {
        if (!draft) return;
        const success = await savePolicyDraft(companyId, draft.title, draft.content);
        if (success) {
            setMessages(prev => [...prev, { role: 'ai', text: `Saved "${draft.title}" to your document vault.` }]);
        }
    }

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black tracking-tight dash-text">AI Policy Assistant</h1>
                    <p className="dash-text-tertiary text-sm">RAG-powered drafting compliant with 2026 NAFDAC circulars.</p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-sm dash-text font-medium outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 shadow-sm"
                    >
                        <option value="privacy">Privacy & Data</option>
                        <option value="pharma">Pharma Marketing</option>
                        <option value="medical_devices">Medical Devices</option>
                        <option value="clinical_trials">Clinical Trials</option>
                    </select>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
                {/* Left: Chat Interface */}
                <div className="col-span-12 lg:col-span-5 flex flex-col dash-card border dash-border rounded-3xl overflow-hidden bg-dash-surface shadow-sm">
                    <div className="px-6 py-4 border-b dash-border flex items-center justify-between bg-dash-surface-alt/30">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-[var(--color-accent)] flex items-center justify-center text-white shadow-lg shadow-[var(--color-accent)]/20">
                                <Bot className="w-4 h-4" />
                            </div>
                            <span className="text-xs font-black uppercase dash-text-secondary tracking-widest">Compliance GPT</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--color-success-soft)] text-[var(--color-success)] text-[10px] font-black uppercase">
                            <Sparkles className="w-3 h-3" /> RAG Active
                        </div>
                    </div>

                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                        {messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center px-8 opacity-40">
                                <Bot className="w-12 h-12 mb-4 dash-text-tertiary" />
                                <p className="text-sm dash-text-secondary font-medium">"Draft a Telehealth Privacy Policy that complies with the latest 2026 NAFDAC circular..."</p>
                            </div>
                        )}
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-4 rounded-2xl text-sm ${m.role === 'user' ? 'bg-[var(--color-accent)] text-white font-medium rounded-tr-none' : 'bg-[var(--color-surface-alt)] border dash-border dash-text rounded-tl-none'}`}>
                                    {m.text}
                                </div>
                            </div>
                        ))}
                        {isGenerating && (
                            <div className="flex justify-start">
                                <div className="bg-[var(--color-surface-alt)] border dash-border p-4 rounded-2xl rounded-tl-none flex items-center gap-2">
                                    <RefreshCw className="w-4 h-4 animate-spin dash-text-tertiary" />
                                    <span className="text-xs dash-text-tertiary font-bold animate-pulse italic">Retrieving circular context...</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-dash-surface-alt/30 border-t dash-border">
                        <div className="relative flex items-center">
                            <input
                                type="text"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Type your policy requirement..."
                                className="w-full pl-6 pr-12 py-4 rounded-2xl bg-dash-surface border dash-border outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20 dash-text text-sm transition-all"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!prompt.trim() || isGenerating}
                                className="absolute right-2 p-2.5 rounded-xl bg-[var(--color-accent)] text-white hover:opacity-90 transition-all disabled:opacity-30 shadow-lg shadow-[var(--color-accent)]/20"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right: Preview Panel */}
                <div className="col-span-12 lg:col-span-7 flex flex-col dash-card border dash-border rounded-3xl overflow-hidden bg-dash-surface shadow-sm sticky top-0">
                    <div className="px-6 py-4 border-b dash-border flex items-center justify-between bg-dash-surface-alt/30">
                        <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 dash-text-tertiary" />
                            <h2 className="text-xs font-black uppercase dash-text-secondary tracking-widest">Draft Preview</h2>
                        </div>
                        {draft && (
                            <div className="flex gap-2">
                                <button className="p-2 rounded-xl border dash-border dash-text-secondary hover:dash-surface-alt transition-all">
                                    <Download className="w-4 h-4" />
                                </button>
                                <button onClick={handleSave} className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-[var(--color-accent)] text-white text-xs font-black hover:opacity-90 shadow-lg shadow-[var(--color-accent)]/20">
                                    <Save className="w-4 h-4" /> Save Policy
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 prose prose-sm max-w-none custom-scrollbar bg-white dark:bg-dash-surface">
                        {draft ? (
                            <div className="markdown-content">
                                <ReactMarkdown>{draft.content}</ReactMarkdown>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center px-12 opacity-30">
                                <FileText className="w-16 h-16 mb-4 dash-text-tertiary" />
                                <p className="text-sm dash-text-tertiary font-bold tracking-tight">Your AI-generated policy draft will appear here.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
