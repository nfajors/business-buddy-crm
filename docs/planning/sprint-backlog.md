# Business Buddy CRM — ZeroDB Enhancement Sprint Backlog

**Version**: 1.1  
**Status**: Awaiting Team Review  
**Author**: AINative Dev Team (Cody)  
**Date**: 2026-05-17  
**Parent Plan**: [zerodb-crm-enhancement-plan.md](./zerodb-crm-enhancement-plan.md)  
**Repo**: https://github.com/nfajors/business-buddy-crm  

---

## Sprint Summary

| Sprint | Initiative | Points | Deliverable |
|--------|-----------|--------|-------------|
| Sprint 1 | Contact Form → CRM Auto-Integration | 13 | Webhook endpoint live, leads auto-created |
| Sprint 2 | Semantic Search | 13 | Vector search live, existing contacts backfilled |
| Sprint 3 | File Attachments | 8 | Upload/download on contact detail page |
| Sprint 4–5 | AI Contact Summaries | 13 | Living summary card per contact |
| Sprint 6 | Hunter.io Lead Generation | 13 | Domain search, email finder, verifier live |
| Sprint 7–8 | Pipeline Intelligence & Lead Scoring | 13 | Smart sort + lead score badges |
| Sprint 9 | Analytics Dashboard | 8 | Rich metrics view with time-series |

---

## Sprint 1 — Contact Form → CRM Auto-Integration

**Duration**: 2 weeks  
**Priority**: Critical  
**Team**: Backend (winning-backend endpoint) + Frontend (form target update)

### Epic: Auto-create CRM contacts from winning.careers contact form submissions

---

#### Story 1.1 — Backend: Contact Form Webhook Endpoint
**Points**: 5  
**Owner**: Backend  
**Branch**: `feat/[issue]-contact-form-webhook`

**As a** Winning Careers staff member,  
**I want** every contact form submission on winning.careers to automatically create a contact in Business Buddy CRM,  
**so that** no inbound leads fall through the gaps due to manual entry delays.

**Acceptance Criteria**:
- [ ] `POST /api/v1/public/contact-form` endpoint on winning-backend
- [ ] Validates required fields: `first_name`, `last_name`, `email`
- [ ] Dedup check: if email exists in CRM, update existing contact (do not create duplicate)
- [ ] Inserts new contact row in CRM ZeroDB project (`eaa2db3e-f83a-4cc3-84f4-299b882e3094`)
  - `pipeline_stage = "new"`
  - `created_by = "system"`
  - `tags = ["website-lead"]`
- [ ] Contact creation completes within 5 seconds of form submission
- [ ] Error logged (not silently dropped) if ZeroDB write fails
- [ ] Returns `{ "success": true, "contact_id": "uuid" }` on success

**Technical Notes**:
- Use `ZERODB_API_KEY` and `CRM_PROJECT_ID` already in winning-backend env
- Base URL: `https://api.ainative.studio/api/v1`
- Table path: `/projects/{id}/database/tables/contacts/rows`

---

#### Story 1.2 — Backend: Auto-create Follow-up Task
**Points**: 2  
**Owner**: Backend  
**Branch**: `feat/[issue]-contact-form-webhook` (same PR as 1.1)

**As a** Winning Careers staff member,  
**I want** a follow-up task automatically created when a website lead comes in,  
**so that** the team is always reminded to respond within 24 hours.

**Acceptance Criteria**:
- [ ] Follow-up task created in CRM tasks table after contact insert
- [ ] Task title: `"Follow up with [first_name] [last_name] from website"`
- [ ] Task due date: 24 hours from submission timestamp
- [ ] Task assigned to team (default assignee)
- [ ] Task linked to contact via `contact_id`

---

#### Story 1.3 — Backend: ZeroDB Event Audit Trail
**Points**: 1  
**Owner**: Backend  
**Branch**: `feat/[issue]-contact-form-webhook` (same PR)

**As a** CRM admin,  
**I want** a ZeroDB event fired on every contact form submission,  
**so that** I can query the audit trail to see submission history.

**Acceptance Criteria**:
- [ ] `POST /api/v1/events/create` called after contact insert
- [ ] Event type: `contact_form_submitted`
- [ ] Event payload includes: `contact_id`, `email`, `source`, `timestamp`

---

#### Story 1.4 — Backend: Confirmation Email to Submitter
**Points**: 2  
**Owner**: Backend

**As a** contact form submitter,  
**I want** to receive a confirmation email after submitting,  
**so that** I know my message was received.

**Acceptance Criteria**:
- [ ] Confirmation email sent via existing SMTP config on winning-backend
- [ ] Email sent to submitter's email address
- [ ] Subject: `"Thanks for reaching out to Winning Careers"`
- [ ] Body includes submitter's first name and a next-steps message
- [ ] Email failure does not block or roll back contact creation

---

#### Story 1.5 — Frontend: Update Contact Form Target
**Points**: 1  
**Owner**: Frontend (winning.careers site)

**As a** Winning Careers web visitor,  
**I want** the contact form to submit to the new backend endpoint,  
**so that** my submission is captured in the CRM.

**Acceptance Criteria**:
- [ ] Form `action` or JS `fetch` target updated to `https://api.winning.careers/api/v1/public/contact-form`
- [ ] Form still shows success/error message to user
- [ ] No other frontend changes required

---

#### Story 1.6 — QA: Spam / Abuse Protection
**Points**: 2  
**Owner**: Backend

**As a** CRM admin,  
**I want** the contact form endpoint to be protected from spam and abuse,  
**so that** the CRM isn't flooded with bot submissions.

**Acceptance Criteria**:
- [ ] Rate limit: max 5 requests per IP per minute
- [ ] Honeypot field in request schema (bots fill it, humans don't)
- [ ] Input sanitized — no XSS payloads accepted
- [ ] 429 returned on rate limit exceeded

---

**Sprint 1 Total**: 13 points

---

## Sprint 2 — Semantic Search

**Duration**: 2 weeks  
**Priority**: High  
**Team**: Backend + Frontend

### Epic: Replace substring search with ZeroDB-powered semantic vector search

---

#### Story 2.1 — Backend/Integration: Embed and Store on Contact Save
**Points**: 3  
**Owner**: Frontend / ZeroDB integration layer

**As a** developer,  
**I want** every new or updated contact to have a semantic embedding stored in ZeroDB,  
**so that** contacts can be found via semantic search queries.

**Acceptance Criteria**:
- [ ] On contact create/update, call `zerodb_embed_and_store` with contact's key fields
- [ ] Embed string: `"{first_name} {last_name} {title} {company} {location} {tags}"`
- [ ] Metadata includes: `contact_id`, `pipeline_stage`, `created_at`
- [ ] Embedding stored in namespace `crm-contacts`
- [ ] No user-visible latency impact (fire-and-forget or async)

---

#### Story 2.2 — Backend: Backfill Migration Script
**Points**: 3  
**Owner**: Backend / Dev

**As a** CRM admin,  
**I want** all existing contacts to have embeddings generated retroactively,  
**so that** semantic search works for contacts created before this feature.

**Acceptance Criteria**:
- [ ] One-time script: reads all contacts from ZeroDB table, generates embeddings, stores vectors
- [ ] Script is idempotent (safe to run twice)
- [ ] Script logs progress: `X of Y contacts embedded`
- [ ] Script documented in `scripts/` directory

---

#### Story 2.3 — Frontend: Semantic Search UI
**Points**: 5  
**Owner**: Frontend

**As a** CRM user,  
**I want** the search bar to return semantically relevant results,  
**so that** typos and synonyms don't break my searches.

**Acceptance Criteria**:
- [ ] Search queries sent to `zerodb_semantic_search` (not just substring filter)
- [ ] Results ranked by relevance score
- [ ] "Jon Smth" returns "John Smith" (typo tolerance)
- [ ] "VP Sales" returns "Vice President of Sales" matches
- [ ] Falls back to table substring search if vector search unavailable
- [ ] Search latency < 500ms (p95)

---

#### Story 2.4 — QA: Search Accuracy Validation
**Points**: 2  
**Owner**: QA

**Acceptance Criteria**:
- [ ] Test suite covers: exact match, typo, synonym, partial name
- [ ] Target: 90% of valid contacts returned in top 3 results

---

**Sprint 2 Total**: 13 points

---

## Sprint 3 — File Attachments

**Duration**: 2 weeks  
**Priority**: Medium  
**Team**: Frontend + ZeroDB File Storage API

### Epic: Attach files (resumes, proposals, contracts) to contacts via ZeroDB File Storage

---

#### Story 3.1 — Frontend: File Upload UI on Contact Detail
**Points**: 3  
**Owner**: Frontend

**As a** CRM user,  
**I want** to upload files directly on a contact's detail page,  
**so that** resumes, proposals, and meeting notes are stored alongside the contact.

**Acceptance Criteria**:
- [ ] Drag-and-drop upload zone on contact detail page
- [ ] File picker as fallback input
- [ ] Supported types: PDF, DOCX, PNG, JPG
- [ ] Max file size: 10MB (client-side validation)
- [ ] Upload progress indicator
- [ ] Files namespaced by contact: `contacts/{contact_id}/{filename}`

---

#### Story 3.2 — Frontend: File List and Download
**Points**: 2  
**Owner**: Frontend

**As a** CRM user,  
**I want** to see all files attached to a contact and download them,  
**so that** I can access relevant documents without leaving the CRM.

**Acceptance Criteria**:
- [ ] Files listed with: name, size, uploader, upload date, file type icon
- [ ] Download via presigned URL (1hr TTL, generated on click)
- [ ] Empty state shown when no files attached

---

#### Story 3.3 — Frontend: File Delete
**Points**: 1  
**Owner**: Frontend

**As a** CRM admin or file uploader,  
**I want** to delete files I've uploaded,  
**so that** outdated documents don't clutter the contact profile.

**Acceptance Criteria**:
- [ ] Delete button visible on files (admin: any file; user: own files only)
- [ ] Confirmation dialog before delete
- [ ] File removed from ZeroDB File Storage
- [ ] Activity log entry: `"Attachment deleted: {filename}"`

---

#### Story 3.4 — Activity Log: File Events
**Points**: 2  
**Owner**: Frontend

**Acceptance Criteria**:
- [ ] Activity log entry created on upload: `"Attachment added: {filename}"`
- [ ] Activity log entry created on delete: `"Attachment deleted: {filename}"`
- [ ] Uploader and timestamp recorded

---

**Sprint 3 Total**: 8 points

---

## Sprints 4–5 — AI Contact Summaries

**Duration**: 4 weeks  
**Priority**: Medium  
**Team**: Frontend + ZeroDB Memory API

### Epic: Surface AI-generated relationship summaries using ZeroDB Memory API

---

#### Story 4.1 — Integration: Store Memory on Activity Events
**Points**: 3  
**Owner**: Frontend / Integration

**As a** developer,  
**I want** significant contact events (stage change, note, task complete) to be stored in ZeroDB Memory,  
**so that** the AI has a rich history to summarize.

**Acceptance Criteria**:
- [ ] Memory stored on: stage change, note added, task completed
- [ ] Memory content: `"{date}: {event description}. {relevant context}."`
- [ ] Metadata: `contact_id`, `event_type`, `timestamp`
- [ ] Memory stored in namespace `crm-contact-summaries`

---

#### Story 4.2 — Frontend: Summary Card on Contact Detail
**Points**: 5  
**Owner**: Frontend

**As a** CRM user,  
**I want** to see a 2-3 sentence AI summary at the top of the contact detail page,  
**so that** I can quickly understand where the relationship stands without reading the full timeline.

**Acceptance Criteria**:
- [ ] Summary card displayed at top of contact detail (above activity feed)
- [ ] Summary fetched via `zerodb_get_context` on page load
- [ ] Card is collapsible (user preference stored in localStorage)
- [ ] Loading skeleton shown while fetching
- [ ] Empty state: `"No history yet — add notes or activities to build a summary."`

---

#### Story 4.3 — Frontend: Auto-refresh Summary After Activity
**Points**: 3  
**Owner**: Frontend

**Acceptance Criteria**:
- [ ] Summary refreshes automatically after: note added, stage changed, task completed
- [ ] Refresh is async — does not block the UI action
- [ ] User sees updated summary within 3 seconds of activity

---

#### Story 4.4 — Admin: Manual Summary Refresh
**Points**: 2  
**Owner**: Frontend

**Acceptance Criteria**:
- [ ] "Refresh Summary" button visible to admin users
- [ ] Triggers `zerodb_get_context` call and updates card
- [ ] Button shows spinner while loading

---

**Sprints 4–5 Total**: 13 points

---

## Sprint 6 — Hunter.io Lead Generation Integration

**Duration**: 2 weeks  
**Priority**: High  
**Team**: Backend (winning-backend proxy) + Frontend (CRM UI)  
**External API**: Hunter.io  
**Prerequisite**: Hunter.io account + `HUNTER_API_KEY` in winning-backend env

### Epic: Proactive outbound lead generation via Hunter.io inside Business Buddy CRM

---

#### Story 6.1 — Backend: Hunter.io Proxy Endpoints
**Points**: 3  
**Owner**: Backend  
**Branch**: `feat/[issue]-hunter-integration`

**As a** developer,  
**I want** winning-backend to proxy all Hunter.io API calls,  
**so that** the API key is never exposed in the frontend bundle.

**Acceptance Criteria**:
- [ ] `GET /api/v1/internal/hunter/domain-search?domain={domain}` — proxies Hunter domain search
- [ ] `GET /api/v1/internal/hunter/email-finder?first_name={}&last_name={}&domain={}` — proxies email finder
- [ ] `GET /api/v1/internal/hunter/email-verifier?email={}` — proxies email verifier
- [ ] All three endpoints require CRM auth (not public)
- [ ] `HUNTER_API_KEY` loaded from env — never hardcoded
- [ ] Hunter 4xx/5xx errors returned as structured JSON (not raw Hunter response)
- [ ] Rate limit exceeded returns `429` with `"Hunter.io quota exceeded"` message

**Technical Notes**:
- Hunter.io base URL: `https://api.hunter.io/v2`
- Domain search returns up to 100 emails per request
- Confidence score 0–100 included per email

---

#### Story 6.2 — Backend: Bulk Import Contacts from Domain Search
**Points**: 3  
**Owner**: Backend  
**Branch**: `feat/[issue]-hunter-integration` (same PR)

**As a** CRM admin,  
**I want** Hunter.io domain search results to be bulk-imported into the CRM,  
**so that** the sales team has a pipeline of leads from target companies immediately.

**Acceptance Criteria**:
- [ ] `POST /api/v1/internal/hunter/import-domain` endpoint
- [ ] Accepts `{ domain, assign_to }` body
- [ ] For each Hunter result:
  - Dedup check by email — skip if contact already exists
  - Insert new contact with `pipeline_stage = "new"`, `created_by = "hunter"`, `tags = ["hunter-lead", "domain:{domain}"]`
  - Store `email_confidence` score on contact
- [ ] Returns `{ imported: N, skipped: N, errors: N }` summary
- [ ] ZeroDB event fired: type `hunter_domain_import`, payload includes domain + counts
- [ ] Errors logged per contact — batch does not fail on single bad record

---

#### Story 6.3 — Frontend: "Find Leads" Panel (Domain Search)
**Points**: 3  
**Owner**: Frontend

**As a** CRM admin,  
**I want** a "Find Leads" panel in the CRM where I can search a company domain and import all discovered contacts,  
**so that** I can fill the pipeline with outbound leads without leaving the CRM.

**Acceptance Criteria**:
- [ ] "Find Leads" item in CRM sidebar (admin-only, hidden for regular users)
- [ ] Domain input field with search button
- [ ] Results preview table: name, email, title, confidence score — before import
- [ ] "Import All" and "Import Selected" (checkbox) actions
- [ ] Post-import toast: `"Imported 12 contacts, 3 already existed"`
- [ ] Imported contacts immediately visible in pipeline under `new` stage
- [ ] Loading state while fetching from Hunter.io proxy

---

#### Story 6.4 — Frontend: Email Finder on "Add Contact" Form
**Points**: 2  
**Owner**: Frontend

**As a** CRM user,  
**I want** to look up a person's email address by name and company while adding a contact,  
**so that** I don't have to guess or manually search for it externally.

**Acceptance Criteria**:
- [ ] "Find Email" button on the Add Contact form (next to email field)
- [ ] Requires first name, last name, and company domain to be filled first
- [ ] Calls Hunter.io email finder via backend proxy
- [ ] Auto-fills email field with result
- [ ] Shows confidence score next to the email: `"Found: 87% confidence"`
- [ ] Graceful message if no result: `"No email found for this person"`

---

#### Story 6.5 — Frontend: Email Verification on Contact Detail
**Points**: 1  
**Owner**: Frontend

**As a** CRM user,  
**I want** to verify any contact's email address before I send outreach,  
**so that** I don't waste quota emailing bounced addresses.

**Acceptance Criteria**:
- [ ] "Verify Email" button on contact detail page (next to email field)
- [ ] Calls Hunter.io verifier via backend proxy
- [ ] Result stored on contact: `email_verified: true/false`, `email_deliverability: "good|risky|invalid"`
- [ ] Status badge shown on contact: green = good, yellow = risky, red = invalid
- [ ] Activity log entry: `"Email verified via Hunter.io: deliverability=good"`
- [ ] Button disabled if email already verified within last 30 days

---

#### Story 6.6 — Frontend: Hunter.io Credit Usage in Settings
**Points**: 1  
**Owner**: Frontend

**As a** CRM admin,  
**I want** to see how many Hunter.io credits remain this month,  
**so that** I don't hit the quota unexpectedly mid-campaign.

**Acceptance Criteria**:
- [ ] Hunter.io usage widget on CRM settings page (admin only)
- [ ] Shows: searches used / monthly limit, verifications used / monthly limit
- [ ] Warning state at 80% usage: `"You've used 80% of your Hunter.io quota"`
- [ ] Data fetched from `GET /api/v1/internal/hunter/account` proxy endpoint

---

**Sprint 6 Total**: 13 points

---

## Sprints 7–8 — Pipeline Intelligence & Lead Scoring

**Duration**: 4 weeks  
**Priority**: Future  
**Team**: Frontend + ZeroDB Quantum Hybrid Search

### Epic: Score and rank pipeline leads using ZeroDB Quantum Hybrid Search

---

#### Story 6.1 — Integration: Lead Score Computation
**Points**: 5  
**Owner**: Frontend / Integration

**As a** CRM user,  
**I want** leads in the pipeline to be scored by engagement likelihood,  
**so that** I know which contacts to prioritize.

**Acceptance Criteria**:
- [ ] Score computed via `zerodb_quantum_hybrid_search` with:
  - `classical_weight: 0.4`, `quantum_weight: 0.6`
  - Metadata filters: `pipeline_stage`
  - Query: `"responded to outreach interested in program"`
- [ ] Score computed on demand, cached 1hr per contact
- [ ] Score labels: `Hot` (>0.8), `Warm` (0.5–0.8), `Cold` (<0.5)

---

#### Story 6.2 — Frontend: Lead Score Badge on Pipeline Cards
**Points**: 3  
**Owner**: Frontend

**Acceptance Criteria**:
- [ ] Score badge on each contact card in pipeline view
- [ ] Badge color: red = Hot, yellow = Warm, blue = Cold
- [ ] Score breakdown tooltip on hover: key signals that drove score

---

#### Story 6.3 — Frontend: Smart Sort Toggle
**Points**: 3  
**Owner**: Frontend

**Acceptance Criteria**:
- [ ] Sort toggle on pipeline view: `By Date` (default) | `By Score` (smart sort)
- [ ] Smart sort orders cards within each column by score descending
- [ ] Toggle state persisted in localStorage
- [ ] Hot leads surface at top of each column in smart sort mode

---

#### Story 6.4 — QA: Score Accuracy Review
**Points**: 2  
**Owner**: QA / Product

**Acceptance Criteria**:
- [ ] Manual review of 20 contacts across pipeline stages
- [ ] Score labels validated against known engagement history
- [ ] Score tuning documented if calibration needed

---

**Sprints 7–8 Total**: 13 points

---

## Sprint 9 — Analytics Dashboard

**Duration**: 2 weeks  
**Priority**: Future  
**Team**: Frontend

### Epic: Replace static count cards with rich metrics using ZeroDB table queries and Events

---

#### Story 9.1 — Dashboard: Pipeline Velocity Metrics
**Points**: 3  
**Owner**: Frontend

**Acceptance Criteria**:
- [ ] Contacts added this week / this month (date-filtered table query)
- [ ] Stage conversion rates: new → contacted → responded → enrolled
- [ ] Average days per stage (activities query + math)

---

#### Story 9.2 — Dashboard: Source Breakdown
**Points**: 2  
**Owner**: Frontend

**Acceptance Criteria**:
- [ ] Lead source breakdown: website form vs Hunter.io import vs manual entry
- [ ] Filter by tag: `website-lead`, `hunter-lead`
- [ ] Displayed as percentage + count per source
- [ ] Filterable by date range

---

#### Story 9.3 — Dashboard: Task & Overdue Summary
**Points**: 2  
**Owner**: Frontend

**Acceptance Criteria**:
- [ ] Tasks overdue by assignee (tasks query with due_date < now)
- [ ] Count of open vs completed tasks this week
- [ ] Link to tasks list filtered to overdue

---

#### Story 9.4 — Dashboard: Activity Heatmap
**Points**: 1  
**Owner**: Frontend

**Acceptance Criteria**:
- [ ] Activity heatmap by day of week (Events + Activities data)
- [ ] Shows busiest outreach days at a glance

---

**Sprint 9 Total**: 8 points

---

## Backlog Summary

| Sprint | Initiative | Points | Status |
|--------|-----------|--------|--------|
| Sprint 1 | Contact Form Integration | 13 | Ready for development |
| Sprint 2 | Semantic Search | 13 | Ready for development |
| Sprint 3 | File Attachments | 8 | Ready for development |
| Sprint 4–5 | AI Contact Summaries | 13 | Requires Sprint 1–2 |
| Sprint 6 | Hunter.io Lead Generation | 13 | Requires Hunter.io API key |
| Sprint 7–8 | Pipeline Intelligence | 13 | Requires Sprint 2 + Sprint 6 |
| Sprint 9 | Analytics Dashboard | 8 | Requires Sprint 1 + Sprint 6 |
| **Total** | | **81** | |

---

## Definition of Done

For every story to be considered complete:

- [ ] Feature works on the live Railway deployment
- [ ] No console errors in production
- [ ] Activity log entry (where applicable)
- [ ] ZeroDB write confirmed via API response (not assumed)
- [ ] Code committed with `Refs #[issue]`
- [ ] PR reviewed and merged to `main`
- [ ] GitHub issue closed

---

*Built by AINative Dev Team — All Data Services Built on ZeroDB*
