"use client";

/* Texting by hand (D-094, plan 2026-11-19-messages): until Twilio is connected, a text is opened in the phone's messaging app with the message filled
   in (`sms:`), and also copied, since a computer may not hand `sms:` to anything. The message is logged by crm/messages:send either way. */

export function openText(phone: string, message: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  void navigator.clipboard?.writeText(message).catch(() => undefined);
  window.location.href = `sms:${digits}?&body=${encodeURIComponent(message)}`;
}
