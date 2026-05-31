// src/lib/aiGovernance/aiSanitization.ts
// AI Sanitization Helper — Phase 6 Sprint 2
// Redacts PII and truncates payloads for safe governance logging.

/**
 * Redacts common sensitive patterns (emails, phone numbers, common API key formats).
 */
export function redactPII(text: string): string {
    if (!text) return text;

    let sanitized = text;

    // Redact Emails
    sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');

    // Redact Phone Numbers (Basic format: +xx xxx xxxx or xxxxxxxxxx)
    sanitized = sanitized.replace(/(\+\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g, '[PHONE_REDACTED]');

    // Redact common API keys (e.g., sk-..., gpit-...)
    sanitized = sanitized.replace(/(sk-|gpit-|AIza)[a-zA-Z0-9_-]{20,}/g, '[KEY_REDACTED]');

    return sanitized;
}

/**
 * Generates a safe summary of a prompt or response.
 * Truncates and redacts.
 */
export function generateSafeSummary(content: string, maxLength = 200): string {
    if (!content) return '';
    
    // Clean whitespace and newlines
    const clean = content.trim().replace(/\s+/g, ' ');
    
    // Redact
    const redacted = redactPII(clean);
    
    // Truncate
    if (redacted.length <= maxLength) return redacted;
    
    return redacted.slice(0, maxLength) + '...';
}

/**
 * Helper to extract risk flags from text based on keywords (MVP).
 */
export function detectRiskFlags(text: string): string[] {
    const flags: string[] = [];
    const lower = text.toLowerCase();

    const rules = [
        { flag: 'MEDICAL_CLAIM', words: ['cure', 'heal', 'guaranteed', 'medicine', 'treatment'] },
        { flag: 'FINANCIAL_ADVICE', words: ['guaranteed returns', 'investment', 'profit', 'stock'] },
        { flag: 'SENSITIVE_DATA', words: ['password', 'secret', 'confidential', 'ssn'] },
        { flag: 'SUPERLATIVE', words: ['best', 'most effective', 'superior', 'unbeatable'] }
    ];

    for (const rule of rules) {
        if (rule.words.some(word => lower.includes(word))) {
            flags.push(rule.flag);
        }
    }

    return flags;
}
