# Offload — Project TODO

## Phase 1: Foundation & Schema
- [x] Define database schema (households, household_members, events, tasks, routing_rules, household_rhythm, dismissed_inference_types)
- [x] Generate and apply migration SQL
- [x] Add DB query helpers in server/db.ts

## Phase 2: Visual Design System
- [x] Set up teal/green calm palette in index.css
- [x] Configure typography (Plus Jakarta Sans, reassuring tone)
- [x] Mobile-first layout with max-width container

## Phase 3: Onboarding Flow
- [x] Step 1: Household setup — collect both carer names
- [x] Step 2: Household rhythm seed — free-text weekly schedule parsed by AI
- [x] Step 3: Domain assignment — scrollable toggle list (Me / Partner / Ask) per category
- [x] Step 4: Optional nuance/exceptions per category (free-text, AI-parsed)
- [x] Persist onboarding state and redirect to dashboard on completion

## Phase 4: AI Pipeline (server-side)
- [x] LLM extraction: events + tasks from text input
- [x] LLM implicit task inference (non-obvious prep tasks)
- [x] LLM low-confidence flagging
- [x] LLM rhythm parsing (free-text → structured routing rules)
- [x] LLM contextual routing decisions
- [x] LLM birthday present suggestions (exactly 3 ideas)
- [x] Voice transcription via Whisper before LLM pipeline
- [x] Image upload → extract text via LLM vision → discard original immediately

## Phase 5: Routing Engine
- [x] Three-dimension rule matching (category × subject × qualifier)
- [x] Learn from user confirmations (save new rules)
- [x] Learn from task deletions (dismissed inference types with notification)
- [x] "Who should handle this?" prompt for unknown categories

## Phase 6: Task Processing Modal
- [x] Compact summary view (event + tasks at a glance)
- [x] Event / task separation display
- [x] Birthday present suggestion pop-up (3 ideas, non-blocking)
- [x] Routing confirmation UI
- [x] Recurrence suggestion prompt
- [x] Low-confidence "review this" flag

## Phase 7: Dashboard
- [x] "Who are you?" identity check on every open of household link
- [x] Per-person load score (weighted by urgency)
- [x] Imbalance signal icon/banner (configurable threshold, default 60/40)
- [x] My Load view (tasks for current user, sorted by urgency/deadline)
- [x] Partner's Load view
- [x] Household view (combined)
- [x] Quick-add bar (text, voice, image, URL)

## Phase 8: Task Management
- [x] Task lifecycle: open → snoozed → done
- [x] Inline edit (title, deadline)
- [x] Manual urgency override
- [x] Reassign task to other carer
- [x] Task deletion with dismissal learning

## Phase 9: Google Calendar Integration
- [x] Google OAuth flow for both carers
- [x] Push events to both carers' calendars
- [x] Push tasks with deadlines as all-day reminders to assigned carer only
- [x] Store Google Calendar token per member (as JSON in DB)

## Phase 10: Settings
- [x] Imbalance threshold configuration (default 60/40, configurable via LoadScoreBar)
- [x] Manage routing rules UI (Settings page)
- [x] Re-enable dismissed inference types UI (Settings page)
- [x] Household rhythm editing (Settings page)

## Phase 11: Tests & Polish
- [x] Vitest unit tests for tRPC procedures (14 passing)
- [x] Dismissal learning wired to task delete with confirmation toast
- [x] "Who should handle this?" prompt shown in modal when routing confidence is low
- [x] Routing suggestions (suggestBatch) used in TaskProcessingModal to pre-assign owners
- [x] Mobile-first responsive layout review
- [x] Empty states and loading skeletons (per-tab empty states in Dashboard)
- [x] Urgency badge and load bar styles added to index.css

## Phase 12: UX Refinements (user requests)
- [x] Remove landing page — root URL routes directly to onboarding or dashboard based on auth/household state

## Phase 13: No-Registration Refactor
- [x] Remove Manus OAuth requirement — app works without login
- [x] Household identified by shareToken stored in localStorage
- [x] Identity (which member you are) stored per-device in localStorage
- [x] "Who are you?" prompt only shown when identity is unknown/new device
- [x] All tRPC procedures switched from protectedProcedure to publicProcedure with householdToken auth
- [x] Onboarding creates household and stores token + memberId in localStorage
- [x] Shared link (/shared/:token) sets token in localStorage and asks identity if unknown

## Phase 15: Dashboard Layout Redesign
- [ ] Move load scores and task list to be the primary visible content on dashboard load
- [ ] Remove InputBar from the top of the dashboard
- [ ] Add a floating action button (FAB) with a + icon in the bottom-right corner
- [ ] FAB opens the input modal (text/image/voice) as a bottom sheet or dialog
- [ ] Quick-add shorthand text field accessible directly from the FAB tap
