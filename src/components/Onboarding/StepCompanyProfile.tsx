import { useRef, useState } from 'react';
import { Building2, Image as ImageIcon, Upload, Loader2 } from 'lucide-react';
import type { OnboardingData } from './OnboardingWizard';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

const INDUSTRY_OPTIONS = [
  'Pharmaceuticals',
  'Biotechnology',
  'Medical Devices',
  'Cosmetics & Personal Care',
  'Food & Nutraceuticals',
  'Healthcare Services',
  'Contract Research Organization',
  'Advertising & Marketing Agency',
  'Logistics & Courier',
  'Financial Services',
  'Food & Beverage',
  'Other',
];

interface StepCompanyProfileProps {
  data: OnboardingData;
  onUpdate: (partial: Partial<OnboardingData>) => void;
  companyId?: string | null;
}

export default function StepCompanyProfile({ data, onUpdate, companyId }: StepCompanyProfileProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    if (!companyId) { setUploadError('Company not ready yet — please try again in a moment.'); return; }
    if (!file.type.startsWith('image/')) { setUploadError('Please upload an image file.'); return; }
    if (file.size > 2 * 1024 * 1024) { setUploadError('Image must be under 2 MB.'); return; }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `company-logos/${companyId}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      // Cache-bust so a re-upload of the same path shows the new image immediately.
      onUpdate({ logoUrl: `${urlData.publicUrl}?t=${Date.now()}` });
    } catch (err: any) {
      logger.error('Logo upload failed:', err);
      setUploadError('Logo upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Building2 className="w-6 h-6 text-[var(--color-success)]" />
        <h2 className="text-xl font-semibold text-white">Company Profile</h2>
      </div>
      <p className="text-[var(--color-info)] text-sm">
        Tell us about your organization so we can tailor the compliance rules that matter most.
      </p>

      <div>
        <label className="block text-sm font-medium text-white mb-2">Company Name</label>
        <input
          type="text"
          value={data.companyName}
          onChange={e => onUpdate({ companyName: e.target.value })}
          placeholder="e.g. Acme Pharmaceuticals Ltd"
          className="w-full px-4 py-3 dash-card/10 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#00A86B] focus:border-transparent text-white placeholder-blue-300/50 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-2">
          Company Logo <span className="text-[var(--color-info)]/60 font-normal">(optional)</span>
        </label>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl border-2 border-dashed border-white/20 bg-white/5 flex items-center justify-center overflow-hidden shrink-0">
            {data.logoUrl
              ? <img src={data.logoUrl} alt="Company logo" className="w-full h-full object-contain p-1" />
              : <ImageIcon className="w-6 h-6 text-white/40" />
            }
          </div>
          <div className="space-y-1.5">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/20 text-sm font-medium text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Uploading…' : data.logoUrl ? 'Change Logo' : 'Upload Logo'}
            </button>
            {data.logoUrl && !uploading && (
              <button
                type="button"
                onClick={() => onUpdate({ logoUrl: '' })}
                className="text-xs text-red-300 hover:underline block"
              >
                Remove logo
              </button>
            )}
            <p className="text-xs text-[var(--color-info)]/60">PNG, JPG or SVG — max 2 MB</p>
          </div>
        </div>
        {uploadError && <p className="text-xs text-red-300 mt-2">{uploadError}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-2">Industry Type</label>
        <div className="grid grid-cols-2 gap-2">
          {INDUSTRY_OPTIONS.map(industry => {
            const selected = data.industryType === industry;
            return (
              <button
                key={industry}
                onClick={() => onUpdate({ industryType: industry })}
                className={`px-4 py-3 rounded-lg text-sm font-medium text-left transition-all ${
                  selected
                    ? 'bg-[var(--color-success)]/20 border-[var(--color-success)] text-white border-2'
                    : 'dash-card/5 border border-white/15 text-blue-100 hover:dash-card/10 hover:border-white/25'
                }`}
              >
                {industry}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

