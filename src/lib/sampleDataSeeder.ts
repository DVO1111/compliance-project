/**
 * sampleDataSeeder
 *
 * Seeds a comprehensive set of demo data across all core modules so pilot
 * customers see a fully populated platform on day 1.
 *
 * Idempotent — checks for existing submissions before running.
 * Each module is seeded independently; failures are logged but don't abort others.
 */

import { supabase } from './supabase';
import { logger } from './logger';

export interface SeedResult {
    alreadySeeded: boolean;
    submissionsCreated: number;
    message: string;
}

// ─── Content submissions ───────────────────────────────────────────────────

const DEMO_SUBMISSIONS = [
    {
        title: 'Q2 NAFDAC Product Launch Campaign',
        platform: 'Social Media',
        content_text: 'Introducing our new pharmaceutical product line, clinically proven to improve patient outcomes. Ask your doctor about our latest treatment options. Results may vary. Always consult a healthcare professional.',
        signoff_status: 'signed_off',
        jurisdiction: 'Nigeria',
    },
    {
        title: 'FDA Clearance Announcement — Device X',
        platform: 'Press Release',
        content_text: 'We are pleased to announce FDA 510(k) clearance for Device X, our breakthrough medical device for cardiac monitoring. This device has demonstrated superior accuracy in clinical trials with over 2,000 patients.',
        signoff_status: 'awaiting_legal',
        jurisdiction: 'USA',
    },
    {
        title: 'EMA Compliance Bulletin — Q3 Update',
        platform: 'Email Newsletter',
        content_text: 'This quarterly update covers the latest European Medicines Agency guidelines on pharmacovigilance reporting, adverse event documentation requirements, and labelling standards for medicinal products in the EU.',
        signoff_status: 'amend_requested',
        jurisdiction: 'Europe',
    },
    {
        title: 'NAFDAC Annual Report — Safety Summary',
        platform: 'Internal Document',
        content_text: 'Annual pharmacovigilance summary covering adverse event reports, market surveillance findings, and corrective actions taken during the financial year in compliance with NAFDAC post-market requirements.',
        signoff_status: 'in_review',
        jurisdiction: 'Nigeria',
    },
    {
        title: 'World Cancer Day Awareness Campaign',
        platform: 'Social Media',
        content_text: 'This World Cancer Day, we stand with patients and caregivers. Early detection saves lives. Schedule your screening today. Consult your oncologist for personalised guidance.',
        signoff_status: 'signed_off',
        jurisdiction: 'Global',
    },
];

// ─── Policies ─────────────────────────────────────────────────────────────

const DEMO_POLICIES = [
    {
        title: 'Promotional Content Review Policy',
        category: 'Compliance',
        description: 'Establishes mandatory legal and regulatory review requirements for all external-facing promotional and marketing content before publication.',
        is_active: true,
    },
    {
        title: 'Data Privacy & GDPR Policy',
        category: 'Privacy',
        description: 'Defines how the organisation collects, processes, stores, and protects personal data in compliance with GDPR, NDPR, and applicable data protection laws.',
        is_active: true,
    },
    {
        title: 'Adverse Event Reporting Policy',
        category: 'Information Security',
        description: 'Mandatory procedures for identifying, documenting, and reporting adverse events and safety signals to relevant regulatory authorities within statutory timeframes.',
        is_active: true,
    },
    {
        title: 'Vendor Due Diligence Policy',
        category: 'Operations',
        description: 'Outlines the risk assessment and onboarding requirements for third-party vendors, suppliers, and service providers with access to regulated data or processes.',
        is_active: true,
    },
];

// ─── Risks ────────────────────────────────────────────────────────────────

const DEMO_RISKS = [
    {
        title: 'Unsubstantiated Health Claim in Marketing',
        description: 'Risk that promotional content contains health claims not supported by clinical evidence, exposing the company to regulatory action from NAFDAC or FDA.',
        category: 'Regulatory',
        likelihood: 3,
        impact: 5,
        status: 'open',
        owner_name: 'Compliance Team',
    },
    {
        title: 'GDPR Data Breach — Patient Records',
        description: 'Risk of unauthorised access to or accidental disclosure of patient personal data, triggering mandatory breach notification obligations.',
        category: 'Data Privacy',
        likelihood: 2,
        impact: 5,
        status: 'mitigated',
        owner_name: 'Data Protection Officer',
    },
    {
        title: 'Third-Party Vendor Non-Compliance',
        description: 'A key vendor fails to meet contractual compliance obligations, creating downstream liability for the organisation.',
        category: 'Operational',
        likelihood: 3,
        impact: 3,
        status: 'open',
        owner_name: 'Procurement',
    },
    {
        title: 'Delayed Adverse Event Reporting',
        description: 'Failure to report adverse events within statutory timeframes (e.g. 15-day EMA requirement) due to inadequate internal monitoring processes.',
        category: 'Regulatory',
        likelihood: 2,
        impact: 4,
        status: 'open',
        owner_name: 'Pharmacovigilance',
    },
    {
        title: 'Social Media Off-Label Promotion',
        description: 'Risk that social media content inadvertently promotes a product for an off-label indication, violating NAFDAC/FDA advertising regulations.',
        category: 'Regulatory',
        likelihood: 4,
        impact: 4,
        status: 'open',
        owner_name: 'Marketing',
    },
];

// ─── Vendors ──────────────────────────────────────────────────────────────

const DEMO_VENDORS = [
    {
        name: 'LexTech Legal Services',
        category: 'Legal',
        status: 'active',
        contact_email: 'compliance@lextech.example.com',
        website: 'https://lextech.example.com',
        risk_level: 'low',
        notes: 'Primary external legal review partner for EU and US markets.',
    },
    {
        name: 'DataGuard Analytics',
        category: 'Technology',
        status: 'active',
        contact_email: 'support@dataguard.example.com',
        website: 'https://dataguard.example.com',
        risk_level: 'medium',
        notes: 'Cloud-based analytics platform processing pseudonymised patient data.',
    },
    {
        name: 'MedPrint Packaging Co.',
        category: 'Manufacturing',
        status: 'under_review',
        contact_email: 'quality@medprint.example.com',
        website: 'https://medprint.example.com',
        risk_level: 'high',
        notes: 'Packaging supplier — pending re-audit after 2023 GMP deviation finding.',
    },
];

// ─── Obligations ──────────────────────────────────────────────────────────

const DEMO_OBLIGATIONS = [
    {
        title: 'NAFDAC Adverse Event 15-Day Report',
        description: 'Submit serious unexpected adverse event reports to NAFDAC within 15 calendar days of first awareness.',
        regulation: 'NAFDAC Act CAP N1 LFN 2004',
        jurisdiction: 'Nigeria',
        due_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        status: 'active',
        frequency: 'As required',
    },
    {
        title: 'GDPR Annual Privacy Impact Assessment',
        description: 'Conduct and document a Data Protection Impact Assessment for all high-risk processing activities.',
        regulation: 'GDPR Article 35',
        jurisdiction: 'EU',
        due_date: new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0],
        status: 'active',
        frequency: 'Annual',
    },
    {
        title: 'FDA Biannual Safety Update Report',
        description: 'Submit Periodic Adverse Drug Experience Report (PADER) to FDA covering all adverse events in the reporting period.',
        regulation: '21 CFR 314.81',
        jurisdiction: 'USA',
        due_date: new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0],
        status: 'active',
        frequency: 'Biannual',
    },
];

// ─── Departments ──────────────────────────────────────────────────────────

const DEMO_DEPARTMENTS = [
    'Regulatory Affairs',
    'Medical Affairs',
    'Legal & Compliance',
    'Marketing',
];

// ─── Main seeder ──────────────────────────────────────────────────────────

export async function seedDemoData(companyId: string, userId: string): Promise<SeedResult> {
    // Idempotency check
    const { count } = await supabase
        .from('content_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId);

    if (count && count > 0) {
        return {
            alreadySeeded: true,
            submissionsCreated: 0,
            message: `Demo data not loaded — workspace already has ${count} submission(s).`,
        };
    }

    const now = new Date().toISOString();
    let submissionsCreated = 0;
    const errors: string[] = [];

    // 1. Content submissions + compliance reports
    for (const demo of DEMO_SUBMISSIONS) {
        try {
            const { data: sub, error: subErr } = await supabase
                .from('content_submissions')
                .insert({
                    company_id: companyId,
                    user_id: userId,
                    title: demo.title,
                    platform: demo.platform,
                    content_text: demo.content_text,
                    signoff_status: demo.signoff_status,
                    jurisdiction: demo.jurisdiction,
                    created_at: now,
                    updated_at: now,
                } as any)
                .select('id')
                .single();

            if (subErr || !sub) { errors.push(`submission: ${subErr?.message}`); continue; }
            submissionsCreated++;

            if (submissionsCreated <= 2) {
                const isHighRisk = submissionsCreated === 2;
                await supabase.from('compliance_reports').insert({
                    content_id: sub.id,
                    company_id: companyId,
                    overall_risk: isHighRisk ? 'high' : 'low',
                    issues: isHighRisk ? [
                        { issue: 'Unsubstantiated efficacy claim', severity: 'Red', regulation_cited: 'FDA 21 CFR Part 202.1', suggestion: 'Replace with clinically substantiated claim citing specific trial data.' },
                        { issue: 'Missing risk disclosure', severity: 'Amber', regulation_cited: 'NAFDAC Advert Guidelines §4.2', suggestion: 'Add standard safety disclaimer.' },
                    ] : [],
                    suggested_rewrites: isHighRisk ? [
                        { original: 'clinically proven to improve patient outcomes', suggested: 'shown in a Phase III trial to improve outcomes in 78% of patients (Study Ref: XYZ-2024)' },
                    ] : [],
                    created_at: now,
                    updated_at: now,
                } as any);
            }
        } catch (err: any) {
            errors.push(`submission: ${err?.message}`);
        }
    }

    // 2. Departments
    for (const name of DEMO_DEPARTMENTS) {
        try {
            await (supabase as any).from('departments').upsert(
                { company_id: companyId, name },
                { onConflict: 'company_id,name', ignoreDuplicates: true }
            );
        } catch (err: any) {
            logger.warn('Dept seed skipped:', err?.message);
        }
    }

    // 3. Policies
    for (const p of DEMO_POLICIES) {
        try {
            await (supabase as any).from('policies').upsert(
                { company_id: companyId, owner_id: userId, ...p, created_at: now, updated_at: now },
                { onConflict: 'company_id,title', ignoreDuplicates: true }
            );
        } catch (err: any) {
            logger.warn('Policy seed skipped:', err?.message);
        }
    }

    // 4. Risks
    for (const r of DEMO_RISKS) {
        try {
            await (supabase as any).from('risks').upsert(
                {
                    company_id: companyId,
                    created_by: userId,
                    title: r.title,
                    description: r.description,
                    category: r.category,
                    likelihood: r.likelihood,
                    impact: r.impact,
                    risk_score: r.likelihood * r.impact,
                    status: r.status,
                    owner_name: r.owner_name,
                    created_at: now,
                    updated_at: now,
                },
                { onConflict: 'company_id,title', ignoreDuplicates: true }
            );
        } catch (err: any) {
            logger.warn('Risk seed skipped:', err?.message);
        }
    }

    // 5. Vendors
    for (const v of DEMO_VENDORS) {
        try {
            await (supabase as any).from('vendors').upsert(
                { company_id: companyId, ...v, created_at: now, updated_at: now },
                { onConflict: 'company_id,name', ignoreDuplicates: true }
            );
        } catch (err: any) {
            logger.warn('Vendor seed skipped:', err?.message);
        }
    }

    // 6. Obligations
    for (const o of DEMO_OBLIGATIONS) {
        try {
            await (supabase as any).from('obligations').upsert(
                { company_id: companyId, created_by: userId, ...o, created_at: now, updated_at: now },
                { onConflict: 'company_id,title', ignoreDuplicates: true }
            );
        } catch (err: any) {
            logger.warn('Obligation seed skipped:', err?.message);
        }
    }

    if (errors.length > 0) {
        logger.warn('Some seed items failed:', errors);
    }

    return {
        alreadySeeded: false,
        submissionsCreated,
        message: `Demo workspace ready — ${submissionsCreated} submissions, 4 policies, 5 risks, 3 vendors, and 3 obligations created.`,
    };
}
