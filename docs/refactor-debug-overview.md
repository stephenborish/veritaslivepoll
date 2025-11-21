# Refactor Debug Overview

## Commit checkpoints
- **Last known good (pre-refactor)**: `c61e8b9` – final merge before the modular refactor begins (UI/text styling fixes for live polls and assessments).
- **Current refactored state**: `d6c3c08` – HEAD of the refactored modular codebase with recent fixes layered on top.

## Modular architecture snapshot
- **Core & Environment**: `_01_Core.gs` establishes the global `Veritas` namespace and version metadata to be available before other modules load.
- **Configuration**: `_02_Config.gs` centralizes teacher auth settings, token keys, sheet names, and column indices that downstream modules reference.
- **Cross-cutting utilities**: `_03_Logging.gs` provides standardized logging/error wrappers; `_04_Security.gs` and `_05_Utils.gs` host security helpers and general utilities shared across modules.
- **Data access layer**: `_06_DataAccess.gs` attaches `Veritas.Data` with spreadsheet/Drive/property helpers used by higher layers.
- **Domain models**: `_07_Models_Poll.gs`, `_08_Models_Session.gs`, and `_09_Models_Analytics.gs` live under `Veritas.Models.*` for poll CRUD, session management, and analytics logic.
- **APIs**: `_10_TeacherApi.gs` and `_11_StudentApi.gs` expose role-aware operations that wrap model/data calls with teacher or token validation.
- **Routing & exposure**: `_12_Routing.gs` manages template rendering and role-based entrypoints, while `_13_ExposedApi.gs` maps public `google.script.run` functions and `doGet`/`include` to the modular APIs.
- **Dev utilities**: `_14_DevTools.gs` retains helper routines for local/testing support.

These notes provide the baseline for diagnosing refactor breakages without modifying application code yet.

## Fixed issues summary
- Restored global availability of inline teacher dashboard handlers (`showDashboard`, `openPollCreator`, and student insights filters) that were hidden by the refactor's IIFE encapsulation.
- Documented legacy dashboard widgets (recent sessions and activity pulse) whose containers were removed from the HTML to avoid reintroducing warnings if their renderers are reactivated.
