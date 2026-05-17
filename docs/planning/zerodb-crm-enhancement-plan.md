# Business Buddy CRM — ZeroDB Enhancement Plan

**Version**: 1.0  
**Status**: Awaiting Team Review  
**Author**: AINative Dev Team (Cody)  
**Date**: 2026-05-17  
**Repo**: https://github.com/nfajors/business-buddy-crm  
**Live**: https://business-buddy-crm-production.up.railway.app  
**ZeroDB Docs**: https://docs.ainative.studio  
**Platform**: https://ainative.studio

---

## Executive Summary

Business Buddy CRM is a production-ready internal tool for the Winning Careers team. The current foundation — contacts, pipeline kanban, tasks, notes, CSV import/export — is fully operational on ZeroDB's NoSQL Tables API.

This plan outlines how to leverage ZeroDB's full feature set (Semantic Search, Vector Storage, Events, File Storage, Memory API, and Quantum Search) to transform the CRM from a basic contact manager into an intelligent outreach platform — and integrate it directly with the public Winning Careers website contact form.

---

## Current State Assessment

### What Works
| Feature | Status |
|---------|--------|
| Contact CRUD | ✅ Production |
| Pipeline Kanban (5 stages) | ✅ Production |
| Task management | ✅ Production |
| Notes per contact | ✅ Production |
| CSV import/export | ✅ Production |
| Activity timeline | ✅ Production |
| Search (substring match) | ✅ Basic |
| Dashboard stats | ✅ Basic |
| Auth (allowlist + shared password) | ✅ Production |
| Railway auto-deploy | ✅ Production |

### Current Weaknesses
| Weakness | Impact |
|----------|--------|
| Substring-only search | Typos break search; no relevance ranking |
| No contact form integration | Website leads must be manually entered |
| No file attachments | Can't store resumes, proposals, contracts |
| No AI summaries | Staff must read full history to catch up |
| Stats are counts only | No pipeline velocity, no conversion rates |
| No workflow automation | Stage changes require manual follow-up tasks |
| No duplicate detection | CSV imports can create duplicate contacts |
| No proactive lead generation | Sales team must manually source leads outside the CRM |

---

## Enhancement Initiatives

---

### Initiative 1 — Contact Form → CRM Auto-Integration
**Priority**: 🔴 Critical  
**ZeroDB APIs**: NoSQL Tables, Events  
**Effort**: 1 sprint (2 weeks)

#### Problem
Every time someone submits the contact form at winning.careers, the team manually creates a contact and follow-up task in the CRM. This is friction that causes leads to fall through the gaps.

#### Solution
Add a single webhook endpoint to the winning-backend that:
1. Receives the contact form POST
2. Creates a contact row in the CRM ZeroDB project
3. Creates a follow-up task assigned to the team
4. Fires a ZeroDB event for the audit trail
5. Sends a confirmation email to the submitter via existing SMTP

#### Architecture
```
winning.careers contact form
    ↓ POST
winning-backend: POST /api/v1/public/contact-form
    ↓
    ├── Insert contact → CRM ZeroDB (project: eaa2db3e)
    ├── Insert task   → CRM ZeroDB ("Follow up with [name] from website")
    ├── Create event  → ZeroDB Events (type: contact_form_submitted)
    └── Send email    → SMTP (confirmation to submitter)
```

#### Data Mapping
| Form Field | CRM Field | Notes |
|-----------|-----------|-------|
| First Name | `first_name` | Required |
| Last Name | `last_name` | Required |
| Email | `email` | Required, validated |
| Organization | `company` | Optional |
| Message | First note | Stored as note on contact |
| — | `pipeline_stage` | Auto-set to `new` |
| — | `created_by` | Auto-set to `system` |
| — | `tags` | Auto-tag `["website-lead"]` |

#### Acceptance Criteria
- [ ] Contact form submission creates contact in CRM within 5 seconds
- [ ] Follow-up task created with due date 24hrs from submission
- [ ] Contact tagged `website-lead` for filtering
- [ ] Submitter receives confirmation email
- [ ] Duplicate email check before creating (update if exists)
- [ ] Error logging if ZeroDB write fails (no silent drops)

---

### Initiative 2 — Semantic Search
**Priority**: 🔴 High  
**ZeroDB APIs**: Embeddings, Vector Storage, Semantic Search  
**Effort**: 1 sprint (2 weeks)

#### Problem
Current search uses substring matching on a `search_blob` field. "Jon" doesn't find "John". "VP Sales" doesn't find "Vice President of Sales". No relevance ranking.

#### Solution
On every contact save, generate an embedding of the contact's key fields and store it as a vector. Search queries get embedded at query time and return semantically ranked results.

#### Architecture
```
Contact created/updated
    ↓
zerodb_embed_and_store({
  text: "John Smith VP Sales Acme Corp New York",
  metadata: { contact_id, pipeline_stage, created_at }
})

User types "sales executive at acme"
    ↓
zerodb_semantic_search({ query: "sales executive at acme", limit: 20 })
    → Returns John Smith ranked #1 (semantic match)
    → Falls back to table query for non-matching results
```

#### Acceptance Criteria
- [ ] Semantic search active for all new contacts
- [ ] Existing contacts backfilled via one-time migration script
- [ ] Typo tolerance: "Jon Smth" finds "John Smith"
- [ ] Results ranked by relevance score
- [ ] Falls back gracefully if vector search unavailable
- [ ] Search latency < 500ms (p95)

---

### Initiative 3 — File Attachments
**Priority**: 🟡 Medium  
**ZeroDB APIs**: File Storage, Presigned URLs  
**Effort**: 1 sprint (2 weeks)

#### Problem
No way to attach files to contacts. Teams share resumes, proposals, and meeting notes via email/Slack and lose track of them.

#### Solution
Use ZeroDB File Storage to attach files to contacts. Files are namespaced by contact ID, retrieved via time-limited presigned URLs.

#### Architecture
```
User uploads file on contact detail page
    ↓
zerodb_upload_file({
  file: <binary>,
  path: contacts/{contact_id}/{filename},
  metadata: { contact_id, uploaded_by, type: "resume|proposal|contract|other" }
})
    ↓
Activity logged: "Attachment added: resume.pdf"
File listed on contact detail with download link (presigned, 1hr TTL)
```

#### Acceptance Criteria
- [ ] Upload UI on contact detail page (drag-drop + file picker)
- [ ] Supported types: PDF, DOCX, PNG, JPG (max 10MB)
- [ ] Files listed with name, size, uploader, date
- [ ] Download via presigned URL (1hr expiry)
- [ ] Delete file (admin or uploader only)
- [ ] Activity log entry on upload/delete

---

### Initiative 4 — AI Contact Summaries
**Priority**: 🟡 Medium  
**ZeroDB APIs**: Memory API, Context API, ZeroMemory  
**Effort**: 2 sprints (4 weeks)

#### Problem
When a team member opens a contact they haven't touched in weeks, they must read through the full activity timeline to understand where things stand. For busy staff, this context-switching is a time sink.

#### Solution
Use ZeroDB's Memory API to store and retrieve a living summary of each contact relationship. After each meaningful activity (stage change, note, call, meeting), update the memory. Surface a 2-3 sentence AI-generated summary at the top of the contact detail page.

#### Architecture
```
Stage change / Note added / Task completed
    ↓
zerodb_store_memory({
  content: "2026-05-17: Moved to Responded. Called twice, interested in scholarship program.",
  metadata: { contact_id, type: "relationship_update" }
})

Staff opens contact detail
    ↓
zerodb_get_context({ query: "relationship status with John Smith contact_id: abc" })
    → Returns: "John expressed strong interest in the scholarship program after 2 calls.
                Meeting scheduled for next week. Warm lead — prioritize."
```

#### Acceptance Criteria
- [ ] Summary card shown at top of contact detail (collapsible)
- [ ] Summary refreshes after each activity
- [ ] Summary sourced from ZeroDB Memory API
- [ ] Graceful empty state for new contacts with no history
- [ ] Admin can manually trigger summary refresh

---

### Initiative 5 — Hunter.io Lead Generation Integration
**Priority**: 🔴 High  
**External API**: Hunter.io (Domain Search, Email Finder, Email Verifier)  
**ZeroDB APIs**: NoSQL Tables, Events, Embeddings  
**Effort**: 2 sprints (4 weeks)

#### Problem
The CRM is reactive — contacts only enter when someone submits the website form or a staff member adds them manually. The sales team has no way to proactively find and qualify leads from target companies or industries without leaving the CRM.

#### Solution
Integrate Hunter.io's API to give the sales team three outbound lead generation capabilities directly inside the CRM:

1. **Domain Search** — Enter a company domain (e.g. `acme.com`) and pull all publicly available professional emails from that organization into the CRM as new leads
2. **Email Finder** — Look up the most likely email address for a named person at a company
3. **Email Verification** — Verify any email address before outreach to reduce bounce rate

All discovered leads are auto-tagged `hunter-lead`, deduped against existing contacts, and immediately available in the pipeline.

#### Architecture
```
CRM User opens "Find Leads" panel
    ↓
Hunter.io Domain Search
POST https://api.hunter.io/v2/domain-search?domain=acme.com&api_key={key}
    ↓
For each result:
    ├── Dedup check → CRM ZeroDB contacts table (match on email)
    ├── Insert new contact row (if not exists)
    │     pipeline_stage = "new"
    │     created_by = "hunter"
    │     tags = ["hunter-lead", "domain:{domain}"]
    ├── Generate embedding → ZeroDB vector store
    └── Fire ZeroDB event (type: hunter_lead_imported)

CRM User opens contact detail → "Verify Email" button
    ↓
Hunter.io Email Verifier
GET https://api.hunter.io/v2/email-verifier?email={email}&api_key={key}
    ↓
Result stored on contact: email_verified: true/false, deliverability: "good|risky|invalid"
Activity log entry: "Email verified via Hunter.io: deliverability=good"
```

#### Data Mapping
| Hunter.io Field | CRM Field | Notes |
|----------------|-----------|-------|
| `first_name` | `first_name` | |
| `last_name` | `last_name` | |
| `email` | `email` | Dedup key |
| `position` | `title` | Job title |
| `organization` | `company` | |
| `linkedin_url` | `linkedin_url` | |
| `phone_number` | `phone` | |
| — | `pipeline_stage` | Auto-set to `new` |
| — | `created_by` | Auto-set to `hunter` |
| — | `tags` | `["hunter-lead", "domain:{domain}"]` |
| `confidence` | `email_confidence` | Hunter's confidence score 0–100 |
| — | `email_verified` | Set after verification step |

#### Hunter.io API Limits (free tier)
| Plan | Domain Searches/mo | Email Finders/mo | Verifications/mo |
|------|-------------------|-----------------|-----------------|
| Free | 25 | 25 | 50 |
| Starter ($34/mo) | 500 | 500 | 1,000 |
| Growth ($104/mo) | 2,500 | 2,500 | 5,000 |

**Recommendation**: Start on Starter plan. Volume justifies Growth once pipeline proves ROI.

#### Acceptance Criteria
- [ ] "Find Leads" panel accessible from CRM sidebar (admin only)
- [ ] Domain search imports up to 100 contacts per search
- [ ] Dedup: existing contacts are skipped (not duplicated), count reported
- [ ] All imported contacts tagged `hunter-lead` and filterable
- [ ] Email Finder available on "Add Contact" form (lookup by name + company)
- [ ] Email Verifier available on any contact with an email address
- [ ] Verification result (deliverability score) stored on contact and shown in UI
- [ ] ZeroDB event fired per batch import for audit trail
- [ ] API key stored in env var — never exposed client-side
- [ ] Rate limit handling: graceful error if Hunter quota exceeded
- [ ] Hunter.io credits consumed shown in CRM settings page

#### Security Note
Hunter.io API key must be stored server-side (winning-backend env var `HUNTER_API_KEY`). All Hunter.io calls are proxied through a winning-backend endpoint — the key is never in the frontend bundle.

---

### Initiative 6 — Pipeline Intelligence & Lead Scoring
**Priority**: 🟢 Future  
**ZeroDB APIs**: Quantum Hybrid Search, Vector Search  
**Effort**: 2 sprints (4 weeks)

#### Problem
The pipeline kanban shows all contacts equally. High-priority leads that haven't been contacted in 7 days look the same as ones touched yesterday.

#### Solution
Use ZeroDB's Quantum Hybrid Search to score and rank leads within each pipeline column by combining:
- Semantic similarity to an "ideal engaged contact" profile
- Metadata signals: days since last activity, stage age, task overdue status

#### Architecture
```
Pipeline column renders
    ↓
zerodb_quantum_hybrid_search({
  query: "responded to outreach interested in program",
  metadata_filters: { pipeline_stage: "contacted" },
  classical_weight: 0.4,
  quantum_weight: 0.6
})
    → Returns contacts ranked by engagement likelihood
    → Hot leads surface at top of each column
```

#### Acceptance Criteria
- [ ] "Smart sort" toggle on pipeline view (default: by date, option: by score)
- [ ] Lead score badge on contact cards (Hot / Warm / Cold)
- [ ] Score computed on demand, cached 1hr
- [ ] Score breakdown visible on hover

---

### Initiative 7 — Analytics Dashboard
**Priority**: 🟢 Future  
**ZeroDB APIs**: NoSQL Tables queries, Events  
**Effort**: 2 sprints (4 weeks)

#### Problem
Current dashboard shows only 4 static counts. No pipeline velocity, no conversion rates, no time-series, no per-staff breakdown.

#### Solution
Build a rich analytics view using ZeroDB table queries and the Events system for time-series data.

#### Metrics to Add
| Metric | Source |
|--------|--------|
| Contacts added this week/month | Tables query with date filter |
| Stage conversion rates (new→contacted→responded) | Tables count queries |
| Average days per stage | Activities query + math |
| Website leads vs manual | Tags filter (`website-lead`) |
| Tasks overdue by assignee | Tasks query |
| Activity heatmap (by day of week) | Events + Activities |

---

## Contact Form Integration — Technical Spec

This is the most impactful near-term initiative. Full technical details for the backend team:

### Endpoint

```
POST https://api.winning.careers/api/v1/public/contact-form
Content-Type: application/json
```

### Request Body
```json
{
  "first_name": "string (required)",
  "last_name": "string (required)",
  "email": "string (required, validated)",
  "company": "string (optional)",
  "message": "string (optional)",
  "source": "string (optional, e.g. 'website-contact-form')"
}
```

### Response
```json
{ "success": true, "contact_id": "uuid" }
```

### Backend Logic (winning-backend)
```python
ZERODB_API_KEY = settings.ZERODB_API_KEY          # wc_prod_57c3...
CRM_PROJECT_ID = "eaa2db3e-f83a-4cc3-84f4-299b882e3094"
CRM_BASE       = "https://api.ainative.studio/api/v1"

async def handle_contact_form(data: ContactFormInput):
    # 1. Dedup check — find existing contact by email
    # 2. Insert or update contact row
    # 3. Insert first note with message body
    # 4. Insert follow-up task (due 24hrs)
    # 5. Fire ZeroDB event
    # 6. Send confirmation email
```

### Frontend (winning.careers — Strapi or static)
Update the form `action` or JS `fetch` target to point at the new endpoint. No other changes needed.

---

## Dependencies & Prerequisites

| Dependency | Owner | Status |
|-----------|-------|--------|
| winning-backend endpoint | Backend team | Not started |
| ZeroDB CRM project credentials in winning-backend | Cody / DevOps | ✅ Done |
| ZeroDB Vector index enabled on CRM project | Cody | Not started |
| Semantic search UI in CRM frontend | Frontend team | Not started |
| File storage UI in CRM frontend | Frontend team | Not started |
| Memory API integration | Frontend + Backend | Not started |
| Hunter.io account + API key | Nique / DevOps | Not started |
| `HUNTER_API_KEY` in winning-backend env | DevOps | Not started |
| Hunter.io proxy endpoints on winning-backend | Backend team | Not started |

---

## Success Metrics

| Metric | Baseline | 90-Day Target |
|--------|---------|---------------|
| Website leads auto-captured | 0% | 100% |
| Search accuracy (found in top 3) | ~60% | >90% |
| Time to context on contact open | 2–3 min | <30 sec |
| Contacts with file attachments | 0% | >40% |
| Pipeline leads scored | 0% | 100% |
| Outbound leads generated via Hunter.io | 0/mo | >200/mo |
| Email bounce rate on outreach | Unknown | <5% (verified contacts) |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| ZeroDB vector search latency > 500ms | Low | Cache results, fallback to table search |
| Contact form endpoint abuse (spam) | Medium | Rate limit by IP, honeypot field, CAPTCHA |
| Duplicate contacts from form submissions | Medium | Dedup by email before insert; update if exists |
| File storage costs exceed budget | Low | 2GB free tier; enforce 10MB limit per file |
| Hunter.io quota exhausted | Medium | Track credits in settings UI; alert at 80% usage |
| Hunter.io data quality (stale emails) | Medium | Always verify before outreach; store deliverability score |
| CAN-SPAM / GDPR compliance on outbound | Medium | Tag all Hunter leads; provide unsubscribe in all outreach |

---

## Approvals Required

- [ ] Nique Fajors (Product) — feature priority sign-off
- [ ] Winning Careers team — contact form endpoint approval
- [ ] AINative Dev Team — architecture review

---

*Built by AINative Dev Team — All Data Services Built on ZeroDB*
