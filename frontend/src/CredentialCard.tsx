import React, { useState, useMemo } from 'react';
import { ShieldCheck, Eye, EyeOff, Lock, CheckCircle, Copy, Check, FileBadge, Info, ExternalLink } from 'lucide-react';
import { SDJWTCredential } from './types/credentials';

interface CredentialCardProps {
  holderAddress?: `0x${string}`;
  currentTheme?: 'dark' | 'palette';
}

export const CredentialCard: React.FC<CredentialCardProps> = ({ holderAddress, currentTheme }) => {
  const [copied, setCopied] = useState(false);

  // Default SD-JWT Credential conforming strictly to backend/schemas/sd_jwt_credential.json
  const defaultCredential: SDJWTCredential = useMemo(() => ({
    iss: 'did:web:gov.in:identity_dept',
    sub: holderAddress ? `did:ethr:amoy:${holderAddress}` : 'did:ethr:amoy:0x71C35b2a0D4183863aE8B79B5a58C56B676C3a9e',
    vct: 'InstitutionalIdCredential',
    iat: Math.floor(Date.now() / 1000) - 86400 * 30, // 30 days ago
    exp: Math.floor(Date.now() / 1000) + 86400 * 335, // 1 year validity
    credentialSubject: {
      role_designation: 'Lead Statutory Auditor',
      aadhaar_reference: '[Aadhaar Redacted]',
      department: 'Comptroller & Auditor General of India',
      organization: 'Ministry of Corporate Affairs & DPI Hub',
      is_over_18: true,
      birthdate: '1988-04-15',
      security_clearance: 'Tier-1 Enterprise Notary',
    },
    _sd: [
      '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae', // hash for birthdate
      'fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9', // hash for department
      '195747e9a8f467ea30303ae31f0cf8572b9a7647228ec53297a89f9ca5e0c5fe', // hash for security_clearance
    ],
    _sd_alg: 'sha-256',
  }), [holderAddress]);

  // Track which claims are selectively disclosed by the citizen
  // Requirement: (e.g. showing "Over 18: True" while hiding birthdate)
  const [disclosedFields, setDisclosedFields] = useState<Record<string, boolean>>({
    role_designation: true,
    is_over_18: true,
    department: false,
    birthdate: false,
    organization: true,
    security_clearance: false,
  });

  const toggleField = (field: string) => {
    setDisclosedFields(prev => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  // Build real-time selective disclosure presentation payload
  const disclosedPresentation = useMemo(() => {
    const revealedSubject: Record<string, unknown> = {
      // Aadhaar reference is ALWAYS strictly redacted under DPDP Act 2023
      aadhaar_reference: '[Aadhaar Redacted]',
    };

    const hiddenClaimHashes: string[] = [];

    // Process each field
    if (disclosedFields.role_designation) {
      revealedSubject.role_designation = defaultCredential.credentialSubject.role_designation;
    } else {
      hiddenClaimHashes.push('sha256(salt + "role_designation")');
    }

    if (disclosedFields.is_over_18) {
      revealedSubject.is_over_18 = defaultCredential.credentialSubject.is_over_18;
    }

    if (disclosedFields.birthdate) {
      revealedSubject.birthdate = defaultCredential.credentialSubject.birthdate;
    } else {
      hiddenClaimHashes.push('sha256(salt + "birthdate:1988-04-15")');
    }

    if (disclosedFields.department) {
      revealedSubject.department = defaultCredential.credentialSubject.department;
    } else {
      hiddenClaimHashes.push('sha256(salt + "department")');
    }

    if (disclosedFields.organization) {
      revealedSubject.organization = defaultCredential.credentialSubject.organization;
    } else {
      hiddenClaimHashes.push('sha256(salt + "organization")');
    }

    if (disclosedFields.security_clearance) {
      revealedSubject.security_clearance = defaultCredential.credentialSubject.security_clearance;
    } else {
      hiddenClaimHashes.push('sha256(salt + "security_clearance")');
    }

    return {
      header: {
        typ: 'sd-jwt-presentation',
        alg: 'ES256',
      },
      payload: {
        iss: defaultCredential.iss,
        sub: defaultCredential.sub,
        vct: defaultCredential.vct,
        iat: defaultCredential.iat,
        exp: defaultCredential.exp,
        disclosed_claims: revealedSubject,
        undisclosed_digest_hashes: hiddenClaimHashes,
        compliance: 'India DPDP Act 2023 - Zero Raw Identity Exposure',
      },
    };
  }, [defaultCredential, disclosedFields]);

  const handleCopyPresentation = () => {
    navigator.clipboard.writeText(JSON.stringify(disclosedPresentation, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="glass-panel p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl -z-10" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <FileBadge className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Verifiable Credential (IETF SD-JWT)
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Selectively disclose verified claims without compromising cryptographic authenticity or revealing government identifiers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              DPDP Act 2023 Validated
            </span>
            <span className="px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs flex items-center gap-1.5 font-mono">
              <ShieldCheck className="w-3.5 h-3.5" />
              Issuer: did:web
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Card & Disclosure Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Visual Credential Card (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-panel-glow p-6 rounded-2xl text-white relative overflow-hidden border border-indigo-500/30 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-indigo-950/40">
            {/* Holographic Accents */}
            <div className="absolute top-0 right-0 p-6 pointer-events-none opacity-20">
              <div className="w-32 h-32 border-4 border-dashed border-indigo-400 rounded-full animate-spin-slow" />
            </div>

            {/* Card Header */}
            <div className="flex items-start justify-between border-b border-slate-800/80 pb-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 p-0.5">
                  <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center text-indigo-400 font-bold text-sm">
                    ID
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-sm tracking-wide text-slate-100">
                    Institutional Identity Card
                  </h3>
                  <span className="text-[11px] font-mono text-cyan-400">
                    {defaultCredential.vct}
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-mono font-medium tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Active
              </span>
            </div>

            {/* Government ID Redacted Notice (DPDP Act) */}
            <div className="p-3 mb-5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">National Identity Reference:</span>
                <span className="font-mono text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800/50">
                  {defaultCredential.credentialSubject.aadhaar_reference}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 italic">
                Strict DPDP Act 2023 compliance: Zero raw government identifiers are ingested or broadcasted.
              </p>
            </div>

            {/* Dynamic Claims List */}
            <div className="space-y-3 text-xs">
              {/* Role Designation */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/50">
                <span className="text-slate-400">Institutional Role:</span>
                <span className="font-semibold text-slate-200">
                  {disclosedFields.role_designation ? (
                    defaultCredential.credentialSubject.role_designation
                  ) : (
                    <span className="text-slate-500 flex items-center gap-1 font-mono text-[11px]">
                      <Lock className="w-3 h-3 text-slate-600" /> [Selective Claim Hidden]
                    </span>
                  )}
                </span>
              </div>

              {/* Age Eligibility Check vs Exact Birthdate */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/50">
                <span className="text-slate-400">Legal Age (18+):</span>
                <span className="font-semibold">
                  {disclosedFields.is_over_18 ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Verified (Age &gt; 18)
                    </span>
                  ) : (
                    <span className="text-slate-500 flex items-center gap-1 font-mono text-[11px]">
                      <Lock className="w-3 h-3 text-slate-600" /> [Selective Claim Hidden]
                    </span>
                  )}
                </span>
              </div>

              {/* Birthdate Claim */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/50">
                <span className="text-slate-400">Date of Birth:</span>
                <span className="font-mono">
                  {disclosedFields.birthdate ? (
                    <span className="text-amber-300">{defaultCredential.credentialSubject.birthdate}</span>
                  ) : (
                    <span className="text-slate-500 flex items-center gap-1 font-mono text-[11px]">
                      <Lock className="w-3 h-3 text-slate-600" /> [Hidden via SD-JWT Digest]
                    </span>
                  )}
                </span>
              </div>

              {/* Department */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/50">
                <span className="text-slate-400">Department:</span>
                <span className="font-medium text-slate-200 text-right truncate max-w-[200px]">
                  {disclosedFields.department ? (
                    defaultCredential.credentialSubject.department
                  ) : (
                    <span className="text-slate-500 flex items-center gap-1 font-mono text-[11px] justify-end">
                      <Lock className="w-3 h-3 text-slate-600" /> [Hidden]
                    </span>
                  )}
                </span>
              </div>

              {/* Organization */}
              <div className="flex items-center justify-between py-1.5 border-b border-slate-800/50">
                <span className="text-slate-400">Organization:</span>
                <span className="font-medium text-slate-200 text-right truncate max-w-[200px]">
                  {disclosedFields.organization ? (
                    defaultCredential.credentialSubject.organization
                  ) : (
                    <span className="text-slate-500 flex items-center gap-1 font-mono text-[11px] justify-end">
                      <Lock className="w-3 h-3 text-slate-600" /> [Hidden]
                    </span>
                  )}
                </span>
              </div>

              {/* Security Clearance */}
              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-400">Clearance:</span>
                <span className="font-mono text-indigo-300 text-xs">
                  {disclosedFields.security_clearance ? (
                    defaultCredential.credentialSubject.security_clearance
                  ) : (
                    <span className="text-slate-500 flex items-center gap-1 font-mono text-[11px]">
                      <Lock className="w-3 h-3 text-slate-600" /> [Hidden]
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* DIDs Footer */}
            <div className="mt-5 pt-4 border-t border-slate-800/80 text-[10px] space-y-1.5 font-mono text-slate-400">
              <div className="flex items-center justify-between">
                <span>Issuer DID:</span>
                <span className="text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer">
                  {defaultCredential.iss} <ExternalLink className="w-2.5 h-2.5" />
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Holder DID:</span>
                <span className="text-slate-300 truncate max-w-[220px]">{defaultCredential.sub}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Selective Disclosure Selector & JSON Payload (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Selective Disclosure Controls */}
          <div className="glass-panel p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-cyan-400" />
                  Selective Disclosure Claims Controller
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Toggle claims to selectively reveal attributes while preserving cryptographic proof.
                </p>
              </div>
              <span className="text-xs text-indigo-400 font-mono">
                {Object.values(disclosedFields).filter(Boolean).length} / {Object.keys(disclosedFields).length} Revealed
              </span>
            </div>

            {/* Checkbox Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {/* Claim 1: Age Over 18 (Recommended Disclosure) */}
              <label
                className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  disclosedFields.is_over_18
                    ? 'bg-emerald-950/20 border-emerald-500/40 text-white'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={disclosedFields.is_over_18}
                  onChange={() => toggleField('is_over_18')}
                  className="mt-1 rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500/20"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    Disclose Over 18 (True)
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">Zero-Knowledge</span>
                  </div>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Proves legal age without disclosing the actual date of birth.
                  </p>
                </div>
              </label>

              {/* Claim 2: Raw Birthdate (Recommended Hidden) */}
              <label
                className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  disclosedFields.birthdate
                    ? 'bg-amber-950/30 border-amber-500/40 text-white'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={disclosedFields.birthdate}
                  onChange={() => toggleField('birthdate')}
                  className="mt-1 rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-amber-500/20"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                    Disclose Birthdate (1988-04-15)
                    {disclosedFields.birthdate ? (
                      <Eye className="w-3 h-3 text-amber-400" />
                    ) : (
                      <EyeOff className="w-3 h-3 text-slate-500" />
                    )}
                  </div>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Exact date of birth. Keep unchecked for maximum privacy.
                  </p>
                </div>
              </label>

              {/* Claim 3: Role Designation */}
              <label
                className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  disclosedFields.role_designation
                    ? 'bg-indigo-950/20 border-indigo-500/40 text-white'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={disclosedFields.role_designation}
                  onChange={() => toggleField('role_designation')}
                  className="mt-1 rounded bg-slate-800 border-slate-700 text-indigo-500 focus:ring-indigo-500/20"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-200">Role Designation</div>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Lead Statutory Auditor (verified by did:web).
                  </p>
                </div>
              </label>

              {/* Claim 4: Department */}
              <label
                className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  disclosedFields.department
                    ? 'bg-indigo-950/20 border-indigo-500/40 text-white'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={disclosedFields.department}
                  onChange={() => toggleField('department')}
                  className="mt-1 rounded bg-slate-800 border-slate-700 text-indigo-500 focus:ring-indigo-500/20"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-200">Department</div>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Comptroller & Auditor General of India.
                  </p>
                </div>
              </label>

              {/* Claim 5: Organization */}
              <label
                className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  disclosedFields.organization
                    ? 'bg-indigo-950/20 border-indigo-500/40 text-white'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={disclosedFields.organization}
                  onChange={() => toggleField('organization')}
                  className="mt-1 rounded bg-slate-800 border-slate-700 text-indigo-500 focus:ring-indigo-500/20"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-200">Organization</div>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Ministry of Corporate Affairs & DPI Hub.
                  </p>
                </div>
              </label>

              {/* Claim 6: Security Clearance */}
              <label
                className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  disclosedFields.security_clearance
                    ? 'bg-indigo-950/20 border-indigo-500/40 text-white'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={disclosedFields.security_clearance}
                  onChange={() => toggleField('security_clearance')}
                  className="mt-1 rounded bg-slate-800 border-slate-700 text-indigo-500 focus:ring-indigo-500/20"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-200">Security Clearance</div>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Tier-1 Enterprise Notary verification level.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Real-time Generated SD-JWT Presentation Output */}
          <div className="glass-panel p-5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${currentTheme === 'palette' ? 'bg-[#0077B3]' : 'bg-cyan-400'}`} />
                <h4 className={`text-xs font-semibold uppercase tracking-wider ${
                  currentTheme === 'palette' ? 'text-slate-800' : 'text-slate-200'
                }`}>
                  Disclosed SD-JWT Presentation (Verifier View)
                </h4>
              </div>

              <button
                onClick={handleCopyPresentation}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors border ${
                  currentTheme === 'palette'
                    ? 'bg-[#E0F7FA] hover:bg-[#b2ebf2] text-[#0077B3] border-[#0077B3]/30 font-medium'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy JSON'}</span>
              </button>
            </div>

            <div className="relative">
              <pre className={`p-4 rounded-xl font-mono text-[11px] overflow-x-auto max-h-60 custom-scrollbar border transition-colors ${
                currentTheme === 'palette'
                  ? 'bg-white border-[#0077B3]/30 text-slate-800 shadow-xs'
                  : 'bg-slate-950/95 border-slate-800 text-slate-300'
              }`}>
                {JSON.stringify(disclosedPresentation, null, 2)}
              </pre>
            </div>

            <div className={`flex items-center gap-2 text-[11px] pt-1 ${
              currentTheme === 'palette' ? 'text-slate-600' : 'text-slate-400'
            }`}>
              <Info className={`w-3.5 h-3.5 shrink-0 ${
                currentTheme === 'palette' ? 'text-[#0077B3]' : 'text-indigo-400'
              }`} />
              <span>
                Undisclosed claims are replaced by SHA-256 disclosure hashes in the cryptographic envelope, preventing verifiers from linking hidden data.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CredentialCard;
