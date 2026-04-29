# Aquaria Playground Management System — Master Build Prompt v6.2

---

## 0. What This Document Is

This is the single source of truth for building **Aquaria** — a complete, professional, sellable playground management product.

Read this document fully before writing any code. Every architectural decision, every business rule, every engineering constraint is here. Do not assume. If something is not in this document, ask before building.

This document describes the **finished product** — not a phased rollout, not an MVP. It is the complete thing as it will exist on the day the Aquaria playground (the first deployment) goes live.

**Working method:** A new chat session begins with no memory of previous sessions. Rafic shares this document at the start of each session. Code in the GitHub repo is the second source of truth. Anything not in either must be re-stated.

---

## 1. Project Context

### Who is building this
- **Owner / Product Lead:** Rafic Abdallah, owner of Aquaria playground in Lebanon.
- **Sole developer:** Claude (Anthropic AI assistant).
- **Rafic's technical level:** Non-developer. Basic computer skills. Has not written code before this project.
- **Working method:** Claude generates complete working code. Rafic copies it into the GitHub repo, runs it, reports what happens. Claude debugs, improves, explains in plain English. Rafic decides product direction; Claude advises on technical tradeoffs and pushes back when something violates this document.

### What is being built
A complete, multi-device, cloud-backed indoor playground management system. Designed from day one as a sellable product but deployed initially at one location only — Aquaria, Lebanon.

### Plan in plain language
1. **Build.** We build the complete product. Aquaria has no system running during the build period — there is no v4 to migrate from. We build from scratch.
2. **Deploy at Aquaria.** When the product is complete, Aquaria becomes the first live deployment.
3. **Live operations and refinement.** Rafic operates Aquaria on the product. Bugs get fixed, edges get smoothed, real-world feedback shapes refinements. This phase ends when Rafic decides the product is ready to sell.
4. **Commercialize.** Hire a developer, hire sales, onboard external playgrounds, scale.

This master prompt covers steps 1–3 in full detail. Step 4 is mentioned only enough for architectural foresight (§31).

### Repository and hosting
- **GitHub repo:** the repo URL will be provided by Rafic at session start (the original v4 repo will be replaced when build begins).
- **Production hosting:** Firebase Hosting. SSL automatic, custom domain supported.
- **Source control:** GitHub.

### Out of scope for first deployment
- Selling to other playgrounds (Stage 4).
- WhatsApp Business API automation — manual `wa.me` queue is the day-one mechanism. Architecture allows a drop-in upgrade later (§19).
- Mobile apps for parents (architecture allows it — not built in v6.2).
- Multi-language UI launched in production. Architecture supports it; English/Arabic/French strings are prepared but the UI defaults to English at launch.

---

## 2. Architecture

### High-level diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   Tablet A      │       │   Tablet B      │       │   TV Display    │
│   (primary)     │       │   (secondary)   │       │   (read-only)   │
│   Chrome        │       │   Chrome        │       │   Kiosk browser │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         └─────────────┬───────────┴─────────────┬───────────┘
                       │                         │
                       │   Local WiFi router     │
                       │                         │
                       ├─────────────────────────┤
                       │                         │
              ┌────────▼─────────┐               │
              │  Akuvox A05C     │ ◄── tablets call its local IP
              │  (face terminal) │     for manual gate / commands
              │  20K face DB     │
              └────────┬─────────┘
                       │  HTTPS (internet)
                       │  asks Cloud Function for permission on every face
                       ▼
                ┌──────────────────────────────────────┐
                │        Firebase Cloud (Google)        │
                │  Firestore  •  Storage  •  Auth       │
                │  Hosting    •  Cloud Functions        │
                │                                       │
                │  • Action URL endpoint                │
                │    (receives face events)             │
                │  • Remote Verification endpoint       │
                │    (replies allow/deny)               │
                └──────────────────────────────────────┘

                       (Tablets and TV also reach Firebase
                        over the internet; tablets cache locally
                        for offline operation.)

                       Akuvox A05C lock relay
                       ─────────►  Electric Gate
```

### Backend stack: Firebase (Google Cloud)

| Service | Purpose |
|---|---|
| **Firestore** | Primary database. NoSQL. Real-time sync built in. Offline cache built in. |
| **Firebase Auth** | Staff login. Email + password. |
| **Firebase Storage** | Kid photos, playground logo, uploaded promo images. Photos never inlined as base64. |
| **Firebase Hosting** | Serves the web app. |
| **Cloud Functions** | Scheduled jobs (subscription expiry, integrity check), trigger-based jobs (audit logging, photo resize), HTTP endpoints if needed. |

### Why Firebase
- Offline support is critical for Lebanese internet reliability. Firebase handles offline/online sync automatically.
- Real-time listeners across devices — essential for two tablets and a TV to stay in sync.
- Generous free tier — Aquaria operates at $0/month at expected scale.
- Authentication, hosting, storage are bundled.
- Multi-tenant architecture supported via the data model.

### Frontend stack
- **Plain HTML, CSS, JavaScript with ES modules.** No React, no Vue, **no build step.**
- **Firebase SDK** loaded via CDN. The full modular SDK adds ~100 KB; we accept this in exchange for simpler maintenance.
- **Fonts:** DM Sans (UI text), DM Mono (numbers, codes, prices) — Google Fonts.
- **Single-page app.** One `index.html`, multiple JavaScript modules under `/src/` organized by domain (`kids.js`, `sessions.js`, `subscriptions.js`, `loyalty.js`, etc.). Routing via URL hash.

### The face terminal: Akuvox A05C (or A05/A05S)

The terminal handles face recognition, stores up to 20,000 face templates locally, and drives the electric gate via its onboard relay. It connects to the local WiFi.

**Why Akuvox A05C and not Hikvision:**
- The Akuvox terminal is designed from the ground up for third-party integration. It calls *your* server URL whenever a face is scanned, and accepts the server's reply as the authorization decision. This pattern (called **Remote Verification**) means no local bridge hardware is needed.
- It has an HTTP API for outbound commands. Configuration via web browser, well-documented, supported by an active community.
- Hardware cost is roughly half of comparable Hikvision units.
- Standard protocols (HTTP, ONVIF, Wiegand). Not locked into a proprietary stack.

### How the terminal talks to Firebase (no local bridge)

There are two communication directions, handled differently:

**Inbound (face scan → decision):**
1. Kid stands in front of the Akuvox. Terminal recognizes the face.
2. Terminal POSTs to a Firebase Cloud Function URL (the "Remote Verification" endpoint), with the FaceID and event data, over HTTPS, over the internet.
3. Cloud Function checks Firestore: kid blocked? capacity full? subscription valid? approval required?
4. Cloud Function replies to the terminal with a JSON decision: `allow` / `deny` / `wait_for_staff`.
5. Terminal acts on the reply: opens the gate, displays a message, or holds and waits.

This pattern means **the terminal never needs to be reachable from the public internet**. The terminal initiates all internet traffic. No port forwarding on the router. No bridge.

**Outbound (tablet → terminal commands):**
For commands from a tablet to the Akuvox (manual gate override, face enrollment, configuration), the tablet calls the Akuvox HTTP API on the **local network** — the tablet and the Akuvox are on the same WiFi, so this is a direct local HTTP call. No internet involved.

For approval-queue decisions (Tablet A approves a kid waiting at the gate): when staff approves, the tablet writes the decision to Firestore *and* directly tells the Akuvox to open the gate (local HTTP call). The Cloud Function does not need to call back into the terminal — the tablet handles it.

### Internet outage behavior

**Internet up (normal operation):**
- Akuvox calls Cloud Function on every face. Smart decisions with full system context.
- Tablets read and write Firestore in real time.
- Everything works as designed.

**Internet down:**
- Akuvox cannot reach the Cloud Function. It falls back to its **local face database** (configured during setup). It opens the gate for any face stored locally as authorized. No block check, no capacity check, no subscription check.
- Tablets keep working through Firebase's offline persistence: reads served from local cache, writes queued locally, sync resumes when internet returns.
- Staff can still operate manually (search a kid in the cached list, "check in" — write queues locally, terminal can be told to open the gate via local WiFi from the tablet).

**When internet returns:**
- Tablets sync their queued writes automatically.
- Akuvox events that occurred during the outage are stored in the terminal's local event log (50,000 capacity per spec). A Cloud Function pulls these via the Akuvox HTTP API and reconciles them into Firestore (creates missing session records, audits any "should not have been allowed" entries — e.g. blocked kids who got in via local fallback). Reconciliation is logged and any anomalies surface on the admin dashboard for staff review.

**Pilot test required:** The exact behavior of the terminal during internet outage and the format of the locally-logged events must be confirmed on a real Akuvox unit before the reconciliation logic is finalized. This is a known unknown — see §18.

### Local network topology

Internet is **optional and intermittent**. The local WiFi router is **always on**. Tablets and the Akuvox keep working offline as described above; Firestore syncs automatically when internet returns.

```
Internet (intermittent)
       │
   WiFi router (local, always-on)
       ├── Tablet A (primary)
       ├── Tablet B (secondary)
       ├── TV display
       └── Akuvox A05C (face terminal)
```

### Hardware purchase plan

| Hardware | When |
|---|---|
| Tablet A (Samsung Galaxy Tab A9+ 11") | Early — used during build for testing |
| Tablet B (Samsung Galaxy Tab A9+ 11") | Early — used for multi-device sync testing |
| TV display (43"+ HDMI) | Early |
| Streaming stick or mini-PC for TV | Early |
| WiFi router | Early |
| Akuvox A05C face terminal | When integration phase begins |
| Electric door strike or magnetic lock | With Akuvox |
| 12V power supply for door strike (if not bundled) | With Akuvox |

### Why NOT alternatives (for the record)
- **IndexedDB-only:** No multi-device, single point of failure. Rejected.
- **Supabase:** Excellent SQL, but offline-first requires custom code Firebase gives for free. Rejected.
- **Self-hosted (PocketBase, Appwrite):** Requires ops capacity Rafic does not have. Rejected.
- **Local server / mini-PC as the brain:** Fully on-prem architecture with cloud only for backup. Rejected — adds sysadmin burden, single point of failure, harder multi-tenant rollout. Cloud-first with the terminal's local face DB as offline fallback covers Aquaria's needs.
- **Native Android APK for tablets:** Locks us to Android, requires per-device reinstalls on update, slows iteration. The web app updates instantly on every device when we push to GitHub. Rejected for the staff UI.
- **Hikvision DS-K1T681 + Raspberry Pi bridge:** Was the v6.0 / v6.1 plan. Replaced by Akuvox in v6.2 because: Akuvox has built-in Remote Verification (no bridge needed), is roughly half the price, and is designed for third-party integration where Hikvision's ISAPI is afterthought-grade.

---
## 3. Data Architecture

### Multi-tenant from day one

Every record in every Firestore collection is scoped under a tenant. The structure:

```
/tenants/{tenantId}/
    kids/{kidId}
    kids/{kidId}/tickets/{ticketId}     ← OneTime tickets (sub-collection)
    sessions/{sessionId}
    subscriptions/{subId}
    users/{userId}                       ← staff accounts
    audit/{logId}
    voids/{voidId}
    schools/{schoolId}
    grades/{gradeId}
    loyaltyLedger/{ledgerId}
    sessionTypes/{typeId}
    subscriptionModels/{modelId}
    bundles/{bundleId}
    rewards/{rewardId}
    spinWheel/{wheelId}
    whatsappTemplates/{templateId}
    specialEvents/{eventId}
    rushHourRules/{ruleId}
    terminalEvents/{eventId}
    approvalQueue/{approvalId}
    financialEvents/{finId}
    giftEvents/{giftId}
    whatsappQueue/{messageId}
    settings/{settingKey}
    aggregates/{aggregateKey}            ← denormalized counters
    errors/{errorId}                     ← runtime error log
    editLocks/{kidId}                    ← see §13 (edit locks)
    _meta/schemaVersion                  ← schema version document
    _meta/terminalHeartbeat              ← Akuvox reachability (last event received OR last successful local ping)
    _meta/tabletAHeartbeat
    _meta/tabletBHeartbeat
```

For Aquaria, `tenantId = "aquaria"` (hardcoded for the first deployment). Future tenants get auto-generated UUIDs.

### Common fields on every document

```
TenantID:    string  (always present, even though path encodes it)
CreatedAt:   timestamp
UpdatedAt:   timestamp
CreatedBy:   string  (UserID of staff who created)
UpdatedBy:   string  (UserID of staff who last modified)
Deleted:     boolean (default false)
DeletedAt:   timestamp (null unless deleted)
DeletedBy:   string   (null unless deleted)
```

**Soft deletes only.** No document is ever hard-deleted. Deletion sets `Deleted: true`. Admin panel "Show deleted" toggle reveals them. Restoration is one click.

### Concurrency rule (important)

When updating any existing document, **always use Firestore's `updateDoc`, never `setDoc`.** `setDoc` replaces the whole document and can wipe fields written by another session. `updateDoc` modifies only the fields you specify and is safe for concurrent edits. (Edit locks per §13 prevent most concurrent-edit cases anyway, but this rule applies everywhere.)

### Schema versioning

A `/tenants/{tenantId}/_meta/schemaVersion` document stores the current schema version (integer). The frontend reads this on app start. If the app's compiled-in `SCHEMA_VERSION` constant is **lower** than the stored version, the app refuses to perform writes and shows: *"Please refresh the page to load the latest version."* This prevents an offline tablet from writing old-shape data after a migration has run.

Migrations are run by Cloud Functions. They are:
- **Idempotent** — running them twice does not corrupt data.
- **Logged** to audit (`migration_run`).
- **Non-destructive** — fields are added or transformed, never silently dropped.
- **Run during off-hours only** — production deploys never happen during open hours (§24), so migrations don't either.

### Money handling

All prices stored as **integer minor units (cents).** Never floats. Aquaria charges in **USD only** — no LBP, no dual pricing, no conversion at point-of-sale.

- `$5.00` is stored as `500`.
- `$12.50` is stored as `1250`.

A helper `formatPrice(amount)` converts for display. `currency` is always `"USD"`; `currencyMinorUnits` is always `100`.

### Photo handling

Photos live in Firebase Storage at `/tenants/{tenantId}/kids/{kidId}/photo.jpg`.
The kid document stores `PhotoURL` and `PhotoStoragePath`. Never base64 inlined.
A Cloud Function trigger resizes uploads to 800×800 max and generates a 200×200 thumbnail.

### Real-time listener discipline

Listeners cost reads and bandwidth. Rules:
- A page activates only the listeners it currently displays.
- When the user navigates away, listeners detach.
- The TV display listens only to: currently-inside kids, Hall of Fame, today's birthdays, today's events, settings. Nothing else.
- Reports use one-shot fetches (`getDocs`), not listeners.
- **Aggregate counts are never computed at runtime** — denormalized aggregates (below) are read instead.

### Aggregates (denormalized counters)

To avoid expensive queries, these aggregate docs are maintained:
- `aggregates/insideCount` — kids currently inside.
- `aggregates/dailyStats/{YYYY-MM-DD}` — visits, unique kids, revenue today.
- `aggregates/monthlyStats/{YYYY-MM}` — used by Hall of Fame.
- `aggregates/peakConcurrent/{YYYY-MM-DD}` — peak inside today.

All aggregates updated atomically inside the transaction that changes the source data.

**Scale note:** `aggregates/insideCount` is a single hot document. Firestore's soft limit is roughly 1 write per second per document. At Aquaria scale this is comfortable. If a future tenant needs higher concurrency, switch to a sharded counter pattern. Architecture decision deferred to Stage 4.

### Internationalization

Every user-facing string lives in `/src/strings/{en,ar,fr}.js`. No hardcoded strings in business logic. The `language` setting determines which is loaded. Default for Aquaria: English.

---

## 4. Configuration Constants

```javascript
const APP_VERSION                = '6.2.0';
const SCHEMA_VERSION             = 1;
const FIREBASE_PROJECT_ID_DEV    = 'aquaria-dev';
const FIREBASE_PROJECT_ID_PROD   = 'aquaria-prod';
const TENANT_ID                  = 'aquaria';     // hardcoded for first deployment
const DEFAULT_SESSION_MINUTES    = 120;           // fallback only when zero session types exist
const STAFF_LOGIN_HOURS          = 8;             // session length before re-auth required
```

Note: there is no `SECRET_SALT` (Firebase Auth handles password hashing) and no `DB_NAME` for IndexedDB (Firebase manages the offline cache automatically).

---

## 5. Tenant Settings (SuperAdmin configurable)

Stored as one document per setting key under `/tenants/{tenantId}/settings/`.

### Identity
| Key | Default | Description |
|---|---|---|
| `playgroundName` | "Aquaria" | Displayed everywhere |
| `playgroundLogo` | (storage path) | Logo image |
| `currency` | "USD" | Always USD at v6.2 |
| `currencyMinorUnits` | 100 | Always 100 at v6.2 |
| `countryCode` | "+961" | Default phone country code |
| `language` | "en" | UI language (en / ar / fr) |
| `timezone` | "Asia/Beirut" | Playground timezone |
| `tabletMode` | "production" | production / training (see §22) |

### Capacity
| Key | Default | Description |
|---|---|---|
| `maxCapacity` | null | Max kids inside; `null` = no limit (never use sentinel numbers like 999) |

### Loyalty
| Key | Default | Description |
|---|---|---|
| `pointsPerMinute` | 60 | Minutes of ticket duration per loyalty point |
| `surpriseBonusFrequency` | 50 | Every Nth check-in earns a bonus |
| `surpriseBonusPoints` | 10 | Bonus point value |
| `streakBonusPoints` | 5 | Points awarded for a 5-open-day streak |
| `loyaltyMonthlyBadge` | true | Award "Loyal Visitor" badge for monthly perfect attendance |
| `checkInCounterTotal` | 0 | Running counter for surprise bonus trigger; never resets |

### Weekly reset
| Key | Default | Description |
|---|---|---|
| `weeklyResetDay` | "Monday" | Day weekly counters reset |
| `weeklyResetHour` | 4 | Hour of reset (24h, dead zone) |

### Approval flow (consolidated)
| Key | Default | Description |
|---|---|---|
| `requireStaffApproval` | true | Every entry requires staff approval |
| `approvalModalTimeoutSeconds` | 60 | Time before the approval modal auto-closes (claim still held) |
| `approvalClaimExpirySeconds` | 180 | Time before a claim auto-releases for re-grab |
| `approvalReassignToBSeconds` | 10 | Time Tablet B has to accept a re-routed registration |
| `approvalMaxHoldSeconds` | 120 | Max time on Hold before auto-deny |
| `approvalMaxRetriesToB` | 2 | Max times Tablet A can re-route to Tablet B per approval |

### Edit locks
| Key | Default | Description |
|---|---|---|
| `editLockInactivitySeconds` | 60 | Seconds of no field change before warning |
| `editLockWarningSeconds` | 15 | Countdown before auto-exit |

### Tickets / subscriptions
| Key | Default | Description |
|---|---|---|
| `oneTimeTicketExpiryMonths` | 6 | OneTime tickets expire this many months after acquisition |
| `subscriptionExpiringWarningDays` | 3 | Warn when subscription within N days of expiry |
| `inactivityReminderDays` | 7 | Days inactive before re-engagement WhatsApp |
| `lowBundleVisitsThreshold` | 2 | WhatsApp when remaining visits drop to this number |

### Sibling gifting
| Key | Default | Description |
|---|---|---|
| `allowSiblingGifting` | true | Sibling gifting enabled |

### Birthdays
| Key | Default | Description |
|---|---|---|
| `autoUnblockBirthdayDaysAhead` | 7 | Auto-unblock blocked kids N days before birthday (0 = disabled) |

### Hardware (Akuvox face terminal)
| Key | Default | Description |
|---|---|---|
| `terminalIPAddress` | "" | Local IP of the Akuvox A05C on the WiFi network |
| `terminalHttpUsername` | "admin" | Username for Akuvox HTTP API (set during onboarding) |
| `terminalHttpPassword` | (encrypted) | Password for Akuvox HTTP API (encrypted at rest) |
| `terminalActionUrl` | (auto) | The Cloud Function URL the Akuvox calls for Remote Verification (configured into the terminal during onboarding) |
| `terminalSharedSecret` | (encrypted) | HMAC secret used to authenticate inbound requests from the Akuvox to the Cloud Function |
| `terminalHeartbeatToleranceSeconds` | 90 | Terminal considered offline if no event received AND no successful local ping in this many seconds |
| `terminalLocalPingIntervalSeconds` | 60 | How often Tablet A pings the Akuvox local IP to confirm reachability |
| `terminalOfflineFallback` | "local_db" | What the terminal does when it cannot reach the Cloud Function. `local_db` = open gate for any locally-recognized face. `deny_all` = reject all entries until internet returns. (Configured on the terminal itself; this setting documents the choice.) |
| `tabletHeartbeatToleranceSeconds` | 30 | Tablet considered offline if heartbeat older than this |
| `gateOpenSeconds` | 3 | Gate open duration per authorization |
| `antiTailgateCooldown` | 5 | Seconds before terminal accepts next face |

### Display
| Key | Default | Description |
|---|---|---|
| `tvDisplayShowFullNames` | "first_only" | full / first_only / hidden — privacy default on TV |
| `tvDisplayShowPhotos` | true | Show kid photos on TV |
| `ratingRequestDelayMinutes` | 120 | Minutes after checkout to send rating request |

### Owner alerts
| Key | Default | Description |
|---|---|---|
| `ownerPhone` | "" | The playground's official WhatsApp number for alerts |
| `ownerAlertCapacity80` | true | Alert when 80% full |
| `ownerAlertBlockedAttempt` | true | Alert on blocked kid attempt |
| `ownerAlertDailySummary` | true | Send daily summary at end of day |
| `ownerAlertBackupFailed` | true | Alert if integrity check fails |

---

## 6. Roles and Permissions

### Three roles

**Operator**
- Check in / check out
- Register kid
- Approve / deny entries from approval queue
- View dashboard (live kids, capacity, queue)
- Search kids
- Send queued WhatsApp messages

**Admin** (Operator + the following)
- All Kids page with filters
- Reports (attendance, subscription health, birthdays, revenue, daily summary)
- Void sessions (with reason)
- Block / unblock kids (with reason)
- View audit log, void log
- Manual gate override (with reason)
- Emergency controls (lock all gates, evacuate, alarm)

**SuperAdmin** (Admin + the following)
- Admin Panel — all configuration
- All exports (CSV)
- Toggle `PermanentBlock` flag on kids
- Manage all tenant settings
- Manage staff accounts (create, deactivate)
- All catalog management (session types, subscription models, bundles, rewards, spin wheel, WhatsApp templates, special events, rush hour rules, schools, grades)
- View `financialEvents` ledger
- Onboarding wizard (for fresh installs)
- View `errors` collection

### Enforcement

Permissions are enforced in **three places**:
1. **Frontend UI** — hides what the user cannot do.
2. **Backend code** — action handlers verify role before executing.
3. **Firestore Security Rules** — the real backstop. Even if UI and backend code have bugs, the database refuses unauthorized writes.

All three are required. UI alone is theater.

---

## 7. Data Models — Core Entities

All documents include the common fields from §3 unless otherwise noted.

### Kid (`/tenants/{tenantId}/kids/{kidId}`)

```
KidID:                  string (auto-generated)
FirstName:              string (required)
LastName:               string (required)
FullName:               string (computed, denormalized for search)
DateOfBirth:            timestamp (required)
Gender:                 "Male" | "Female" (required, no other values)
School:                 string (references schools collection)
Grade:                  string (references grades collection)
Address:                string
ParentName:             string (required)
Phone:                  string (E.164 format, leading 0 stripped, country code prepended)
EmergencyContact:       string (E.164)
Notes:                  string

Status:                 "Active" | "Blocked" (default Active)
PermanentBlock:         boolean (default false; SuperAdmin only)
BlockHistory:           array of { blockedAt, blockedBy, reason,
                                   unblockedAt, unblockedBy, unblockReason }

PhotoURL:               string
PhotoStoragePath:       string
PhotoThumbnailURL:      string
FaceID:                 string (terminal-side template ID, set at face enrollment)

FamilyID:               string | null (shared with siblings)

LoyaltyPoints:          integer (current balance, denormalized from ledger sum)
LoyaltyLevel:           "Bronze" | "Silver" | "Gold" | "Diamond" (denormalized)
TotalVisits:            integer (lifetime, denormalized)
VisitsThisMonth:        integer (denormalized, reset monthly)
LastVisit:              timestamp | null
StreakDays:             integer (consecutive open-day visits, denormalized)

DisplayOnPublicScreen:  "full" | "first_only" | "hidden" (default first_only)
```

OneTime tickets are **not** stored on the kid document. They live in a sub-collection (below).

### OneTime tickets sub-collection (`/tenants/{tenantId}/kids/{kidId}/tickets/{ticketId}`)

One document per OneTime ticket the kid currently owns. This used to be an array on the kid document in v6.0; promoted to a sub-collection in v6.1 because arrays of objects are awkward to mutate atomically and OneTime tickets are gifted, won, voided, and consumed frequently.

```
TicketID:               string
SessionTypeID:          string (which session type this ticket grants)
Source:                 "purchased" | "gifted" | "spin" | "redemption" | "reward" | "void_refund"
SourceReference:        string (related KidID for gifts, SpinID for spins, etc.)
AcquiredAt:             timestamp
ExpiresAt:              timestamp (AcquiredAt + oneTimeTicketExpiryMonths)
Consumed:               boolean (default false)
ConsumedAt:             timestamp | null
ConsumedSessionID:      string | null
```

A ticket is **usable** when `Consumed = false` AND `ExpiresAt > now`. Cloud Function runs daily to flip expired tickets to a tombstone state (sets `Consumed = true` with marker `ConsumedSessionID = "expired"`) so they don't appear in queries.

### Subscription (`/tenants/{tenantId}/subscriptions/{subId}`)

A subscription instance — links a kid to a Monthly model OR a Bundle.

```
SubID:               string
KidID:               string (indexed)
Type:                "Monthly" | "Bundle"
ModelID:             string (references subscriptionModels OR bundles depending on Type)
StartDate:           timestamp
EndDate:             timestamp
PricePaid:           integer (minor units)

// Monthly only
VisitsThisWeek:      integer
WeekStartDate:       timestamp

// Bundle only
TotalVisits:         integer (snapshot of bundle TotalVisits at purchase)
RemainingVisits:     integer
ValidityEnd:         timestamp (= StartDate + ValidityMonths)
```

**No `Status` field.** Subscription "active" status is computed live from `EndDate > now` (Monthly) or `RemainingVisits > 0 AND ValidityEnd > now` (Bundle). A daily Cloud Function may write a denormalized `IsActive` flag for query convenience, but the live conditions are the source of truth at check-in. (This was a v6.0 source of bugs.)

### Session (`/tenants/{tenantId}/sessions/{sessionId}`)

One playtime visit. Created on check-in, finalized on check-out or void.

```
SessionID:           string
KidID:               string (indexed)
Date:                string (YYYY-MM-DD, indexed)
CheckInTime:         timestamp
CheckOutTime:        timestamp | null
DurationMinutes:     integer (locked at check-in)
SessionTypeID:       string | null
SubID:               string | null
TicketID:            string | null (if consumed from OneTime)
ConsumedFrom:        "OneTime" | "Monthly" | "Bundle"
PricePaid:           integer (minor units, with rush hour applied if active)
RushHourRuleApplied: string | null
SpecialEventID:      string | null

PointsAwarded:       integer (locked at check-in)
LoyaltyLedgerID:     string

ApprovedBy:          string (UserID)
CheckedOutBy:        string | null

Voided:              boolean (default false)
VoidedAt:            timestamp | null
VoidedBy:            string | null
VoidReason:          string | null
```

### Loyalty Ledger (`/tenants/{tenantId}/loyaltyLedger/{ledgerId}`)

Append-only. Sum of all entries for a KidID = current `LoyaltyPoints`.

```
LedgerID:    string
KidID:       string (indexed)
Timestamp:   timestamp
Type:        "earned" | "redeemed" | "spin_cost" | "spin_refund" |
             "void_reversal" | "surprise_bonus" | "streak_bonus" |
             "manual_adjustment"
Points:      integer (positive or negative)
Balance:     integer (running balance after this entry, for audit)
Reference:   string (SessionID, SpinID, RewardID, etc.)
Description: string
```

### Financial Events (`/tenants/{tenantId}/financialEvents/{finId}`)

Append-only. Source of truth for revenue reports.

```
FinID:      string
Timestamp:  timestamp
Type:       "ticket_sold" | "subscription_purchased" | "bundle_sold" |
            "renewal" | "void_refund" | "reward_redemption" |
            "spin_cost" | "discount_applied"
KidID:      string
Amount:     integer (minor units, can be negative)
Currency:   "USD" (always)
Reference:  string (SubID, SessionID, etc.)
StaffID:    string (who processed)
Notes:      string
```

Note: gifts are **not** financial events — no money changes hands. Gifts go to `giftEvents`.

### Approval Queue (`/tenants/{tenantId}/approvalQueue/{approvalId}`)

Real-time queue of entries awaiting staff decision. Multi-tablet collaboration depends on this collection.

```
ApprovalID:       string
Timestamp:        timestamp
KidID:            string | null (null for new unrecognized faces)
PhotoSnapshot:    string (URL to terminal-captured photo, for unknown faces)
Scenario:         number (which entry scenario triggered this — see §17)
TerminalEventID:  string

RoutedTo:         "A" | "B" | "either"  (current target tablet)
RouteHistory:     array of { tablet, sentAt, outcome }
                  outcomes: "claimed" | "dismissed" | "timed_out"
RetriesToB:       integer (default 0; capped by approvalMaxRetriesToB)

ClaimedBy:        string | null (UserID; null = unclaimed)
ClaimedAt:        timestamp | null
ClaimExpiresAt:   timestamp | null

Status:           "Pending" | "Claimed" | "Approved" | "Denied" | "Held" | "Expired"
DecidedAt:        timestamp | null
DecidedBy:        string | null
DecisionReason:   string (required for "Denied")
HoldStartedAt:    timestamp | null
Notes:            string
```

The full lifecycle and routing rules are in §16.

### Gift Events (`/tenants/{tenantId}/giftEvents/{giftId}`)

```
GiftID:          string
Timestamp:       timestamp
FromKidID:       string
ToKidID:         string
FamilyID:        string (verified at time of gift)
GiftType:        "bundle_visit" | "onetime_ticket"
SourceBundleID:  string | null
SourceTicketID:  string | null
NewTicketID:     string (the ticket created on the recipient)
Quantity:        integer (always 1)
ApprovedBy:      string (staff who processed)
Notes:           string
```

### WhatsApp Queue (`/tenants/{tenantId}/whatsappQueue/{messageId}`)

```
MessageID:       string
Timestamp:       timestamp (when added to queue)
SendAt:          timestamp (when it should appear to staff — may be future)
Status:          "Pending" | "Sent" | "Cancelled"
TriggerType:     string
TemplateID:      string
KidID:           string
RecipientPhone:  string (E.164)
RenderedMessage: string (template variables resolved)
SentAt:          timestamp | null
SentBy:          string | null
```

### Terminal Events (`/tenants/{tenantId}/terminalEvents/{eventId}`)

Every face scan and gate event from the Akuvox terminal. Events are written by the Cloud Function that receives them; events that occurred during internet outage are reconciled into Firestore when connectivity returns (see §18).

```
EventID:     string
Timestamp:   timestamp
EventType:   "face_scan" | "gate_opened" | "gate_locked" |
             "face_enrolled" | "manual_override" | "emergency_lock" |
             "offline_recovered"
KidID:       string | null
FaceID:      string | null
Scenario:    number (1 through 11, see §17)
Action:      "allowed" | "denied" | "awaiting_approval" | "queued"
OccurredOnline: boolean (false if reconciled from terminal local log after outage)
Details:     object (scenario-specific)
ApprovedBy:  string | null
```

### Errors (`/tenants/{tenantId}/errors/{errorId}`)

Runtime errors caught in the frontend or Cloud Functions. Visible in the Admin Panel under "Errors" (§24). Used by Rafic and Claude for debugging across sessions.

```
ErrorID:    string
Timestamp:  timestamp
Source:     "frontend" | "cloud_function"
Page:       string (URL hash or function name)
UserID:     string | null
Action:     string (what the user was doing)
Message:    string (error message)
Stack:      string (truncated stack trace)
Context:    object (relevant IDs, state)
```

### Edit Locks (`/tenants/{tenantId}/editLocks/{kidId}`)

One document per kid currently being edited. See §13 for the protocol.

```
KidID:           string (= document ID)
LockedBy:        string (UserID)
LockedByName:    string (display)
LockedAt:        timestamp
LastActivityAt:  timestamp (touched on every keystroke)
ExpiresAt:       timestamp (LastActivityAt + editLockInactivitySeconds)
```

Document is deleted when the user saves, cancels, or is auto-exited.

---
## 8. Catalogs (SuperAdmin configurable)

All catalogs include the common fields from §3.

### Session Types (`sessionTypes/`)

```
SessionTypeID:    string
Name:             string ("Standard", "Half Hour", "VIP Extended")
DurationMinutes:  integer
Price:            integer (minor units)
Active:           boolean
DisplayOrder:     integer
```

### Subscription Models (`subscriptionModels/`)

```
ModelID:          string
Name:             string
DurationMonths:   integer
VisitsPerWeek:    integer (7 = unlimited)
MinutesPerVisit:  integer
Price:            integer (minor units, total)
Active:           boolean
DisplayOrder:     integer
```

### Bundles (`bundles/`)

```
BundleID:         string
Name:             string
TotalVisits:      integer
ValidityMonths:   integer
MinutesPerVisit:  integer
Price:            integer (minor units, total)
Active:           boolean
DisplayOrder:     integer
```

### Rewards (`rewards/`)

```
RewardID:     string
Name:         string
PointsCost:   integer
RewardType:   "freeOneTime" | "freeMonthly" | "freeBundle" |
              "bonusPoints" | "discount" | "extraMinutes"
RewardValue:  object (depends on RewardType)
Active:       boolean
DisplayOrder: integer
```

### Spin Wheel (`spinWheel/main`)

Single document per wheel. Only one active wheel at v6.2.

```
WheelID:              string ("main")
CostPerSpin:          integer (points)
RefundOnNothing:      boolean
NothingRefundPoints:  integer (points actually charged on "nothing")
Slices:               array of { label, prizeType, prizeValue, weight }
                      weights sum to 100
                      prizeType: same as RewardType, plus "nothing"
Active:               boolean
```

### WhatsApp Templates (`whatsappTemplates/`)

```
TemplateID:    string
Name:          string (internal label)
Trigger:       "after_checkout" | "subscription_inactive" |
               "subscription_expiring" | "birthday" | "after_registration" |
               "reward_redeemed" | "spin_win" | "low_bundle_visits" |
               "block_lifted_birthday" | "gift_received"
Message:       string (variables: {KidName}, {ParentName}, {PlaygroundName},
                       {RewardName}, {SubscriptionName}, {DaysLeft},
                       {Points}, {SiblingNames})
DelayMinutes:  integer (0 = immediate)
Active:        boolean
```

### Special Events (`specialEvents/`)

```
EventID:           string
Name:              string
Date:              timestamp (specific date)
Description:       string
CapacityOverride:  integer | null
TicketPricing:     object | null (overrides session type prices for this day)
ThemeColor:        string (hex)
TerminalMessage:   string (custom welcome)
Active:            boolean
```

### Rush Hour Rules (`rushHourRules/`)

```
RuleID:           string
Name:             string ("Off-Peak Weekday")
Days:             array of "Mon" | "Tue" | ... | "Sun"
HoursFrom:        string ("HH:MM")
HoursTo:          string ("HH:MM")
DiscountPercent:  integer (1–99, only discounts, never surcharges)
AppliesTo:        array of "OneTime" | "Bundle"  (never Monthly)
Active:           boolean
```

### Staff Users (`users/`)

Linked to Firebase Auth users by `AuthUID`.

```
UserID:    string (= Firebase Auth UID)
Username:  string (display name)
Email:     string (login)
Role:      "Operator" | "Admin" | "SuperAdmin"
Active:    boolean (deactivated, never deleted)
LastLogin: timestamp
```

### Schools and Grades

Simple collections — `SchoolName`, `Active`, common fields. Same shape for `GradeLabel`.

---

## 9. Business Rules — Tickets, Subscriptions, Bundles

### 9.1 Three ways to enter

- **OneTime ticket** — pay-per-visit. Owned in the kid's `tickets` sub-collection. **Expires 6 months after acquisition** (`oneTimeTicketExpiryMonths`).
- **Monthly subscription** — time-bounded plan with weekly visit limit.
- **Bundle** — pre-paid pack of visits, valid for a time window.

### 9.2 Configurability

All three are SuperAdmin-defined catalogs. If only one type exists, it auto-selects. If multiple, staff chooses at point-of-sale or check-in.

`DEFAULT_SESSION_MINUTES` (120) is used **only** if zero session types are configured (fresh-install edge case). Once any session type exists, duration always comes from the chosen type.

### 9.3 What "active" means

- A **Monthly** is active when `EndDate > now`.
- A **Bundle** is active when `RemainingVisits > 0` AND `ValidityEnd > now`. **Whichever runs out first kills the bundle.** A bundle with 5 visits left but expired validity is unusable. A bundle within validity but with 0 visits is unusable.
- A **OneTime ticket** is active when `Consumed = false` AND `ExpiresAt > now`.

These are the live conditions checked at every check-in. There is no `Status` field that needs to be in sync — the conditions are the truth.

### 9.4 Subscription priority at check-in

When a kid has multiple options, consume in this order:

1. **Monthly** (active, weekly limit not reached)
2. **Bundle** (active per 9.3)
3. **OneTime** (last — preserve countable assets)

Rationale: time-bounded resources are consumed before countable ones. Monthly and Bundle expire whether used or not. OneTime expires too (6 months) but lasts longer.

### 9.5 Mutual exclusion: OneTime + Subscription

A kid **cannot purchase** a OneTime ticket while holding an active Monthly or unexhausted Bundle. The point-of-sale UI blocks this.

A kid **CAN own** a OneTime ticket alongside a subscription if it was acquired through:
- Spin wheel win
- Loyalty reward redemption
- Reward grant by staff

Sibling gifting has its own rules (§9.7).

When both exist at check-in, Monthly/Bundle is consumed first per 9.4. OneTime remains in the sub-collection, ticking toward expiry.

### 9.6 Check-in evaluation order (the algorithm)

When a face is recognized OR a manual check-in is initiated, evaluate in this exact order:

1. **Permanent block?** → Scenario 11 (deny, discreet, permanent record)
2. **Blocked?** → Scenario 5 (deny, discreet)
3. **Already inside?** (open session, not checked out) → Scenario 2
4. **At max capacity?** → Scenario 10 (deny, "we're full")
5. **No active ticket / sub?** → Scenario 4 (deny, prompt staff)
6. **Subscription expiring within `subscriptionExpiringWarningDays`?** → flag (Scenario 8) but allow
7. **Determine consumption source per 9.4:**
   - Monthly: weekly limit reached? → check fallback (Bundle, then OneTime). If no fallback → Scenario 7
   - Bundle: exhausted? → check fallback. If no fallback → Scenario 4
   - OneTime: consume the oldest non-expired ticket (FIFO so the closest-to-expiry is used first)
8. **`requireStaffApproval = true`?** → Scenario 1a (queue, await decision)
9. **Approved (or auto-approve disabled):**
   - Create session record (lock duration, lock points, lock price)
   - Decrement bundle visits / increment weekly counter / mark ticket consumed
   - Append loyalty ledger entry for points earned
   - Append `financialEvents` entry (only if money was paid — gifted/redeemed sessions skip this)
   - Increment `aggregates/insideCount`
   - Append `audit` entry
   - Append `terminalEvents` entry
   - Open gate — for face-scan flow, by the Cloud Function's reply to the Akuvox; for tablet-initiated check-in, by the tablet calling Akuvox HTTP API on the local network
   - Show green screen + TTS welcome (on the terminal)
   - Trigger surprise bonus if `checkInCounterTotal % surpriseBonusFrequency === 0`
   - Trigger birthday flow if today = DOB (free spin per §10)

All steps run in a single Firestore transaction where possible. Partial failures roll back.

### 9.7 Sibling gifting

Allowed when `allowSiblingGifting = true`.

**Eligibility (both directions):**
- Sender and recipient must share `FamilyID`.
- Both must be Active (not Blocked, not PermanentBlocked).
- **The recipient must have NO active Monthly AND NO unexhausted Bundle.** This prevents stale gifts from accumulating on kids who don't need them.
- Sender must own the gift (a Bundle with `RemainingVisits > 0` for a bundle visit, or a non-expired OneTime ticket for a ticket gift).

**Gift flow (Bundle visit):**
1. Staff opens sender's profile → "Gift 1 visit to [sibling]" button visible if eligibility above is met.
2. Confirmation modal — "Confirm: gifting 1 visit from Rami's [Bundle Name] to Maya?"
3. On confirm, in a single transaction:
   - Sender's Bundle: `RemainingVisits -= 1`
   - New ticket created in recipient's `tickets/` sub-collection: `Source: "gifted"`, `SourceReference: senderKidID`, `ExpiresAt: AcquiredAt + oneTimeTicketExpiryMonths`
   - `giftEvents` entry appended
   - `audit` entry appended
   - `gift_received` WhatsApp queued

**Gift flow (OneTime ticket):**
Same flow. Sender's ticket gets `Consumed = true` with marker `ConsumedSessionID = "gifted_to_<recipientKidID>"`. Recipient gets a new ticket with fresh `ExpiresAt`. (Resetting the clock is intentional — gifts are kindnesses, not stale-asset transfers.)

**Rules:**
- Only same-FamilyID kids can gift.
- One unit per gift action (no bulk).
- Monthly subscriptions cannot be gifted (time-based, not countable).
- Loyalty points cannot be gifted (individual, not pooled).
- Recipient earns loyalty points on use (they're playing, they earn).
- Blocked or PermanentBlocked kids cannot send or receive gifts.

### 9.8 Voids

Voiding a session, in a single transaction:
- Subtracts the original `PointsAwarded` from the loyalty ledger (negative entry, type `void_reversal`). Loyalty balance floored at 0 — never goes negative.
- If the session consumed a Bundle visit: refunds it (`RemainingVisits += 1`) — **only if the bundle is still within validity**. If the bundle expired since, the visit is lost (cannot revive an expired bundle).
- If the session consumed Monthly: decrements `VisitsThisWeek`.
- If the session consumed OneTime: creates a new ticket in the kid's `tickets/` sub-collection with `Source: "void_refund"` and `ExpiresAt = now + oneTimeTicketExpiryMonths` (fresh clock).
- Appends a negative `financialEvents` entry of equal magnitude.
- Decrements `aggregates/insideCount` (only if the session was still open).
- Appends a `voids` entry with reason (free text, required).

The original session record is **never modified**. The `Voided: true` flag is set; the original financial event is preserved and the void is a separate negative entry.

### 9.9 Weekly reset (lazy + cron)

A Cloud Function runs every Monday at `weeklyResetHour` (default 04:00, in the tenant's timezone) and resets `VisitsThisWeek = 0` for all active Monthly subscriptions, updating `WeekStartDate`.

**Defensive lazy check:** at every check-in, if the Monthly's `WeekStartDate` is more than 7 days old, reset `VisitsThisWeek = 0` and `WeekStartDate = now` *before* incrementing. This protects against the cron failing or the playground being closed during reset hour.

---

## 10. Loyalty System

### Earning

Points awarded at **check-in time**, based on **ticket duration**:

```
points = floor(durationMinutes / pointsPerMinute)
```

Default `pointsPerMinute = 60` → 1 point per hour of ticket duration.

Points are based on what the kid bought, not what they used. A 120-min ticket awards 2 points whether the kid stays 30 minutes or the full 120.

Points stored on the session record at award time. Never recomputed.

### Levels

- 🥉 Bronze — 0–20 points
- 🥈 Silver — 21–50 points
- 🥇 Gold — 51–99 points
- 💎 Diamond — 100+ points

`LoyaltyLevel` is denormalized on the kid document, recomputed when `LoyaltyPoints` changes (within the same transaction).

### Streaks

- 5 consecutive **open days** (closed days don't break it) → `streakBonusPoints` awarded.
- Visits every week of a calendar month → "Loyal Visitor" badge (if `loyaltyMonthlyBadge = true`).

`StreakDays` is denormalized on the kid document; incremented on each new-day check-in, reset on a missed open day.

### Surprise bonus

Every Nth check-in across all kids (N = `surpriseBonusFrequency`, default 50) earns the kid `surpriseBonusPoints` extra. The counter (`checkInCounterTotal`) lives in tenant settings, **never resets**, and increments transactionally on every check-in.

When `checkInCounterTotal % surpriseBonusFrequency === 0`, the terminal shows: *"🎉 Lucky visitor! You earned X bonus points!"* Speaker plays celebration sound.

### Redemption

SuperAdmin defines rewards. Staff opens a kid's profile → "Redeem Reward" → list of affordable rewards → select → confirm.

On redeem, in a single transaction:
- Loyalty ledger negative entry, type `redeemed`.
- Reward applied (subscription created, ticket added, points granted, etc.). Ticket grants get `Source: "redemption"`.
- Audit entry, financial event entry (zero-money for catalog rewards; the reward is point-priced, not USD-priced).
- `reward_redeemed` WhatsApp queued.

### Spin Wheel

Configured per `spinWheel/main`. Cost in points, slices with weights, prize types.

**Flow:**
1. Staff opens kid's profile → "Spin the Wheel".
2. Verify `LoyaltyPoints >= CostPerSpin`.
3. Deduct full cost (negative ledger entry, `spin_cost`).
4. Wheel animation (CSS) — dramatic spin, slows, lands.
5. Weighted random selection determines result.
6. **If "nothing" AND `RefundOnNothing = true`:** add positive ledger entry of `(CostPerSpin - NothingRefundPoints)` points, type `spin_refund`.
7. If prize: apply instantly (subscription, ticket with `Source: "spin"`, bonus points, etc.).
8. Confetti animation + celebration screen.
9. Audit entry includes `spinCost`, `result`, `pointsDeducted` (net), `prizeAwarded`.
10. `spin_win` WhatsApp queued (only if a prize was won).

**Birthday free spin:** On a kid's birthday, on the first **successful entry** of the day (Scenario 1, including the path 1a → 1, or Scenario 8), a free spin is automatically triggered. No points deducted. Birthday animation + happy birthday sound + spin result. Ledger entry recorded with `Description: "birthday_free_spin"` and `Points: 0`.

**Why birthday spin stays despite group-fairness concerns:** siblings will get their own birthday spins when their birthdays arrive. The asymmetry is part of celebrating individual birthdays.

---

## 11. Sibling / Family System

### FamilyID

Auto-generated when the first sibling link is established. Both kids share the FamilyID.

### Linking flows

**During registration:** "This kid has a sibling already registered" checkbox → search by name or parent phone → on match, auto-fill ParentName, Phone, EmergencyContact, Address; both share FamilyID after registration.

**After the fact (SuperAdmin):** Kid profile → "Link to sibling" → search → connect → shared FamilyID created or applied.

**Unlinking (SuperAdmin):** Removes FamilyID from one kid only. Other siblings retain the FamilyID.

### What FamilyID enables

- Search by parent phone returns all siblings.
- Check-in flow can offer "check in all siblings" shortcut.
- WhatsApp templates can reference `{SiblingNames}`.
- Sibling gifting per §9.7.
- Family group view (SuperAdmin).

Loyalty points are **never pooled** — each kid earns and spends individually.

---

## 12. Capacity Management

`maxCapacity` setting (`null` = no limit).

- At check-in step 4 (per §9.6), if `aggregates/insideCount >= maxCapacity` → Scenario 10 (deny).
- Dashboard shows `insideCount / maxCapacity` (e.g. "24 / 30").
- Amber warning at 80% capacity.
- Red banner when full.
- Wait-time estimator: average remaining duration of currently-inside kids → "Estimated next opening: ~12 min."
- Owner alert (`ownerAlertCapacity80`) WhatsApp fires once per day when 80% reached.

---

## 13. Edit Locks

When a staff member opens a kid's edit screen (or any other "important" form whose concurrent edit could lose data — kids, subscription edits, catalog item edits), the system writes a lock document to `editLocks/{kidId}` (or analogous path).

### Lock acquisition
1. Staff taps "Edit" on Kid Maya.
2. The app reads `editLocks/aquaria/maya123`.
   - If document exists and `ExpiresAt > now`: show banner *"Maya is being edited by [Other Staff]. Please wait."* — form is read-only.
   - If document exists but expired: delete it, then proceed.
   - If document does not exist: write a new lock with `LockedBy = current user`, `LockedAt = now`, `LastActivityAt = now`, `ExpiresAt = now + editLockInactivitySeconds`.
3. Lock acquisition uses a Firestore transaction so two simultaneous opens cannot both succeed.

### During edit
- Every keystroke (debounced to once per 2 seconds) updates `LastActivityAt` and pushes `ExpiresAt` forward.
- If the user idles for `editLockInactivitySeconds` (default 60): warning modal appears with `editLockWarningSeconds` countdown (default 15).
- If the warning is dismissed → activity resumes, lock extends.
- If the countdown expires → unsaved changes are discarded, the lock is released, the user is sent back to the kid's profile view.

### Lock release
- On Save: lock is released after the save commits.
- On Cancel: lock is released immediately.
- On auto-exit: lock is released, unsaved changes lost.
- On browser close / network drop: lock expires after `editLockInactivitySeconds + editLockWarningSeconds` (combined ~75 seconds at default settings). Other staff can then edit.

### What is locked

Edit locks apply to:
- Kid profile edits.
- Subscription edits (price, dates, model swap).
- Catalog edits (a SuperAdmin editing the same session type concurrently).

Edit locks do **not** apply to:
- Check-in / check-out (not editing existing data).
- Approval queue claims (claims have their own model — see §16).
- Reads of any kind.

Tunable settings:
- `editLockInactivitySeconds` (default 60)
- `editLockWarningSeconds` (default 15)

---
## 14. Rush Hour Pricing

Applies to OneTime tickets and Bundles only. Monthly subscribers unaffected.

At point-of-sale (or check-in for OneTime tickets purchased on the spot):
- The system checks current time against active rush hour rules (matching day + hour window).
- If a rule applies, the discount is applied to the price.
- The price is locked on the financial event at sale time. Never recomputed retroactively.
- If multiple rules match, the highest discount wins.

UI displays both original and discounted price (e.g. "$10 → $8").

---

## 15. Special Events

SuperAdmin creates events for specific dates with overrides:
- Capacity override.
- Custom ticket pricing (overrides session type prices for that day only).
- Theme color (terminal background).
- Custom terminal message ("Happy Halloween! 🎃").

On an event day:
- Dashboard shows event banner.
- Terminal shows themed background and message.
- Pricing automatically swaps to event pricing (with rush hour discount on top, if also configured).
- Capacity uses override if specified.

**Future feature (Stage 4):** spontaneous lottery for kids currently inside on an event day. Architecture supports this; not built in v6.2.

---

## 16. Multi-Device Architecture

### Devices

- **Tablet A** — primary. The main staff workstation. All approval requests route here first. Also acts as the **terminal pinger**: pings the Akuvox local IP every minute to confirm reachability.
- **Tablet B** — secondary. Standby and assistance.
- **TV display** — read-only kiosk.
- **Akuvox A05C** — face terminal. Talks to a Cloud Function for face-scan decisions (Remote Verification) and accepts HTTP commands from tablets on the local network.
- **Owner phone** (optional) — remote dashboard via web. Owner uses a SuperAdmin login. The phone is **not** a separate role — `ownerPhone` setting is purely the playground's official WhatsApp number for alerts.

Architecturally unlimited additional devices (a third tablet, manager phone, etc.) — just additional logins.

### Heartbeats

- Tablet A writes `_meta/tabletAHeartbeat` every 10 seconds (just `{ updatedAt: now, userId: currentUser, online: true }`).
- Tablet B writes `_meta/tabletBHeartbeat` every 10 seconds.
- Tablet A pings the Akuvox local IP every `terminalLocalPingIntervalSeconds` (default 60) and writes `_meta/terminalHeartbeat`. The Cloud Function also touches this document every time it receives a face-scan event from the Akuvox.
- A tablet is "online" if its heartbeat is younger than `tabletHeartbeatToleranceSeconds` (default 30).
- A tablet is "online and ready" if (a) heartbeat fresh AND (b) a user is logged in AND (c) the user has the role required for the relevant action.
- The terminal is "online" if `_meta/terminalHeartbeat` is younger than `terminalHeartbeatToleranceSeconds` (default 90 — longer than tablet tolerance because face scans can be infrequent on a quiet day).

### Real-time sync

All devices subscribe to relevant Firestore collections via real-time listeners:
- Firebase pushes updates within ~1 second.
- Works offline: writes queue locally, sync on reconnect.

### Listener strategy by device

**Tablet (operator/admin):**
- Currently inside (live grid)
- Approval queue (filtered to entries `RoutedTo` = current tablet OR `either`)
- Today's sessions (for counts)
- Edit locks for the kid currently being edited (if any)
- Notifications panel

**Tablet on Reports page:** detach operations listeners, use one-shot fetches for historical data.

**TV display:**
- Currently inside kids (with privacy filtering per kid)
- Hall of Fame aggregate
- Today's birthdays
- Active special events
- Settings (for branding)

**Owner phone (when logged in):**
- Aggregate stats only (`insideCount`, daily revenue, alerts)
- No detailed kids list (privacy + data minimization)

### Approval queue routing — Tablet A primary, Tablet B secondary

This is the critical multi-device flow. **Tablet A is primary; everything goes there first.**

#### Lifecycle of an approval

1. **Creation.** When the Akuvox calls the Cloud Function on a face scan, the Cloud Function evaluates per §9.6. If `requireStaffApproval = true` and entry would otherwise be allowed (Scenario 1a), the Cloud Function creates a new `approvalQueue` document with `RoutedTo = "A"`, `Status = "Pending"`, and replies `wait_for_staff` to the terminal. The terminal shows "Please wait for staff to let you in…" and locks the gate.

2. **If Tablet A is online and ready:** Tablet A receives the entry via its listener. Modal opens with the kid's photo, sub info, and three buttons: **[Let in]**, **[Deny]**, **[Hold]**. Plus a fourth button if Tablet B is also online: **[Send to Tablet B]**.

3. **If Tablet A is NOT online and ready:** the Cloud Function detects this (no fresh heartbeat for Tablet A) and the entry is **not** routed to B by default — the terminal shows *"System unavailable. Please see staff."* Admin+ on any device can manually claim from a "Pending Approvals" admin list. (Rationale: B is secondary, not a fallback for an entire missing primary; that situation needs human attention.)

4. **Claim.** When a staff member taps to act, a transactional update sets `ClaimedBy = userId`, `ClaimedAt = now`, `ClaimExpiresAt = now + approvalClaimExpirySeconds`, `Status = "Claimed"`. Firestore guarantees only one tablet wins.

5. **Modal timeout.** If the modal sits open for `approvalModalTimeoutSeconds` (default 60) without a decision, the modal auto-closes on the user's screen. The claim is **not** released yet — `ClaimExpiresAt` still controls that. Other tablets cannot grab it during this window. The modal can be reopened from the user's notifications panel.

6. **Claim expiry.** If `ClaimExpiresAt` passes without a decision, a Cloud Function (or the next reading client) releases the claim: `ClaimedBy = null`, `Status = "Pending"`. Notifications re-fire to all eligible tablets.

7. **Decision.**
   - **Approve** → triggers the full check-in flow per §9.6 step 9. The tablet that approved writes the decision to Firestore *and* directly calls the Akuvox HTTP API on the local network to open the gate (Tablet A or B, whichever approved — both are on the same WiFi as the terminal). Cloud Function is not in this loop. If the Akuvox is unreachable (terminal offline or local network issue), the tablet shows an error toast, writes to `errors/`, but the Firestore session record is still created (the kid is "in" from a data perspective; staff can manually let them through the gate or troubleshoot).
   - **Deny** → records `DecisionReason` (required free text). The tablet writes the decision to Firestore. The Cloud Function (watching for queue updates) does *not* tell the terminal to open. The terminal — which has been showing "Please wait" since Step 1 — receives a "denied" status update via a follow-up call from the tablet (or, if not reachable, simply times out and reverts to idle). Terminal then shows red + reason. No gate.
   - **Hold** → `Status = "Held"`, `HoldStartedAt = now`. Modal stays open. The kid waits at the gate. Auto-deny after `approvalMaxHoldSeconds` (default 120) with reason `"hold_timeout"`.

8. Decisions are final. The queue entry is locked once decided.

#### Send to Tablet B

When Tablet A's operator is busy (e.g. mid-conversation with a parent) and Tablet B is online:

1. Operator on A taps **[Send to Tablet B]**.
2. The entry updates: `RoutedTo = "B"`, `RouteHistory` appended with `{ tablet: "A", sentAt: now, outcome: "rerouted" }`, `RetriesToB += 1`.
3. Tablet B's modal opens with a banner *"Re-routed from Tablet A"* and a `approvalReassignToBSeconds` countdown (default 10).
4. Tablet B operator can: **[Take it]** → flow proceeds normally on B. Or do nothing — countdown expires.
5. If countdown expires OR B operator dismisses: entry routes back to A with `RoutedTo = "A"`, `RouteHistory` appended with `{ tablet: "B", sentAt: previous, outcome: "timed_out" or "dismissed" }`. Modal reopens on A.
6. A's operator now has three choices:
   - **[Let in / Deny / Hold]** as normal.
   - **[Send to Tablet B again]** — *only if `RetriesToB < approvalMaxRetriesToB` (default 2)*.
   - **[Dismiss as failed]** — terminal shows *"Entry could not be processed — please see staff."* No gate. Logged.

**If Tablet B is not online and ready:** the [Send to Tablet B] button is **greyed out** with tooltip *"Tablet B offline."*

This entire flow applies to **all** approval scenarios — both new-kid registrations (Scenario 6) and regular check-in approvals (Scenario 1a). The hierarchy is consistent.

### Race conditions on edits

For non-queue edits (kid profile, catalog items): the edit lock per §13 prevents concurrent edits in the first place. If somehow two writes still race (e.g. lock TTL expired): use `updateDoc` per §3, last-write-wins per field (Firestore behavior, since `updateDoc` only modifies the fields you pass). Acceptable for an internal-staff system.

### Offline behavior

- Each device's Firebase SDK maintains a local cache (IndexedDB under the hood, but Firebase manages it — no manual code).
- Reads served from cache when offline.
- Writes queued locally; uploaded on reconnect.
- UI shows offline indicator in header.
- Approval queue is functional while offline. If both tablets are offline simultaneously and both claim the same entry, first-to-reconnect wins; the other is informed and reverted with a clear message. This edge case is rare and documented.

---

## 17. Entry Scenarios

The 11 scenarios produced by `handleTerminalEvent()`. Evaluation order per §9.6.

| # | Name | Outcome | Reaches approval queue? |
|---|---|---|---|
| 1 | ✅ Normal entry (approved) | Allow | No (already approved) |
| 1a | ⏳ Awaiting staff approval | Pending | **Yes** |
| 2 | ✅ Already inside | Soft notice | No |
| 3 | 🚫 Session ended, re-entry attempt | Deny | No (alert only) |
| 4 | 🚫 No subscription | Deny | No (alert only — can become Scenario 6 path if staff registers a new ticket) |
| 5 | 🚫 Blocked kid (regular) | Deny, discreet, NO name on terminal | No (skips queue) |
| 6 | 🆕 Unknown face (new kid) | Pending | **Yes** |
| 7 | ⚠️ Weekly limit reached (Monthly only) | Deny or fall back | No (alert only) |
| 8 | ⚠️ Subscription expiring soon | Allow with warning | Same as Scenario 1 / 1a |
| 9 | ❓ Face scan fails (cap, mask, bad light) | Deny, no tablet alert (too frequent) | No |
| 10 | 🚫 At capacity | Deny | No |
| 11 | 🔒 Permanent block | Deny, discreet, NO name | No (skips queue) |

**Approval queue entries are created only for Scenarios 1a and 6.** Other denials write to `terminalEvents` and surface as **notifications** in the tablet UI (a separate notification list, not the queue). The notifications panel in §16 shows these.

### Detail per scenario

#### Scenario 1 — ✅ Normal entry (approved)
Conditions: recognized + Active + valid ticket/sub + not inside + capacity available + staff approved (or auto-approve disabled).
- Action: full check-in per §9.6 step 9.
- Terminal: green + "Welcome [Name]! Have fun!" (TTS).
- Gate: OPEN for `gateOpenSeconds`.
- If birthday: free spin per §10.

#### Scenario 1a — ⏳ Awaiting staff approval
Conditions: recognized + Active + valid ticket/sub + not inside + capacity available + `requireStaffApproval = true`.
- Action: queue entry created, routed to Tablet A.
- Terminal: blue + "Hello [Name]! Please wait for staff to let you in…"
- Gate: LOCKED.
- On approve → Scenario 1 (gate opens, birthday spin if applicable — yes, the birthday spin still triggers via the 1a→1 path).
- On deny → terminal shows red + reason.
- See §16 for the full lifecycle and routing.

#### Scenario 2 — ✅ Already inside
Conditions: recognized + currently has open session.
- Terminal: amber + "You're already inside, [Name]!"
- Gate: LOCKED.
- No tablet notification.

#### Scenario 3 — 🚫 Session ended, re-entry attempt
Conditions: recognized + checked out today + no active ticket/sub remaining.
- Terminal: red + alarm + "[Name], please see a staff member."
- Gate: LOCKED.
- Tablet notification: "[Name] trying to re-enter — session ended."

#### Scenario 4 — 🚫 No subscription
Conditions: recognized + Active + no valid ticket/sub.
- Terminal: amber + "Please purchase a ticket at the desk."
- Gate: LOCKED.
- Tablet notification: "[Name] at the door — no ticket."

#### Scenario 5 — 🚫 Blocked kid (regular)
Conditions: recognized + `Status = "Blocked"` + `PermanentBlock = false`.
- Terminal: red + "Access denied — please see staff" (**NO name — discreet**).
- Gate: LOCKED.
- Tablet silent notification: "BLOCKED: [Name] at door — reason: [reason]".
- **Skips the approval queue.**

#### Scenario 6 — 🆕 Unknown face (new kid)
Conditions: face NOT recognized.
- Terminal: "Welcome! Please register at the desk."
- Approval queue entry created, routed to Tablet A (per §16).
- Once a staff member claims and registers: kid passes through Scenario 1a (or Scenario 1 if approval not required).

#### Scenario 7 — ⚠️ Weekly limit reached (Monthly only)
Conditions: recognized + Monthly active + `VisitsThisWeek >= VisitsPerWeek`.
- Check fallback: kid has Bundle (active) or OneTime (active)? → use that, proceed to Scenario 1/1a.
- No fallback: deny.
- Terminal: amber + "Weekly visits used — please see staff."
- Tablet notification: "[Name] — weekly limit reached. Add ticket?"

#### Scenario 8 — ⚠️ Subscription expiring soon
Conditions: recognized + valid sub + `EndDate <= now + subscriptionExpiringWarningDays`.
- Allow entry normally (Scenario 1 or 1a flow).
- Terminal: green (normal welcome).
- Tablet gentle warning: "[Name]'s subscription expires in X days."

#### Scenario 9 — ❓ Face scan fails
Conditions: terminal cannot read a face (cap, mask, bad light).
- Terminal: "Face not detected — please remove cap or see staff."
- Gate: LOCKED.
- No tablet notification (too frequent to be useful).
- Staff resolves manually (search kid → check in from tablet, which still flows through approval).

#### Scenario 10 — 🚫 At capacity
Conditions: recognized + valid sub + `insideCount >= maxCapacity`.
- Evaluated **after** Blocked + Already-Inside + PermanentBlock checks.
- Terminal: amber + "We're full — a spot will open soon!"
- Gate: LOCKED.

#### Scenario 11 — 🔒 Permanent block
Conditions: recognized + `Status = "Blocked"` + `PermanentBlock = true`.
- Behavior identical to Scenario 5 (NO name on terminal, gate locked).
- Logged distinctly with `permanent_block` marker.
- **Never** auto-unblocked by the birthday cron.
- Only SuperAdmin can lift the `PermanentBlock` flag.

---

## 18. Akuvox A05C Integration

### Device specs (Akuvox A05/A05C/A05S)
- 5" IPS touchscreen.
- Face capacity: 20,000 templates stored locally on the device.
- Card capacity: 20,000.
- Event log capacity: 50,000 records (used for offline event recovery — see below).
- Recognition: <0.2s, ≥99.7% accuracy.
- Anti-spoofing: dual IR camera liveness detection.
- Authentication methods: face, RFID/NFC card, PIN code, QR code, Bluetooth (via SmartPlus app).
- Connectivity: Ethernet (PoE), WiFi.
- Lock control: built-in onboard relay → electric door strike OR magnetic lock OR gate.
- Protection: IP65.
- Protocols: HTTP API for inbound commands, Action URL push for outbound events, ONVIF, Wiegand 26/34, RS485.

### Three integration mechanisms used by this system

The Akuvox supports three independent network features that together cover everything we need:

**1. Remote Verification.** When a face is recognized, the terminal calls a configured HTTPS URL (the "verification server") and waits for a yes/no reply. The reply determines whether the gate opens. This is the heart of the integration — no bridge needed because the *terminal* initiates every face-decision.

**2. Action URL.** The terminal POSTs to a configured URL on specific events (door opened, face enrolled, etc.). One-way notification, no reply expected.

**3. HTTP API (inbound).** The terminal exposes an HTTP API on its local IP. Authorized callers (our tablets, on the same WiFi) can send commands like `open relay`, `add user`, `delete user`, `enroll face`. Used for tablet-initiated actions (manual gate override, face enrollment from registration screen).

### How the three mechanisms connect to our architecture

```
                          INTERNET                              LOCAL WIFI
Akuvox A05C ──── (1) Remote Verification ────► Cloud Function
            ──── (2) Action URL events ──────► Cloud Function

Cloud Function (in Firebase) ─────────► Firestore (writes)

Tablet ────► Firestore (read/write)
Tablet ──── (3) HTTP API ────────────────────────────────────► Akuvox A05C
            (open gate after approval, enroll face, configure)
```

**Key property:** the Cloud Function never needs to call the Akuvox. The terminal initiates internet traffic; the tablet initiates local-network traffic. The Akuvox stays behind the playground's NAT — never exposed to the public internet.

### Cloud Function endpoints

Two HTTPS Cloud Functions handle everything from the terminal side:

**`POST /verifyFaceScan`** (the Remote Verification endpoint)
- Called by the Akuvox on every face scan.
- Authenticated by HMAC using `terminalSharedSecret`.
- Body contains: FaceID (template ID), event timestamp, terminal device ID.
- Function executes the full §9.6 evaluation (block check, capacity, subscription, etc.).
- Reply within 2 seconds, JSON:
  - `{ "action": "allow", "openRelay": true, "displayMessage": "Welcome [Name]!" }` — terminal opens gate.
  - `{ "action": "deny", "openRelay": false, "displayMessage": "Please see staff" }` — terminal denies.
  - `{ "action": "wait", "openRelay": false, "displayMessage": "Please wait for staff" }` — terminal holds; Cloud Function has created an `approvalQueue` entry that the staff will resolve.
- Function writes the event to `terminalEvents`. If the result was `allow` and no approval was required, the function also creates the session record per §9.6 step 9.
- If the result was `wait`, the staff approval flow takes over (§16). When staff approves, the **tablet** opens the gate via the Akuvox HTTP API.

**`POST /terminalActionEvent`** (the Action URL endpoint)
- Called by the Akuvox on door-open, face-enrolled, manual-unlock, and similar events.
- Authenticated by HMAC.
- Used for audit logging only — does not return a meaningful reply.

### Tablet → Akuvox commands (over local WiFi)

When a tablet needs to send a command to the Akuvox (manual gate override, after-approval gate open, enroll a new face), it calls the Akuvox HTTP API directly. Authentication is HTTP Digest (username + password). Functions used:

- `enrollFace(kidId)` — staff initiates from the registration screen. Terminal captures the face, returns a FaceID, tablet stores it on the kid record.
- `openGate()` — pulses the onboard relay for `gateOpenSeconds`. Used for: post-approval gate open, manual override, emergency unlock.
- `lockGate()` — explicit lock. Used during emergency lock-all.
- `deleteFace(faceId)` — when a kid is hard-deleted (rare; soft-delete keeps the FaceID).
- `setMessage(text, color, durationSeconds)` — show a message on the terminal display. Limited; depends on Akuvox firmware. Pilot test confirms.

**If a tablet command fails** (Akuvox unreachable, auth error, network error): the action is logged to `errors/`, a toast surfaces the failure to the staff member, but the Firestore-side state still updates. The staff member is told the gate didn't open and can either manually unlock or retry.

### Internet-outage event recovery

When internet is down, the Akuvox cannot call `verifyFaceScan`. Per `terminalOfflineFallback` setting (default `local_db`), the terminal falls back to its local face database and opens the gate for any locally-recognized face. Each such event is logged in the terminal's local 50,000-event log.

When internet returns, a Cloud Function runs `reconcileTerminalEvents()`:
1. Calls the Akuvox HTTP API to fetch the event log since the last reconciliation timestamp.
2. For each event with `OccurredOnline = false`, creates the corresponding `terminalEvents` record and (if the kid was let in offline) a `sessions` record.
3. For each offline event involving a *blocked* or *permanently-blocked* kid that the local DB allowed in: surfaces a high-priority alert on the dashboard for SuperAdmin review and writes an audit entry tagged `offline_block_breach`.
4. Updates `_meta/lastReconciliationAt`.

The reconciliation function is also runnable manually from the Admin Panel (Errors / Reconciliation tab).

### Pilot test required

Before final integration code is written, a real Akuvox A05C must be tested for:
1. Remote Verification reply timing (must be reliable within 2 seconds; Cloud Function cold starts may need pre-warming).
2. The exact JSON schemas of the Action URL push and the Remote Verification request — Akuvox documentation describes the *shape* but field names may differ across firmware versions.
3. HTTP API authentication mechanics (Digest vs. Basic, header conventions).
4. Behavior of the local-DB fallback during internet outage (does it actually open the gate? what's logged?).
5. Format of the local event log (timestamps, fields, completeness — needed to design `reconcileTerminalEvents()`).
6. Display customization capabilities (can we show custom messages? colors?).

The pilot is a separate session before production code is written. Outcomes update this section.

### Anti-tailgate

After every gate open, `antiTailgateCooldown` seconds (default 5) where the terminal ignores additional face scans. Configured on the Akuvox (`Authentication Interval`). Optional hardware (flap barrier or turnstile) deferred — purchase decision later.

---

## 19. Gate Control

### Hardware
- Akuvox A05C onboard relay → electric door strike OR magnetic lock OR swing gate OR flap barrier.
- `gateOpenSeconds` (default 3) — auto-locks after.

### Manual override
- Admin+ can open the gate from a tablet.
- Reason required (free text).
- Logged to `terminalEvents` AND `audit`.

### Emergency controls

The header has an "Emergency" button visible to Admin+ at all times. Opens a modal:
- **Lock all gates** — immediate, overrides pending approvals, gate stays locked until cleared.
- **Clear all sessions** — marks everyone checked out (used during evacuation).
- **Sound alarm** — terminal alarm for N seconds.
- **Notify owner** — urgent WhatsApp to `ownerPhone`.

All emergency actions heavily logged.

---

## 20. Audio / Voice

The Akuvox A05C has a built-in speaker and supports its own TTS prompts (a small set of preset phrases). For richer audio (custom phrases, kid names spoken aloud), we use the **tablet's** speaker, since the tablet is right there at the entry desk and TTS in the browser is straightforward.

**Audio plan:**
- Akuvox plays its own short confirmation sound on successful face recognition (its built-in feedback — cannot be disabled cleanly, and that's fine).
- Tablet plays the "Welcome, [Name]!" TTS message via the browser's `SpeechSynthesis` API when a check-in is recorded. English at launch; Arabic and French strings prepared.
- Birthday: happy birthday sound (audio file from Storage) + "Happy Birthday [Name]! 🎂" (tablet TTS).
- Awaiting approval: tablet shows the modal; no audio (avoid annoying staff with chimes).
- Denied (Scenarios 5, 11 — Blocked): NO name spoken anywhere. Akuvox displays "Access denied — please see staff." Tablet stays silent.
- Other denials: Akuvox shows a brief message; tablet logs the event silently.

**Why not depend on the Akuvox speaker for kid names:** the Akuvox's built-in TTS is a fixed phrase library, not arbitrary text. The tablet's `SpeechSynthesis` accepts any string, supports multiple languages, and is more flexible.

**Pilot test confirms:** what audio events fire automatically on the Akuvox, whether they can be muted, and how loud they are.

---

## 21. WhatsApp Messaging

### Method
- **Day one:** `wa.me` link approach. App generates a link with pre-filled message; staff taps → WhatsApp opens → staff sends.
- **Future (Stage 4):** WhatsApp Business API — drop-in replacement, queue logic unchanged.

### Queue
All outbound messages enter `whatsappQueue`:
- Immediate triggers (after registration, reward redeemed, gift received, spin win) appear at the top.
- Delayed triggers (after_checkout 120 min, expiring 3 days) enter at scheduled `SendAt`.
- A Cloud Function checks the queue every 5 minutes and surfaces ready messages on the dashboard "Messages to send" panel.
- Staff taps **[Send via WhatsApp]** → wa.me link opens → staff sends → marks `Status: "Sent"`.
- End-of-day target: empty queue.

### Built-in triggers

| Trigger | Default delay | Purpose |
|---|---|---|
| `after_checkout` | 120 min | Satisfaction + rating |
| `subscription_inactive` | `inactivityReminderDays` days | Re-engagement |
| `subscription_expiring` | 3 days before expiry | Renewal reminder |
| `birthday` | Morning of (09:00) | Birthday greeting |
| `after_registration` | 0 min | Welcome |
| `reward_redeemed` | 0 min | Confirmation |
| `spin_win` | 0 min | Prize notification |
| `low_bundle_visits` | 0 min | "X visits remaining" |
| `block_lifted_birthday` | 0 min | "Welcome back surprise" |
| `gift_received` | 0 min | "Your sibling gifted you…" |

### Variables

`{KidName}`, `{ParentName}`, `{PlaygroundName}`, `{RewardName}`, `{SubscriptionName}`, `{DaysLeft}`, `{Points}`, `{SiblingNames}`.

### Rating system

The `after_checkout` template includes "Rate your experience 1–5 ⭐". Parent replies with a number. Staff reads the reply and records it in audit (manual day one). Future: API-based capture.

---

## 22. Training Mode

`tabletMode = "training"` enables a learning environment without affecting the real playground.

### Training mode means
- A **persistent yellow banner** across the top of every screen: *"⚠️ TRAINING MODE — no real actions taken."*
- All audit entries are tagged `mode: "training"` and excluded from default report views.
- All financial events are tagged `mode: "training"` and excluded from revenue reports.
- All terminal events are tagged `mode: "training"`.
- WhatsApp messages: written to the queue, **immediately auto-marked as `Sent (training)`** without ever opening wa.me. The recipient is never contacted.
- **The gate does not physically open.** Two enforcement points:
  - The Cloud Function (`verifyFaceScan`) checks `tabletMode` and returns `deny` (with a message indicating training) when `tabletMode = "training"`.
  - The tablet's manual gate-open code path checks `tabletMode` before calling the Akuvox HTTP API and silently no-ops when in training mode.
  Defense in depth: either layer alone would suffice; both ensure no accidental real gate opens.
- Kid records created in training mode are tagged `createdInTraining: true` so SuperAdmin can bulk soft-delete them later.

### Training mode does NOT
- Use a separate database or tenant. Same data, just tagged.
- Disable kid registration or check-in flows. Trainees need to practice the full UI.
- Block face enrollment on the terminal — but enrollment in training mode marks the FaceID with a `_training` suffix that's separated/cleaned later.

### Cannot enter training mode if anyone is inside

The "Enable training mode" toggle in the Admin Panel refuses to flip if `aggregates/insideCount > 0`. The playground must be empty. This prevents staff from inadvertently switching mid-shift and corrupting real session records.

### Cannot exit training mode without confirmation

Switching back to `production` requires a SuperAdmin password re-entry confirmation (defense against accidentally clicking back to production with training-tagged data lying around).

---
## 23. TV Display

### Hardware
- 43"+ HDMI TV (any brand).
- Driven by a streaming stick (Fire TV, Chromecast) or a small mini-PC (Beelink, Mini-Forum, etc.). Mini-PC recommended for reliability — runs the kiosk browser tab indefinitely with fewer driver issues than streaming sticks.
- TV in always-on mode.
- Browser opens a dedicated kiosk URL: `https://aquaria.app/?display=tv`.

### Layout (default)

```
┌─────────────────────────────────────────────────────┐
│  AQUARIA                          24 / 30 inside    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐         │
│  │ R  │ │ M  │ │ A  │ │ S  │ │ L  │ │ N  │         │
│  │Rami│ │Maya│ │Ali │ │Sara│ │Leyl│ │Nour│         │
│  │45m │ │30m │ │1h2m│ │15m │ │5m! │ │OVER│         │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘         │
│  (live grid — color-coded by remaining time)        │
│                                                     │
├─────────────────────────────────────────────────────┤
│  🏆 Hall of Fame This Month                         │
│  1. Rami (12 visits)  2. Maya (10)  3. Ali (8)      │
├─────────────────────────────────────────────────────┤
│  🎂 Birthdays Today: Sara (turning 6!) 🎉           │
└─────────────────────────────────────────────────────┘
```

### Content rotation

The bottom panel rotates every 15 seconds:
- Hall of Fame (visits)
- Hall of Fame (points)
- Today's birthdays
- Upcoming special events (next 7 days)
- Custom promo images (SuperAdmin-uploaded)

### Privacy controls

Per-kid setting (set during registration, editable in profile):
- `full` — full name and photo on TV.
- `first_only` — first name only, photo (default for Aquaria).
- `hidden` — initial only, no photo.

Tenant-wide overrides: `tvDisplayShowFullNames` and `tvDisplayShowPhotos`.

### Performance and stability

- Listener subscribes to inside-kids only — never the full kids collection.
- Page never reloads (real-time updates only).
- Heartbeat ping detects stale connections.
- **Auto-refresh page every 6 hours, but only between 04:00–06:00 (closed hours).** A refresh during open hours would briefly blank the screen, which is jarring; the closed-hours-only rule prevents this.

---

## 24. Reports

All reports are SuperAdmin-accessible (Admin sees most). All exportable as **CSV only** at v6.2 — PDF export is deferred to a future version.

### Attendance (Admin+)
- Date range (Today / This Week / This Month / Last Month / Custom).
- Total visits, unique kids, average duration.
- Bar charts: by day of week, by hour.
- Daily visit count line chart.

### Subscription health (Admin+)
- Active Monthly + Bundle subscribers.
- Columns: Name | Sub End | Days Left | Visits This Week | Last Visit | Phone.
- Color: red (0 visits this week), amber (1–3), green (4+).

### Birthdays (Admin+)
- Next 30 days, split: Next 14 days | Next 15–30 days.

### Revenue (SuperAdmin)
- Source: `financialEvents` ledger (immutable, always accurate).
- Breakdown by ticket type, subscription model, bundle.
- Rush hour vs normal pricing comparison.
- Daily / weekly / monthly totals.
- Discount accounting.

### Daily summary (auto-generated)
- Total check-ins, unique kids.
- Revenue by ticket type.
- New registrations.
- Loyalty points earned/redeemed.
- Busiest hour.
- Tomorrow's renewals due.
- A Cloud Function generates the summary at end-of-day and queues `ownerAlertDailySummary` WhatsApp with a brief text summary. (No PDF attachment — link to dashboard view.)

### Audit log (Admin+)
- All actions, paginated.
- Filters: user, action type, date range, kid.
- **Search across archived audit** (per §26): if filtered range crosses into archived months, the archive search runs against JSON archives in Storage and returns matches.

### Void log (Admin+)
- Read-only table.

### Financial events ledger (SuperAdmin)
- Read-only, full CSV export.

### Errors log (SuperAdmin)
- Live tail of `errors/` collection (§7).
- Filters: source (frontend / cloud_function), date range, user, page.
- Used by Rafic and Claude for cross-session debugging.

---

## 25. Admin Panel — SuperAdmin Configuration

Tabs:

- **Backup & Restore** — manual backup, integrity check status, restore from backup
- **Errors** — runtime error log (§7, §24)
- **Terminal & Reconciliation** — Akuvox connection status, last reconciliation timestamp, "Run reconciliation now" button (§18), pilot-test results record
- **Session Types** — CRUD with active toggle
- **Subscription Models** — CRUD
- **Bundles** — CRUD
- **Rewards Catalog** — CRUD
- **Spin Wheel** — slices, weights, cost, refund settings, visual preview
- **WhatsApp Templates** — CRUD per trigger
- **Special Events** — CRUD
- **Rush Hour Rules** — CRUD
- **Capacity** — single number input (`null` or `0` = unlimited)
- **Schools** — pills with double-click rename
- **Grades** — table
- **Staff Accounts** — create, deactivate (soft); links to Firebase Auth
- **Blocks Management** — currently blocked kids list, unblock, toggle PermanentBlock, view BlockHistory
- **Loyalty Settings** — points per minute, streak bonus, surprise bonus, monthly badge toggle
- **Approval Settings** — toggle, all four timeouts (§5)
- **Edit Lock Settings** — inactivity + warning seconds (§13)
- **Sibling Settings** — toggle gifting
- **Birthday Settings** — auto-unblock days ahead
- **Owner Alerts** — toggles for capacity 80%, blocked attempt, daily summary, backup failure
- **System Settings** — name, logo, currency (read-only USD at v6.2), country, language, timezone, tabletMode
- **TV Display Settings** — privacy defaults, photo display, rotation timing
- **Onboarding Wizard** — 7-step setup for fresh installs (see §29)
- **Audit Log** — paginated viewer with filters (includes archive search)
- **Void Log** — read-only
- **Financial Events** — read-only ledger

---

## 26. Backup, Recovery, and Data Integrity

### Native Firebase backups
- Firestore Point-in-Time Recovery (7-day window) enabled.
- Storage soft delete enabled (30-day recovery).
- No manual backup required for routine protection.

### Manual export (SuperAdmin)
- "Export full tenant data" button → JSON dump of all collections.
- Stored in Firebase Storage at `/tenants/{tenantId}/backups/{timestamp}.json`.
- Downloadable from admin panel.

### Weekly integrity check
- Cloud Function runs Sunday 04:00 (in tenant timezone).
- Validates: aggregate counts match source data, no orphaned references, schema version matches.
- Logs result to `audit`.
- On failure: `ownerAlertBackupFailed` WhatsApp fires.

### Audit log retention and archive

- Audit entries older than 1 year are archived monthly to Storage as `audit_archive_{YYYY-MM}.json`.
- Archived entries are removed from Firestore to control read costs.
- Archives are immutable.
- **Archive search:** the audit log viewer (§24) accepts date ranges that cross into archived months. When that happens, the viewer fetches the relevant archive files from Storage and runs an in-browser filter (kid, user, action type, date). For Aquaria scale (~10K audit entries/year), this is fast enough.

### Disaster recovery
1. SuperAdmin can trigger Firestore PITR restore from the Firebase Console.
2. Manual JSON exports are usable as a last-resort backup.
3. A documented runbook lives in the admin panel under "Backup & Restore".

---

## 27. Security

### Authentication
- Firebase Auth with email + password.
- Password requirements: 8+ chars, mixed case, number.
- No SMS auth (cost + complexity); email-link 2FA deferred.
- Password reset via email link.

### Authorization
- Role stored on `users/{userId}`.
- Custom claims set via Cloud Function on user creation/role change.
- Firestore Security Rules enforce role-based access.

### Firestore Security Rules (pattern)

```
match /tenants/{tenantId}/{document=**} {
  allow read:  if request.auth.token.tenantId == tenantId;
  allow write: if request.auth.token.tenantId == tenantId
                  && hasRole(['Operator', 'Admin', 'SuperAdmin']);
}

match /tenants/{tenantId}/users/{userId} {
  allow write: if hasRole(['SuperAdmin']);
}

match /tenants/{tenantId}/settings/{settingKey} {
  allow write: if hasRole(['SuperAdmin']);
}

match /tenants/{tenantId}/financialEvents/{finId} {
  allow read:   if hasRole(['SuperAdmin']);
  allow create: if hasRole(['Operator', 'Admin', 'SuperAdmin']);
  allow update: if false;     // immutable
  allow delete: if false;     // immutable
}

match /tenants/{tenantId}/loyaltyLedger/{ledgerId} {
  allow update: if false;     // immutable
  allow delete: if false;     // immutable
}

match /tenants/{tenantId}/audit/{logId} {
  allow update: if false;     // immutable
  allow delete: if false;     // immutable
}
```

Tenant isolation is **enforced at the database level** — even buggy app code cannot leak data across tenants.

### Sensitive data
- Akuvox HTTP API credentials encrypted at rest (Firebase Secret Manager for the Cloud Function side; Firestore field-level encryption for the value used by the tablet, decrypted only in-memory at use).
- HMAC shared secret for terminal-to-Cloud-Function authentication stored in Firebase Secret Manager.
- No personal data sent to third parties.
- WhatsApp messages stored only as outbound text; incoming replies not auto-captured (would require API).

### GDPR / Lebanese data law preparation
- Data minimization: only what's needed.
- Right to be forgotten: soft delete supports this; hard delete via support request.
- Data export: SuperAdmin can export any kid's full data on request.
- Region: Aquaria deployment uses `europe-west` Firebase region (closest to Lebanon, GDPR-friendly).

---

## 28. Cost Monitoring

Firebase costs at Aquaria's expected scale (~100 kids/day, 2 tablets, 1 TV, 1 Pi):
- Firestore reads: ~5K/day → free tier.
- Firestore writes: ~500/day → free tier.
- Storage: ~100 MB photos → free tier.
- Hosting: minimal traffic → free tier.
- Cloud Functions: ~10K invocations/month → free tier.

**Expected monthly cost at Aquaria: $0.**

Alerts configured in Google Cloud Console:
- Daily spending alert at $1.
- Monthly budget alert at $20.

If costs ever spike, `aggregates/dailyCosts` could be tracked, but this is overkill at v6.2.

---

## 29. Onboarding Wizard

A 7-step setup flow that runs the first time a SuperAdmin logs in to a fresh tenant. Used at Aquaria's first deploy and for every future tenant.

1. **Welcome + tenant identity.** Playground name, logo upload, country code.
2. **Operating settings.** Currency (defaults USD, locked at v6.2), language (defaults English), timezone (defaults Asia/Beirut).
3. **First session type** *(required).* At least one session type must exist before anyone can check in. Example default offered: "Standard 2hr — $5".
4. **First subscription model** *(optional).* Skip allowed.
5. **First bundle** *(optional).* Skip allowed.
6. **First staff account.** Email, password, role (defaults SuperAdmin — this is the playground owner's account).
7. **Terminal setup** *(optional, can defer).* Akuvox local IP, HTTP API username + password, generated `terminalSharedSecret` for HMAC, and the Cloud Function URLs to paste into the Akuvox web admin (Action URL and Remote Verification URL — both auto-generated and shown for copy-paste). If skipped, system runs in "manual check-in only" mode until configured.

Final screen: *"You're ready! Your playground is set up."* — done button takes the user to the dashboard.

The wizard can be re-opened from the Admin Panel if a SuperAdmin wants to walk through configuration again. Existing data is not affected.

---

## 30. Engineering Standards (NON-NEGOTIABLE)

### Code quality
- No redundant loops. Build lookup maps once.
- No duplicate logic. Extract shared helpers.
- No dead code. No commented-out blocks.
- No silent failures. Every error → toast + console + audit (if user-facing) + write to `errors/` collection.
- No modal state leaks. Reset on close.
- No `!important` in CSS. One CSS rule per property per element.
- No polling unless necessary. Real-time listeners replace polling.

### Firestore discipline
- Listeners attached on view, detached on navigate-away.
- Aggregate queries forbidden — use denormalized counters.
- Multi-document writes batched via transactions.
- Documents capped at 1 MiB (photos in Storage, not inline).
- **Always use `updateDoc`, never `setDoc` for existing documents** (§3).

### Frontend discipline
- One render per data load. Build full HTML, set innerHTML once.
- Event delegation over individual listeners.
- All state resets on modal close: `_pendingKidId`, `_pendingSessionId`, `_pendingApprovalId`, `_duplicateOverride`, etc.

### Data discipline
- Every record carries the common fields (§3).
- Soft delete only.
- Money: integer minor units.
- Strings: i18n dictionary.
- Financial actions: append to `financialEvents`, never update.

### Schema discipline
- `SCHEMA_VERSION` bumps on every change.
- Migrations idempotent and logged.
- Migrations non-destructive.
- App refuses writes if its compiled `SCHEMA_VERSION` is older than the stored version (§3).

### Observability
- Every caught exception writes to `errors/` (§7).
- Cloud Function failures log to Firebase logs AND write to `errors/` with `Source: "cloud_function"`.

---

## 31. UI/UX Standards

### Color system

```css
--accent:  #0ea5e9;  /* blue */
--success: #10b981;  /* green */
--warning: #f59e0b;  /* amber */
--danger:  #ef4444;  /* red */
--purple:  #8b5cf6;
--ink:     #0f172a;
--ink-2:   #334155;
--mute:    #64748b;
--line:    #e2e8f0;
--bg:      #f8fafc;
--card:    #ffffff;
```

### Gender colors
- Male: `#3b82f6` blue with ♂.
- Female: `#ec4899` pink with ♀.

### Loyalty levels
- Bronze: `#cd7f32`
- Silver: `#c0c0c0`
- Gold: `#ffd700`
- Diamond: `#b9f2ff`

### Terminal screens
- Green: allowed.
- Blue: awaiting approval.
- Red: denied (Scenarios 3, 5, 11).
- Amber: warning (Scenarios 2, 4, 7, 10).
- White: idle.

### Fonts
- DM Sans (UI).
- DM Mono (numbers, codes, prices, phone numbers, loyalty points).

---

## 32. Deployment

### Environments
- **Development:** Firebase project `aquaria-dev` — used during build, free, no real data.
- **Production:** Firebase project `aquaria-prod` — Aquaria's live system.

### Deployment flow
1. Code pushed to a `dev` branch on GitHub.
2. Develop and test against `aquaria-dev`.
3. When stable, merge to `main`.
4. GitHub Actions auto-deploys `main` to `aquaria-prod` Firebase Hosting.
5. **Never deploy to production during open hours (12:00–22:00 Beirut local time).** After-hours deployments preferred. Emergency hotfixes handled case-by-case.
6. Cloud Function migrations also run after-hours only.

### URL structure
- Production: `https://aquaria.app` (custom domain) or `https://aquaria-prod.web.app` (Firebase default).
- TV display: `https://aquaria.app/?display=tv`.
- Owner remote dashboard: `https://aquaria.app/?role=owner` (requires SuperAdmin login — `role=owner` is just a UI hint that surfaces the simplified mobile view; it grants no extra permissions).

---

## 33. Data Migration to Aquaria

Aquaria does not currently use any digital management system, so no migration is required. Aquaria's first day on v6.2 starts with empty data, populated through normal use:

1. SuperAdmin (Rafic) completes the onboarding wizard (§29).
2. Staff begin registering kids as they arrive — no historical backfill.
3. The system is operational from day one.

If Rafic later wants to import historical data (paper records, spreadsheets), a one-time CSV import tool can be built. Not in scope for launch.

---
## 34. Logging and Troubleshooting Runbook

When something goes wrong, here is where to look.

### "Something I just did didn't work"
1. Open browser DevTools (F12) → Console tab. Most frontend errors surface here with a stack trace.
2. Open the Admin Panel → **Errors** tab. Filter by recent timestamp. Frontend and Cloud Function errors land here.
3. Open the Admin Panel → **Audit Log**. Filter by your user and recent timestamp. The audit shows what the system thought you were doing.

### "The terminal stopped working"
1. Check `_meta/terminalHeartbeat` in Firestore. Is the timestamp recent (younger than `terminalHeartbeatToleranceSeconds`)?
2. From a tablet on the same WiFi, open the Akuvox web admin URL (`http://<terminal-IP>`). If you can't reach it, the terminal is off, on a different network, or unplugged.
3. Check the Akuvox itself: screen responsive, network LED on, IP address shown in its admin menu matches `terminalIPAddress` setting.
4. Check the **Errors** tab in the admin panel for recent terminal-related errors (`Source: "cloud_function"`, look for `verifyFaceScan` failures).
5. Check internet: if the terminal is reachable on the local network but Cloud Function calls are failing, the terminal can't reach Firebase. The terminal will be falling back to local-DB recognition. Verify by looking at recent `terminalEvents` — if `OccurredOnline = false`, the system is in offline-fallback mode.

### "A tablet shows 'system unavailable'"
- This means the entry routing logic detected that Tablet A is not online and ready (§16). Check that Tablet A's app is open and a user is logged in.
- If Tablet A is the missing one, refresh the browser tab or restart the app.

### "The terminal recognized a kid but the gate didn't open"
1. Check if the kid was actually approved: look at `approvalQueue` in Firestore for the recent entry. What's its `Status`?
2. If `Status = "Approved"` but gate didn't open: the tablet failed to call the Akuvox HTTP API. Look at `errors/` for an HTTP-call failure from the tablet to the terminal IP. Common causes: terminal IP changed, tablet not on the same WiFi, Akuvox HTTP API password mismatch.
3. If `Status = "Pending"` or `"Claimed"`: staff hasn't approved yet. Normal operation, kid is waiting at the gate.

### "Something is wrong with the database"
1. Firebase Console → Firestore → look at the affected document.
2. If the document is corrupted (e.g. missing required fields), do not edit by hand — log the issue, restore via PITR if needed (§26).
3. If the issue is widespread, contact Claude with screenshots of the error and the document state.

### "I need to debug across sessions with Claude"
The whole point of the `errors/` collection and the audit log is that Rafic can paste relevant entries into a new Claude session, and Claude can see exactly what happened. The runbook above tells Rafic which view to copy from.

### Cloud Function logs

Firebase Console → Functions → Logs. Searchable. Cloud Function failures **also** write to `errors/`, but the full stack traces and timing live in the Firebase logs.

---

## 35. Version History

This section exists so a future reader (Claude or Rafic) can see what changed across versions. v7.0 will likely remove this section once changes have stabilized.

### What's new in v6.2

The big change in v6.2 is the **face terminal switch from Hikvision DS-K1T681 to Akuvox A05C**, which removed the Raspberry Pi bridge entirely and simplified the architecture.

**Architectural changes:**
- **Akuvox A05C replaces Hikvision DS-K1T681.** Roughly half the price, designed for third-party integration (Remote Verification, Action URL, HTTP API are first-class features), supports multiple authentication methods (face, RFID, QR, NFC, Bluetooth) instead of just face.
- **Raspberry Pi bridge removed.** No longer needed. The Akuvox calls a Cloud Function directly for every face scan (Remote Verification pattern); the Cloud Function replies allow/deny within 2 seconds. The terminal stays behind NAT and is never exposed to the public internet.
- **Tablet → terminal commands go over local WiFi.** When staff approves an entry, the tablet (already on the same WiFi as the Akuvox) calls the Akuvox HTTP API directly to open the gate. Cloud Function is not in the outbound loop. This avoids any NAT / port-forwarding requirement.
- **Heartbeat model updated.** Bridge heartbeat removed. Terminal heartbeat now derived from (a) Cloud Function receiving events from the terminal, OR (b) Tablet A's local-network ping to the terminal. Tolerance increased to 90 seconds (longer than tablets) because terminals can be silent on quiet days.
- **Internet-outage event recovery added.** When internet returns, a `reconcileTerminalEvents()` function pulls any events from the Akuvox's local 50,000-event log that the Cloud Function missed during the outage. Offline events involving blocked kids surface as alerts.

**Settings changes:**
- Removed: `bridgeHeartbeatToleranceSeconds`, the old generic `terminalCredentials`.
- Added: `terminalHttpUsername`, `terminalHttpPassword`, `terminalSharedSecret`, `terminalActionUrl`, `terminalLocalPingIntervalSeconds`, `terminalOfflineFallback`, `terminalHeartbeatToleranceSeconds`.

**Section rewrites:**
- §2 architecture diagram and bridge subsection.
- §18 Hikvision integration → Akuvox integration (Remote Verification, Action URL, HTTP API).
- §20 Audio (no more 3.5mm external speaker — tablet-side TTS for kid-name announcements; Akuvox speaker for confirmation feedback only).
- §22 Training mode gate suppression now happens in the Cloud Function and the tablet, not the bridge.
- §29 Onboarding wizard step 7 — Akuvox-specific configuration.
- §34 Troubleshooting runbook — Pi/SSH instructions removed; Akuvox web admin and local-ping instructions added.

**Hardware list changes:**
- Removed: Raspberry Pi 4 + microSD + power supply, Hikvision DS-K1T681, external 3.5mm powered speaker.
- Added: Akuvox A05C (the Akuvox includes onboard relay so no separate relay module needed).
- Net hardware savings vs. v6.1: roughly $400-700 depending on supplier.

**What did NOT change in v6.2:**
- Firebase as the backend.
- All business rules (subscriptions, bundles, OneTime tickets, loyalty, gifting, blocking, sibling logic).
- Multi-device approval flow (Tablet A primary / Tablet B secondary).
- Edit locks, training mode tagging, error logging, audit, observability.
- The 11 entry scenarios (§17) and check-in evaluation order (§9.6).
- TV display, reports, admin panel, security model.

### What's new in v6.1

(Kept for historical context. v6.1 was the version superseded by v6.2.)

### Architectural changes
- **Hikvision bridge moved to Raspberry Pi** (was: tablet-as-bridge with heartbeat failover). The previous design was unworkable because a browser tab cannot run an HTTP server to receive Hikvision push events. *(Now superseded in v6.2 — bridge removed entirely.)*
- **Tablet A primary / Tablet B secondary hierarchy** (was: peer-to-peer with race-condition claims). All approval requests route to A first; A can re-route to B with a 10-second window; max 2 retries; if A is offline, the terminal shows "system unavailable".
- **`AvailableTickets` moved from array on kid document to `tickets/` sub-collection.** Arrays of objects are awkward to mutate atomically; a sub-collection is cleaner.

### Business rule changes
- **OneTime tickets now expire 6 months after acquisition.** Previously: never expired.
- **Sibling gifting now requires the recipient to have NO active Monthly AND NO unexhausted Bundle.** Previously: anyone in the family could receive any gift, leading to stale-ticket accumulation.
- **Subscription `Status` field removed.** Active state is now computed live from `EndDate`, `RemainingVisits`, `ValidityEnd` at every check-in. A denormalized `IsActive` flag may be written for query convenience, but the live conditions are the source of truth.
- **Weekly counter has a defensive lazy reset.** Check-in code now resets `VisitsThisWeek` if `WeekStartDate` is more than 7 days old, protecting against cron failures.
- **Free birthday spin clarified:** triggers on the first successful entry of the day, including the path Scenario 1a → Scenario 1.
- **No "first kid of the day" free spin.** Removed before implementation due to group-fairness concerns (siblings would feel left out). Future feature: spontaneous lottery for kids inside.
- **No PDF reports.** CSV exports only at v6.1. PDF deferred.
- **USD only.** No LBP, no dual pricing.

### New features
- **Edit locks (§13).** Two-staff-editing-the-same-kid is now prevented. Lock with auto-release on inactivity. SuperAdmin-tunable timeouts.
- **Training mode fully specified (§22).** Yellow banner, tagged data, gate suppressed, WhatsApp suppressed, cannot enter while playground occupied.
- **Errors collection (§7, §24).** Runtime errors logged to Firestore for cross-session debugging.
- **Logging runbook (§34).** Where to look when things go wrong.
- **Onboarding wizard explicitly enumerated (§29).** 7 steps.
- **Approval timeouts consolidated (§5).** Four named settings, neighbors in the settings table.

### Fixes
- TV display auto-refresh now scheduled to closed-hours only (04:00–06:00). v6.0 refreshed every 6 hours regardless, which would blank the screen during open hours.
- Hold timeout (`approvalMaxHoldSeconds`) added — kids no longer wait at the gate indefinitely on Hold.
- Gifts use `giftEvents` only — not `financialEvents` — since no money changes hands.
- Audit archive search added so SuperAdmin can investigate older-than-1-year events without manually downloading JSON files.

### Removals (v6.1)
- "9 entry scenarios" reference removed from changelog history. There are 11 scenarios (or 12 if counting 1a separately) and §17 is the canonical list.
- Tablet-as-bridge architecture removed entirely. Replaced by Pi. *(Both subsequently superseded in v6.2 — bridge concept removed entirely.)*
- Bridge "heartbeat failover" between tablets removed. *(Whole bridge layer gone in v6.2.)*

---

## 36. How Claude and Rafic Work Together

### The contract

- **Rafic's role:** product owner, decision-maker, operator. He decides what the product does. He runs the code and reports results.
- **Claude's role:** sole developer. Generates working code, explains technical tradeoffs in plain English, pushes back when something violates this document.
- **This document's role:** the single source of truth between sessions. Claude has no memory across chats. Rafic shares this document at the start of each session.

### Per-session protocol

1. **Start of session:** Rafic shares the latest `Aquaria_Master_Prompt_v6_X.md` (this document) and any relevant code or screenshots. Claude reads it before responding.
2. **Decisions update the document.** When Claude and Rafic agree on a change to architecture, business rules, or settings, the change is reflected in this document before the next session. The document version bumps (v6.1 → v6.2 → v7.0). The repo always contains the latest version.
3. **Code in the GitHub repo is the second source of truth.** When the document and the code disagree, Claude flags it and they get reconciled.
4. **Errors and audit are the cross-session debugging channel.** Per §34: when something goes wrong, Rafic copies relevant rows from the Errors tab and the Audit log; Claude reads them in the next session.

### Definition of "done"

A piece of work is "done" when:
1. Claude has provided complete, working code.
2. Rafic has run it and the result matches what Claude said it would do.
3. If the work involved a UI: Rafic has clicked through the relevant flow and confirmed it behaves correctly.
4. If the work involved data: Rafic has checked Firestore (via Firebase Console) and confirmed the documents match the spec.
5. The change is reflected in this document if it changes architecture, business rules, or settings.

If any of those steps fail, the work is **not done**. Claude does not declare done unilaterally.

### Claude's constraints

- **Do not invent.** If something is not in this document, ask before assuming.
- **Do not skip rules.** Every record gets common fields. Every UI string is i18n. Every financial action goes to `financialEvents`. No exceptions.
- **Do not deploy during open hours.** Production deploys go after-hours only (§32).
- **Do not pretend uncertainty is certainty.** When Claude is guessing, Claude says so.
- **Do not be wordy.** Concise, specific, actionable. Plain English. Zero jargon when explaining to Rafic.

### Rafic's constraints

- **Do not edit Firestore documents by hand.** It bypasses audit, breaks integrity checks, and corrupts state. Always go through the app or ask Claude to write a migration.
- **Do not deploy to production by clicking around the Firebase Console.** Use the GitHub flow (§32).
- **Do not modify the master prompt without flagging it.** The document is shared; changes need agreement.

---

## 37. Future Roadmap (Stage 4)

Not built in v6.2. Captured here so foresight is encoded in the architecture.

- **Multi-tenant onboarding.** Fresh tenant flow already supported (§29). Stage 4 builds the SaaS billing layer.
- **WhatsApp Business API.** Drop-in replacement for the wa.me queue (§21).
- **Mobile app for parents.** Architecture supports it; not built.
- **PDF report exports.** Deferred from v6.2.
- **Spontaneous lottery for kids inside on event days.** Triggered by SuperAdmin during a special event; picks N random kids currently checked in; awards a prize.
- **Sharded `aggregates/insideCount`** if scale demands it.
- **Email-link 2FA for staff.**
- **Incoming WhatsApp reply capture** (requires API).

---

## 38. Document Glossary

A quick reference for terms used throughout.

- **Tenant** — one playground deployment. Aquaria is `tenantId = "aquaria"`. Future playgrounds get UUIDs.
- **Kid** — a registered child who plays at the playground.
- **Session** — one playtime visit, from check-in to check-out.
- **OneTime ticket** — a pay-per-visit token. Lives in `kids/{kidId}/tickets/`. Expires 6 months after acquisition.
- **Monthly subscription** — time-bounded plan with weekly visit limit.
- **Bundle** — pre-paid pack of visits, valid for a time window.
- **FamilyID** — shared identifier linking siblings. Enables sibling gifting.
- **Active** — used contextually:
  - Kid `Status = "Active"` means not blocked.
  - Subscription is *active* when its live conditions hold (§9.3).
  - Catalog item `Active = true` means staff can select it.
- **Remote Verification** — the Akuvox feature where the terminal asks a Cloud Function for permission on every face scan, and acts on the reply. Replaces the Hikvision-era bridge concept.
- **Action URL** — Akuvox's outbound event push: terminal POSTs to a configured HTTPS URL when door-open / face-enrolled / etc. events occur. Used for audit logging.
- **Approval queue** — Firestore collection where pending entry decisions live. Routed to Tablet A primary, Tablet B secondary.
- **Edit lock** — Firestore document preventing two staff from editing the same kid simultaneously.
- **Aggregate** — denormalized counter document (e.g. `insideCount`).
- **Tablet mode** — `production` or `training` (§22).
- **Scenario** — one of the 11 entry scenarios (§17).

## 39. Build Decisions Log

This section records product-level decisions made during the build that amend or
clarify earlier sections. Implementation details (file structure, CSS classes,
which library to use) live in the code, not here. This log captures decisions
that affect data shape, business rules, or behavior — anything a future Claude
session needs to know to stay consistent with what was actually built.

Format: §39.N — date — amends [section] — decision and rationale.

### §39.1 — 2026-04-27 — amends §3 and §5

**Settings document shape standardized.**

Every settings key listed in §5 is stored as a single document under
`/tenants/{tenantId}/settings/{key}` with this exact shape:

```javascript
{
  value: <any>,              // string, number, boolean, null, object, or array
  CreatedAt: <timestamp>,    // serverTimestamp() at first write
  UpdatedAt: <timestamp>,    // serverTimestamp() on every write
  CreatedBy: <userId>,       // UID of staff who first set this key
  UpdatedBy: <userId>        // UID of staff who last modified this key
}
```

The actual value lives under `value`. The four audit fields are common-fields
per §3 (settings are never deleted, so soft-delete fields are omitted).

This shape is uniform across all keys, queryable, and audit-friendly. Code
that reads a setting always does:

```javascript
const snap = await getDoc(doc(db, 'tenants', tenantId, 'settings', 'maxCapacity'));
const value = snap.exists() ? snap.data().value : <default>;
```

### §39.2 — 2026-04-27 — amends §29 step 1 and clarifies §5 (countryCode)

**Country picker scope and storage convention.**

The wizard's Step 1 (Identity) and the future kid registration form (Kids module)
share a single country list file. Decisions:

- **Scope:** all UN-recognized countries (193 members + 2 observer states:
  Vatican City, Palestine), MINUS Israel. Israel is excluded per Lebanese
  constitutional position; future tenants outside Lebanon may need this list
  amended in a tenant-specific override (deferred to Stage 4).
- **Sort:** alphabetical by English name.
- **Default selection:** Lebanon (ISO `LB`, dial code `+961`).
- **Storage:** the `countryCode` setting (and any future per-kid country fields)
  stores only the dial code string (e.g. `"+961"`). Country name, flag, and
  ISO code are looked up at render time from the static list file. Rationale:
  matches §5 which specifies a string default; insulates stored data from
  country renames (e.g. Türkiye, Czechia, Eswatini) that occur over time;
  single source of truth.
- **Implementation note:** dial code `+1` is shared between US, Canada, and
  Caribbean nations. The list disambiguates Caribbean entries with extended
  prefixes (e.g. `+1242` Bahamas, `+1876` Jamaica). US and Canada both
  genuinely use `+1`. Display lookups for `+1` return the first alphabetical
  match (Canada). If we ever need to distinguish "user chose US" from "user
  chose Canada" in stored data, switch the canonical reference to ISO code.

### §39.3 — 2026-04-27 — amends §29 step 6

**Wizard Step 6 adapts to existing SuperAdmin.**

§29 step 6 reads "First staff account: Email, password, role (defaults
SuperAdmin — this is the playground owner's account)." This assumes a fresh
tenant with zero staff. In practice, at Aquaria's first deploy and any future
fresh tenant, the SuperAdmin's Firebase Auth user and `users/{uid}` profile
are created BEFORE the wizard runs (so the wizard can authenticate them).

Step 6 therefore behaves as follows when a SuperAdmin already exists:

- Display the existing profile read-only: email, role, current Username.
- Allow the SuperAdmin to optionally edit their `Username` field.
- If `Username` is changed, the wizard's finalize step writes the update to
  `/tenants/{tenantId}/users/{uid}` via `batch.update()` (only the changed
  field, plus `UpdatedAt` and `UpdatedBy`).
- No new staff account is created during the wizard.

Adding additional staff accounts (Operators, Admins) happens later via the
Admin Panel → Staff Accounts (§25), not via the wizard.

### §39.4 — 2026-04-27 — amends §29 step 7 and §5 (terminal settings)

**Wizard Step 7 writes nothing.**

§29 step 7 reads "Terminal setup (optional, can defer)." We are now stricter:
the wizard NEVER writes any terminal configuration setting, even empty
placeholders, even when the SuperAdmin clicks through Step 7.

Reasons:
- Terminal configuration requires Cloud Functions to be enabled (for the
  Remote Verification endpoint and HMAC shared secret generation), which
  requires the Blaze plan.
- The full terminal-onboarding flow needs the actual Akuvox device on the
  local network for IP and credential capture.
- Both prerequisites belong to a dedicated post-Blaze Akuvox onboarding
  session, not to the generic SuperAdmin wizard.

Step 7 therefore renders as a display-only "configure later" screen with a
note that the playground will operate in manual check-in mode until the
terminal is connected. The SuperAdmin clicks "Finish setup" and the wizard
finalizes without touching any of: `terminalIPAddress`, `terminalHttpUsername`,
`terminalHttpPassword`, `terminalActionUrl`, `terminalSharedSecret`,
`terminalLocalPingIntervalSeconds`, `terminalOfflineFallback`,
`terminalHeartbeatToleranceSeconds`, `gateOpenSeconds`, `antiTailgateCooldown`.

Those settings are written by the dedicated Akuvox onboarding flow when it
runs (post-Blaze, separate session).

### §39.5 — 2026-04-27 — clarifies §29 (wizard finalize semantics)

**Wizard finalize is atomic via batched write.**

When the SuperAdmin clicks "Finish setup" on Step 7, all writes commit in a
single Firestore `writeBatch`:
- Step 1 settings: `playgroundName`, `countryCode`.
- Step 2 settings: `currency` (always `"USD"` at v6.2), `currencyMinorUnits`
  (always `100`), `language`, `timezone`.
- Step 3: one document in `sessionTypes/` (always required).
- Step 4: one document in `subscriptionModels/` IF the SuperAdmin filled the
  optional step (skipped → no document).
- Step 5: one document in `bundles/` IF the SuperAdmin filled the optional
  step (skipped → no document).
- Step 6: one update on `users/{uid}` IF the SuperAdmin changed their
  Username (no change → no update).
- `setupComplete` setting written LAST so the flag is only set if all other
  writes succeed. The batch is atomic — all or nothing. Partial setup is
  impossible.

If the batch commit fails (network drop, rules rejection), the SuperAdmin sees
an error toast and stays on Step 7. They can retry. The `setupComplete` flag
is not written, so the wizard re-launches on the next login.

### §39.6 — 2026-04-27 — clarifies §6 (auth implementation status)

**Role lookup currently reads from Firestore document, not custom claims.**

§6 enforcement says "Permissions are enforced in three places: frontend UI,
backend code, Firestore Security Rules." Per the v6.2 §27 security model,
custom claims via Cloud Functions are the long-term plan. Current build status:

- **Today (Spark plan, no Cloud Functions):** the user's role is read from
  `/tenants/{tenantId}/users/{uid}` document at login by `auth-service.js`.
  Firestore Security Rules also call `get()` on the same document to enforce
  role-based access. The role is the document's `Role` field.
- **Future (post-Blaze migration, dedicated session):** a Cloud Function will
  set custom claims on the auth token at user creation / role change. Rules
  will read `request.auth.token.role` instead of doing a `get()`. The
  `getCurrentUserProfile()` API contract in `auth-service.js` does not change.

This implementation choice was made deliberately to allow auth and rules to
work end-to-end on the free tier during the build phase. Custom claims
migration is a known dependency for Akuvox integration (the
`verifyFaceScan` Cloud Function will need them) and must happen before that
work begins.

### §39.7 — 2026-04-27 — build state at end of "Wizard frame + Step 1" session

This entry is a build-state snapshot, not a spec amendment. Captures what's
live at the end of this session for cross-session continuity.

**Working:**
- Authentication (sign-in, sign-out, role lookup).
- Firestore Security Rules deployed (tenant-isolated, role-aware, immutable
  collections).
- Setup-status detection: shell routes new SuperAdmins to the wizard,
  Operators/Admins to "setup not finished" screen until done.
- Wizard shell: header, progress bar, footer with Back / Skip / Next, step
  routing, sign-out button.
- Wizard Step 1 (Identity): playground name + country picker, validation,
  state persistence across Back/Next.
- Wizard finalize: batched write of all collected state to Firestore.

**Placeholder (clicks through, no real input):**
- Wizard Step 2 (Operating settings).
- Wizard Step 3 (First session type — REQUIRED in spec; finalize will write
  an empty session type doc until this is built, which must be cleaned up
  manually if test-finalizing).
- Wizard Step 4 (First subscription model).
- Wizard Step 5 (First bundle).
- Wizard Step 6 (Confirm SuperAdmin account).
- Wizard Step 7 (Terminal — display-only by design, no implementation needed).

**Caveat for testers:** if the wizard is finalized while Steps 2-6 are still
placeholders, the resulting session type doc will have empty Name and zero
Duration/Price. Delete the doc from Firestore Console and reset
`settings/setupComplete` to re-run the wizard against real Step content.

**Next session targets:**
1. Extract Step 1 from `wizard-view.js` into its own file
   `public/src/setup/steps/step1-identity.js`.
2. Build Step 2 (Operating settings) into `step2-operating.js`.
3. Build Step 3 (First session type) into `step3-session-type.js`.


=== Notes for Aquaria Master Prompt v6.3 — accumulated during the wizard build ===

Build state at v6.3 starting point:
- Wizard fully built and end-to-end tested. SuperAdmin runs it on first sign-in.
- Steps 1, 2, 3, 4, 5, 6 each in their own file under public/src/setup/steps/.
- Step 7 is display-only by design (no terminal config until Blaze + Akuvox).
- Finalize is one atomic writeBatch: settings, catalog docs, optional user
  update, setupComplete flag.
- Verified writes for: 7 settings docs (value+audit shape), 1 sessionTypes doc
  (required), 0 or 1 subscriptionModels doc (optional), 0 or 1 bundles doc
  (optional), 0 or 1 user-doc update (Username only).

Implementation notes — code organization:
- Each step file exports renderStep{N}{Name}(container, state, onValidChange,
  profile). Profile parameter is currently unused by Steps 1-5 but Step 6
  needs it; passing it to all steps keeps the call shape consistent and
  costs nothing.
- The escapeHtml helper is duplicated across Steps 1, 3, 4, 5, 6 and
  wizard-view.js. Should be lifted to public/src/ui/escape-html.js in v6.3.
- Steps 4 (subscription) and Step 5 (bundle) share ~80% of their structure:
  optional name + optional dollar price + 3 dropdowns + same empty/filled/
  partial validation pattern. A shared "optional catalog form" helper would
  remove most of the duplication. Worth a refactor in v6.3.
- Per-view styles inject themselves once on first render via a module-level
  flag. This works but means CSS lives across 8+ files. v6.3 might want a
  single CSS file.

Implementation notes — data:
- Wizard 'firstSubscriptionModel' and 'firstBundle' both use null (not absent)
  to signal "skipped." Finalize checks `if (state.firstX)` so null = no write.
- Catalog docs use auto-generated IDs. Settings docs use fixed IDs (one per
  setting key). Re-running finalize overwrites settings but creates new
  catalog docs — so don't re-run during testing without manual cleanup, or
  add a pre-flight delete during dev runs.
- Username field on users/{uid}: created if not present, updated if changed,
  no-op if user left input blank. The wizard never deletes a Username.
- Currency locked at "USD"/100 minor units in v6.2; multi-currency deferred.
- Language locked at "en" in v6.2 (Arabic and French shown but disabled
  with "(coming soon)" labels — strings files don't exist yet).

Curated reference data files added during this build:
- public/src/data/countries.js — 195 countries (UN + observer states minus
  Israel), shape { name, iso, dialCode, flag }, with helpers
  getCountryByDialCode and getCountryByIso, default LB.
- public/src/data/timezones.js — ~40 curated IANA timezones grouped by
  region (Middle East, Africa, Europe, Americas, Asia & Oceania), shape
  { id, label, offsetLabel, region }, default Asia/Beirut. v6.3 question:
  is the curated short list good enough long-term, or do we need the full
  ~600 IANA list eventually? Current list is fine for MENA + Europe + major
  cities; add by editing the file.

Lessons learned (worth documenting in v6.3 §30 or §32):
- Browser cache is a recurring trap. After every `firebase deploy`, hard-
  refresh with Ctrl+Shift+R. Plain F5 reuses cached JS. The first time we
  hit this it looked like the deploy itself failed, when it had succeeded
  but the browser was still serving the old bundle.
- Firebase Console panel cache also fooled us. New collections sometimes
  don't appear in the navigation panel until you refresh the Console page
  itself. Empty collections also don't appear at all (because in Firestore
  a "collection" only exists when at least one doc lives under that path).
- The "diagnostic console.log line, then remove" pattern is useful for
  debugging state issues when behavior looks wrong but data on disk looks
  right. v6.3 might add a debug-mode flag to enable verbose logging
  without code edits.

Caveat that ended up being non-issues:
- A cosmetic "Mixed Content" warning in the dev console came from a
  third-party browser extension (xeriflow.net), not from Aquaria. Tested
  to confirm by checking incognito mode. v6.3 might add a note in §30
  encouraging developers to test in incognito to filter out extension noise.


  ### §39.8 — 2026-04-28 — amends §7 (Kid schema)

**Two new fields added to the Kid document for v1 registration.**

The §7 Kid schema is extended with two fields built during the kids-registration session:

- `SchoolType: "local" | "out_of_country"` (required)
  - "local" — child attends a school in the same country as the playground.
  - "out_of_country" — child's school is abroad (e.g. summer-only visitors).
  - When "local", `School` is required and autocomplete suggestions surface
    from the existing `School` values across the tenant's kids.
  - When "out_of_country", `School` is optional (parents may not share the
    abroad school name), and autocomplete is disabled (suggestions are
    local-only by design).

- `City: string` (required)
  - City of residence. Free text in v1.
  - Separated from `Address` (which remains optional, free text) so reports
    and groupings can use city without parsing addresses.

**v1 implementation choices captured for cross-session continuity:**

- `School` and `Grade` are stored as plain strings in v1, with `<datalist>`
  autocomplete sourced from the existing kids collection (one-shot fetch of
  up to 200 active kids on form mount). When the Admin Panel ships and
  Schools / Grades CRUD exists, a one-time migration converts free-text
  values to references and dedupes case/whitespace variants. Out-of-country
  schools stay as free text post-migration.
- `EmergencyContact` uses an independent country code selector (different
  from the parent's phone country). Both selectors default to the tenant's
  `countryCode` setting on form mount; operators can override per kid.
- Photo upload is **optional** in v1. Client-side resize via `<canvas>`
  produces 800×800 main + 200×200 thumbnail, both JPEG. Stored at
  `/tenants/{tid}/kids/{kidId}/photo.jpg` and `/photo_thumb.jpg`.
  When Akuvox face enrollment runs (post-Blaze), it overwrites both photos
  with the face-capture image. Kids registered today without a photo will
  have one filled in at face-enrollment time — no migration needed.
- Photo upload failure is **non-fatal**: if the kid doc writes but Storage
  upload fails, the registration still succeeds (`{ ok: true,
  photoUploadFailed: true }`) and the operator sees a softer toast. The
  photo can be added later via edit-kid (future session).

**Storage rules added** (`storage.rules`, registered in `firebase.json`):
- Tenant-scoped paths (`/tenants/{tenantId}/...`) require an authenticated
  user with a Firestore profile in that tenant.
- Writes capped at 10 MB and `image/*` content type only.
- Default deny everywhere else.

**Errors collection writer added** (`public/src/services/errors-service.js`):
- `logError({ source, page, action, error, context })` — writes to
  `/tenants/{tid}/errors/{auto-id}` per the §7 Errors schema.
- Designed to never throw; failures fall back to `console.error`.
- Stack truncated to 2000 chars, message to 500, context (JSON-stringified)
  to 2000.
- The Errors viewer in the Admin Panel is a future session; the writer is
  in place now so all subsequent modules can log consistently.

**Hash routing added to shell.js:**
- `#/dashboard` (default), `#/kids/new`, `#/kids/{kidId}`.
- Two cleanup tracks: `currentViewCleanup` (outer view: login / wizard /
  layout / setup-incomplete) and `currentPageCleanup` (inner routed page
  inside the layout). Tracking them separately is necessary because the
  layout's cleanup nulls `pageMount`, which would break the next route if
  it triggered. (One full chat session was lost rediscovering this.)

**Build state at end of session:**
- File layout (real repo): `public/src/services/errors-service.js`,
  `public/src/kids/photo-resize.js`, `public/src/kids/kids-service.js`,
  `public/src/kids/register-view.js`, `public/src/kids/profile-view.js`,
  plus updates to `public/src/strings/en.js` and `public/src/ui/shell.js`,
  plus `storage.rules` at repo root and `firebase.json` updated.
- Project upgraded to Blaze with $1/$5 budget alerts. Storage bucket
  created in `eur3` (multi-region Europe). No Cloud Functions enabled —
  cutover to Cloud Functions remains a deliberate later session per
  §39.6.
- Kids list, edit-kid, sibling linking, school/grade catalogs, errors
  viewer in Admin Panel, and seed-test-data dev tool are deferred to
  future sessions.

**Next session targets:**
1. Kids list page at `#/kids` — search, filters, pagination, listener
   strategy. Click a kid → existing profile view.
2. Edit-kid flow — needs edit-locks per §13.
3. Seed test data — SuperAdmin-only dev button, dev-environment-only
   (gated by `projectId === "aquaria-dev-66eec"`), fills ~5 fake kids.

   ### §39.9 — 2026-04-28 — Dev seed tool + SearchKey field

**Goal:** Build a SuperAdmin-only "Developer tools" section on the dashboard
to seed varied test kids and backfill the new `SearchKey` field, in
preparation for the kids list page.

**Schema change (additive, backward-compatible):**
- Added `SearchKey` (string) to the Kid schema. Lowercased + trimmed +
  whitespace-collapsed version of `${FirstName} ${LastName}`. Used for
  prefix-match search on the upcoming kids list page via Firestore range
  queries (Firestore range queries are case-sensitive, so a separate
  normalized field is required).
- Naming chosen as `SearchKey` (not `FullNameLower`) so the normalization
  rule can evolve — e.g. add diacritic stripping later — without renaming
  the field.

**Files added:**
- `public/src/dev/seed-tool.js` — exports `seedFakeKids(profile)` and
  `backfillSearchKeys(profile)`. Seeds 5 deliberately-varied kids: two
  Khoury siblings sharing FamilyID, an out-of-country kid (Lara Hadad),
  a Blocked kid with one BlockHistory entry (Omar Saad), and a newly-
  registered kid with no photo (Yara Mansour). CreatedAt is back-dated
  per kid so they appear in realistic chronological order on the list.
  Seed kids are written directly via setDoc rather than through createKid()
  because they need pre-set Status/BlockHistory/FamilyID values createKid()
  doesn't accept.
- `public/src/dev/dev-tools-section.js` — renders a card on the dashboard,
  gated by BOTH `firebaseConfig.projectId === "aquaria-dev-66eec"` AND
  `profile.role === "SuperAdmin"`. Returns null when either gate fails,
  so the production code path can't be triggered. Amber styling marks it
  as developer-only at a glance.

**Files modified:**
- `public/src/kids/kids-service.js` — added SearchKey to createKid payload;
  exported `buildSearchKey(firstName, lastName)` so seed-tool uses the
  same normalization. No behavior change for existing callers.
- `public/src/ui/shell.js` — `renderDashboardPlaceholder` now mounts the
  dev-tools section beneath the placeholder card and stores its cleanup
  as the page cleanup.
- `public/src/strings/en.js` — added `devTools` block (badge, title,
  subtitle, button labels for seed + backfill, success messages with
  {count}/{updated}/{scanned} placeholders) and two new error keys
  (seedFailed, backfillReadFailed).

**Decisions worth flagging for future sessions:**
- The dev gate is hardcoded to `["aquaria-dev-66eec"]` in
  `dev-tools-section.js`. When a staging or second-dev project is added,
  extend the `DEV_PROJECT_IDS` array there.
- backfillSearchKeys is idempotent — running it twice is safe and skips
  kids that already have the field.
- Seed kids are normal kid docs, not flagged. They're indistinguishable
  from real kids in the database. To clean them up before going live in
  prod, add a "Delete seeded kids" action in a later session, OR rely on
  resetting the dev project.

**Next session:** kids list page (`#/kids`) — card grid, real-time listener
scoped to visible page, prefix search via SearchKey, filters per the plan
in §39.9 chat (search, Status, School/out-of-country, Show deleted, Sort,
result count). Card grid format chosen over table for tablet primary use.

   ### §39.10 — 2026-04-28 — Kids list page

**Goal:** Build the kids list at `#/kids` — the operational hub for staff to
find, filter, and open kid records. Replaces the dashboard's "Register kid"
nav button as the primary entry point into the kids module.

**Files added:**
- `public/src/kids/kids-list-service.js` — listener-based data layer.
  Exports `subscribeToKidsList(filters, callbacks)` and `KIDS_PAGE_SIZE` (50).
  Listener-per-page model: each "Load 50 more" click attaches a NEW listener
  with `startAfter(lastSnap)` rather than re-querying. When filters change,
  ALL listeners detach and a fresh first-page listener attaches.
  Search prefix forces orderBy("SearchKey") and ignores user sort choice;
  this is enforced at the data layer regardless of UI state.
- `public/src/kids/kids-list-view.js` — the list UI. Card grid using CSS
  grid auto-fill 200px-min. Filters: search (250ms debounce), status
  segmented control (default Active), school dropdown populated from
  streaming data, sort dropdown, SuperAdmin-only "Show deleted" checkbox.
  All filters serialize to the URL hash query string via
  `history.replaceState` (so they don't pollute browser history).
  Empty state distinguishes "no kids exist" (with register CTA) from
  "no kids match filters" (with clear-filters CTA).

**Files modified:**
- `public/src/ui/shell.js` — added `#/kids` route. Added `splitHash()`
  helper that separates path from query string before route matching.
  Added `lastRoutedPath` tracking so a query-string-only URL change
  (filter typing) does NOT tear down and re-mount the page on every
  keystroke. Header nav button changed from "Register kid" to "Kids"
  (Decision 1b — list is the hub, register is an action from there).
  The "Cancel" button on `#/kids/new` now returns to `#/kids` (was
  `#/dashboard`), and the profile view's "Back" button likewise.
- `public/src/strings/en.js` — renamed `shell.navRegisterKid` →
  `shell.navKids`. Added top-level `kidsList` block. Added
  `errors.kidsListLoadFailed`.
- `firestore.indexes.json` — first real population. 8 composite indexes
  on the kids collection covering: Deleted+Status+SearchKey,
  Deleted+Status+CreatedAt (asc + desc), Deleted+SearchKey,
  Deleted+CreatedAt (asc + desc), Deleted+SchoolType+SearchKey,
  Deleted+School+SearchKey. Deployed and verified all 8 Enabled before
  hosting deploy.

**Decisions worth flagging for future sessions:**
- Filters serialize to hash query string with key set: q, status, school,
  schoolType, sort, showDeleted. Defaults are NOT serialized — only
  non-default values appear in the URL. This keeps `#/kids` as the clean
  default URL.
- The list keeps a SET of accumulated school names that grows as kids
  stream in (never clears within a session). This means deselecting a
  school filter still shows that school as an option in the dropdown,
  which is the right UX. Resets on full page reload.
- Composite-index strategy: declare the most common combos in
  `firestore.indexes.json` and let Firestore's missing-index error guide
  us on exotic combos. The "create this index" link in the error message
  is the fastest path. Eight currently declared.
- Pagination is "Load 50 more" only — no jump-to-page. Firestore cursor
  model doesn't support page jumps efficiently. If we later want
  jump-to-page, we'll need a different storage model (e.g. a denormalized
  page-index field). Deferred indefinitely; "Load more" is plenty.

**Known gaps (intentional, deferred to later sessions):**
- Search is prefix-only on FullName via SearchKey. "khoury" doesn't match
  "Maya Khoury" because SearchKey is "maya khoury". If we want last-name
  matching, we either change buildSearchKey() to ALSO write a reversed
  variant, or add a SearchTokens array (denormalized). Not needed yet —
  staff search by first name overwhelmingly.
- No filter by parent name or phone. Phone search would require either
  a normalized PhoneSearchKey field or client-side filtering of the
  visible page. Deferred.
- Soft-delete UI shows a "Deleted" pill when `Show deleted` is on, but
  there is no "Restore" button on the card yet. That comes in the
  edit-kid session along with the soft-delete action itself.
- The kids list's listener on page 1 doesn't see updates to docs that
  have scrolled to page 2+ (out of its query window). Acceptable trade-off
  for v1 — listener cost stays bounded.

**Next session:** edit-kid flow. Requires building edit-locks per §13
first (one staff member at a time editing a given kid). Roughly two
sessions of work — edit-locks alone is meaty. Soft-delete (deleting and
restoring kids) probably also lands in this session since it shares the
edit-permission story.


### §39.11 — 2026-04-28 — Edit-locks foundation (no user-visible feature)

**Goal:** Build the generic edit-locks primitive per §13. Used wherever
two staff members editing the same record concurrently could lose each
other's changes — kids, subscription edits, catalog edits. This session
ships the service + rules + a dev-tool playground; no real edit feature
exists yet (deferred to §39.12).

**Files added:**
- `public/src/services/edit-locks-service.js` — the generic primitive.
  Public API: `acquireLock({ lockKey, profile, timeouts?, onAutoExit,
  onLockChanged })` returns `{ ok, session }` on success, where session
  exposes `recordActivity()` and `release()`. Plus `subscribeToLock(key,
  cb)` for the "locked by other" banner pattern, `peekLock(key)` for
  one-shot reads, and `forceReleaseLock(key)` for SuperAdmin override.
  `DEFAULT_TIMEOUTS` exported (60s inactivity / 15s warning per §13).
  Internal: closure-based `LockSession` (no class), three internal
  timers (heartbeat debounce, inactivity, warning countdown), service-
  rendered warning modal.
- `public/src/dev/edit-locks-playground.js` — dev-only playground card
  on the dashboard. Lets you acquire/release/force-expire/force-release
  a fixed test lock and see the warning modal countdown without needing
  the real edit-kid view to exist. Inactivity / warning seconds are
  inputs (defaults 5/3) so testing doesn't take a minute per cycle.
  Live readout of the lock document via subscribeToLock().

**Files modified:**
- `public/src/dev/dev-tools-section.js` — mounts the playground card
  beneath the existing Seed/Backfill card; cleanup chains both.
- `public/src/strings/en.js` — added top-level `editLocks` block
  containing warning-modal strings + nested `playground` sub-object
  for the dev-tool. Added three error keys (lockKeyMissing,
  lockAcquireFailed, lockReleaseFailed) under `errors`.
- `firestore.rules` — added `match /editLocks/{lockKey}` block inside
  the tenant scope. Read: any tenant member. Create: must be tenant
  member AND set LockedBy = own uid. Update: only by current holder
  AND cannot change LockedBy. Delete: by holder, by anyone if expired,
  or by SuperAdmin.

**Key design decisions:**
- **Activity tracker pattern (Decision §39.11.2.b).** The service owns
  a `LockSession` object. Forms call `session.recordActivity()` blindly
  on every input event; the service handles debouncing internally.
  Reasoning: this primitive will be used by edit-kid, edit-subscription,
  edit-catalog. One place to get the timing right.
- **Service-rendered warning modal (Decision §39.11.3.a).** Same logic
  as above; one place to get the warning UX right.
- **No `beforeunload` (Decision §39.11.4).** Passive expiry via
  `ExpiresAt` is the real recovery mechanism for tab-close, network
  drop, and crash anyway. Wiring `beforeunload` would be Firefox-on-a-
  good-day at best and create the illusion of robustness without it.
- **Same-user re-acquisition is allowed.** If a lock with `LockedBy ==
  currentUid` exists, acquireLock() overwrites it with fresh timestamps
  rather than rejecting. Covers the "user reloaded the page mid-edit"
  case. Trade-off: if the same user has the form open in two tabs, both
  will think they hold the lock. Acceptable — won't happen in practice.
- **Lock key character constraint (bug fix during testing).** Firestore
  reserves document IDs starting OR ending with `__`. Initial dev-tool
  used `__editlock_playground__`, which the SDK rejected client-side.
  Replaced with `playground_editlock_test`. Real lock keys are kid IDs
  / subscription IDs / catalog IDs — Firestore-generated auto-IDs,
  which are guaranteed to not start with underscores, so this is a
  dev-tool concern only.
- **Settings storage (Decision §39.11.1.a).** Defaults
  (DEFAULT_TIMEOUTS) live in the service. When the Admin Panel ships,
  it can write `editLockInactivitySeconds` / `editLockWarningSeconds`
  to `settings/general`; the service can be updated to read from there
  and merge with defaults. No migration needed at that point — missing
  fields fall back to constants.

**Known gaps (deferred):**
- The catch-all rule `match /{collection}/{document=**} { allow read,
  write: if hasProfile(tenantId); }` inside the tenant scope OR's with
  the strict editLocks rules. So the strict editLocks checks are not
  yet defense-in-depth — a malicious tenant member could in theory
  acquire a lock on someone else's behalf via the catch-all. Acceptable
  for a v1 internal-staff system; needs re-evaluation when the catch-
  all is tightened.
- Two-window concurrent-acquisition test was assumed-working rather
  than verified end-to-end. The mutual-exclusion logic (Firestore
  transaction inside acquireLock) is correctly written and the rules
  block backs it up, but real two-different-user testing wasn't done.
  Worth re-running before any production cutover.
- No way for the lock holder's UI to know their lock was force-released
  by a SuperAdmin OTHER than the `onLockChanged` callback firing — but
  the playground doesn't surface this. Edit-kid (next session) should
  handle this case in its UI: if the lock disappears unexpectedly,
  warn the user and discard.

**Settings unused but reserved:**
- `editLockInactivitySeconds` and `editLockWarningSeconds` are not
  written to `settings/general` yet. Defaults live in
  edit-locks-service.js. Admin Panel writes will land in a future
  session.

**Next session:** edit-kid view. Will use acquireLock() at form mount,
recordActivity() on every input event, release() on save / cancel.
Plus the "locked by other" banner using subscribeToLock(). Should be
relatively straightforward now that the primitive is solid.
---
### §39.12 — 2026-04-29 — Edit-kid view (no destructive actions)

**Goal:** Build a working edit-kid view that uses §39.11's edit-locks
primitive end-to-end. First real consumer of acquireLock(). No photo
replacement, no destructive actions (block / delete) — those are §39.13.

**Files added:**
- `public/src/kids/edit-view.js` — the edit form. Loads kid via getKid()
  and acquires the lock concurrently on mount. On lockedByOther:
  renders a banner with the holder's name + a subscribeToLock() listener
  that flips the banner to "now available" + retry button when the
  holder releases. On lock acquired: renders a pre-filled form mirroring
  register-view's structure. recordActivity() wired to every input event
  via a `withActivity()` decorator. Save/Cancel/auto-exit all release
  the lock cleanly. Photo shown read-only at the top of the form
  (replacement deferred to §39.13).

**Files modified:**
- `public/src/kids/kids-service.js` — added `updateKid(kidId, formData,
  profile)`. Updates editable text fields only. Recomputes FullName +
  SearchKey from the new first/last name. Bumps UpdatedAt + UpdatedBy.
  Does NOT touch photo fields, status/blocking, loyalty counters,
  FamilyID, or soft-delete fields. Photo + destructive-action logic
  belongs in §39.13.
- `public/src/kids/profile-view.js` — added "Edit" button in the page
  header next to "Back to dashboard". onEdit dep wired by the shell to
  navigate to #/kids/{id}/edit.
- `public/src/ui/shell.js` — added `#/kids/{id}/edit` route. Pattern is
  matched BEFORE the profile route because the profile regex would
  otherwise greedy-match "abc/edit" as a kid ID. Edit-view's onCancel
  and onSaved both navigate back to the profile (#/kids/{id}). Special
  onRetry hook nulls lastRoutedPath before re-navigating to force a
  clean re-mount of the same path.
- `public/src/strings/en.js` — added kids.profile.editButton, new
  kids.edit block (page title, subtitle, photo caption, save/cancel
  labels, locked-by-other banner copy), editLocks.autoExitedToast and
  editLocks.lockLostToast, toast.kidUpdated. Added .aq-page__header-actions
  CSS rule in register-view.js's style block (the shared owner of the
  .aq-page page-shell namespace).

**Bugs found & fixed during testing:**
- "Edit again immediately after Save" failed with the "lock lost" toast.
  Root cause: my edit-view's onLockChanged callback treated the
  Firestore listener's INITIAL snapshot the same as a real change event.
  When the listener's first snapshot arrived after our acquire
  transaction but before Firestore had fully propagated the doc back,
  state.exists was momentarily false, and we incorrectly inferred
  "force-released." Fixed in edit-view.js by tracking a `seenExisting`
  flag locally; "exists became false" only fires the lock-lost path
  if we'd previously confirmed the lock existed. Considered fixing in
  edit-locks-service.js itself (suppress the first callback) but kept
  the fix narrow to avoid affecting the playground or future consumers.

**Tested behaviors (all green):**
1. Cancel without saving truly discards changes (re-opening edit shows
   original values).
2. Validation blocks invalid saves (cleared First name disables Save).
3. Saved changes persist across hard refresh.
4. Kids list reflects edits in real time (the listener pattern from
   §39.10 picks up the doc change automatically).
5. Re-editing the same kid immediately after a save works (the bug fix
   above).

**Tested-but-deferred:**
- Inactivity warning + auto-exit during edit: skipped because timing
  defaults are 60s/15s and §39.11's playground already verified the
  underlying timer machinery. Worth a real test before production.
- Locked-by-other banner with a SECOND user: skipped because we only
  have one tenant user account in dev. Same-user re-acquisition path
  was triggered instead (correctly — see §39.11 same-user trade-off).
  Need a second Admin or Operator user before this can be verified.

**Tech debt acknowledged in code (file headers reference this):**
- `register-view.js` and `edit-view.js` share roughly 600 lines of form
  HTML, validation, autocomplete loading, and event wiring. Duplication
  was a deliberate trade-off (see Phase-1 plan in this session) — the
  full extraction-then-test would not have fit in the time budget.
  **Phase 2 of this session extracts the shared form code into
  `kid-form.js` so future field additions don't have to be made twice.**
- `register-view.js` owns the .aq-page / .aq-page__header CSS
  namespace, which profile-view and edit-view piggy-back on. Should
  eventually move to a shared layout module. Not urgent.

**Next session(s):**
- Remainder of THIS session (Phase 2): extract `kid-form.js`. Pure
  refactor — no behavior change. Both register-view and edit-view
  consume it.
- §39.13: destructive actions on kids (block/unblock with BlockHistory,
  soft-delete, restore from soft-deleted, photo replace). Permission
  gates: SuperAdmin for all; Admin for block/unblock and photo
  replace; Operator gets no destructive actions.
  

  ### §39.12 Phase 2 — 2026-04-29 — kid-form.js extraction (refactor)

**Goal:** Eliminate the ~600-line duplication between register-view.js
and edit-view.js identified at end of §39.12 Phase 1. Pure refactor.
No behavior change — both register-kid and edit-kid flows verified
working identically post-refactor.

**Files added:**
- `public/src/kids/kid-form.js` — shared form module. Owns the form
  HTML, validation, autocomplete loading, country-dial dropdowns,
  E.164 phone splitting, DOB bounds. Public API: `renderKidForm(mount,
  options) → cleanup()`. Options carry mode ("create" | "edit"),
  optional initialData, onSubmit / onCancel / onActivity callbacks,
  and button labels.

**Files modified:**
- `public/src/kids/register-view.js` — slimmed from ~700 to ~300 lines.
  Now owns only: page chrome, photo upload UI, calling createKid, and
  the page-chrome CSS that profile-view + edit-view + register-view
  share (.aq-page, .aq-page__header, .aq-page__main, etc).
- `public/src/kids/edit-view.js` — slimmed from ~700 to ~390 lines.
  Now owns only: page chrome, read-only photo display, edit-locks
  acquire/release, locked-by-other banner, calling updateKid.

**Module ownership (clarified for future sessions):**
- `kid-form.js` — form HTML, form-field styles (.aq-kid-form*,
  .aq-field__help, .aq-field__error, .aq-field__input--invalid),
  validation, autocomplete suggestions.
- `register-view.js` — page chrome styles (.aq-page*), photo upload
  UI and .aq-kid-form__photo* styles, .aq-kid-form__subtitle,
  .aq-page__header-actions.
- `edit-view.js` — read-only photo display styles (.aq-edit-photo*)
  and locked-banner styles (.aq-edit-locked*).
- `login-view.js` — generic field styles (.aq-field, .aq-field__label,
  .aq-field__input, .aq-button*) — earliest-injected, others piggy-back.

**Future cleanup (not blocking):**
- Generic styles (.aq-field, .aq-field__input, .aq-button*) currently
  live in login-view.js, which is fragile — they're effectively global
  but owned by the file that happens to render first. Consolidating
  into a single shared theme module is on the table but not urgent.
- Same for .aq-page* — currently in register-view.js for historical
  reasons. Could move to a shared layout module when that's needed.

**Next session:** §39.13 — destructive actions on kids: block / unblock
with BlockHistory entries, soft-delete, restore, photo replace.
Permission gates: SuperAdmin for all destructive actions; Admin for
block/unblock and photo replace; Operator gets nothing destructive.

### §39.13 — 2026-04-29 — Destructive actions on kids

**Goal:** Add the destructive actions deferred from §39.12 — block /
unblock with BlockHistory, soft-delete, restore from soft-delete, photo
replace, photo remove. Plus the role-based gating that constrains who
can do what.

**Permission model decided this session (deviates from initial proposal):**

| Action               | Operator | Admin | SuperAdmin |
|----------------------|----------|-------|------------|
| Register new kid     | ✅       | ✅    | ✅         |
| Edit kid             | ❌       | ✅    | ✅         |
| Photo replace/remove | ❌       | ✅    | ✅         |
| Block / unblock      | ❌       | ✅    | ✅         |
| Soft-delete          | ❌       | ❌    | ✅         |
| Restore deleted      | ❌       | ❌    | ✅         |
| View deleted         | ❌       | ❌    | ✅         |

Operators are register-only. The reasoning: kid records carry liability,
and edits should go through someone with policy training. If real-world
friction proves too high we can loosen later — easier than tightening.

**Files added:**
- `public/src/auth/permissions.js` — pure function helpers:
  isAdmin, isSuperAdmin, canEditKids, canReplaceKidPhoto, canBlockKids,
  canSoftDeleteKids, canRestoreKids, canViewDeletedKids. UI consults
  these to hide/show buttons; rules enforce server-side independently.
- `public/src/ui/confirm.js` — generic confirmation modal that returns
  a Promise. Supports optional reason textarea (with min/max length and
  required-flag) and optional "permanent" checkbox. Esc cancels,
  backdrop click cancels, Enter confirms unless inside the textarea.
  Single active modal at a time. New `.aq-button--danger` style added.

**Files modified:**
- `public/src/kids/kids-service.js` — added six new service functions:
  blockKid, unblockKid, softDeleteKid, restoreKid, replaceKidPhoto,
  removeKidPhoto. Block/unblock use Firestore transactions because they
  need read-modify-write on the BlockHistory array. Block appends a new
  entry; unblock finds the most-recent entry without UnblockedAt and
  fills in UnblockedAt + UnblockedBy. Field-set discipline (each
  function writes a disjoint set of fields) means concurrent edits +
  destructive actions can't corrupt each other — see §39.13 design note.
- `public/src/kids/profile-view.js` — rewritten. Now takes `profile` as
  a 3rd argument (shell update below). Renders gated buttons: Edit (Admin+),
  Block/Unblock (Admin+), Delete (SuperAdmin only). New BlockHistory
  section displays each block entry with reason, blocked-on date, and
  resolved-on date if unblocked. Status pill is now red when blocked,
  green when active. Subscribes to the kid doc via onSnapshot so changes
  from one tab reflect immediately in another.
- `public/src/kids/edit-view.js` — photo section now interactive when
  canReplaceKidPhoto(profile). Replace button triggers file picker;
  Remove button triggers a confirm modal. Both call kids-service
  directly (not via the form's onSubmit) since they're independent
  actions.
- `public/src/ui/shell.js` — passes signedInProfile to renderKidProfileView
  (NEW 3rd arg). Added route guard: Operators typing #/kids/{id}/edit
  in the URL get bounced to #/kids/{id} with toast "Only admins can
  edit kid records."
- `public/src/kids/kids-list-view.js` — Restore button on deleted-kid
  cards (SuperAdmin only). Renders inside the card with stopPropagation
  so the card click (which opens the kid) doesn't fire. Confirm dialog
  + restoreKid call.
- `public/src/strings/en.js` — added kids.profile.editButton/blockButton/
  unblockButton/deleteButton, full block/unblock/delete confirm copy
  block, blockHistory* labels, kids.edit.photoReplaceButton/etc + photo
  confirm copy, kidsList.restoreButton + restore confirm copy, toast
  keys for all six actions, errors.editForbidden + 9 new error keys.
- `firestore.rules` — added explicit kids match block: read by tenant
  member, create by Operator+Admin+SuperAdmin, update by Admin+SuperAdmin,
  delete forbidden (soft-delete via update). Same caveat as editLocks
  in §39.11: catch-all rule below still ORs with these, so server-side
  enforcement is documented intent only until the catch-all is tightened.
- `firestore.indexes.json` — added Status+SearchKey index for the
  "Show deleted" query path (when Deleted filter is removed, the existing
  Deleted+Status+SearchKey index doesn't apply).

**Bugs found & fixed during testing:**

1. Profile page initially showed no Edit/Block/Delete buttons even for
   SuperAdmin, plus a "Cannot read properties of undefined (reading
   'onBack')" error. Root cause: shell.js was calling
   renderKidProfileView with only 3 args (kidId, deps) instead of 4
   (kidId, profile, deps). The `deps` object got bound to the new
   `profile` parameter; profile was undefined; canEditKids returned
   false; deps was undefined; clicking Back crashed. Fix: applied
   shell.js Edit A2 from edits-to-apply.txt.

2. After C1 was applied to en.js, "undefined" appeared as button labels
   for Block and Delete, plus crash on click with "Cannot read
   properties of undefined (reading 'replace')". Root cause: missing
   string keys (blockButton, deleteButton, confirmBlockBody, etc).
   Fix: applied edits C1 + C2 + C3 + C4 + C5 to en.js.

3. After deploying, "Show deleted" toggle on kids list threw
   FirebaseError "The query requires an index". Root cause: turning on
   "Show deleted" makes the query drop the Deleted filter, leaving
   Status+SearchKey alone — no existing composite index covered that
   combination. Fix: added the Status+SearchKey index to
   firestore.indexes.json and deployed via CLI.

**Tested behaviors (all green):**
1. Block kid: confirm modal with required reason field + permanent
   checkbox; profile flips to red Status:Blocked; BlockHistory entry
   appears with reason+timestamp; toast shown.
2. Unblock kid: confirm modal; status flips back to green; BlockHistory
   entry now shows "Resolved" with unblock timestamp.
3. Delete kid: confirm modal; toast; bounce to kids list; kid no longer
   visible by default.
4. Restore from kids list: "Show deleted" toggle reveals deleted kid
   with Restore button on card; click → confirm → kid back in active list.
5. Photo replace from edit-view: file picker → upload → photo updates
   immediately + persists across hard refresh.
6. Photo remove from edit-view: confirm modal → photo replaced with
   initials in frame; profile shows the kid without photo.

**Tested-but-deferred:**
- Operator route guard (Test 10): not tested because no Operator user
  exists in dev. The check `canEditKids(signedInProfile)` and the toast
  redirect are both straightforward; will verify when an Operator is
  created in a later session.

**Known issues (deferred):**
- Server-side rule enforcement for kids is intent-only, same as
  editLocks per §39.11. The catch-all OR's with the new rules. Becomes
  defense-in-depth when the catch-all is tightened. UI gating + service-
  layer reads of profile.role still prevent unauthorized actions today
  for normal users; the gap is "what if a malicious tenant member uses
  the Firestore SDK directly to bypass the UI."
- Photo replacement during a concurrent edit: edit-view replaces photos
  via direct service calls (not via the form's onSubmit), bypassing
  the lock's save flow. Photo replace and form-text updates touch
  disjoint fields so corruption is impossible, but the user might be
  surprised by a photo change happening while another admin is in the
  edit form. Acceptable trade-off; field-set disjointness is the
  guarantee.

**Next session(s):**
- Subscriptions module per §15. New collection per kid; new sub-
  resource of the playground operation.
- Sibling linking (FamilyID join across kids).
- School/grade catalog management (currently free-text + autocomplete
  from existing kid data).
- Errors viewer in Admin Panel (the writer is in place since §39.8;
  reader is overdue).

### §39.14 — 2026-04-29 — Sibling linking

**Goal:** Implement sibling linking per §9.7 — kids who share a FamilyID
are siblings. UI to view, link, and unlink siblings from the kid profile.

**Permission model (per §39.14):**

| Action          | Operator | Admin | SuperAdmin |
|-----------------|----------|-------|------------|
| View siblings   | ✅       | ✅    | ✅         |
| Link sibling    | ✅       | ✅    | ✅         |
| Unlink sibling  | ❌       | ✅    | ✅         |

Linking is non-destructive (reversible, no data loss), so any tenant
member can link. Unlinking is gated to Admin+ — same gate as canEditKids.

**Linking semantics (encoded in family-service.linkSibling):**
- Neither kid has FamilyID → generate fresh ID, assign to both.
- One kid has FamilyID → other joins that family.
- Both have SAME FamilyID → no-op.
- Both have DIFFERENT FamilyIDs → REJECTED (errorKey
  "siblingFamiliesConflict"). Merging two existing families is dangerous
  because it could affect 4+ kids silently. User must unlink one side
  first.

**Unlink auto-detach rule:** if unlinking a kid would leave exactly one
other kid in the family, that kid is also detached. A family of one isn't
a family. Implemented in unlinkSibling — does an out-of-transaction query
to count siblings, then detaches both inside the transaction.

**Files added:**
- `public/src/kids/family-service.js` — getSiblings, linkSibling,
  unlinkSibling, searchKidsByName. linkSibling and unlinkSibling use
  Firestore transactions for read-modify-write safety. Field-set
  discipline: only writes FamilyID + UpdatedAt + UpdatedBy. Disjoint
  from updateKid, blockKid, etc — concurrent edits + sibling changes
  cannot corrupt each other.
- `public/src/kids/family-section.js` — the Family section rendered on
  the profile page. Self-mounting: profile-view calls
  renderFamilySection(body, kidId, profile) and gets back a cleanup fn.
  Lists siblings with thumb + name + status pill; rows are clickable to
  navigate to that sibling's profile. Each row has a gated Unlink
  button (Admin+).
- `public/src/kids/link-sibling-modal.js` — search-and-pick modal.
  Debounced (220ms) prefix search via SearchKey. Excludes self + already-
  linked siblings from results. Returns Promise<picked|null>.

**Files modified:**
- `public/src/kids/profile-view.js` — five small edits: import
  renderFamilySection, declare familyCleanupRef, mount the section
  inside renderProfile, tear it down in cleanup() and renderNotFound().
  No behavioral change to existing profile rendering.
- `public/src/strings/en.js` — added kids.profile.familySectionTitle/
  familyLoading/familyEmpty/familyLinkButton/familyUnlinkButton,
  confirmUnlinkTitle/Body/Confirm, linkModal* search-modal copy,
  toast.siblingLinked/siblingUnlinked, errors.siblingsReadFailed +
  5 new sibling error keys.
- `firestore.indexes.json` — added FamilyID+Deleted composite index for
  the getSiblings query path.

**Tested behaviors (all green):**
1. Link two unlinked kids → shared FamilyID created, both profiles
   show each other. Persists across refresh.
2. Unlink → bidirectional detach (auto-detach orphan rule fires when
   only one other sibling remains in the family).
3. Three-sibling family: third kid joins existing family without
   generating a new FamilyID.
4. Conflict: linking two kids who are each already in DIFFERENT
   families is rejected with the "already in different families" toast.

**Tested-but-deferred:**
- Operator linking + Admin unlinking gates not exercised end-to-end —
  only one SuperAdmin user exists in dev. The pure-function checks in
  permissions.js are simple enough to trust until an Operator/Admin user
  exists for smoke testing.

**Known issues (deferred):**
- Server-side rule enforcement for kids.FamilyID writes is intent-only,
  same as edit-locks (§39.11) and destructive actions (§39.13). Catch-
  all rule still ORs. Hardening pass is its own session.
- Sibling search is prefix-by-FullName-SearchKey only — same limitation
  as the kids-list search (§39.10). If the user types "khoury" it won't
  find "Maya Khoury". Acceptable; staff search by first name in practice.
- The link modal's "Already in another family" hint is purely
  informational — it doesn't pre-block the pick. The service layer
  rejects with siblingFamiliesConflict if needed. Decision: avoid a
  second Firestore lookup at modal time; service is source of truth.

**Next session(s):**
- Subscriptions module per §15.
- Errors viewer in Admin Panel (writer in place since §39.8).
- Catch-all Firestore rules tightening + Operator/Admin smoke tests.

**END OF MASTER PROMPT v6.2**
