// public/src/services/errors-service.js
//
// Centralized error logging. Per master prompt §30: "No silent failures.
// Every error → toast + console + audit + write to errors/ collection."
//
// Public API:
//   logError({ source, page, action, error, context })

import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

import { auth, db } from "../firebase-init.js";
import { TENANT_ID } from "../config.js";

const STACK_MAX = 2000;
const MESSAGE_MAX = 500;
const CONTEXT_MAX = 2000;

export async function logError({ source, page, action, error, context }) {
  console.error(`[${source}/${page}/${action}]`, error, context || "");

  try {
    const docPayload = {
      Timestamp: serverTimestamp(),
      Source: safeString(source, 32) || "frontend",
      Page: safeString(page, 120) || "(unknown)",
      UserID: getCurrentUserId(),
      Action: safeString(action, 120) || "(unknown)",
      Message: extractMessage(error),
      Stack: extractStack(error),
      Context: stringifyContext(context),
      TenantID: TENANT_ID
    };

    const errorsRef = collection(db, "tenants", TENANT_ID, "errors");
    await addDoc(errorsRef, docPayload);
  } catch (writeFailure) {
    console.error("[errors-service] Failed to write error log:", writeFailure);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getCurrentUserId() {
  try {
    return auth.currentUser ? auth.currentUser.uid : null;
  } catch (_) {
    return null;
  }
}

function extractMessage(error) {
  if (error == null) return "(no error provided)";
  if (typeof error === "string") return truncate(error, MESSAGE_MAX);
  if (error instanceof Error) return truncate(error.message || error.name || "Error", MESSAGE_MAX);
  if (typeof error === "object" && typeof error.message === "string") {
    return truncate(error.message, MESSAGE_MAX);
  }
  try {
    return truncate(String(error), MESSAGE_MAX);
  } catch (_) {
    return "(unstringifiable error)";
  }
}

function extractStack(error) {
  if (error instanceof Error && typeof error.stack === "string") {
    return truncate(error.stack, STACK_MAX);
  }
  return "";
}

function stringifyContext(context) {
  if (context == null) return "";
  try {
    const seen = new WeakSet();
    const replacer = (key, value) => {
      if (value && typeof value === "object") {
        if (seen.has(value)) return "(circular)";
        seen.add(value);
      }
      if (typeof value === "function") return "(function)";
      if (typeof value === "undefined") return "(undefined)";
      return value;
    };
    const json = JSON.stringify(context, replacer);
    return truncate(json, CONTEXT_MAX);
  } catch (_) {
    return "(unserializable context)";
  }
}

function safeString(value, maxLen) {
  if (value == null) return "";
  return truncate(String(value).trim(), maxLen);
}

function truncate(str, maxLen) {
  if (str == null) return "";
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}