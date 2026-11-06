"use client";

import { useState } from "react";

/* "Forgot password?" that is always on the sign-in page (Jobber's is). Clerk only draws its own link once the password box has text in
   it, and its reset step needs that link's handler, so this link sets a one-character password for a moment, lets Clerk draw its link,
   and clicks it. That starts Clerk's real reset flow (an emailed code and a new password) for the email typed above. The character is
   never sent: Clerk's reset sends only the email. If Clerk's markup changes so the link cannot be found, the message below says so
   instead of doing nothing. Clerk's own copy of the link is hidden in app/globals.css so there are never two. */

function setValue(input: HTMLInputElement, value: string) {
  // React tracks the value itself, so a plain assignment would not be noticed; this goes through the native setter and fires input.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function ForgotPasswordLink() {
  const [message, setMessage] = useState("");

  function start() {
    setMessage("");
    const root = document.querySelector<HTMLElement>(".auth-signin");
    const email = root?.querySelector<HTMLInputElement>("input[name='identifier'], input[type='email'], input[autocomplete~='username']");
    const password = root?.querySelector<HTMLInputElement>(".cl-formFieldRow__password input, input[type='password']");
    if (!root || !email || !password) {
      setMessage("The sign-in form is still loading. Try again in a moment.");
      return;
    }
    if (!email.value.trim()) {
      email.focus();
      setMessage("Enter your email address first, then choose Forgot password?.");
      return;
    }
    const hadValue = password.value !== "";
    if (!hadValue) setValue(password, "x");

    const started = Date.now();
    const look = () => {
      const action = root.querySelector<HTMLElement>(".cl-formFieldRow__password .cl-formFieldAction, .cl-formFieldAction__password");
      if (action) {
        action.click();
        if (!hadValue) setValue(password, "");
        return;
      }
      if (Date.now() - started > 1500) {
        if (!hadValue) setValue(password, "");
        setMessage("Could not start the password reset from here. Ask an Admin to reset it for you.");
        return;
      }
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  }

  return (
    <div className="auth-forgot">
      <button type="button" className="linkbtn" onClick={start}>Forgot password?</button>
      {message && <p className="auth-forgot-msg" role="alert">{message}</p>}
    </div>
  );
}
