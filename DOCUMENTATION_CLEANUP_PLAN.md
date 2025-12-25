# Veritas Documentation Cleanup Plan

**Generated**: 2025-12-25
**Status**: Pending Approval
**Goal**: Organize 16 documentation files into a clean, maintainable structure

---

## Executive Summary

After comprehensive audit, we have:
- ✅ **9 files to KEEP** (essential or actively maintained)
- 📦 **6 files to ARCHIVE** (historical audits, completed work)
- 🔄 **4 files to UPDATE/CONSOLIDATE** (dated or overlapping)
- ❓ **2 files pending review**

**No files recommended for deletion** - all have historical or technical value.

---

## Proposed Directory Structure

```
veritaslivepoll/
├── README.md                          # ✅ KEEP (just updated)
├── .gitignore                         # ✅ KEEP
├── .clasp.json                        # ✅ KEEP
├── package-lock.json                  # ✅ KEEP
│
├── docs/                              # 📁 NEW - Active Documentation
│   ├── ARCHITECTURE.md                # ⚠️ UPDATE - Sync with README
│   ├── AGENTS.md                      # ⚠️ UPDATE - Verify current
│   ├── DEPLOYMENT.md                  # ⚠️ CONSOLIDATE - Detailed deploy guide
│   ├── TROUBLESHOOTING.md             # ✅ KEEP - Standalone guide
│   ├── TRIGGER_SETUP_GUIDE.md         # ✅ CRITICAL - Write-behind ops
│   ├── SECURE_EXAMS.md                # ✅ KEEP - Technical reference
│   ├── VERIFICATION_GUIDE.md          # ❓ REVIEW
│   └── MANUAL_TEST_SCRIPTS.md         # ❓ REVIEW
│
└── docs/archive/                      # 📦 NEW - Historical Records
    ├── 2025-fixes/
    │   ├── CRITICAL_FIXES_APPLIED.md
    │   └── SECURITY_FIXES_2025-12-23.md
    ├── implementation-logs/
    │   └── IMPLEMENTATION_SUMMARY.md
    ├── security-audits/
    │   ├── RED_TEAM_AUDIT_REPORT.md
    │   └── SECURE_ASSESSMENT_AUDIT.md
    └── performance-audits/
        └── STRESS_TEST_AUDIT_REPORT.md
```

---

## Action Items

### Phase 1: Archive Historical Files (5 min)

```bash
# Create archive structure
mkdir -p docs/archive/{2025-fixes,implementation-logs,security-audits,performance-audits}

# Move completed audit reports
git mv CRITICAL_FIXES_APPLIED.md docs/archive/2025-fixes/
git mv SECURITY_FIXES_2025-12-23.md docs/archive/2025-fixes/
git mv IMPLEMENTATION_SUMMARY.md docs/archive/implementation-logs/
git mv RED_TEAM_AUDIT_REPORT.md docs/archive/security-audits/
git mv SECURE_ASSESSMENT_AUDIT.md docs/archive/security-audits/
git mv STRESS_TEST_AUDIT_REPORT.md docs/archive/performance-audits/

# Commit
git add -A
git commit -m "docs: Archive completed audit reports and fix logs

- Move historical security audits to docs/archive/security-audits/
- Move completed fixes to docs/archive/2025-fixes/
- Move implementation logs to docs/archive/implementation-logs/
- Move performance audits to docs/archive/performance-audits/
- Preserves history for compliance and future reference"
```

### Phase 2: Organize Active Docs (5 min)

```bash
# Create docs folder
mkdir -p docs

# Move active documentation
git mv ARCHITECTURE.md docs/
git mv AGENTS.md docs/
git mv DEPLOYMENT.md docs/
git mv TROUBLESHOOTING.md docs/
git mv TRIGGER_SETUP_GUIDE.md docs/
git mv SECURE_EXAMS.md docs/
git mv VERIFICATION_GUIDE.md docs/  # if keeping after review
git mv MANUAL_TEST_SCRIPTS.md docs/  # if keeping after review

# Commit
git add -A
git commit -m "docs: Reorganize active documentation into docs/ folder

- Move 6-8 active docs to docs/ for better organization
- Keep README.md at root (standard)
- Separates active docs from source code"
```

### Phase 3: Update ARCHITECTURE.md (15 min)

**Current Issues:**
- Last updated Nov 10 (doesn't mention Firebase)
- Doesn't match new README's "Write-Behind" pattern explanation
- Missing exam system architecture

**Updates Needed:**
1. Add Firebase RTDB section (fast path for lock status)
2. Update architecture diagram to match new README
3. Add exam module architecture
4. Update file structure to show 25 .gs files + 18 .html files
5. Change date to 2025-12-25

**Action:**
- Review ARCHITECTURE.md against new README
- Add missing Firebase integration details
- Update diagrams
- Commit: `docs: Update ARCHITECTURE.md to reflect Firebase hybrid architecture`

### Phase 4: Update AGENTS.md (15 min)

**Current Issues:**
- Last updated Dec 22 (recent)
- May not reflect all 25 .gs files identified in audit
- Needs verification against actual codebase

**Updates Needed:**
1. Add exam system agents (Veritas_Exams.gs, Veritas_QuestionBank.gs, etc.)
2. Add API_Exposed_Exams.gs
3. Update dependency graph
4. Verify all listed agents still exist with correct names

**Action:**
- Cross-reference against actual file list from audit
- Add missing agents
- Update dependencies
- Commit: `docs: Update AGENTS.md with exam system components`

### Phase 5: Update TODO.md (10 min)

**Current Status:** Dated Nov 10, says "Production-Ready v2.0"

**Options:**

**Option A: DELETE** (Recommended if using GitHub Issues)
```bash
git rm TODO.md
git commit -m "docs: Remove TODO.md (using GitHub Issues for task tracking)"
```

**Option B: MAJOR UPDATE** (If keeping)
```markdown
# Veritas Live Poll - Roadmap

**Last Updated**: 2025-12-25
**Status**: ✅ Production Stable
**Next Version**: v2.2 (Analytics Module)

## Recently Completed
- ✅ v2.1 (Dec 2025): Comprehensive README rewrite with architecture audit
- ✅ v2.0 (Nov 2025): UI modernization, proctoring enhancements
- ✅ Firebase RTDB integration for real-time lock status

## Current Focus
- 🚧 Documentation cleanup and organization
- 📋 Exam module testing and validation

## Future Roadmap (Prioritized)
1. **Analytics Dashboard** (Q1 2026) - Post-session psychometrics
2. **Question Bank Enhancements** (Q1 2026) - Advanced tagging
3. **LMS Integration** (Q2 2026) - Canvas/Blackboard/Moodle
```

### Phase 6: Update README Links (5 min)

After moving files to `/docs/`, update README.md references:

```markdown
### Documentation

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Technical deep-dive
- **[docs/AGENTS.md](docs/AGENTS.md)** - System components guide
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Detailed deployment guide
- **[docs/TRIGGER_SETUP_GUIDE.md](docs/TRIGGER_SETUP_GUIDE.md)** - CRITICAL: Write-behind trigger setup
- **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[docs/SECURE_EXAMS.md](docs/SECURE_EXAMS.md)** - Exam module technical reference
```

---

## Files Requiring Manual Review

### 1. VERIFICATION_GUIDE.md
**Check:**
- Is this still used for QA testing?
- Does it duplicate content now in README troubleshooting section?
- Does it have unique test procedures not documented elsewhere?

**Decision Matrix:**
- If **actively used** → Move to `docs/VERIFICATION_GUIDE.md`
- If **superseded** → Archive to `docs/archive/testing/VERIFICATION_GUIDE.md`
- If **redundant** → Delete (git retains history)

### 2. MANUAL_TEST_SCRIPTS.md
**Check:**
- Are these test scripts still run before releases?
- Have they been replaced by automated tests?
- Do they duplicate VERIFICATION_GUIDE.md?

**Decision Matrix:**
- If **actively used** → Move to `docs/MANUAL_TEST_SCRIPTS.md`
- If **superseded** → Archive to `docs/archive/testing/MANUAL_TEST_SCRIPTS.md`
- If **redundant** → Delete (git retains history)

---

## Deployment.md Consolidation Strategy

**Current Overlap with README:**
- README has 8-step installation (lines 123-250)
- DEPLOYMENT.md has more detailed version with screenshots

**Recommendation: Keep Both**

**README.md** (Quick Start):
- High-level overview
- Essential steps only
- Links to detailed guide

**docs/DEPLOYMENT.md** (Detailed Guide):
- Step-by-step with screenshots
- Troubleshooting each step
- Alternative deployment methods (clasp vs manual)
- Advanced configuration options

**Update README** to link:
```markdown
## Prerequisites & Installation

### Quick Start (5 steps)
[Brief installation steps...]

**For detailed deployment guide with screenshots**: See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
```

---

## Timeline Estimate

| Phase | Time | Complexity |
|-------|------|------------|
| Archive historical files | 5 min | Low |
| Organize active docs | 5 min | Low |
| Update ARCHITECTURE.md | 15 min | Medium |
| Update AGENTS.md | 15 min | Medium |
| Update TODO.md | 10 min | Low |
| Update README links | 5 min | Low |
| Review VERIFICATION/MANUAL_TEST | 10 min | Low |
| **Total** | **~60 min** | **Medium** |

---

## Success Criteria

After cleanup, the repository should have:

✅ **Clear documentation hierarchy**
- Root README for quick start
- `/docs/` for technical references
- `/docs/archive/` for historical records

✅ **No outdated documentation**
- All active docs updated to 2025-12-25
- All references to old architecture removed
- All links functional

✅ **Preserved history**
- No deleted files (archives instead)
- Git history intact for compliance
- Audit trail maintained

✅ **Improved discoverability**
- README lists all active docs with descriptions
- Related docs grouped in `/docs/`
- Historical docs separated but accessible

---

## Rollback Plan

If cleanup causes issues:

```bash
# Revert all changes
git reset --hard HEAD~N  # N = number of commits made

# OR cherry-pick specific reverts
git revert <commit-hash>

# Restore specific file
git checkout HEAD~1 -- path/to/file.md
```

---

## Next Steps

1. **Review this plan** - Approve or suggest modifications
2. **Execute Phase 1-2** - Quick reorganization (10 min)
3. **Review VERIFICATION/MANUAL_TEST** - Determine fate of these files
4. **Execute Phase 3-6** - Content updates (~45 min)
5. **Push to branch** - Create PR for review

---

## Questions for Maintainer

Before proceeding, please clarify:

1. **TODO.md**: Delete or major update?
2. **VERIFICATION_GUIDE.md**: Still actively used for QA?
3. **MANUAL_TEST_SCRIPTS.md**: Still run before releases?
4. **GitHub Issues**: Using for task tracking (would replace TODO.md)?
5. **Archive naming**: Prefer `archive/` or `deprecated/`?

---

**Ready to execute?** Confirm and I'll begin implementation.
