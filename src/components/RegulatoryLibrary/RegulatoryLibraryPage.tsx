import { useState, useMemo } from 'react';
import {
    searchLibrary,
    DOCUMENT_TYPES,
    getJurisdictionStats,
    type Jurisdiction,
    type DocumentType,
    type LibraryDocument,
} from '../../lib/regulatoryLibraryService';
import {
    BookOpen, Search, ExternalLink, ChevronRight,
    X, Globe, FileText, AlertTriangle, Gavel, ScrollText,
} from 'lucide-react';

const JURISDICTION_COLORS: Record<string, string> = {
    FDA: 'bg-[var(--color-info-soft)] text-[var(--color-info)]',
    EMA: 'bg-[var(--color-purple)]/10 text-[var(--color-purple)]',
    MHRA: 'bg-[var(--color-purple)]/10 text-[var(--color-purple)]',
    TGA: 'bg-teal-100 text-teal-800',
    NAFDAC: 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
    'Health Canada': 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
};

const DOCTYPE_ICONS: Record<string, typeof FileText> = {
    guidance: BookOpen,
    warning_letter: AlertTriangle,
    enforcement_action: Gavel,
    consent_decree: ScrollText,
    regulation: FileText,
};

export default function RegulatoryLibraryPage() {
    const [query, setQuery] = useState('');
    const [jurisdiction, setJurisdiction] = useState<Jurisdiction | undefined>();
    const [docType, setDocType] = useState<DocumentType | undefined>();
    const [selectedDoc, setSelectedDoc] = useState<LibraryDocument | null>(null);

    const stats = useMemo(() => getJurisdictionStats(), []);

    const results = useMemo(() =>
        searchLibrary(query, jurisdiction, docType),
        [query, jurisdiction, docType]
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-1">
                    <div className="p-2 rounded-xl bg-[var(--color-accent-soft)]">
                        <BookOpen className="w-5 h-5 dash-accent" />
                    </div>
                    <h2 className="text-2xl font-bold dash-text">Regulatory Library</h2>
                </div>
                <p className="dash-text-secondary text-sm ml-12">
                    Curated database of regulations, guidance, enforcement actions, and warning letters
                </p>
            </div>

            {/* Jurisdiction Stats */}
            <div className="flex gap-2 flex-wrap">
                <button onClick={() => setJurisdiction(undefined)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${!jurisdiction ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] dash-accent' : 'border-[var(--color-border)] dash-text-secondary hover:border-[var(--color-accent)]'}`}>
                    All ({results.length})
                </button>
                {stats.map(s => (
                    <button key={s.jurisdiction} onClick={() => setJurisdiction(s.jurisdiction as Jurisdiction)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${jurisdiction === s.jurisdiction ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] dash-accent' : 'border-[var(--color-border)] dash-text-secondary hover:border-[var(--color-accent)]'}`}>
                        {s.jurisdiction} ({s.count})
                    </button>
                ))}
            </div>

            {/* Search + Type Filter */}
            <div className="flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[240px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 dash-text-tertiary" />
                    <input type="text" placeholder="Search regulations, guidance, warning letters..."
                        value={query} onChange={e => setQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]" />
                </div>
                <select value={docType || ''}
                    onChange={e => setDocType((e.target.value as DocumentType) || undefined)}
                    className="px-3 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] dash-text text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]">
                    <option value="">All Types</option>
                    {DOCUMENT_TYPES.map(dt => (
                        <option key={dt.id} value={dt.id}>{dt.label}</option>
                    ))}
                </select>
            </div>

            {/* Results */}
            <div className="space-y-3">
                {results.length === 0 ? (
                    <div className="dash-card rounded-2xl p-8 text-center">
                        <Globe className="w-10 h-10 mx-auto mb-3 dash-text-tertiary" />
                        <p className="dash-text-secondary text-sm">No documents match your search criteria</p>
                    </div>
                ) : results.map(doc => {
                    const DocIcon = DOCTYPE_ICONS[doc.documentType] || FileText;
                    return (
                        <button key={doc.id} onClick={() => setSelectedDoc(doc)}
                            className="w-full dash-card rounded-xl p-5 border border-[var(--color-border)] hover:border-[var(--color-accent)] hover:shadow-md transition-all text-left group">
                            <div className="flex items-start gap-4">
                                <div className="p-2 rounded-lg bg-[var(--color-surface-alt)] shrink-0">
                                    <DocIcon className="w-5 h-5 dash-text-secondary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${JURISDICTION_COLORS[doc.jurisdiction] || 'bg-[var(--color-surface-alt)] text-[var(--color-text-primary)]'}`}>
                                            {doc.jurisdiction}
                                        </span>
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-surface-alt)] dash-text-secondary font-medium capitalize">
                                            {doc.documentType.replace(/_/g, ' ')}
                                        </span>
                                        <span className="text-xs dash-text-tertiary ml-auto">
                                            {new Date(doc.publishedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                    </div>
                                    <h4 className="font-semibold dash-text text-sm">{doc.title}</h4>
                                    <p className="text-xs dash-text-secondary mt-1 line-clamp-2">{doc.summary}</p>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className="text-xs dash-text-tertiary">Relevance: {doc.relevanceScore}%</span>
                                        <span className="text-xs dash-text-tertiary">{doc.therapeuticArea}</span>
                                    </div>
                                </div>
                                <ChevronRight className="w-4 h-4 dash-text-tertiary shrink-0 group-hover:dash-accent transition-colors mt-2" />
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Detail Modal */}
            {selectedDoc && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                    onClick={() => setSelectedDoc(null)}>
                    <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-y-auto"
                        onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] p-5 flex items-start justify-between rounded-t-2xl">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${JURISDICTION_COLORS[selectedDoc.jurisdiction]}`}>
                                        {selectedDoc.jurisdiction}
                                    </span>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-surface-alt)] dash-text-secondary capitalize">
                                        {selectedDoc.documentType.replace(/_/g, ' ')}
                                    </span>
                                </div>
                                <h3 className="font-bold dash-text text-lg leading-tight">{selectedDoc.title}</h3>
                            </div>
                            <button onClick={() => setSelectedDoc(null)} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-alt)] shrink-0 ml-3">
                                <X className="w-5 h-5 dash-text-secondary" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex items-center gap-4 text-xs dash-text-tertiary">
                                <span>Published: {new Date(selectedDoc.publishedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                                <span>Therapeutic Area: {selectedDoc.therapeuticArea}</span>
                                <span>Relevance: {selectedDoc.relevanceScore}%</span>
                            </div>

                            <div className="p-4 rounded-xl bg-[var(--color-surface-alt)] border border-[var(--color-border)]">
                                <h4 className="font-semibold dash-text text-sm mb-2">Summary</h4>
                                <p className="text-sm dash-text-secondary">{selectedDoc.summary}</p>
                            </div>

                            <div>
                                <h4 className="font-semibold dash-text text-sm mb-2">Full Text</h4>
                                <p className="text-sm dash-text leading-relaxed">{selectedDoc.fullText}</p>
                            </div>

                            {selectedDoc.sourceUrl && (
                                <a href={selectedDoc.sourceUrl} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-sm font-medium dash-accent hover:underline">
                                    <ExternalLink className="w-4 h-4" />
                                    View Original Source
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
