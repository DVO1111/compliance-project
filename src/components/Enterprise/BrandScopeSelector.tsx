// src/components/Enterprise/BrandScopeSelector.tsx
// Header dropdown that lets users switch their active brand scope
import { useState, useEffect, useRef } from 'react';
import { Building2, ChevronDown, Globe, Check } from 'lucide-react';
import { getOrgTree, type OrgTreeNode, type Brand } from '../../lib/hierarchyService';

interface BrandScopeSelectorProps {
    organizationId: string;
    activeBrandId: string | null;
    onBrandChange: (brandId: string | null) => void;
}

export default function BrandScopeSelector({
    organizationId,
    activeBrandId,
    onBrandChange,
}: BrandScopeSelectorProps) {
    const [tree, setTree] = useState<OrgTreeNode | null>(null);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        getOrgTree(organizationId).then(setTree);
    }, [organizationId]);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    if (!tree) return null;

    const allBrands: Brand[] = tree.businessUnits.flatMap((bu) => bu.brands);
    if (allBrands.length <= 1) return null; // No switcher needed for single-brand orgs

    const activeBrand = allBrands.find((b) => b.id === activeBrandId);
    const label = activeBrand ? activeBrand.name : 'All Brands';

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border)]
                   bg-[var(--color-surface)] hover:bg-[var(--color-surface-alt)] text-sm font-medium text-[var(--color-text-secondary)]
                   transition-all duration-150 shadow-sm"
            >
                <Building2 className="w-4 h-4 text-[var(--color-purple)]" />
                <span className="max-w-[140px] truncate">{label}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-1 w-72 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]
                        shadow-xl z-50 py-1 max-h-80 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150">
                    {/* All brands option */}
                    <button
                        onClick={() => { onBrandChange(null); setOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[var(--color-surface-alt)]
                       ${!activeBrandId ? 'bg-[var(--color-purple)]/10 text-[var(--color-purple)] font-medium' : 'text-[var(--color-text-secondary)]'}`}
                    >
                        <Globe className="w-4 h-4 text-[var(--color-text-tertiary)] shrink-0" />
                        <span>All Brands</span>
                        {!activeBrandId && <Check className="w-3.5 h-3.5 ml-auto text-[var(--color-purple)]" />}
                    </button>

                    <div className="border-t border-[var(--color-border)] my-1" />

                    {/* Tree: BU → brands */}
                    {tree.businessUnits.map((bu) => (
                        <div key={bu.id}>
                            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                                {bu.name}
                                {bu.region && <span className="ml-1 text-[var(--color-text-tertiary)]">· {bu.region}</span>}
                            </div>
                            {bu.brands.map((brand) => (
                                <button
                                    key={brand.id}
                                    onClick={() => { onBrandChange(brand.id); setOpen(false); }}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[var(--color-surface-alt)]
                             ${activeBrandId === brand.id ? 'bg-[var(--color-purple)]/10 text-[var(--color-purple)] font-medium' : 'text-[var(--color-text-secondary)]'}`}
                                >
                                    {brand.logo_url ? (
                                        <img src={brand.logo_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                                    ) : (
                                        <div className="w-4 h-4 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-[8px] text-white font-bold">
                                            {brand.name.charAt(0)}
                                        </div>
                                    )}
                                    <span className="truncate">{brand.name}</span>
                                    {brand.jurisdictions.length > 0 && (
                                        <span className="text-[10px] text-[var(--color-text-tertiary)] ml-auto shrink-0">
                                            {brand.jurisdictions.slice(0, 2).join(', ')}
                                            {brand.jurisdictions.length > 2 && ` +${brand.jurisdictions.length - 2}`}
                                        </span>
                                    )}
                                    {activeBrandId === brand.id && <Check className="w-3.5 h-3.5 ml-1 text-[var(--color-purple)] shrink-0" />}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
