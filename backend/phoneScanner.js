
const { parsePhoneNumberFromString } = require('libphonenumber-js/max');

const LEAKCHECK_URL = 'https://leakcheck.io/api/public';

const FIELD_LABELS = {
    id: 'IDs',
    first_name: 'Names',
    last_name: 'Names',
    full_name: 'Names',
    phone: 'Phone numbers',
    email: 'Email addresses',
    password: 'Passwords',
    address: 'Physical addresses',
    username: 'Usernames'
};

async function checkLeakCheck(phone) {
    const params = new URLSearchParams({
        check: phone,
        type: 'phone'
    });

    const response = await fetch(`${LEAKCHECK_URL}?${params}`, {
        signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
        throw new Error(`LeakCheck HTTP error: ${response.status}`);
    }

    const data = await response.json();

    // LeakCheck uses "Not found" when there are no matching records.
    if (
        data.success === false &&
        String(data.error).toLowerCase() === 'not found'
    ) {
        return {
            success: true,
            found: 0,
            fields: [],
            sources: []
        };
    }

    if (data.success !== true) {
        throw new Error(data.error || 'LeakCheck lookup failed');
    }

    return data;
}

async function phoneScanner(phone) {
    const parsed = parsePhoneNumberFromString(
        phone,
        process.env.DEFAULT_PHONE_REGION || 'IN'
    );

    if (!parsed || !parsed.isValid()) {
        return {
            valid: false,
            message: 'Please enter a valid phone number.'
        };
    }

    const numberType = parsed.getType() || 'UNKNOWN';

    const typeLabels = {
        MOBILE: 'Mobile',
        FIXED_LINE: 'Landline',
        FIXED_LINE_OR_MOBILE: 'Landline or Mobile',
        TOLL_FREE: 'Toll Free',
        PREMIUM_RATE: 'Premium Rate',
        SHARED_COST: 'Shared Cost',
        VOIP: 'VoIP',
        PERSONAL_NUMBER: 'Personal Number',
        PAGER: 'Pager',
        UAN: 'Universal Access Number',
        VOICEMAIL: 'Voicemail',
        UNKNOWN: 'Unknown'
    };

    const metadata = {
        country: parsed.country || 'Unknown',
        countryCallingCode: parsed.countryCallingCode,
        internationalNumber: parsed.formatInternational(),
        nationalNumber: parsed.formatNational(),
        numberType: typeLabels[numberType] || numberType,
        isPossible: parsed.isPossible(),
        isValid: parsed.isValid()
    };

    const findings = [
        {
            source: 'Phone Intelligence',
            title: 'Phone Number Analysis',
            description:
                'Numbering-plan validation and metadata analysis completed.',
            risk: 'low',
            status: 'info',
            evidence: {
                country: metadata.country,
                countryCallingCode: metadata.countryCallingCode,
                internationalNumber: metadata.internationalNumber,
                nationalNumber: metadata.nationalNumber,
                numberType: metadata.numberType,
                isPossible: metadata.isPossible,
                isValid: metadata.isValid
            }
        }
    ];

    let publicFootprint = 'unavailable';

    try {
        // LeakCheck expects the international number without the + sign.
        const normalizedPhone = parsed.number.replace(/\D/g, '');

        const data = await checkLeakCheck(normalizedPhone);

        const matchedFields = Array.isArray(data.fields)
            ? data.fields
            : [];

        const exposedData = [
            ...new Set(
                matchedFields
                    .map(field => FIELD_LABELS[field.toLowerCase()])
                    .filter(Boolean)
            )
        ];

        const sources = Array.isArray(data.sources)
            ? data.sources
            : [];

        if (Number(data.found) > 0) {
            publicFootprint = 'found';

            // Create one finding for each breach source.
            for (const source of sources) {
                findings.push({
                    source: 'LeakCheck',
                    title: source.name || 'Unknown breach source',
                    description:
                        `This phone number was matched in a LeakCheck dataset. ` +
                        `Reported date: ${source.date || 'Unknown'}.`,
                    risk: 'medium',
                    status: 'found',
                    evidence: {
                        breachDate: source.date || 'Unknown',
                        exposedData,
                        matchedFields
                    }
                });
            }

            // Fallback in case the API reports matches without source details.
            if (sources.length === 0) {
                findings.push({
                    source: 'LeakCheck',
                    title: 'Phone Number Exposure',
                    description:
                        'LeakCheck reported matching records for this phone number.',
                    risk: 'medium',
                    status: 'found',
                    evidence: {
                        exposedData,
                        matchedFields
                    }
                });
            }
        } else {
            publicFootprint = 'not_found';

            findings.push({
                source: 'LeakCheck',
                title: 'No Matching Breach Records',
                description:
                    'LeakCheck did not return any matching records for this phone number. This does not guarantee that the number has never been exposed.',
                risk: 'low',
                status: 'info',
                evidence: {
                    matchedFields: [],
                    exposedData: []
                }
            });
        }
    } catch (error) {
        console.error('LeakCheck error:', error.message);

        publicFootprint = 'unavailable';

        findings.push({
            source: 'LeakCheck',
            title: 'Breach Lookup Unavailable',
            description:
                'Phone metadata was retrieved, but LeakCheck could not complete the breach lookup. Please try again later.',
            risk: 'low',
            status: 'info',
            evidence: {
                reason: 'External provider unavailable'
            }
        });
    }

    return {
        valid: true,
        metadata,
        providers: {
            phoneValidation: 'completed',
            numberType: 'completed',
            publicFootprint
        },
        findings
    };
}

module.exports = phoneScanner;
