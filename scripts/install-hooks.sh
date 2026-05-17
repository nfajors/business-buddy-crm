#!/bin/bash
# Install AINative git hooks for Business Buddy CRM
# Run once after cloning: bash scripts/install-hooks.sh

HOOKS_DIR=".git/hooks"
REPO_ROOT="$(git rev-parse --show-toplevel)"

echo "Installing AINative git hooks..."

# ── commit-msg: blocks third-party AI attribution ──────────────────────────
cat > "$REPO_ROOT/$HOOKS_DIR/commit-msg" << 'HOOK'
#!/bin/bash
# Commit Message Hook - AI Attribution Enforcement
COMMIT_MSG_FILE=$1
echo "🔍 Checking commit message for AI attribution..."
if grep -qiE "(claude|anthropic|chatgpt|openai.*generated|copilot.*generated|co-authored-by:.*claude|co-authored-by:.*chatgpt|co-authored-by:.*copilot|generated with claude|generated with chatgpt|generated with.*https://claude\.com)" "$COMMIT_MSG_FILE"; then
    echo "❌ ERROR: Commit message contains FORBIDDEN third-party AI attribution!"
    echo ""
    echo "✅ ALLOWED - Use AINative branding instead:"
    echo "  - Built by AINative Dev Team"
    echo "  - Built Using AINative Studio"
    echo "  - All Data Services Built on ZeroDB"
    echo "  - Developed with Cody"
    echo ""
    echo "📖 See .ainative/git-rules.md for complete guidelines"
    exit 1
fi
echo "✅ Commit message: PASS"
exit 0
HOOK

# ── pre-commit: blocks wrong file placement ─────────────────────────────────
cat > "$REPO_ROOT/$HOOKS_DIR/pre-commit" << 'HOOK'
#!/bin/bash
# Pre-Commit Hook — File Placement Enforcement
echo "🔍 Checking file placement rules..."
ERRORS=0
STAGED=$(git diff --cached --name-only)
for FILE in $STAGED; do
  if echo "$FILE" | grep -qE "^[^/]+\.md$"; then
    BASENAME=$(basename "$FILE")
    if [[ "$BASENAME" != "README.md" && "$BASENAME" != "CLAUDE.md" ]]; then
      echo "❌ FORBIDDEN: Root-level .md file: $FILE"
      echo "   → Move to docs/{category}/$BASENAME"
      ERRORS=$((ERRORS + 1))
    fi
  fi
  if echo "$FILE" | grep -qE "^[^/]+\.sh$"; then
    echo "❌ FORBIDDEN: Root-level .sh file: $FILE"
    echo "   → Move to scripts/$(basename "$FILE")"
    ERRORS=$((ERRORS + 1))
  fi
done
if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "❌ ERROR: $ERRORS file placement violation(s) found."
  echo "  - .md files → docs/{category}/filename.md"
  echo "  - .sh files → scripts/filename.sh"
  echo "  - Exceptions: README.md and CLAUDE.md may live in root"
  echo "📖 See .ainative/CRITICAL_FILE_PLACEMENT_RULES.md"
  exit 1
fi
echo "✅ File placement: PASS"
exit 0
HOOK

chmod +x "$REPO_ROOT/$HOOKS_DIR/commit-msg"
chmod +x "$REPO_ROOT/$HOOKS_DIR/pre-commit"

echo "✅ Hooks installed:"
echo "   - commit-msg  (blocks AI attribution)"
echo "   - pre-commit  (enforces file placement)"
echo ""
echo "Built by AINative Dev Team"
