import { supabase } from './supabase';
import { recordAuditEvent } from './auditService';
import { logger } from './logger';

/* ═══════════════════════════════════════════════════════════════
   License Expiry Auto-Pilot — Service Layer
   ═══════════════════════════════════════════════════════════════ */

// ── Types ────────────────────────────────────────────────────

export interface License {
    id: string;
    company_id: string;
    uploaded_by: string;
    product_name: string;
    nafdac_reg_number: string;
    category: string;
    expiry_date: string;
    issue_date: string | null;
    issuing_authority: string;
    certificate_url: string | null;
    status: 'active' | 'expiring' | 'expired' | 'renewed';
    renewal_status: 'none' | 'in_progress' | 'completed';
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface RenewalTask {
    id: string;
    license_id: string;
    title: string;
    description: string;
    deadline: string;
    is_completed: boolean;
    completed_at: string | null;
    completed_by: string | null;
    sort_order: number;
    created_at: string;
}

export type LicenseStatus = 'active' | 'expiring' | 'expired';

// ── 2026 NAFDAC Renewal Guidelines Template ──────────────────
//  Moved to ./renewalTemplate so it can be imported without pulling in
//  the Supabase client. Imported AND re-exported: `export { X } from '...'`
//  alone forwards the name without creating a local binding, so
//  generateRenewalTaskDates() below would fail to resolve it — a
//  ReferenceError at runtime, not just a type error.
import { NAFDAC_2026_RENEWAL_TASKS } from './renewalTemplate';
export { NAFDAC_2026_RENEWAL_TASKS };
export type { RenewalTaskTemplate } from './renewalTemplate';

// ── Status helpers ───────────────────────────────────────────

export function getLicenseStatus(expiryDate: string): LicenseStatus {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diffMs = expiry.getTime() - now.getTime();
    const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30);

    if (diffMonths < 0) return 'expired';
    if (diffMonths <= 6) return 'expiring';
    return 'active';
}

export function getDaysUntilExpiry(expiryDate: string): number {
    const now = new Date();
    const expiry = new Date(expiryDate);
    return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function getStatusColor(status: LicenseStatus): { bg: string; text: string; border: string } {
    switch (status) {
        case 'active': return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
        case 'expiring': return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
        case 'expired': return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
    }
}

// ── AI Extraction (regex-based w/ structured fallback) ───────

export interface ExtractedLicenseData {
    product_name: string;
    nafdac_reg_number: string;
    expiry_date: string;
    issue_date: string;
    issuing_authority: string;
    category: string;
    confidence: 'high' | 'medium' | 'low';
}

export function extractLicenseData(text: string): ExtractedLicenseData {
    const clean = text.replace(/\s+/g, ' ').trim();

    // NAFDAC Registration Number patterns
    const regPatterns = [
        /(?:NAFDAC[\s-]*(?:Reg\.?|Registration)?[\s#:.-]*(?:No\.?)?[\s:.-]*)([\w\d-]{4,20})/i,
        /(?:Registration\s*(?:Number|No\.?)[\s:.-]*)([\w\d-]{4,20})/i,
        /\b([A-Z]{1,4}-\d{4,}-\d{2,})\b/,
    ];
    let nafdac_reg_number = '';
    for (const p of regPatterns) {
        const m = clean.match(p);
        if (m) { nafdac_reg_number = m[1].trim(); break; }
    }

    // Date patterns (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, "January 15, 2027", etc.)
    const datePatterns = [
        /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/g,
        /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/g,
        /(\w+)\s+(\d{1,2}),?\s+(\d{4})/g,
    ];

    const dates: Date[] = [];
    for (const p of datePatterns) {
        let m;
        while ((m = p.exec(clean)) !== null) {
            const d = new Date(m[0]);
            if (!isNaN(d.getTime())) dates.push(d);
        }
    }

    dates.sort((a, b) => a.getTime() - b.getTime());
    const now = new Date();
    const futureDates = dates.filter(d => d > now);
    const pastDates = dates.filter(d => d <= now);

    const expiry_date = futureDates.length > 0
        ? futureDates[futureDates.length - 1].toISOString().slice(0, 10)
        : dates.length > 0
            ? dates[dates.length - 1].toISOString().slice(0, 10)
            : '';

    const issue_date = pastDates.length > 0
        ? pastDates[0].toISOString().slice(0, 10)
        : '';

    // Product name — look for common patterns
    const namePatterns = [
        /(?:Product\s*(?:Name)?[\s:.-]+)([^\n,;]{3,60})/i,
        /(?:Brand\s*(?:Name)?[\s:.-]+)([^\n,;]{3,60})/i,
        /(?:Name\s*of\s*(?:Drug|Product|Medicine)[\s:.-]+)([^\n,;]{3,60})/i,
    ];
    let product_name = '';
    for (const p of namePatterns) {
        const m = clean.match(p);
        if (m) { product_name = m[1].trim(); break; }
    }

    // Category
    const categoryMap: Record<string, string> = {
        'drug': 'Drug',
        'pharmaceutical': 'Drug',
        'biological': 'Biological',
        'vaccine': 'Biological',
        'cosmetic': 'Cosmetic',
        'medical device': 'Medical Device',
        'food': 'Processed Food',
        'chemical': 'Chemical',
        'herbal': 'Herbal Medicine',
    };
    let category = 'Drug';
    const lc = clean.toLowerCase();
    for (const [keyword, cat] of Object.entries(categoryMap)) {
        if (lc.includes(keyword)) { category = cat; break; }
    }

    const confidence: 'high' | 'medium' | 'low' =
        (nafdac_reg_number && expiry_date && product_name) ? 'high' :
            (expiry_date || nafdac_reg_number) ? 'medium' : 'low';

    return {
        product_name,
        nafdac_reg_number,
        expiry_date,
        issue_date,
        issuing_authority: 'NAFDAC',
        category,
        confidence,
    };
}

// ── Renewal Task Generation ──────────────────────────────────

export function generateRenewalTaskDates(expiryDate: string): { title: string; description: string; deadline: string; sortOrder: number }[] {
    const expiry = new Date(expiryDate);
    return NAFDAC_2026_RENEWAL_TASKS.map(t => {
        const deadline = new Date(expiry);
        deadline.setMonth(deadline.getMonth() - Math.floor(t.monthsBefore));
        deadline.setDate(deadline.getDate() - Math.round((t.monthsBefore % 1) * 30));
        return {
            title: t.title,
            description: t.description,
            deadline: deadline.toISOString().slice(0, 10),
            sortOrder: t.sortOrder,
        };
    });
}

// ── Cross-module propagation ─────────────────────────────────

async function maybePropagateToRiskAndObligation(
    license: License,
    companyId: string,
    userId: string,
    status: LicenseStatus,
): Promise<void> {
    try {
        if (status === 'active') return;

        const isExpired = status === 'expired';
        const riskLevel = isExpired ? 'critical' : 'high';
        const riskTitle = isExpired
            ? `Licence Expired — ${license.product_name}`
            : `Licence Expiring Soon — ${license.product_name}`;

        const { createRisk, updateRisk, addRiskLink } = await import('./governance/riskRegisterService');

        // Dedup: check for existing risk link on this license
        const { data: links } = await (supabase as any)
            .from('risk_links')
            .select('risk_id')
            .eq('company_id', companyId)
            .eq('link_type', 'license')
            .eq('linked_entity_id', license.id)
            .limit(1);

        const existingRiskId: string | null = links?.[0]?.risk_id ?? null;

        if (existingRiskId) {
            await updateRisk(companyId, userId, existingRiskId, {
                risk_level: riskLevel,
                status: 'identified',
                title: riskTitle,
            });
        } else {
            const risk = await createRisk(companyId, userId, {
                title: riskTitle,
                description: `Licence "${license.product_name}" (${license.nafdac_reg_number}) issued by ${license.issuing_authority} ${isExpired ? 'has expired' : `expires on ${license.expiry_date}`}. Immediate renewal action required.`,
                risk_category: 'compliance',
                risk_level: riskLevel,
                status: 'identified',
            });
            if (risk) await addRiskLink(companyId, userId, risk.id, 'license', license.id);
        }

        // Obligation — dedup by title
        const obligationTitle = `Licence Renewal: ${license.product_name} (${license.nafdac_reg_number})`;
        const { data: existing } = await (supabase as any)
            .from('regulatory_obligations')
            .select('id')
            .eq('company_id', companyId)
            .eq('title', obligationTitle)
            .maybeSingle();

        if (!existing?.id) {
            const { createObligation } = await import('./governance/obligationService');
            await createObligation(companyId, userId, {
                title: obligationTitle,
                description: `${license.issuing_authority} registration certificate for "${license.product_name}" (Reg. No: ${license.nafdac_reg_number}) ${isExpired ? 'has expired' : `expires on ${license.expiry_date}`}. Renewal must be completed to remain compliant.`,
                jurisdiction: 'Nigeria',
                category: 'regulatory',
                status: 'identified',
            });
        }
    } catch (err) {
        logger.warn('licenseService: maybePropagateToRiskAndObligation non-blocking', err);
    }
}

// ── DB Operations ────────────────────────────────────────────

export async function fetchLicenses(companyId: string): Promise<License[]> {
    const { data, error } = await supabase
        .from('licenses' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('expiry_date', { ascending: true });
    if (error) throw error;
    return (data ?? []) as any as License[];
}

export async function createLicense(license: Omit<License, 'id' | 'created_at' | 'updated_at' | 'status' | 'renewal_status'>): Promise<License> {
    const status = getLicenseStatus(license.expiry_date);
    const dbStatus = status === 'expiring' ? 'expiring' : status === 'expired' ? 'expired' : 'active';

    const { data, error } = await supabase
        .from('licenses' as any)
        .insert({
            ...license,
            status: dbStatus,
            renewal_status: 'none',
        } as any)
        .select()
        .single();
    if (error) throw error;

    const saved = data as any as License;

    // Auto-generate renewal tasks if expiring within 6 months
    if (status === 'expiring') {
        await generateAndSaveRenewalTasks(saved.id, saved.expiry_date);
    }

    // Propagate expiring/expired licences to Risk Register + Obligations
    await maybePropagateToRiskAndObligation(saved, license.company_id, license.uploaded_by, status);

    try { await recordAuditEvent({ userId: license.uploaded_by, companyId: license.company_id, action: 'license.created', entityType: 'license', entityId: saved.id, metadata: { product_name: license.product_name, nafdac_reg_number: license.nafdac_reg_number, category: license.category, expiry_date: license.expiry_date }, captureEvidence: false }); } catch { /* non-blocking */ }
    return saved;
}

export async function generateAndSaveRenewalTasks(licenseId: string, expiryDate: string): Promise<void> {
    const tasks = generateRenewalTaskDates(expiryDate);
    const inserts = tasks.map(t => ({
        license_id: licenseId,
        title: t.title,
        description: t.description,
        deadline: t.deadline,
        is_completed: false,
        sort_order: t.sortOrder,
    }));

    await supabase.from('license_renewal_tasks' as any).insert(inserts as any);
}

export async function fetchRenewalTasks(licenseId: string): Promise<RenewalTask[]> {
    const { data, error } = await supabase
        .from('license_renewal_tasks' as any)
        .select('*')
        .eq('license_id', licenseId)
        .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as any as RenewalTask[];
}

export async function toggleTask(taskId: string, completed: boolean, userId: string, companyId?: string): Promise<void> {
    const { data } = await (supabase.from('license_renewal_tasks' as any).update({
        is_completed: completed,
        completed_at: completed ? new Date().toISOString() : null,
        completed_by: completed ? userId : null,
    } as any).eq('id', taskId).select('id, license_id, title') as any);
    if (companyId && data?.[0]) {
        try {
            await recordAuditEvent({
                userId,
                companyId,
                action: completed ? 'license.renewal_task_completed' : 'license.renewal_task_reopened',
                entityType: 'license_renewal_task',
                entityId: taskId,
                metadata: { license_id: data[0].license_id, task_title: data[0].title },
                captureEvidence: false,
            });
        } catch { /* non-blocking */ }
    }
}

export async function updateLicenseStatus(licenseId: string, status: string, renewalStatus?: string, companyId?: string, userId?: string): Promise<void> {
    const update: any = { status, updated_at: new Date().toISOString() };
    if (renewalStatus) update.renewal_status = renewalStatus;
    await supabase.from('licenses' as any).update(update).eq('id', licenseId);
    if (companyId && userId) {
        try { await recordAuditEvent({ userId, companyId, action: 'license.status_updated', entityType: 'license', entityId: licenseId, metadata: { status, renewal_status: renewalStatus }, captureEvidence: false }); } catch { /* non-blocking */ }

        // Propagate expiry changes to Risk Register + Obligations
        if (status === 'expiring' || status === 'expired') {
            const { data: lic } = await (supabase as any).from('licenses').select('*').eq('id', licenseId).maybeSingle();
            if (lic) await maybePropagateToRiskAndObligation(lic as License, companyId, userId, status as LicenseStatus);
        }
    }
}

export async function deleteLicense(licenseId: string, companyId?: string, userId?: string): Promise<void> {
    if (companyId && userId) {
        try { await recordAuditEvent({ userId, companyId, action: 'license.deleted', entityType: 'license', entityId: licenseId, metadata: { license_id: licenseId }, captureEvidence: false }); } catch { /* non-blocking */ }
    }
    await supabase.from('license_renewal_tasks' as any).delete().eq('license_id', licenseId);
    await supabase.from('licenses' as any).delete().eq('id', licenseId);
}
