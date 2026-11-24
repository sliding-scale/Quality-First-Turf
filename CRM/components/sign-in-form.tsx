"use client";

/* The sign-in form (replaces Clerk's drawn <SignIn> so a wrong password is reported on this same page instead of on Clerk's "factor-one"
   page, and so every button shows one spinner while it works). Clerk still does the real work through its `useSignIn` flow: passwords,
   emailed codes, new-device checks and password resets, so nobody is locked out by a custom form. Steps: password (email and password
   together), method (another way in), code (a code emailed to the person; also used for a new device and for a password reset), newpass
   (the new password after a reset). */

import { useSignIn } from "@clerk/nextjs";
import { useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";

type Step = "password" | "method" | "code" | "newpass";
type CodeFor = "signin" | "mfa" | "reset";
type Failure = { code?: string; longMessage?: string; message?: string; errors?: { code?: string; longMessage?: string; message?: string }[] } | null | undefined;

const LINES: Record<Step, string> = {
  password: "Log in to the Quality First Turf CRM.",
  method: "Choose another way to log in.",
  code: "Enter the code we emailed you.",
  newpass: "Choose a new password.",
};

/** A readable message for a Clerk error. */
function say(error: Failure) {
  const first = error?.errors?.[0] ?? error;
  const code = first?.code ?? error?.code ?? "";
  if (code === "form_password_incorrect" || code === "form_identifier_not_found" || code === "strategy_for_user_invalid") {
    return "That email and password do not match. Check them and try again.";
  }
  if (code === "form_code_incorrect" || code === "verification_failed") return "That code is not right. Check it and try again.";
  if (code === "verification_expired") return "That code has expired. Send a new one.";
  if (code === "too_many_requests") return "Too many tries. Wait a minute and try again.";
  return first?.longMessage ?? first?.message ?? error?.longMessage ?? error?.message ?? "Something went wrong. Try again.";
}

function Field({ label, bad, children }: { label: string; bad?: boolean; children: ReactNode }) {
  return (
    <div className={`sf-field${bad ? " bad" : ""}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}

/** Six one-digit boxes for the emailed code. Typing moves on, Backspace moves back, and pasting a whole code fills them all. `inputRef` is the first box. */
function CodeBoxes({ value, onChange, bad, disabled, inputRef }: { value: string; onChange: (v: string) => void; bad?: boolean; disabled?: boolean; inputRef: RefObject<HTMLInputElement | null> }) {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) => { const b = boxes.current[Math.max(0, Math.min(5, i))]; b?.focus(); };
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  /** Puts digits in from box `i`, over whatever is there; the digits after them stay. */
  function put(i: number, text: string) {
    const clean = text.replace(/\D/g, "");
    if (!clean) return;
    const v = (value.slice(0, i).padEnd(i, "0") + clean + value.slice(i + clean.length)).slice(0, 6);
    onChange(v);
    focus(Math.min(i + clean.length, 5));
  }

  return (
    <div className={`sf-otp${bad ? " bad" : ""}`} role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { boxes.current[i] = el; if (i === 0) inputRef.current = el; }}
          className="sf-otp-box"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={!!bad}
          value={d}
          disabled={disabled}
          onChange={(e) => {
            // A box that already has a digit gets two characters when typed in: only the one just typed counts. A longer value is an autofilled code.
            const typed = (e.nativeEvent as InputEvent).data;
            put(i, e.target.value.length === 2 && typed ? typed : e.target.value);
          }}
          onPaste={(e) => { e.preventDefault(); put(0, e.clipboardData.getData("text")); }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              if (digits[i]) onChange(value.slice(0, i) + value.slice(i + 1));
              else if (i > 0) { onChange(value.slice(0, i - 1) + value.slice(i)); focus(i - 1); }
            } else if (e.key === "ArrowLeft") { e.preventDefault(); focus(i - 1); }
            else if (e.key === "ArrowRight") { e.preventDefault(); focus(i + 1); }
          }}
        />
      ))}
    </div>
  );
}

export function SignInForm() {
  const { signIn, fetchStatus } = useSignIn();
  const [step, setStep] = useState<Step>("password");
  const [codeFor, setCodeFor] = useState<CodeFor>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [code, setCode] = useState("");
  const [fresh, setFresh] = useState("");
  const [error, setError] = useState("");
  const [bad, setBad] = useState<{ email?: boolean; password?: boolean; code?: boolean; fresh?: boolean }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const freshRef = useRef<HTMLInputElement>(null);

  const working = busy || done || fetchStatus === "fetching";

  function go(next: Step) {
    setStep(next);
    setError("");
    setNotice("");
    setBad({});
  }

  /** Runs one Clerk call with the button busy; a returned error is shown on this page and nothing else changes. */
  async function run(call: () => Promise<{ error: Failure }>) {
    setBusy(true);
    setError("");
    try {
      const r = await call();
      if (r.error) {
        setError(say(r.error));
        return false;
      }
      return true;
    } catch (e) {
      setError(say(e as Failure));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (signIn.status !== "complete") return false;
    // The spinner stays on until the page has changed, so the button never flashes back.
    setDone(true);
    const r = await signIn.finalize({ navigate: ({ decorateUrl }) => { window.location.assign(decorateUrl("/home")); } });
    if (r.error) {
      setDone(false);
      setError(say(r.error));
      return false;
    }
    return true;
  }

  /** After a first factor: finished, or the new-device check that needs an emailed code, or something unexpected. */
  async function afterFactor() {
    if (await finish()) return;
    if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
      const sent = await run(() => signIn.mfa.sendEmailCode());
      if (sent) {
        setCode("");
        setCodeFor("mfa");
        go("code");
        setNotice(`This looks like a new device. We emailed a code to ${email.trim()}.`);
        setTimeout(() => codeRef.current?.focus(), 0);
      }
      return;
    }
    if (signIn.status === "needs_new_password") {
      go("newpass");
      return;
    }
    setError("That sign-in needs another step this page cannot do. Ask an Admin for help.");
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    const flags = { email: !email.trim(), password: !password };
    setBad(flags);
    if (flags.email || flags.password) {
      setError(flags.email ? "Enter your email address." : "Enter your password.");
      (flags.email ? emailRef : passRef).current?.focus();
      return;
    }
    const ok = await run(() => signIn.password({ identifier: email.trim(), password }));
    if (!ok) {
      setBad({ password: true });
      passRef.current?.focus();
      passRef.current?.select();
      return;
    }
    await afterFactor();
  }

  function needEmail(message: string) {
    go("password");
    setBad({ email: true });
    setError(message);
    setTimeout(() => emailRef.current?.focus(), 0);
  }

  async function sendSignInCode() {
    if (!email.trim()) return needEmail("Enter your email address first.");
    const ok = await run(async () => {
      const made = await signIn.create({ identifier: email.trim() });
      if (made.error) return made;
      return signIn.emailCode.sendCode();
    });
    if (ok) {
      setCode("");
      setCodeFor("signin");
      go("code");
      setNotice(`We emailed a code to ${email.trim()}.`);
      setTimeout(() => codeRef.current?.focus(), 0);
    }
  }

  async function startReset() {
    if (!email.trim()) return needEmail("Enter your email address first, then choose Forgot password?.");
    const ok = await run(async () => {
      const made = await signIn.create({ identifier: email.trim() });
      if (made.error) return made;
      return signIn.resetPasswordEmailCode.sendCode();
    });
    if (ok) {
      setCode("");
      setCodeFor("reset");
      go("code");
      setNotice(`We emailed a code to ${email.trim()}. It lets you choose a new password.`);
      setTimeout(() => codeRef.current?.focus(), 0);
    }
  }

  async function resend() {
    setNotice("");
    const ok = await run(() =>
      codeFor === "mfa" ? signIn.mfa.sendEmailCode() : codeFor === "reset" ? signIn.resetPasswordEmailCode.sendCode() : signIn.emailCode.sendCode(),
    );
    if (ok) setNotice("A new code is on its way.");
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    const value = code.replace(/\D/g, "");
    if (value.length < 6) {
      setBad({ code: true });
      setError("Enter the 6-digit code from the email.");
      codeRef.current?.focus();
      return;
    }
    const ok = await run(() =>
      codeFor === "mfa"
        ? signIn.mfa.verifyEmailCode({ code: value })
        : codeFor === "reset"
          ? signIn.resetPasswordEmailCode.verifyCode({ code: value })
          : signIn.emailCode.verifyCode({ code: value }),
    );
    if (!ok) {
      setBad({ code: true });
      codeRef.current?.focus();
      codeRef.current?.select();
      return;
    }
    if (codeFor === "reset") {
      go("newpass");
      setTimeout(() => freshRef.current?.focus(), 0);
      return;
    }
    await afterFactor();
  }

  async function submitNewPassword(e: FormEvent) {
    e.preventDefault();
    if (fresh.length < 8) {
      setBad({ fresh: true });
      setError("Use at least 8 characters.");
      freshRef.current?.focus();
      return;
    }
    const ok = await run(() => signIn.resetPasswordEmailCode.submitPassword({ password: fresh }));
    if (!ok) {
      setBad({ fresh: true });
      return;
    }
    if (!(await finish())) setError("Your password was changed. Log in with it now.");
  }

  const submitStep = step === "password" ? submitPassword : step === "code" ? submitCode : submitNewPassword;
  // Not a `disabled` button: the app's global rule dims every disabled button, which made this one fade out while it worked.
  const onSubmit = (e: FormEvent) => { if (working) e.preventDefault(); else void submitStep(e); };
  const label = step === "password" ? "Log In" : step === "code" ? "Continue" : "Save password";
  const eye = (
    <button type="button" className="sf-eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
      {show ? "Hide" : "Show"}
    </button>
  );

  return (
    <div className="sf" aria-busy={working}>
      <div className="auth-head">
        <h1 className="auth-product">LaunchPad</h1>
        <p className="auth-welcome">Welcome back</p>
        <p>{LINES[step]}</p>
      </div>

      <div className="sf-step" key={step}>
        {step === "method" ? (
          <div className="sf-methods">
            <button type="button" className="sf-method" disabled={working} onClick={sendSignInCode}>
              <b>Email me a code</b>
              <small>{email.trim() ? `Sent to ${email.trim()}` : "Sent to the email on your account"}</small>
            </button>
            <button type="button" className="sf-method" disabled={working} onClick={startReset}>
              <b>Reset my password</b>
              <small>We email a code, then you choose a new password</small>
            </button>
            {error && <p className="sf-error" role="alert">{error}</p>}
            <div className="sf-links">
              <button type="button" className="linkbtn" onClick={() => go("password")}>Back to log in</button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            {step === "password" && (
              <>
                <Field label="Email address*" bad={bad.email}>
                  <input ref={emailRef} type="email" name="identifier" autoComplete="username" autoFocus value={email} aria-invalid={!!bad.email} disabled={working}
                    onChange={(e) => { setEmail(e.target.value.replace(/\s/g, "")); setBad((b) => ({ ...b, email: false })); setError(""); }} />
                </Field>
                <Field label="Password*" bad={bad.password}>
                  <input ref={passRef} type={show ? "text" : "password"} name="password" autoComplete="current-password" value={password} aria-invalid={!!bad.password} disabled={working}
                    onChange={(e) => { setPassword(e.target.value); setBad((b) => ({ ...b, password: false })); setError(""); }} />
                  {eye}
                </Field>
              </>
            )}
            {step === "code" && (
              <CodeBoxes value={code} bad={bad.code} disabled={working} inputRef={codeRef}
                onChange={(v) => { setCode(v); setBad({}); setError(""); }} />
            )}
            {step === "newpass" && (
              <Field label="New password*" bad={bad.fresh}>
                <input ref={freshRef} type={show ? "text" : "password"} autoComplete="new-password" value={fresh} aria-invalid={!!bad.fresh} disabled={working}
                  onChange={(e) => { setFresh(e.target.value); setBad({}); setError(""); }} />
                {eye}
              </Field>
            )}

            {notice && !error && <p className="sf-notice" role="status">{notice}</p>}
            {error && <p className="sf-error" role="alert">{error}</p>}

            <button type="submit" className="sf-submit" aria-disabled={working} data-busy={working ? "true" : undefined}>
              <span>{label}</span>
              <i className="sf-spin" aria-hidden="true" />
            </button>

            {step === "password" && (
              <div className="sf-links">
                <button type="button" className="linkbtn" disabled={working} onClick={() => go("method")}>Use another method</button>
                <button type="button" className="linkbtn" disabled={working} onClick={startReset}>Forgot password?</button>
              </div>
            )}
            {step === "code" && (
              <div className="sf-links">
                <button type="button" className="linkbtn" disabled={working} onClick={resend}>Send a new code</button>
                <button type="button" className="linkbtn" disabled={working} onClick={() => go(codeFor === "mfa" ? "password" : "method")}>Back</button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
