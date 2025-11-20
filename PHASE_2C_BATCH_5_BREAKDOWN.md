# Phase 2C Batch 5: Models_Poll Extraction Plan

**Total Scope:** ~60 functions, ~1,100 lines

## Strategic Breakdown into Sub-batches

### Sub-batch 5A: Poll CRUD Core ✅ NEXT
**Estimated:** ~250 lines, ~8 functions
**Complexity:** Medium
**Dependencies:** DataAccess, Config

**Functions:**
- `createNewPoll` - Creates new poll with validation
- `updatePoll` - Updates existing poll
- `deletePoll` - Deletes poll and responses
- `copyPoll` - Deep copy poll
- `savePollNew` - Alternative save endpoint
- `saveDraft` - Save as draft (D- prefix)
- `duplicateQuestion` - Duplicate question within poll
- `writePollRows_` - Internal: Write poll to sheet
- `removePollRows_` - Internal: Delete poll from sheet

**Why start here:** Core CRUD is foundational and has clear inputs/outputs

---

### Sub-batch 5B: Poll Retrieval & Query
**Estimated:** ~350 lines, ~3 functions
**Complexity:** High (complex aggregations)
**Dependencies:** 5A, DataAccess, Analytics functions

**Functions:**
- `getPollForEditing` - Fetch poll for editor
- `getArchivedPolls` - All polls with analytics
- `getSecureAssessmentBookView` - Comprehensive book view (LARGE)

**Why second:** Depends on CRUD being established, complex queries

---

### Sub-batch 5C: Question Normalization & Validation
**Estimated:** ~200 lines, ~7 functions
**Complexity:** Medium-High (critical for image handling)
**Dependencies:** Config

**Functions:**
- `normalizeQuestionObject_` - fileIds → proxy URLs (CRITICAL)
- `normalizeSecureMetadata_` - Validate secure assessment metadata
- `normalizeSessionTypeValue_` - Normalize session types
- `isSecureSessionType_` - Boolean check
- `isSecureSessionPhase_` - Boolean check
- `buildSecureAvailabilityDescriptor_` - Availability window status
- `parseDateInput_` - Parse date strings
- `formatSecureDateLabel_` - Format dates for display

**Why third:** Used by both CRUD and retrieval, relatively self-contained

---

### Sub-batch 5D: Roster Management
**Estimated:** ~300 lines, ~9 functions
**Complexity:** Medium
**Dependencies:** DataAccess, Config

**Functions:**
- `createClassRecord` - Create new class
- `getRosterManagerData` - Get all classes/rosters
- `saveRoster` - Save/update roster (batch optimized)
- `bulkAddStudentsToRoster` - Add multiple students
- `renameClass` - Rename class across all sheets
- `deleteClassRecord` - Delete class and cleanup
- `getClasses_` - Cached class list
- `getRoster_` - Get roster for class
- `ensureClassExists_` - Create if doesn't exist

**Why fourth:** Roster is semi-independent, batch operations need care

---

### Sub-batch 5E: Image Management
**Estimated:** ~150 lines, ~5 functions
**Complexity:** Medium (Drive API)
**Dependencies:** Config, DriveApp

**Functions:**
- `uploadImageToDrive` - Upload base64 to Drive
- `getDriveFolder_` - Get/validate Drive folder
- `fixAllImagePermissions` - Utility for permissions
- `getWebAppUrl_` - Get web app base URL
- `saveMisconceptionTag` - Save misconception tags

**Why fifth:** Drive operations are isolated, good to extract separately

---

### Sub-batch 5F: Internal Helpers & Utilities
**Estimated:** ~100 lines, ~2 functions
**Complexity:** Low
**Dependencies:** Various

**Functions:**
- `getPolls_` - Cached poll fetcher (IMPORTANT)
- `getDataRangeValues_` - Sheet helper

**Why last:** Support functions used across the board

---

## Execution Strategy

1. **Sub-batch 5A (Poll CRUD Core)** ← START HERE
   - Most straightforward
   - Creates foundation for other batches
   - Clear inputs/outputs
   - ~30 minutes

2. **Sub-batch 5C (Normalization)** ← SECOND
   - Needed by both CRUD and retrieval
   - Image handling is critical
   - ~25 minutes

3. **Sub-batch 5F (Internal Helpers)** ← THIRD
   - getPolls_ is used everywhere
   - Quick to extract
   - ~15 minutes

4. **Sub-batch 5B (Retrieval)** ← FOURTH
   - Depends on 5A, 5C, 5F
   - Complex but now has dependencies ready
   - ~35 minutes

5. **Sub-batch 5D (Roster)** ← FIFTH
   - Relatively independent
   - Batch operations
   - ~30 minutes

6. **Sub-batch 5E (Images)** ← LAST
   - Drive operations
   - Cleanup and utilities
   - ~20 minutes

**Total Estimated Time:** ~2.5 hours across 6 sub-batches

---

## Success Criteria

After each sub-batch:
- [ ] Functions extracted to `_08_Models_Poll.gs`
- [ ] Legacy wrappers added
- [ ] Duplicates removed from Code.gs
- [ ] No undefined function errors
- [ ] Commit with clear message
- [ ] Push to branch

After all sub-batches:
- [ ] All ~60 functions extracted
- [ ] Models_Poll namespace complete
- [ ] Code.gs significantly reduced
- [ ] All existing calls work via wrappers
- [ ] Documentation updated

---

## Risk Mitigation

**High Risk Areas:**
- `normalizeQuestionObject_` - Image URLs MUST work
- `getArchivedPolls` - Complex aggregations
- `renameClass` - Multi-sheet updates

**Mitigation:**
- Extract carefully with ES5 syntax
- Preserve exact logic
- Test image proxy after normalization extraction
- Verify batch operations work

---

**Ready to begin Sub-batch 5A: Poll CRUD Core**
