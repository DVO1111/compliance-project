import { supabase } from './supabase';

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

export interface RenewalTaskTemplate {
    title: string;
    description: string;
    monthsBefore: number; // months before expiry
    sortOrder: number;
}

export const NAFDAC_2026_RENEWAL_TASKS: RenewalTaskTemplate[] = [
    {
        title: 'Obtain current Power of Attorney (PoA)',
        description: 'Secure an updated and notarized Power of Attorney from the product manufacturer authorizing the local representative. Must be less than 12 months old at submission.',
        monthsBefore: 6,
        sortOrder: 1,
    },
    {
        title: 'Book GMP Facility Inspection',
        description: 'Schedule a Good Manufacturing Practice (GMP) inspection with NAFDAC for the manufacturing facility. Coordinate with the manufacturer for availability and required documentation.',
        monthsBefore: 5,
        sortOrder: 2,
    },
    {
        title: 'Prepare updated Certificate of Pharmaceutical Product (CPP)',
        description: 'Request an updated CPP from the regulatory authority in the country of origin. Must be recent (within 2 years) and authenticated by the Nigerian Embassy.',
        monthsBefore: 5,
        sortOrder: 3,
    },
    {
        title: 'Complete Product Stability Studies Report',
        description: 'Compile stability data as per ICH guidelines (Zone IVb for Nigeria). Include accelerated and long-term stability reports for the product.',
        monthsBefore: 4,
        sortOrder: 4,
    },
    {
        title: 'Update Product Information Leaflet (PIL)',
        description: 'Review and update the patient information leaflet and Summary of Product Characteristics (SmPC) per current NAFDAC requirements. Ensure English language version is included.',
        monthsBefore: 4,
        sortOrder: 5,
    },
    {
        title: 'Prepare Batch Manufacturing Records (last 3 batches)',
        description: 'Compile complete batch manufacturing records for the last 3 production batches, including in-process controls and release testing results.',
        monthsBefore: 3,
        sortOrder: 6,
    },
    {
        title: 'Obtain Site Master File (SMF) from manufacturer',
        description: 'Request the current Site Master File from the manufacturing facility. This must reflect the current state of the facility and comply with WHO guidelines.',
        monthsBefore: 3,
        sortOrder: 7,
    },
    {
        title: 'Submit NAFDAC Renewal Application Form',
        description: 'Complete and submit the official NAFDAC Product Registration Renewal Application Form. Include all required attachments and supporting documentation.',
        monthsBefore: 3,
        sortOrder: 8,
    },
    {
        title: 'Pay NAFDAC Renewal Processing Fee',
        description: 'Pay the applicable renewal processing fee through the official NAFDAC payment portal (Remita). Retain evidence of payment for submission.',
        monthsBefore: 3,
        sortOrder: 9,
    },
    {
        title: 'Submit complete dossier to NAFDAC',
        description: 'Compile and submit the complete renewal dossier to the NAFDAC Registration & Regulatory Affairs Directorate. Include 2 hard copies and 1 electronic copy (eCTD format preferred).',
        monthsBefore: 2,
        sortOrder: 10,
    },
    {
        title: 'Follow up with NAFDAC Registration Division',
        description: 'Actively follow up with the NAFDAC Registration Division to track the status of the renewal application. Address any queries or deficiency letters promptly.',
        monthsBefore: 1,
        sortOrder: 11,
    },
    {
        title: 'Receive renewed certificate / track status',
        description: 'Collect the renewed NAFDAC Registration Certificate. Upload a copy to the system and update the license record with new expiry date.',
        monthsBefore: 0.5,
        sortOrder: 12,
    },
];

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

export async function toggleTask(taskId: string, completed: boolean, userId: string): Promise<void> {
    await supabase.from('license_renewal_tasks' as any).update({
        is_completed: completed,
        completed_at: completed ? new Date().toISOString() : null,
        completed_by: completed ? userId : null,
    } as any).eq('id', taskId);
}

export async function updateLicenseStatus(licenseId: string, status: string, renewalStatus?: string): Promise<void> {
    const update: any = { status, updated_at: new Date().toISOString() };
    if (renewalStatus) update.renewal_status = renewalStatus;
    await supabase.from('licenses' as any).update(update).eq('id', licenseId);
}

export async function deleteLicense(licenseId: string): Promise<void> {
    await supabase.from('license_renewal_tasks' as any).delete().eq('license_id', licenseId);
    await supabase.from('licenses' as any).delete().eq('id', licenseId);
}
