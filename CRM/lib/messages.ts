"use client";

/* Messages (plan 2026-11-19-messages). The backend (convex/crm/messages.ts) groups, orders and counts; this file only asks for it. */

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useKept } from "./clients";

export function useConversations(businessId: Id<"businesses"> | undefined, enabled = true) {
  return useKept(useQuery(api.crm.messages.conversations, businessId && enabled ? { businessId } : "skip"));
}
export function useThread(businessId: Id<"businesses"> | undefined, who: { clientId?: Id<"clients">; phone?: string }) {
  return useQuery(api.crm.messages.thread, businessId && (who.clientId || who.phone) ? { businessId, ...(who.clientId ? { clientId: who.clientId } : { phone: who.phone }) } : "skip");
}
export function useUnreadTexts(businessId: Id<"businesses"> | undefined, enabled = true) {
  return useQuery(api.crm.messages.unread, businessId && enabled ? { businessId } : "skip");
}
export function useTextingStatus(businessId: Id<"businesses"> | undefined, enabled = true) {
  return useQuery(api.crm.messages.provider, businessId && enabled ? { businessId } : "skip");
}
export function useCalls(businessId: Id<"businesses"> | undefined, who: { clientId?: Id<"clients">; phone?: string }) {
  return useQuery(api.crm.calls.thread, businessId && (who.clientId || who.phone) ? { businessId, ...(who.clientId ? { clientId: who.clientId } : { phone: who.phone }) } : "skip");
}
