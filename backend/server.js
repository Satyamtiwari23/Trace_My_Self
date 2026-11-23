
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const cookieParser = require('cookie-parser');

const {
    router: authRouter,
    connectDB,
    requireAuth
} = require('./auth');

const emailScanner = require('./emailScanner');
const phoneScanner = require('./phoneScanner');
const calculateRisk = require('./riskEngine');

const {
    startTelegramBot,
    startEmailVerification,
    startPhoneVerification,
    verifyEmailOtp,
    getVerificationStatus,
    authorizeScan
} = require('./verification');

const app = express();

app.use(helmet());

app.use(cors({
    origin: [
        'http://127.0.0.1:5501',
        'http://localhost:5501'
    ],
    credentials: true
}));

app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

const scanLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10
});

const verificationStartLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: {
        success: false,
        message: 'Too many verification requests. Try again later.'
    }
});

const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    message: {
        success: false,
        message: 'Too many authentication requests. Try again later.'
    }
});

app.use('/api/auth', authLimiter, authRouter);


// HEALTH CHECK
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Trace_My_Self backend is running'
    });
});

// START EMAIL VERIFICATION
app.post(
    '/api/verification/email/start',
    verificationStartLimiter,
    async (req, res) => {
        try {
            const { email } = req.body;

            if (
                typeof email !== 'string' ||
                !validator.isEmail(email.trim())
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Enter a valid email address.'
                });
            }

            const result = await startEmailVerification(email);

            res.json({
                success: true,
                message: 'Email OTP sent successfully.',
                ...result
            });

        } catch (error) {
            console.error('Email verification error:', error.message);

            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);

// VERIFY EMAIL OTP
app.post(
    '/api/verification/email/verify',
    otpLimiter,
    (req, res) => {
        try {
            const { sessionId, otp } = req.body;

            if (
                typeof sessionId !== 'string' ||
                typeof otp !== 'string' ||
                !/^\d{6}$/.test(otp)
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Enter the six-digit OTP.'
                });
            }

            const result = verifyEmailOtp(sessionId, otp);

            res.json({
                success: true,
                message: 'Email verified successfully.',
                ...result
            });

        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);

// START PHONE VERIFICATION THROUGH TELEGRAM
app.post(
    '/api/verification/phone/start',
    verificationStartLimiter,
    async (req, res) => {
        try {
            const { phone } = req.body;

            if (typeof phone !== 'string' || !phone.trim()) {
                return res.status(400).json({
                    success: false,
                    message: 'Enter a phone number.'
                });
            }

            const result = await startPhoneVerification(phone);

            res.json({
                success: true,
                message: 'Open Telegram to verify your phone number.',
                ...result
            });

        } catch (error) {
            console.error('Phone verification error:', error.message);

            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);

// CHECK VERIFICATION STATUS
app.get('/api/verification/status', (req, res) => {
    const sessionId = req.query.sessionId;

    if (typeof sessionId !== 'string') {
        return res.status(400).json({
            success: false,
            message: 'Verification session is required.'
        });
    }

    res.json(getVerificationStatus(sessionId));
});

// PROTECTED SCAN API
app.post('/api/scan', scanLimiter, requireAuth, async (req, res) => {
    try {
        const { value, mode } = req.body;

        if (
            typeof value !== 'string' ||
            !value.trim() ||
            !['email', 'phone'].includes(mode)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Invalid input.'
            });
        }

        const sessionId = req.get('x-verification-session');

        const authorization = authorizeScan(
            sessionId,
            value,
            mode
        );

        if (!authorization.allowed) {
            return res.status(403).json({
                success: false,
                message: authorization.message
            });
        }

        let result;

        if (mode === 'email') {
            result = await emailScanner(value.trim());
        } else {
            result = await phoneScanner(value.trim());
        }

        if (!result.valid) {
            return res.status(400).json({
                success: false,
                message: result.message
            });
        }

        const risk = calculateRisk(result.findings || []);
        const findings = risk.findings;

        res.json({
            success: true,
            mode,
            totalExposures: findings.filter(
                item => item.status === 'found'
            ).length,
            risk,
            metadata: result.metadata || {},
            providers: result.providers || {},
            findings
        });

    } catch (error) {
        console.error('Scan error:', error.message);

        res.status(500).json({
            success: false,
            message: 'Unable to complete scan.'
        });
    }
});

// START SERVER AFTER DATABASE CONNECTION

const PORT = process.env.PORT || 5050;

async function startServer() {
    try {
        await connectDB();

        app.listen(PORT, () => {
            console.log(`Trace_My_Self backend running on port ${PORT}`);

            startTelegramBot().catch(error => {
                console.error(
                    'Telegram bot startup error:',
                    error.message
                );
            });
        });

    } catch (error) {
        console.error('Server startup failed:', error.message);
        process.exit(1);
    }
}

startServer();
