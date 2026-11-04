"use client";

import { useAction } from "convex/react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import Image from "next/image";
import { FormEvent, useId, useState } from "react";
import { api } from "@/convex/_generated/api";
import { friendlyError } from "@/lib/errors";

export function SalesLogin({ onSignedIn }: { onSignedIn: (token: string, remember?: boolean) => void }) {
  const login = useAction(api.sales.login.login);
  const emailErrorId = useId();
  const passwordErrorId = useId();
  const formErrorId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const nextEmail = email.trim();
    const nextEmailError = emailProblem(nextEmail);
    const nextPasswordError = password.trim() === "" ? "Enter your password." : null;
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setError(null);
    if (nextEmailError !== null || nextPasswordError !== null) return;

    setPending(true);
    try {
      const result = await login({ email: nextEmail, password });
      if ("error" in result) {
        setError(
          result.error === "limited"
            ? "Too many attempts. Wait a few minutes and try again."
            : result.error === "unconfigured"
              ? "Sales sign-in is not set up yet."
              : "That email or password is not recognized.",
        );
        return;
      }
      onSignedIn(result.token, remember);
    } catch (loginError) {
      setError(friendlyError(loginError, "Could not reach the server. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="sales-login">
      <div className="sales-login__stage">
        <form
          className="sales-login__card"
          onSubmit={onSubmit}
          noValidate
          aria-describedby={error !== null ? formErrorId : undefined}
        >
          <Image
            className="sales-login__logo"
            src="/brand/logo-mark.png"
            alt="Quality First Turf"
            width={771}
            height={605}
            priority
          />
          <h1>Welcome Back</h1>
          <p className="sales-login__lead">
            Sign in to access your account and continue your journey with Quality First Turf.
          </p>

          <div className={emailError !== null ? "sales-login__field is-invalid" : "sales-login__field"}>
            <label htmlFor="sales-email">Email</label>
            <div className="sales-login__control">
              <Mail aria-hidden="true" strokeWidth={1.75} />
              <input
                id="sales-email"
                type="email"
                autoComplete="username"
                inputMode="email"
                placeholder="Enter your email address"
                value={email}
                aria-invalid={emailError !== null}
                aria-describedby={emailError !== null ? emailErrorId : undefined}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError !== null) setEmailError(null);
                }}
              />
            </div>
            {emailError !== null ? (
              <p id={emailErrorId} className="sales-login__field-error">
                {emailError}
              </p>
            ) : null}
          </div>

          <div className={passwordError !== null ? "sales-login__field is-invalid" : "sales-login__field"}>
            <label htmlFor="sales-password">Password</label>
            <div className="sales-login__control">
              <Lock aria-hidden="true" strokeWidth={1.75} />
              <input
                id="sales-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                aria-invalid={passwordError !== null}
                aria-describedby={passwordError !== null ? passwordErrorId : undefined}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (passwordError !== null) setPasswordError(null);
                }}
              />
              <button
                type="button"
                className="sales-login__reveal"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff aria-hidden="true" strokeWidth={1.75} /> : <Eye aria-hidden="true" strokeWidth={1.75} />}
              </button>
            </div>
            {passwordError !== null ? (
              <p id={passwordErrorId} className="sales-login__field-error">
                {passwordError}
              </p>
            ) : null}
          </div>

          <div className="sales-login__options">
            <label className="sales-login__remember" htmlFor="sales-remember">
              <input
                id="sales-remember"
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              Remember me
            </label>
          </div>

          {error !== null ? (
            <p id={formErrorId} className="sales-login__alert" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="sales-login__submit" disabled={pending} aria-busy={pending}>
            {pending ? "Signing in" : "Sign In"}
            {pending ? null : <ArrowRight aria-hidden="true" strokeWidth={2} />}
          </button>
        </form>
      </div>
    </div>
  );
}

function emailProblem(value: string) {
  if (value === "") return "Enter your email address.";
  const at = value.indexOf("@");
  const domain = at > 0 ? value.slice(at + 1) : "";
  if (at < 1 || !domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return "Enter an email address with a domain, such as name@company.com.";
  }
  return null;
}
