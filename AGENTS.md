# AGENTS.md — Veritas Live Poll

## Definition of Done (student workflow)
We do NOT accept “verified” unless:
- Two concurrent browser profiles (Teacher + Student) show:
  1) Student open link → join succeeds
  2) Teacher sees student presence
  3) Student sees real question (no placeholder)
  4) Student submits response
  5) Teacher sees response update in realtime

## Mandatory debugging method
- Capture evidence from:
  - browser console logs
  - Firebase emulator logs
  - Security rule denial messages

## Security rules
- Never “fix” by opening reads/writes broadly.
- Prefer auth.uid as the canonical student identifier.

## Production-first requirement
- A fix is not accepted unless it is deployed to the live site and the teacher+student workflow is verified on the live domain.

## Safe instrumentation
- Debug logging must be gated behind ?debug=1 and default OFF.
- Never log tokens/secrets.
- Remove or disable debug mode after verification.
