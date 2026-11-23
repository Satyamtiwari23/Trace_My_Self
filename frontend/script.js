
(() => {
    'use strict';

    /* ============================================================
       CURSOR ENGINE
    ============================================================ */
    const dot = document.getElementById('dot');
    const ring = document.getElementById('ring');
    const root = document.documentElement;

    let mx = innerWidth / 2, my = innerHeight / 2;   // raw pointer
    let dx = mx, dy = my;                            // dot (snappy)
    let rx = mx, ry = my;                            // ring (lagging)
    let px = 0, py = 0;                             // parallax lerp

    window.addEventListener('mousemove', e => {
        mx = e.clientX; my = e.clientY;
        root.style.setProperty('--mx', mx + 'px');
        root.style.setProperty('--my', my + 'px');
    }, { passive: true });

    window.addEventListener('mousedown', () => ring.classList.add('is-down'));
    window.addEventListener('mouseup', () => ring.classList.remove('is-down'));
    window.addEventListener('mouseleave', () => { dot.style.opacity = 0; ring.style.opacity = 0; });
    window.addEventListener('mouseenter', () => { dot.style.opacity = 1; ring.style.opacity = 1; });

    // hover-state detection (works for dynamically added nodes too)
    document.addEventListener('mouseover', e => {
        const hit = e.target.closest('a, button, input, .tilt, .rcard, .fcard, .seg-btn');
        ring.classList.toggle('is-hover', !!hit);
    });

    const parallaxEls = [...document.querySelectorAll('[data-parallax]')];

    function raf() {
        // spring-ish lerps
        dx += (mx - dx) * 0.92;
        dy += (my - dy) * 0.92;
        rx += (mx - rx) * 0.15;
        ry += (my - ry) * 0.15;

        dot.style.transform = `translate(${dx}px,${dy}px) translate(-50%,-50%)`;
        ring.style.transform = `translate(${rx}px,${ry}px) translate(-50%,-50%)`;

        // global parallax
        const nx = (mx / innerWidth - 0.5);
        const ny = (my / innerHeight - 0.5);
        px += (nx - px) * 0.06;
        py += (ny - py) * 0.06;
        for (const el of parallaxEls) {
            const s = parseFloat(el.dataset.parallax) || 10;
            el.style.transform = `translate3d(${px * s}px, ${py * s}px, 0)`;
        }
        requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    /* ============================================================
       MAGNETIC BUTTONS
    ============================================================ */
    document.querySelectorAll('[data-magnetic]').forEach(el => {
        el.addEventListener('mousemove', e => {
            const r = el.getBoundingClientRect();
            const x = e.clientX - r.left - r.width / 2;
            const y = e.clientY - r.top - r.height / 2;
            el.style.transform = `translate(${x * 0.22}px, ${y * 0.34}px)`;
        });
        el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });

    /* ============================================================
       3D TILT + CURSOR GLOW
    ============================================================ */
    function bindTilt(el) {
        if (el.dataset.tiltBound) return;
        el.dataset.tiltBound = '1';

        el.addEventListener('mousemove', e => {
            const r = el.getBoundingClientRect();
            const px2 = (e.clientX - r.left) / r.width - 0.5;
            const py2 = (e.clientY - r.top) / r.height - 0.5;
            el.style.transform =
                `perspective(850px) rotateY(${px2 * 9}deg) rotateX(${-py2 * 9}deg) translateY(-4px)`;
            el.style.setProperty('--gx', ((e.clientX - r.left) / r.width * 100) + '%');
            el.style.setProperty('--gy', ((e.clientY - r.top) / r.height * 100) + '%');
        });

        el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    }
    document.querySelectorAll('.tilt').forEach(bindTilt);

    /* ============================================================
       SCROLL REVEAL
    ============================================================ */
    const io = new IntersectionObserver(entries => {
        entries.forEach(en => {
            if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
        });
    }, { threshold: 0.14 });

    document.querySelectorAll('.reveal').forEach((el, i) => {
        if (el.closest('.hero')) {
            setTimeout(() => el.classList.add('in'), 120 + i * 110);
        } else {
            io.observe(el);
        }
    });


    /* ============================================================
       REAL SCAN ENGINE
    ============================================================ */

    const form = document.getElementById('scanForm');
    const input = document.getElementById('query');
    const terminal = document.getElementById('terminal');
    const summary = document.getElementById('summary');
    const results = document.getElementById('results');
    const scanBtn = form.querySelector('.scan-btn');


    const API_BASE = 'https://trace-my-self.vercel.app/api';
    const API_URL = `${API_BASE}/scan`;

    const state = {
        mode: 'email',
        busy: false,
        sessionId: null,
        verified: false,
        verifiedValue: '',
        polling: false
    };

    const verificationPanel = document.getElementById('verificationPanel');

    const emailVerification = document.getElementById('emailVerification');
    const phoneVerification = document.getElementById('phoneVerification');

    const sendOtpBtn = document.getElementById('sendOtpBtn');
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    const telegramBtn = document.getElementById('telegramBtn');

    const otpInput = document.getElementById('otpInput');
    const otpRow = document.getElementById('otpRow');

    const emailMessage = document.getElementById('emailMessage');
    const phoneMessage = document.getElementById('phoneMessage');

    const telegramLink = document.getElementById('telegramLink');
    const verificationStatus = document.getElementById('verificationStatus');

    function setVerificationMessage(message, type = '') {
        verificationStatus.textContent = message;
        verificationStatus.className = 'verification-status ' + type;
    }

    function resetVerification() {
        state.sessionId = null;
        state.verified = false;
        state.verifiedValue = '';
        state.polling = false;

        otpInput.value = '';
        otpRow.hidden = true;
        telegramLink.hidden = true;

        sendOtpBtn.disabled = false;
        verifyOtpBtn.disabled = false;
        telegramBtn.disabled = false;

        setVerificationMessage('');
    }

    async function apiRequest(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });

        const data = await response.json();

        if (!response.ok || data.success === false) {
            throw new Error(data.message || 'Request failed.');
        }

        return data;
    }




    /* ============================================================
       AUTHENTICATION — FRONTEND
    ============================================================ */

    const authOverlay = document.getElementById('authOverlay');

    const loginOpenBtn = document.getElementById('loginOpenBtn');
    const signupOpenBtn = document.getElementById('signupOpenBtn');
    const authCloseBtn = document.getElementById('authCloseBtn');

    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const forgotForm = document.getElementById('forgotForm');
    const resetForm = document.getElementById('resetForm');

    const showSignupBtn = document.getElementById('showSignupBtn');
    const showLoginBtn = document.getElementById('showLoginBtn');
    const forgotOpenBtn = document.getElementById('forgotOpenBtn');
    const forgotBackBtn = document.getElementById('forgotBackBtn');
    const resetBackBtn = document.getElementById('resetBackBtn');

    const authStatus = document.getElementById('authStatus');

    const accountMenu = document.getElementById('accountMenu');
    const accountName = document.getElementById('accountName');
    const logoutBtn = document.getElementById('logoutBtn');

    let currentUser = null;

    function showAuthMessage(message, type = '') {
        authStatus.textContent = message;
        authStatus.style.color = type === 'error'
            ? '#ff6262'
            : '#00ffa6';
    }

    function showAuthForm(selectedForm) {
        [loginForm, signupForm, forgotForm, resetForm]
            .forEach(authForm => {
                authForm.hidden = authForm !== selectedForm;
            });

        showAuthMessage('');
    }

    function openAuthModal(formType = 'login') {
        authOverlay.hidden = false;
        document.body.style.overflow = 'hidden';

        const forms = {
            login: loginForm,
            signup: signupForm,
            forgot: forgotForm,
            reset: resetForm
        };

        showAuthForm(forms[formType] || loginForm);
    }

    function closeAuthModal() {
        authOverlay.hidden = true;
        document.body.style.overflow = '';
        showAuthMessage('');
    }

    function updateAccountUI(user) {
        currentUser = user;

        if (user) {
            loginOpenBtn.hidden = true;
            signupOpenBtn.hidden = true;

            accountMenu.hidden = false;
            accountName.textContent = user.name;
        } else {
            loginOpenBtn.hidden = false;
            signupOpenBtn.hidden = false;

            accountMenu.hidden = true;
            accountName.textContent = 'Account';
        }
    }

    /* CHECK CURRENT LOGIN SESSION */

    async function loadCurrentUser() {
        try {
            const data = await apiRequest(`${API_BASE}/auth/me`);

            updateAccountUI(data.user);

        } catch (error) {
            updateAccountUI(null);
        }
    }

    const authCheckPromise = loadCurrentUser();

    /* OPEN AND CLOSE MODAL */

    loginOpenBtn.addEventListener('click', () => {
        openAuthModal('login');
    });

    signupOpenBtn.addEventListener('click', () => {
        openAuthModal('signup');
    });

    authCloseBtn.addEventListener('click', closeAuthModal);

    authOverlay.addEventListener('click', event => {
        if (event.target === authOverlay) {
            closeAuthModal();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !authOverlay.hidden) {
            closeAuthModal();
        }
    });

    /* SWITCH BETWEEN FORMS */

    showSignupBtn.addEventListener('click', () => {
        showAuthForm(signupForm);
    });

    showLoginBtn.addEventListener('click', () => {
        showAuthForm(loginForm);
    });

    forgotOpenBtn.addEventListener('click', () => {
        document.getElementById('forgotEmail').value =
            document.getElementById('loginEmail').value;

        showAuthForm(forgotForm);
    });

    forgotBackBtn.addEventListener('click', () => {
        showAuthForm(loginForm);
    });

    resetBackBtn.addEventListener('click', () => {
        showAuthForm(loginForm);
    });

    /* LOGIN */

    loginForm.addEventListener('submit', async event => {
        event.preventDefault();

        const button = document.getElementById('loginSubmitBtn');

        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        button.disabled = true;
        showAuthMessage('Logging in...');

        try {
            const data = await apiRequest(`${API_BASE}/auth/login`, {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });

            updateAccountUI(data.user);

            showAuthMessage('Login successful.');

            await wait(500);
            closeAuthModal();

            loginForm.reset();

        } catch (error) {
            showAuthMessage(error.message, 'error');

        } finally {
            button.disabled = false;
        }
    });

    /* SIGNUP */

    signupForm.addEventListener('submit', async event => {
        event.preventDefault();

        const button = document.getElementById('signupSubmitBtn');

        const name = document.getElementById('signupName').value.trim();
        const email = document.getElementById('signupEmail').value.trim();
        const password = document.getElementById('signupPassword').value;

        button.disabled = true;
        showAuthMessage('Creating your account...');

        try {
            const data = await apiRequest(`${API_BASE}/auth/signup`, {
                method: 'POST',
                body: JSON.stringify({ name, email, password })
            });

            updateAccountUI(data.user);

            showAuthMessage('Account created successfully.');

            await wait(500);
            closeAuthModal();

            signupForm.reset();

        } catch (error) {
            showAuthMessage(error.message, 'error');

        } finally {
            button.disabled = false;
        }
    });

    /* FORGOT PASSWORD — SEND OTP */

    forgotForm.addEventListener('submit', async event => {
        event.preventDefault();

        const button = document.getElementById('forgotSubmitBtn');
        const email = document.getElementById('forgotEmail').value.trim();

        button.disabled = true;
        showAuthMessage('Requesting password reset OTP...');

        try {
            const data = await apiRequest(
                `${API_BASE}/auth/forgot-password/start`,
                {
                    method: 'POST',
                    body: JSON.stringify({ email })
                }
            );

            document.getElementById('resetEmail').value = email;

            showAuthForm(resetForm);
            showAuthMessage(data.message);

        } catch (error) {
            showAuthMessage(error.message, 'error');

        } finally {
            button.disabled = false;
        }
    });

    /* FORGOT PASSWORD — VERIFY OTP AND RESET */

    resetForm.addEventListener('submit', async event => {
        event.preventDefault();

        const button = document.getElementById('resetSubmitBtn');

        const email = document.getElementById('resetEmail').value.trim();
        const otp = document.getElementById('resetOtp').value.trim();
        const newPassword = document.getElementById('newPassword').value;

        button.disabled = true;
        showAuthMessage('Resetting your password...');

        try {
            const data = await apiRequest(
                `${API_BASE}/auth/forgot-password/reset`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        email,
                        otp,
                        newPassword
                    })
                }
            );

            resetForm.reset();

            showAuthForm(loginForm);

            document.getElementById('loginEmail').value = email;

            showAuthMessage(data.message);

        } catch (error) {
            showAuthMessage(error.message, 'error');

        } finally {
            button.disabled = false;
        }
    });

    /* LOGOUT */

    logoutBtn.addEventListener('click', async () => {
        logoutBtn.disabled = true;

        try {
            await apiRequest(`${API_BASE}/auth/logout`, {
                method: 'POST'
            });

            updateAccountUI(null);

            resetVerification();
            verificationPanel.hidden = true;
            emailVerification.hidden = true;
            phoneVerification.hidden = true;

            showAuthMessage('You have logged out.');

        } catch (error) {
            console.error('Logout error:', error);
            alert(error.message);

        } finally {
            logoutBtn.disabled = false;
        }
    });


    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    const escapeHTML = value =>
        String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[char]);

    /* MODE SWITCH */

    document.querySelectorAll('.seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.busy) return;

            state.mode = btn.dataset.mode;

            document.querySelectorAll('.seg-btn').forEach(button => {
                button.classList.toggle('active', button === btn);
            });

            input.value = '';
            input.placeholder = state.mode === 'email'
                ? 'you@example.com'
                : '+919876543210';

            resetVerification();

            verificationPanel.hidden = true;
            emailVerification.hidden = true;
            phoneVerification.hidden = true;

            summary.classList.remove('on');
            summary.innerHTML = '';
            results.innerHTML = '';
            terminal.classList.remove('on');

            input.focus();
        });
    });

    /* VALIDATION */

    const isEmail = value =>
        /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

    const isPhone = value =>
        /^[+]?[\d][\d\s\-().]{6,19}$/.test(value);

    function shake() {
        form.classList.remove('shake');
        void form.offsetWidth;
        form.classList.add('shake');

        setTimeout(() => form.classList.remove('shake'), 500);
    }


    /* ============================================================
   EMAIL OTP VERIFICATION
============================================================ */

    sendOtpBtn.addEventListener('click', async () => {
        const email = input.value.trim();

        if (!isEmail(email)) {
            shake();
            input.focus();
            return;
        }

        sendOtpBtn.disabled = true;
        setVerificationMessage('Sending verification code...');

        try {
            const data = await apiRequest(
                `${API_BASE}/verification/email/start`,
                {
                    method: 'POST',
                    body: JSON.stringify({ email })
                }
            );

            state.sessionId = data.sessionId;
            state.verified = false;
            state.verifiedValue = email;

            otpRow.hidden = false;
            otpInput.focus();

            setVerificationMessage(
                'OTP sent. Check your email inbox and spam folder.'
            );

        } catch (error) {
            setVerificationMessage(error.message, 'error');
        } finally {
            sendOtpBtn.disabled = false;
        }
    });


    verifyOtpBtn.addEventListener('click', async () => {
        const otp = otpInput.value.trim();

        if (!state.sessionId) {
            setVerificationMessage('Please request an OTP first.', 'error');
            return;
        }

        if (!/^\d{6}$/.test(otp)) {
            setVerificationMessage('Enter a valid 6-digit OTP.', 'error');
            return;
        }

        verifyOtpBtn.disabled = true;
        setVerificationMessage('Verifying OTP...');

        try {
            const data = await apiRequest(
                `${API_BASE}/verification/email/verify`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        sessionId: state.sessionId,
                        otp
                    })
                }
            );

            state.verified = true;

            setVerificationMessage(
                'Email verified successfully. You can now click Trace.',
                'success'
            );

        } catch (error) {
            state.verified = false;
            setVerificationMessage(error.message, 'error');
        } finally {
            verifyOtpBtn.disabled = false;
        }
    });


    /* ============================================================
       TELEGRAM PHONE VERIFICATION
    ============================================================ */

    telegramBtn.addEventListener('click', async () => {
        const phone = input.value.trim();

        if (!isPhone(phone)) {
            shake();
            input.focus();
            return;
        }

        telegramBtn.disabled = true;
        setVerificationMessage('Creating Telegram verification link...');

        try {
            const data = await apiRequest(
                `${API_BASE}/verification/phone/start`,
                {
                    method: 'POST',
                    body: JSON.stringify({ phone })
                }
            );

            state.sessionId = data.sessionId;
            state.verified = false;
            state.verifiedValue = phone;

            if (!data.telegramUrl) {
                throw new Error('Telegram verification link was not returned.');
            }

            telegramLink.href = data.telegramUrl;
            telegramLink.hidden = false;

            setVerificationMessage(
                'Open Telegram, start the bot and share your own phone contact.'
            );

            window.open(data.telegramUrl, '_blank');

            pollPhoneVerification();

        } catch (error) {
            setVerificationMessage(error.message, 'error');
            telegramBtn.disabled = false;
        }
    });


    async function pollPhoneVerification() {
        if (!state.sessionId || state.mode !== 'phone') return;

        state.polling = true;
        setVerificationMessage(
            'Waiting for Telegram contact verification...'
        );

        while (state.polling && state.sessionId && !state.verified) {
            try {
                const data = await apiRequest(
                    `${API_BASE}/verification/status?sessionId=${encodeURIComponent(state.sessionId)}`
                );

                if (data.verified || data.ready) {
                    state.verified = true;
                    state.polling = false;

                    setVerificationMessage(
                        'Phone number verified successfully. You can now click Trace.',
                        'success'
                    );

                    telegramBtn.disabled = false;
                    return;
                }

            } catch (error) {
                state.polling = false;
                setVerificationMessage(error.message, 'error');
                telegramBtn.disabled = false;
                return;
            }

            await wait(2500);
        }
    }

    /* TERMINAL */

    async function runTerminal(lines) {
        terminal.innerHTML = '';
        terminal.classList.add('on');

        for (const [message, cls] of lines) {
            const line = document.createElement('div');

            line.className = 'term-line ' + (cls || '');
            line.innerHTML = message;

            terminal.appendChild(line);

            await wait(300);
        }

        const caret = document.createElement('div');
        caret.className = 'term-line';
        caret.innerHTML = '<span class="caret"></span>';

        terminal.appendChild(caret);
    }

    function buildLines(value, mode, response) {
        const safeValue = escapeHTML(value);
        const count = response.totalExposures ?? 0;

        return [
            ['&gt; trace_protocol v1.0 — handshake ok', 'dim'],
            [`&gt; target :: <span class="tgt">${safeValue}</span> [${mode}]`, ''],
            ['&gt; connecting to Trace_My_Self API ...', 'dim'],
            ['&gt; checking configured public data sources ...', ''],
            ['&gt; processing scan response ...', 'dim'],
            [
                `&gt; scan complete — <span class="tgt">${count}</span> exposure(s) reported`,
                'ok'
            ]
        ];
    }

    /* EVIDENCE FORMATTER */

    function formatEvidence(evidence) {
        if (!evidence) return '';

        if (typeof evidence === 'string') {
            return evidence;
        }

        if (typeof evidence !== 'object') {
            return String(evidence);
        }

        const fields = {
            industry: 'Industry',
            domain: 'Domain',
            breachDate: 'Breach date',
            addedDate: 'Added to database',
            affectedRecords: 'Affected records',
            verified: 'Verified',
            passwordRisk: 'Password risk',
            providerRiskLabel: 'Provider risk',
            providerRiskScore: 'Provider risk score',

            // Phone number information
            country: 'Country',
            internationalNumber: 'International number',
            nationalNumber: 'National number',
            countryCallingCode: 'Calling code',
            numberType: 'Number type',
            isPossible: 'Possible number',
            isValid: 'Valid number'
        };

        let html = '';

        for (const [key, label] of Object.entries(fields)) {
            if (evidence[key] !== undefined && evidence[key] !== null) {
                html += `
                <div class="evidence-item">
                    <strong>${label}:</strong>
                    ${escapeHTML(evidence[key])}
                </div>
            `;
            }
        }

        if (Array.isArray(evidence.exposedData) &&
            evidence.exposedData.length) {
            html += `
            <div class="evidence-item">
                <strong>Reported exposed data:</strong>
                ${escapeHTML(evidence.exposedData.join(', '))}
            </div>
        `;
        }

        if (evidence.reference) {
            const reference = String(evidence.reference);

            if (/^https:\/\/(www\.)?forbesindia\.com\//i.test(reference)) {
                html += `
                <div class="evidence-item">
                    <a href="${escapeHTML(reference)}"
                       target="_blank"
                       rel="noopener noreferrer">
                        View reference
                    </a>
                </div>
            `;
            }
        }

        return html;
    }

    /* RESULT CARD */

    function createResultCard(item, index) {
        const wrap = document.createElement('div');
        wrap.className = 'rcard-wrap';
        wrap.style.animationDelay = `${index * 70}ms`;

        const card = document.createElement('article');
        card.className = 'rcard tilt';

        const risk = ['high', 'medium', 'low'].includes(
            String(item.risk).toLowerCase()
        ) ? String(item.risk).toLowerCase() : 'low';

        const status = String(item.status || 'info').toUpperCase();

        const title = escapeHTML(item.title || 'Scan result');
        const description = escapeHTML(item.description || '');

        const evidence = formatEvidence(item.evidence);

        card.innerHTML = `
        <div class="rcard-head">
            <span class="rcard-icon">
                ${escapeHTML(item.source || 'SCAN')}
            </span>
            <span class="risk ${risk}">
                ${status}
            </span>
        </div>

        <h4>${title}</h4>

        <p>${description}</p>

        ${evidence ? `
            <div class="evidence">
                ${evidence}
            </div>
        ` : ''}

        <div class="rcard-foot">
            <i></i>
            ${status === 'FOUND'
                ? 'Reported in source'
                : status === 'UNAVAILABLE'
                    ? 'Source unavailable'
                    : status === 'NOT_FOUND'
                        ? 'No match reported'
                        : 'Informational result'}
        </div>
    `;

        wrap.appendChild(card);
        bindTilt(card);

        return wrap;
    }

    /* RENDER RESULTS */


    function renderResults(response) {
        const findings = response.findings || [];
        const risk = response.risk || {};

        const score = Number(risk.score || 0);
        const level = String(risk.level || 'LOW').toUpperCase();

        const isPhone = response.mode === 'phone';

        // Count confirmed breach findings
        const confirmedFindings = findings.filter(
            item => item.status === 'found'
        );

        const counts = {
            high: 0,
            medium: 0,
            low: 0
        };

        confirmedFindings.forEach(item => {
            const severity = String(item.risk || 'low').toLowerCase();

            if (counts[severity] !== undefined) {
                counts[severity]++;
            }
        });

        // Risk score color class
        const riskClass = ['LOW', 'MEDIUM', 'HIGH'].includes(level)
            ? level.toLowerCase()
            : 'low';

        summary.innerHTML = `
        <div class="sum-main">
            <span class="sum-num">
                ${Number(response.totalExposures || 0)}
            </span>
            reported exposure(s)
        </div>

        <div class="sum-legend">
            <span>
                <i style="background:var(--high)"></i>
                ${counts.high} HIGH
            </span>

            <span>
                <i style="background:var(--med)"></i>
                ${counts.medium} MEDIUM
            </span>

            <span>
                <i style="background:var(--low)"></i>
                ${counts.low} LOW
            </span>
        </div>

        <div class="sum-main">
            Risk score:
            <b class="risk-score ${riskClass}">
                ${score}/100 — ${escapeHTML(level)}
            </b>
        </div>
    `;

        summary.classList.add('on');
        results.innerHTML = '';

        // Show metadata-only or no-match message
        if (!findings.length) {
            const message = document.createElement('p');

            message.textContent = isPhone
                ? 'Phone analysis returned no findings. Check the provider status for availability.'
                : 'No matching breach records were returned by the configured source. This does not guarantee that the email has never been exposed.';

            results.appendChild(message);
            return;
        }

        // Render all result cards
        findings.forEach((item, index) => {
            results.appendChild(createResultCard(item, index));
        });

        // Explain risk score limitations
        const note = document.createElement('p');
        note.className = 'hint';

        note.textContent =
            'Risk score is a heuristic calculated by Trace_My_Self using unique reported exposure categories. ' +
            'A dataset match does not prove that every listed field belongs to the same individual, ' +
            'and a result does not confirm active account compromise.';

        results.appendChild(note);
    }


    /* ERROR DISPLAY */

    function showError(message) {
        summary.classList.remove('on');
        summary.innerHTML = '';

        results.innerHTML = '';

        const error = document.createElement('p');
        error.textContent = message;

        results.appendChild(error);
    }

    /* SUBMIT */

    /* ============================================================
   INPUT CHANGE — INVALIDATE OLD VERIFICATION
============================================================ */

    input.addEventListener('input', () => {
        if (
            state.verified &&
            input.value.trim() !== state.verifiedValue
        ) {
            resetVerification();
            setVerificationMessage(
                'Input changed. Please verify this new identifier.'
            );
        }
    });


    /* ============================================================
       SUBMIT — VERIFY FIRST, THEN SCAN
    ============================================================ */

    form.addEventListener('submit', async event => {
        event.preventDefault();

        if (state.busy) return;

        // Wait until the existing login session has been checked.
        await authCheckPromise;

        // Login is required before scanning.
        if (!currentUser) {
            openAuthModal('login');
            showAuthMessage('Please log in before starting a scan.');
            return;
        }

        const value = input.value.trim();

        const valid = state.mode === 'email'
            ? isEmail(value)
            : isPhone(value);

        if (!valid) {
            shake();
            input.focus();
            return;
        }

        // Verification is mandatory before scanning.
        if (
            !state.verified ||
            !state.sessionId ||
            state.verifiedValue !== value
        ) {
            verificationPanel.hidden = false;

            emailVerification.hidden = state.mode !== 'email';
            phoneVerification.hidden = state.mode !== 'phone';

            setVerificationMessage(
                state.mode === 'email'
                    ? 'First click Send OTP and verify your email.'
                    : 'First click Verify with Telegram and share your own contact.'
            );

            return;
        }

        state.busy = true;
        scanBtn.disabled = true;

        document.body.classList.add('scanning');

        summary.classList.remove('on');
        summary.innerHTML = '';
        results.innerHTML = '';

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'x-verification-session': state.sessionId
                },
                body: JSON.stringify({
                    value,
                    mode: state.mode
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message || 'Unable to complete scan.'
                );
            }

            // A verification session is intended for one scan.
            state.verified = false;
            state.sessionId = null;
            state.verifiedValue = '';

            await runTerminal(
                buildLines(value, state.mode, data)
            );

            await wait(250);

            renderResults(data);

            setVerificationMessage(
                'Scan completed. Verify again before starting another scan.'
            );

        } catch (error) {
            console.error('Scan error:', error);

            showError(
                error.message === 'Failed to fetch'
                    ? 'Cannot connect to the backend. Make sure your Express server is running on port 5050.'
                    : error.message || 'Something went wrong during the scan.'
            );

        } finally {
            document.body.classList.remove('scanning');

            scanBtn.disabled = false;
            state.busy = false;
        }
    });

    /* INITIAL FOCUS */

    window.addEventListener('load', () => {
        setTimeout(() => {
            input.focus({ preventScroll: true });
        }, 900);
    });

})();