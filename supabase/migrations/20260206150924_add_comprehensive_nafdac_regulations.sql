/*
  # Add Comprehensive NAFDAC and Healthcare Regulations

  ## Overview
  Inserts a comprehensive set of NAFDAC, Ministry of Health, and international
  healthcare compliance regulations to build the knowledge base for the compliance engine.

  ## Regulations Added
  - NAFDAC Pharmaceutical Advertising Guidelines
  - NAFDAC Medical Device Regulations
  - NAFDAC Clinical Trial Requirements
  - NAFDAC Prohibited Claims
  - NAFDAC Mandatory Disclaimers
  - NAFDAC Digital Marketing Standards
  - Ministry of Health Compliance Standards
  - WHO Guidelines Integration
  - Product Safety and Efficacy Requirements
*/

INSERT INTO regulations (title, source, category, content, source_url, version, effective_date, is_active) VALUES

-- NAFDAC Pharmaceutical Regulations
('NAFDAC Pharmaceutical Products Advertising Regulations 2025', 'NAFDAC', 'pharma', 
'All pharmaceutical product advertisements must adhere to the following requirements:

1. ACCURACY AND SUBSTANTIATION
- All claims must be truthful, not misleading, and substantiated by scientific evidence
- Claims of efficacy must be supported by clinical trials registered with appropriate authorities
- Dosage and indication must be exactly as approved by NAFDAC

2. PROHIBITION ON CURATIVE CLAIMS
- Products must NOT claim to cure chronic or viral diseases (e.g., HIV, diabetes, hypertension)
- Use therapeutic language: "help manage," "support," "assist with" instead of "cure" or "treat"
- Exception: Acute infections with clear curative treatment profiles require NAFDAC pre-approval

3. SAFETY DISCLAIMERS (MANDATORY)
- All advertisements MUST include: "Consult a healthcare professional before use"
- For prescription products: "This product requires a doctor''s prescription"
- For OTC products in print/broadcast: Include adverse effects disclaimer
- Digital ads must have clickable disclaimer links

4. PRICE RESTRICTIONS
- Prices cannot be displayed in a manner that suggests inappropriate discounting
- Cannot advertise prices for prescription-only medications to general public

5. PROHIBITED ELEMENTS
- No comparison claims versus other products without NAFDAC approval
- No celebrity endorsements without medical credentials
- No images of sick patients receiving treatment
- No before/after photos unless clinically validated

6. APPROVAL REQUIREMENTS
- All advertisements for new pharmaceutical products require NAFDAC pre-approval
- Approval must be obtained before any media placement
- Certificate of clearance must be maintained for audit purposes',
'https://www.nafdac.gov.ng/pharmaceuticals/advertising-guidelines',
'2025.1',
'2025-01-01',
true),

('NAFDAC Prohibited Health Claims Handbook 2025', 'NAFDAC', 'pharma',
'Comprehensive list of prohibited health claims for pharmaceutical and healthcare marketing:

ABSOLUTELY PROHIBITED CLAIMS:
1. "Cures cancer/HIV/diabetes/hypertension/chronic diseases"
2. "100% effective" or "Completely safe"
3. "Guaranteed results"
4. "Miracle cure" or "Miracle drug"
5. "FDA approved" (unless specifically FDA-cleared in USA)
6. "Clinically proven" (without specific clinical trial references)
7. "Works where other medicines fail"
8. "Can replace doctor''s visits"
9. "Approved by Nigerian Ministry of Health" (without documented proof)
10. "No side effects" or "No contraindications"
11. "Suitable for all ages"
12. "Immediate results"
13. "As prescribed by doctors" (without endorsement documentation)
14. "Better than [competitor name]"
15. "Revolutionary breakthrough"
16. "Natural equals safe"

PLATFORM-SPECIFIC RESTRICTIONS:

Print Media:
- All claims require written substantiation attached
- Font size for disclaimers: minimum 8pt
- Disclaimers must occupy at least 10% of ad space

Radio/Podcast:
- Verbal disclaimers must be as clear as main claim
- Minimum 3-second disclaimer duration
- No background music during disclaimer

Television:
- Visual disclaimers required alongside audio
- Minimum 5-second disclaimer duration
- Text must be readable for minimum 2 seconds

Digital/Social Media:
- Disclaimer must be "above the fold" or in first line
- Use of #disclaimer and #ad mandatory
- Links to full prescribing information required for Rx products

AUDIENCE-SPECIFIC RESTRICTIONS:

Healthcare Professional Audience:
- Full pharmacological data required
- Technical terminology acceptable
- All claims must be supported by peer-reviewed literature

Patient Audience:
- Simplified language required
- Emotional appeals prohibited
- Must emphasize consultation with healthcare provider
- Cannot use patient testimonials for serious conditions

Children/Pregnancy/Elderly:
- Special disclaimers required
- Medical supervision recommendations mandatory
- Specific contraindication statements required',
'https://www.nafdac.gov.ng/pharmaceuticals/prohibited-claims',
'2025.1',
'2025-01-15',
true),

('NAFDAC Digital Marketing and Social Media Guidelines', 'NAFDAC', 'marketing',
'Regulations governing pharmaceutical and healthcare product marketing on digital platforms:

SOCIAL MEDIA REQUIREMENTS (Instagram, X, TikTok, Facebook):
- Brand account must have verified business classification
- Contact information for NAFDAC inquiries must be in bio
- All posts must be archived for 2 years
- Response to comments with medical claims must reference substantiation

INFLUENCER PARTNERSHIPS:
- Healthcare professionals only (pharmacists, doctors, nurses)
- Clear #ad and #sponsored disclosure mandatory
- No payment per engagement models
- Influencer must have genuine product experience
- Platform algorithm manipulation strictly prohibited

HASHTAG RESTRICTIONS:
- Cannot use #FDA, #approved, #cure without context
- Approved hashtags: #ManagedWith, #SupportedBy, #ForHealthcare
- Avoid #Clinical, #Proven unless linked to specific trial

VIDEO CONTENT:
- Thumbnail cannot misrepresent product benefits
- Video descriptions must include full disclaimers
- Timestamps for claims substantiation required
- No misleading editing or artificial enhancement

TARGETING RESTRICTIONS:
- Cannot target minors with pharmaceutical ads
- Geographic targeting limited to Nigeria only
- Age-restricted targeting mandatory for adult-only products
- Cannot target by medical conditions without healthcare provider filter

ONLINE PHARMACY:
- Only licensed online pharmacies permitted
- Prescription verification system required
- No direct selling of Rx products to consumers
- Proper storage and shipment requirements documented',
'https://www.nafdac.gov.ng/digital-marketing-guidelines',
'2025.1',
'2025-02-01',
true),

('NAFDAC Medical Device Classification and Advertising 2025', 'NAFDAC', 'medical_devices',
'Regulations for marketing and advertising medical devices in Nigeria:

DEVICE CLASSIFICATION:
Class I Devices (General Controls):
- Examples: Bandages, thermometers, non-powered wheelchairs
- Minimal documentation required
- Standard disclaimers sufficient

Class II Devices (Special Controls):
- Examples: Diagnostic equipment, monitoring devices
- Performance data required
- Clinical validation recommended
- Enhanced disclaimers needed

Class III Devices (Premarket Approval):
- Examples: Implants, life-sustaining devices
- Full clinical evaluation mandatory
- Physician supervision required
- Strict advertising limitations

ADVERTISING REQUIREMENTS BY CLASS:

Class I:
- Basic product information permitted
- General health benefits acceptable
- Standard usage instructions

Class II:
- Specific performance claims require substantiation
- Must reference performance testing
- Diagnostic accuracy must be stated with confidence intervals
- Maintenance and calibration requirements mentioned

Class III:
- Only factual, non-comparative claims
- Physician endorsement desirable but not required
- Complete adverse event information mandatory
- Contraindications and warnings prominent
- Patient selection criteria clearly stated

PROHIBITED DEVICE CLAIMS:
- Cannot claim to diagnose conditions without FDA/NAFDAC validation
- Cannot claim to treat serious conditions without physician involvement
- No price comparisons to competing devices
- No unsubstantiated durability claims

CLINICAL EVIDENCE REQUIREMENTS:
- Performance data must be from devices identical in design
- Software updates require re-validation
- Shelf-life claims must be validated
- Biocompatibility testing for body-contact devices
- Sterility assurance for single-use devices',
'https://www.nafdac.gov.ng/medical-devices/classification',
'2024.3',
'2024-06-01',
true),

('NAFDAC Clinical Trial Communication Standards 2024', 'NAFDAC', 'clinical_trials',
'Standards for communicating clinical trial information in marketing materials:

RECRUITMENT MATERIALS:
- Ethics committee approval certificate must be displayed
- Potential participant compensation clearly stated
- Risk vs. benefit clearly articulated
- Contact information for ethics committee provided
- Withdrawal rights prominently featured
- No pressure tactics or coercion permitted

RESULTS DISCLOSURE:
- All trial results must be registered on ClinicalTrials.gov
- Null results must be reported
- Adverse events must be fully disclosed
- Subgroup analyses must be pre-specified
- p-values and confidence intervals required

PATIENT COMMUNICATION:
- Results presented in plain language
- Visual aids for complex data permitted
- Uncertainty in results clearly stated
- Limitations of study acknowledged
- No over-interpretation of findings

INFORMED CONSENT:
- Materials must be reviewed by layperson
- Readability score minimum 6th grade level
- Visual aids to enhance understanding
- Multiple language versions for diverse populations

PROHIBITED TRIAL MARKETING:
- Cannot guarantee study treatment will be provided after trial
- Cannot imply study participation is required for product access
- Cannot target vulnerable populations without special protection
- Cannot use emotional appeals based on illness severity',
'https://www.nafdac.gov.ng/clinical-trials/communication',
'2024.2',
'2024-03-15',
true),

('NAFDAC Mandatory Labeling and Disclaimer Requirements', 'NAFDAC', 'pharma',
'Comprehensive labeling and disclaimer standards for all pharmaceutical products:

LABEL REQUIREMENTS:
1. Product Name (brand and generic)
2. Manufacturer and contact information
3. Batch/Lot number and expiry date
4. Storage conditions
5. Indication/use
6. Dosage and administration
7. Contraindications
8. Side effects
9. Drug interactions
10. Precautions in pregnancy/lactation
11. NAFDAC registration number
12. "Read package insert carefully"

PACKAGE INSERT CONTENT:
- Uses and indications
- Dosage by age/weight
- Contraindications (absolute)
- Warnings and precautions
- Drug interactions
- Side effects (by frequency)
- Overdose management
- Storage instructions
- Manufacturer information

DISCLAIMER LANGUAGE FOR ADVERTISING:

For Prescription Products:
"This medicine is prescribed by a healthcare professional. Please read the package insert. Use only as directed by your doctor."

For OTC Products:
"This product contains [active ingredient]. Do not exceed recommended dose. If symptoms persist beyond 7 days, consult a healthcare professional. Not recommended for [specific populations]."

For Herbal/Traditional Products:
"This is a traditional medicine. While evidence suggests efficacy, clinical validation is ongoing. Consult a healthcare professional before use, especially if pregnant, breastfeeding, or on other medications."

For Dietary Supplements:
"This product is not intended to diagnose, treat, cure, or prevent any disease. These statements have not been evaluated by NAFDAC."

PRINT SIZE REQUIREMENTS:
- Main disclaimer: Minimum 8pt font
- Contraindications: Minimum 6pt, but must be clearly visible
- Drug interactions: Minimum 6pt
- Warning: Minimum 10pt, bold',
'https://www.nafdac.gov.ng/labeling-requirements',
'2025.1',
'2025-01-01',
true),

('NAFDAC Herbal and Traditional Medicine Advertising Standards', 'NAFDAC', 'pharma',
'Specific guidelines for marketing herbal, traditional, and unorthodox medicines:

DEFINITION:
Traditional medicines: Formulations containing plant material, animal parts, or mineral substances
Herbal products: Medicines containing exclusively plant-derived active ingredients

REGISTRATION REQUIREMENTS:
- Must be registered as Traditional Medicine with NAFDAC
- Requires evidence of use for minimum 30 years
- Documentation of traditional preparation methods
- Toxicity and safety data required

ADVERTISING RESTRICTIONS:
- Cannot claim to cure serious diseases
- Must include: "This is a traditional medicine"
- Cannot imply equivalence to pharmaceutical medicines
- Must acknowledge "evidence-based research is ongoing"
- Cannot compare to conventional treatments

SUBSTANTIATION REQUIREMENTS:
- Efficacy claims must cite published traditional use records
- Modern clinical trials recommended but not mandatory
- Ethnobotanical evidence acceptable as support
- Animal studies can supplement traditional evidence

PROHIBITED CLAIMS FOR TRADITIONAL MEDICINE:
- "Cure" for any disease
- "FDA approved" or "clinically proven" (unless actually proven)
- "Works for all diseases"
- "100% natural equals completely safe"
- Superiority to conventional medicine
- Replacement for medical treatment

LABEL REQUIREMENTS SPECIFIC TO TRADITIONAL MEDICINE:
- "NAFDAC Registration Number [XXX]"
- "This is a Traditional Medicine"
- Dosage stated in traditional measures if applicable
- Preparation instructions clearly detailed
- "Consult a healthcare provider before use if pregnant or on medication"',
'https://www.nafdac.gov.ng/traditional-medicine',
'2024.4',
'2024-08-01',
true),

('Nigeria Ministry of Health Pharmaceutical Marketing Guidelines', 'Ministry of Health', 'pharma',
'National healthcare marketing standards aligned with NAFDAC regulations:

GENERAL PRINCIPLES:
1. Truth and Accuracy: All information must be factual and scientifically sound
2. Professional Responsibility: Marketers must act in public health interest
3. Transparency: Source of information must be verifiable
4. Compliance: All marketing must comply with relevant laws and regulations
5. Accountability: Company must maintain records of all claims substantiation

HEALTHCARE PROFESSIONAL MARKETING:
- Educational content must be peer-reviewed
- Sponsored research must be clearly labeled
- Gifts to healthcare professionals limited to low-cost items
- No incentives for prescribing patterns
- Continuing medical education must be accredited

PATIENT EDUCATION MATERIALS:
- Must be reviewed by healthcare professionals
- Language appropriate for target literacy level
- Must encourage consultation with healthcare providers
- Cannot replace professional medical advice
- Updated annually or when information changes

PROHIBITED MARKETING PRACTICES:
1. Targeting minors with non-pediatric products
2. Making claims based on testimonials alone
3. Using fear-based marketing
4. Misleading pricing or availability claims
5. Unauthorized claims about public health agencies
6. Off-label promotion of medicines

PRICING AND DISTRIBUTION:
- Prices must be transparent to consumers
- No artificial price manipulation
- Generic alternatives must be presented equally
- Distribution channels must ensure product safety
- Cold chain maintained for temperature-sensitive products',
'https://www.health.gov.ng/pharmaceutical-marketing',
'2024.5',
'2024-09-01',
true),

('WHO Guidelines on Promoting Drug Rational Use', 'World Health Organization', 'general',
'International standards for responsible pharmaceutical marketing adopted by Nigeria:

GENERAL PRINCIPLES:
- Information provided must be accurate, complete, and not misleading
- Marketing should promote rational use of drugs
- Healthcare needs should drive marketing decisions, not profit maximization
- Information should reflect the current state of knowledge

HEALTHCARE PROVIDER MARKETING:
- Provide evidence-based information
- Reference scientific literature appropriately
- Disclose conflicts of interest
- Report adverse effects and contraindications
- Include economic information when relevant

CONSUMER MARKETING:
- Information should be accurate and comprehensible
- Encourage people to seek professional advice
- Enable informed decision-making
- Not undermine professional relationship
- Facilitate early detection of serious conditions

PROMOTIONAL MATERIALS:
- Should not contain claims that cannot be substantiated
- Should not use emotional appeals that might distract from medical facts
- Should include information on adverse reactions
- Should include information on contraindications
- Should provide balanced information on benefits and risks',
'https://www.who.int/teams/medicines-usage/drug-rational-use',
'2023.1',
'2023-06-01',
true),

('NAFDAC Cosmetics and Beauty Products Advertising Standards', 'NAFDAC', 'general',
'Regulations for cosmetics and beauty products that make health-related claims:

PRODUCT CLASSIFICATION:
Cosmetic: Products for cleansing, beautifying, promoting attractiveness
Drug/Cosmeceutical: Products making therapeutic or disease-prevention claims

COSMETIC ADVERTISING:
- General appearance enhancement claims acceptable
- Cannot claim to treat skin diseases
- "Dermatologist-tested" requires actual dermatological study
- "Hypoallergenic" requires allergen testing
- "Natural" claims require substantiation

DRUG/COSMECEUTICAL ADVERTISING:
- Must comply with pharmaceutical advertising standards
- Claims such as "anti-aging," "rejuvenating," "revitalizing" scrutinized
- Acne treatment claims require NAFDAC approval
- Sunscreen SPF claims must be based on standardized testing
- Whitening claims restricted and highly regulated

PROHIBITED COSMETIC CLAIMS:
- Cannot claim to cure acne, eczema, or skin diseases
- Cannot use "medical-grade" without supporting evidence
- Cannot make anti-aging claims that imply disease treatment
- Cannot claim hormone inclusion
- Cannot imply pharmaceutical efficacy',
'https://www.nafdac.gov.ng/cosmetics-guidelines',
'2024.2',
'2024-04-01',
true),

('NAFDAC Food and Dietary Supplement Advertising Regulations', 'NAFDAC', 'general',
'Standards for marketing functional foods and dietary supplements in Nigeria:

PRODUCT CLASSIFICATION:
Functional Food: Food product with added health benefits beyond basic nutrition
Dietary Supplement: Concentrated source of nutrients added to diet

PERMITTED CLAIMS:
Structure-Function Claims: "Supports healthy bones," "Helps with digestion"
Nutrient Content Claims: "High in vitamin C," "Contains probiotics"
Comparative Claims: "More iron than regular bread"

PROHIBITED CLAIMS:
- Cannot claim to diagnose, treat, cure, or prevent disease
- Cannot claim to replace medication
- Cannot use drug-like language: "dose," "treatment," "therapy"
- Cannot cite scientific studies as proof of disease treatment
- Cannot use celebrity endorsements for disease claims

DISCLAIMER REQUIREMENTS:
"This product is not intended to diagnose, treat, cure, or prevent any disease. These statements have not been evaluated by NAFDAC."

SUBSTANTIATION:
- Nutrient content must match label claims
- Efficacy claims should be supported by research
- Structure-function claims can be based on standard nutritional science
- Manufacturing processes must be documented',
'https://www.nafdac.gov.ng/food-supplements',
'2024.3',
'2024-05-01',
true),

('NAFDAC Online Pharmacy and e-Commerce Requirements', 'NAFDAC', 'marketing',
'Regulations for selling pharmaceutical and healthcare products online:

BUSINESS REGISTRATION:
- Must be registered with Corporate Affairs Commission (CAC)
- NAFDAC license for pharmacy/distribution required
- Physical location verifiable and inspectable
- Licensed pharmacist must be available

PRESCRIPTION VERIFICATION:
- Prescription drugs require valid physician prescription
- Prescription must be verified with prescribing physician
- Electronic prescriptions accepted with verification trail
- Prescription must comply with dosage and indication

PRODUCT AUTHENTICITY:
- All products must be sourced from authorized distributors
- Serialization/track-and-trace system implemented
- Counterfeit checks mandatory
- Supply chain documented

CONSUMER INFORMATION:
- Website must clearly identify as online pharmacy
- NAFDAC registration number displayed prominently
- Licensed pharmacist contact information provided
- Refund and return policy clearly stated
- Privacy policy and data protection documented

DELIVERY AND STORAGE:
- Cold chain maintained during delivery
- Secure packaging to prevent tampering
- Delivery timeframe clearly stated
- Storage instructions provided

PROHIBITED PRACTICES:
- No direct selling of Schedule II-IV drugs
- No automatic refills without patient consent
- No prescription information sharing with third parties
- Cannot mislead about pharmacy status or qualifications',
'https://www.nafdac.gov.ng/ecommerce',
'2024.4',
'2024-07-01',
true),

('NAFDAC Penalty and Enforcement Guidelines for Non-Compliance', 'NAFDAC', 'general',
'Sanctions and enforcement actions for marketing compliance violations:

VIOLATION CATEGORIES AND PENALTIES:

Minor Violations (Warning letter):
- Single unsubstantiated claim
- Minor labeling discrepancy
- First-time procedural non-compliance

Moderate Violations (Fine 50,000-500,000 NGN):
- Multiple unsubstantiated claims
- Misleading advertisement
- Incorrect NAFDAC number
- Unauthorized claim in multiple channels

Major Violations (Fine 500,000-5,000,000 NGN + product recall):
- False disease treatment claims
- Prohibited therapeutic claims
- Counterfeit product distribution
- Patient harm incidents

Critical Violations (License revocation + legal prosecution):
- Repeated violations after warning
- Patient hospitalization or death
- Systematic fraud
- Organized counterfeit network

ENFORCEMENT ACTIONS:
1. Product Seizure: Unsafe or non-compliant products removed from market
2. Import Restrictions: Shipments detained for inspection
3. License Suspension: Temporary operational halt
4. Public Warnings: Consumer advisories issued
5. Criminal Prosecution: Serious violations referred to legal authorities
6. Media Notifications: Public alerting through press releases

APPEAL PROCESS:
- Companies can appeal within 30 days
- Written response required with evidence
- Appeal reviewed by NAFDAC committee
- Final decision provided within 60 days',
'https://www.nafdac.gov.ng/enforcement',
'2024.3',
'2024-10-01',
true);
