
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { parsePhoneNumberFromString } = require('libphonenumber-js/max');

const sessions = new Map();
const linkTokens = new Map();
const telegramChats = new Map();

const SESSION_DURATION = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_USER,
        pass: (process.env.SMTP_APP_PASSWORD || '').replace(/\s/g, '')
    }
});

function makeOtpHash(sessionId, otp) {
    return crypto
        .createHmac('sha256', process.env.OTP_SECRET)
        .update(`${sessionId}:${otp}`)
        .digest('hex');
}

function isSessionActive(session) {
    return Boolean(session && Date.now() < session.expiresAt);
}

function parsePhone(value) {
    const parsed = parsePhoneNumberFromString(
        value,
        process.env.DEFAULT_PHONE_REGION || 'IN'
    );

    return parsed && parsed.isValid() ? parsed.number : null;
}

async function sendTelegramMessage(chatId, text, replyMarkup) {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                ...(replyMarkup ? { reply_markup: replyMarkup } : {})
            })
        }
    );

    const data = await response.json();

    if (!data.ok) {
        throw new Error(data.description || 'Telegram message failed');
    }

    return data;
}

// EMAIL VERIFICATION
async function startEmailVerification(email) {
    if (
        !process.env.SMTP_USER ||
        !process.env.SMTP_APP_PASSWORD ||
        !process.env.OTP_SECRET
    ) {
        throw new Error('Email verification is not configured on the server.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const sessionId = crypto.randomBytes(32).toString('hex');
    const otp = crypto.randomInt(100000, 1000000).toString();

    const session = {
        mode: 'email',
        email: normalizedEmail,
        otpHash: makeOtpHash(sessionId, otp),
        otpAttempts: 0,
        verified: false,
        expiresAt: Date.now() + SESSION_DURATION,
        scansUsed: false
    };

    sessions.set(sessionId, session);

    try {
        await transporter.sendMail({
            from: `"Trace_My_Self" <${process.env.SMTP_USER}>`,
            to: normalizedEmail,
            subject: 'Your Trace_My_Self verification code',
            text:
                `Your verification code is ${otp}.\n\n` +
                'This code expires in 10 minutes. Do not share it with anyone.'
        });
    } catch (error) {
        sessions.delete(sessionId);
        console.error('Email OTP error:', error.message);
        throw new Error('Could not send the email OTP. Check the Gmail configuration.');
    }

    return {
        sessionId,
        mode: 'email',
        expiresInSeconds: SESSION_DURATION / 1000
    };
}

function verifyEmailOtp(sessionId, otp) {
    const session = sessions.get(sessionId);

    if (!isSessionActive(session) || session.mode !== 'email') {
        throw new Error('Verification expired. Please request a new OTP.');
    }

    if (session.verified) {
        return { verified: true, mode: 'email' };
    }

    if (session.otpAttempts >= MAX_OTP_ATTEMPTS) {
        throw new Error('Too many incorrect OTP attempts. Please request a new OTP.');
    }

    session.otpAttempts++;

    const suppliedHash = Buffer.from(makeOtpHash(sessionId, String(otp)));
    const storedHash = Buffer.from(session.otpHash);

    if (
        suppliedHash.length !== storedHash.length ||
        !crypto.timingSafeEqual(suppliedHash, storedHash)
    ) {
        throw new Error('Incorrect OTP. Please try again.');
    }

    session.verified = true;
    session.otpHash = null;

    return { verified: true, mode: 'email' };
}

// PHONE VERIFICATION THROUGH TELEGRAM
async function startPhoneVerification(phone) {
    if (
        !process.env.TELEGRAM_BOT_TOKEN ||
        !process.env.TELEGRAM_BOT_USERNAME
    ) {
        throw new Error('Telegram verification is not configured on the server.');
    }

    const normalizedPhone = parsePhone(phone);

    if (!normalizedPhone) {
        throw new Error('Please enter a valid phone number.');
    }

    const sessionId = crypto.randomBytes(32).toString('hex');
    const linkToken = crypto.randomBytes(24).toString('hex');

    const session = {
        mode: 'phone',
        phone: normalizedPhone,
        verified: false,
        expiresAt: Date.now() + SESSION_DURATION,
        scansUsed: false,
        telegramChatId: null,
        telegramUserId: null
    };

    sessions.set(sessionId, session);
    linkTokens.set(linkToken, sessionId);

    const telegramUrl =
        `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}` +
        `?start=${linkToken}`;

    return {
        sessionId,
        mode: 'phone',
        telegramUrl,
        expiresInSeconds: SESSION_DURATION / 1000
    };
}

// TELEGRAM BOT UPDATE HANDLER
async function handleTelegramUpdate(update) {
    const message = update.message;

    if (!message || !message.chat || !message.from) return;

    const chatId = message.chat.id;
    const fromId = message.from.id;
    const text = message.text || '';

    // User opens their unique verification link.
    const startMatch = text.match(
        /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]+)$/
    );

    if (startMatch) {
        const linkToken = startMatch[1];
        const sessionId = linkTokens.get(linkToken);
        const session = sessions.get(sessionId);

        if (
            !sessionId ||
            !isSessionActive(session) ||
            session.mode !== 'phone'
        ) {
            await sendTelegramMessage(
                chatId,
                'This verification link has expired. Please start again from the Trace_My_Self website.'
            );
            return;
        }

        session.telegramChatId = chatId;
        session.telegramUserId = fromId;

        telegramChats.set(String(chatId), sessionId);
        linkTokens.delete(linkToken);

        await sendTelegramMessage(
            chatId,
            'Trace_My_Self phone verification\n\n' +
            'Tap the button below to share your own Telegram phone contact. ' +
            'It must match the number entered on the website.',
            {
                keyboard: [[
                    {
                        text: 'Share my phone number',
                        request_contact: true
                    }
                ]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        );

        return;
    }

    // Verify that the contact belongs to the Telegram user.
    if (message.contact) {
        const sessionId = telegramChats.get(String(chatId));
        const session = sessions.get(sessionId);

        if (
            !isSessionActive(session) ||
            session.mode !== 'phone'
        ) {
            await sendTelegramMessage(
                chatId,
                'Your verification session has expired. Please start again from the website.'
            );
            telegramChats.delete(String(chatId));
            return;
        }

        if (
            !message.contact.user_id ||
            message.contact.user_id !== fromId
        ) {
            await sendTelegramMessage(
                chatId,
                'Please use the Share my phone number button to share your own contact.'
            );
            return;
        }

        const sharedPhone = parsePhone(message.contact.phone_number);

        if (!sharedPhone || sharedPhone !== session.phone) {
            await sendTelegramMessage(
                chatId,
                'The shared phone number does not match the number entered on the website. Please try again.'
            );
            return;
        }

        session.verified = true;

        await sendTelegramMessage(
            chatId,
            'Phone verification successful. Return to the Trace_My_Self website.',
            { remove_keyboard: true }
        );
    }
}

// TELEGRAM LONG POLLING
let telegramPollingStarted = false;
let telegramOffset = 0;

async function startTelegramBot() {
    if (telegramPollingStarted) return;

    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
        console.warn('Telegram bot not configured.');
        return;
    }

    telegramPollingStarted = true;
    console.log('Telegram verification bot started.');

    while (true) {
        try {
            const response = await fetch(
                `https://api.telegram.org/bot${token}/getUpdates`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        offset: telegramOffset,
                        timeout: 25,
                        allowed_updates: ['message']
                    }),
                    signal: AbortSignal.timeout(35000)
                }
            );

            const data = await response.json();

            if (!data.ok) {
                throw new Error(data.description || 'Telegram polling failed');
            }

            for (const update of data.result || []) {
                telegramOffset = update.update_id + 1;

                try {
                    await handleTelegramUpdate(update);
                } catch (error) {
                    console.error('Telegram update error:', error.message);
                }
            }
        } catch (error) {
            console.error('Telegram polling error:', error.message);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
}

// CHECK VERIFICATION STATUS
function getVerificationStatus(sessionId) {
    const session = sessions.get(sessionId);

    if (!isSessionActive(session)) {
        return {
            success: false,
            expired: true,
            verified: false,
            ready: false
        };
    }

    return {
        success: true,
        expired: false,
        mode: session.mode,
        verified: session.verified,
        ready: session.verified
    };
}

// AUTHORIZE ONLY THE VERIFIED IDENTIFIER
function authorizeScan(sessionId, value, mode) {
    const session = sessions.get(sessionId);

    if (!isSessionActive(session)) {
        return {
            allowed: false,
            message: 'Verification expired. Please verify again.'
        };
    }

    if (session.mode !== mode) {
        return {
            allowed: false,
            message: 'This verification session is for a different scan type.'
        };
    }

    if (!session.verified) {
        return {
            allowed: false,
            message: 'Please complete verification before scanning.'
        };
    }

    const normalizedValue = mode === 'email'
        ? value.trim().toLowerCase()
        : parsePhone(value);

    const expectedValue = mode === 'email'
        ? session.email
        : session.phone;

    if (!normalizedValue || normalizedValue !== expectedValue) {
        return {
            allowed: false,
            message: `You can only scan the ${mode} address or number you verified.`
        };
    }

    if (session.scansUsed) {
        return {
            allowed: false,
            message: 'This verification session has already been used for a scan. Please verify again.'
        };
    }

    session.scansUsed = true;

    return { allowed: true };
}

// CLEAN UP EXPIRED SESSIONS
setInterval(() => {
    for (const [sessionId, session] of sessions.entries()) {
        if (Date.now() >= session.expiresAt) {
            sessions.delete(sessionId);

            for (const [token, linkedSession] of linkTokens.entries()) {
                if (linkedSession === sessionId) {
                    linkTokens.delete(token);
                }
            }

            if (session.telegramChatId) {
                telegramChats.delete(String(session.telegramChatId));
            }
        }
    }
}, 60 * 1000).unref();

module.exports = {
    startTelegramBot,
    startEmailVerification,
    startPhoneVerification,
    verifyEmailOtp,
    getVerificationStatus,
    authorizeScan
};
