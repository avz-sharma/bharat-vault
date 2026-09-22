/**
 * Types representing SD-JWT Verifiable Credential schema adhering to India DPDP Act 2023
 */

export interface CredentialSubject {
  role_designation: string;
  aadhaar_reference: '[Aadhaar Redacted]';
  department: string;
  is_over_18?: boolean;
  birthdate?: string;
  organization?: string;
  security_clearance?: string;
}

export interface SDJWTCredential {
  iss: string; // Issuer DID (e.g. did:web:gov.in:identity_dept)
  sub: string; // Holder DID (e.g. did:ethr:amoy:0x...)
  vct: string; // Verifiable Credential Type (e.g. InstitutionalIdCredential)
  iat: number; // Issued at (epoch)
  exp: number; // Expiration (epoch)
  credentialSubject: CredentialSubject;
  _sd: string[]; // Selectively disclosable claim hashes
  _sd_alg: 'sha-256';
}

export interface RoleOption {
  id: number;
  name: string;
  description: string;
  color: string;
  badge: string;
}

export const PRESET_ROLES: RoleOption[] = [
  {
    id: 1,
    name: 'Auditor',
    description: 'Statutory compliance & audit access for DPDP Act 2023 oversight',
    color: 'emerald',
    badge: 'Auditor Role #1',
  },
  {
    id: 2,
    name: 'Institutional Officer',
    description: 'Authorized department custodian for asset registration and notarization',
    color: 'indigo',
    badge: 'Officer Role #2',
  },
  {
    id: 3,
    name: 'Citizen Beneficiary',
    description: 'Public identity holder for selectively disclosable digital credentials',
    color: 'sky',
    badge: 'Citizen Role #3',
  },
];
