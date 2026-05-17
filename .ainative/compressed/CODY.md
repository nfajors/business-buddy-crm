# Business Buddy CRM — Agent Context (Compressed)

## Project
**Stack**: React + TypeScript + Vite + Tailwind + shadcn/ui  
**Live**: https://business-buddy-crm-production.up.railway.app  
**Repo**: https://github.com/nfajors/business-buddy-crm

## ZeroDB (CRM Project)
- **Project ID**: `eaa2db3e-f83a-4cc3-84f4-299b882e3094`
- **Owner**: admin@winning.careers
- **API Base**: `https://api.ainative.studio`
- **Table path**: `/api/v1/projects/{id}/database/tables/{name}/rows`
- **Tables**: contacts, notes, activities, tasks, profiles, user_roles
- **Auth**: API key (`VITE_ZERODB_API_KEY`) + allowlist + `VITE_CRM_PASSWORD`
- **Docs**: https://docs.ainative.studio

## Critical Rules

### 1. Git Commits
- Zero tolerance for AI attribution
- Hook: `.git/hooks/commit-msg` blocks forbidden text

### 2. File Placement
- Docs → `docs/{category}/`
- No root `.md` (except README.md, CLAUDE.md)

### 3. Testing
- Verify on live Railway URL before closing issues
- Confirm ZeroDB writes return success

### 4. Code Quality
- All ZeroDB calls via `src/integrations/zerodb/client.ts`
- No direct fetch to ZeroDB outside integration layer

## Key Files
- `src/integrations/zerodb/client.ts` — ZeroDB client
- `src/hooks/useAuth.tsx` — Auth (allowlist + API key session)
- `src/lib/queries.ts` / `mutations.ts` — Data layer
- `src/lib/auth-allowlist.ts` — Allowed emails

## Allowlisted Users
- `nf@winning.careers` (admin), `mf@winning.careers`, `caleb@winning.careers`, `scott@inspiration-labs.com`

## Dev
```bash
npm install && npm run dev  # http://localhost:5173
```

## Deployment Checklist
- [ ] Feature works on Railway live URL
- [ ] No AI attribution in commits
- [ ] ZeroDB writes verified
- [ ] GitHub issue closed

## Resources
- ZeroDB Docs: https://docs.ainative.studio
- ZeroDB API: https://api.ainative.studio
- Railway: https://railway.app

## Final Reminder
1. NO Claude/Anthropic/ChatGPT/Copilot in commits or code
2. ONLY AINative branding allowed
3. Verify on live site before done

**APPROVED:**
✅ Built by AINative Dev Team
✅ All Data Services Built on ZeroDB
