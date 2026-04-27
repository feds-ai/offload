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
- [x] Move load scores and task list to be the primary visible content on dashboard load
- [x] Remove InputBar from the top of the dashboard
- [x] Add a floating action button (FAB) with a + icon in the bottom-right corner
- [x] FAB opens the input modal (text/image/voice) as a bottom sheet or dialog
- [x] Quick-add shorthand text field accessible directly from the FAB tap

## Phase 16: Visual Design Polish
- [x] Replace plain circular FAB with a labelled pill CTA button (e.g. "+ Offload it")
- [x] Improve LoadScoreBar visual design with richer layout
- [x] Improve TaskCard visual design with better hierarchy and colour accents
- [x] Improve Dashboard header with subtle branding
- [x] Improve overall colour use and spacing for a more crafted feel

## Phase 17: Bug Fixes
- [x] Fix voice input "failed to fetch audio file" error — replaced storagePut + URL fetch with direct buffer-to-Whisper transcription (transcribeBuffer.ts)

## Phase 18: Visual Design Polish (decorative enhancements)
- [x] Add subtle organic blob/gradient background to app shell and key pages
- [x] Add decorative SVG/CSS accents to Onboarding (soft circles, wave dividers)
- [x] Enhance LoadScoreBar with richer gradient and decorative ring/glow
- [x] Add subtle card depth (layered shadows, micro-borders) to TaskCard
- [x] Polish Dashboard header with decorative background pattern
- [x] Improve Settings and SharedView page visual hierarchy and decoration
- [x] Refine global typography scale and spacing tokens

## Phase 19: Bug Fixes
- [x] Fix dismissal learning: "won't suggest again" toast should only fire after 3+ deletions of the same task type, not on first deletion

## Phase 20: Bug Fixes
- [x] Fix routing rules not saving — tasks offloaded but no rules appear in Settings
- [x] Fix category/domain assignment not being asked during task processing

## Phase 21: Enhancements
- [x] Add task completion celebration/nudge (confetti or warm toast) when a task is marked done
- [x] Add imbalance motivational sentence on Dashboard when load is unbalanced
- [x] Add profile picture upload for household members (avatar in Settings + member chips)
- [x] Add Household Calendar tab showing all events and recurring rhythm items
- [x] Add small category icon to each TaskCard (visible in card header/meta row)

## Phase 21: Enhancements (from user request)
- [x] Task completion celebration nudge (warm toast with emoji)
- [x] Imbalance motivational sentence in LoadScoreBar (rotating messages)
- [x] Profile picture upload for household members (Settings + LoadScoreBar + TaskCard owner chip)
- [x] Household Calendar tab in Dashboard (one-off events + weekly rhythm entries)
- [x] Category icon + label badge on each TaskCard

## Phase 22: LoadScoreBar Botanical Redesign
- [x] Replace percentage display with botanical growth rings (SVG arc per person, fills by task load)
- [x] Plant SVG inside each ring perks up (tall, vibrant) when load is lighter, droops (bent, muted) when heavier
- [x] Always-visible warm sentence: affirming when balanced, names heavier person when not
- [x] Remove all percentage numbers from LoadScoreBar

## Phase 23: Bug Fixes & Improvements
- [x] Calendar: add delete button to one-off events; hide weekly rhythm entries from "Next 14 days" upcoming list (too noisy)
- [x] After offloading: prompt user to review/edit the result and optionally add extra tasks
- [x] Fix: offloaded events not being added to the household calendar
- [x] Plants: make plant SVG bigger inside the growth rings
- [x] Fix: when deadline is not specified on a task, show no deadline in the edit view (not a default date)
- [x] Fix load balance: only show imbalance nudge when total tasks >= 4 AND one person has 2x+ the other's tasks (not 1 vs 0)

## Phase 24: Modal Review Clarity
- [x] TaskProcessingModal: make event vs task classification visually unmistakable — distinct headers, icons, colours, and a summary line at the top ("1 event · 2 tasks extracted")
- [x] Add a "Move to tasks" / "Move to calendar" toggle on each item so users can correct the AI classification before saving

## Phase 25: Modal Reclassification
- [x] Add per-item reclassification in TaskProcessingModal: event cards get "Move to tasks" button; task cards get "Move to calendar" button, with state updates so corrected items save to the right destination

## Phase 26: Boat Theme Redesign
- [x] LoadScoreBar: replace plant illustration with tilting SVG boat on water (tilt proportional to imbalance, calm water when balanced, choppy when imbalanced)
- [x] LoadScoreBar: replace plant icons in member circles with cargo/crate SVG icons (more crates as tasks increase)
- [x] LoadScoreBar: replace plant-themed status messages with boat-themed equivalents
- [x] Empty state: replace plant illustration with calm water boat SVG, change "All clear!" to "Calm waters!"
- [x] App icon: update to incorporate subtle boat/wave motif

## Phase 28: Google Calendar Integration
- [x] Remove built-in Calendar tab and HouseholdCalendar component from Dashboard
- [x] Set up Google Calendar OAuth flow (auth URL generation, callback handler, token storage per member)
- [x] Add "Connect Google Calendar" button in Settings for each member
- [x] Sync offloaded events to connected member's Google Calendar on creation
- [x] Show connected/disconnected status in Settings

## Phase 28 Status
- [x] Remove built-in Calendar tab and HouseholdCalendar component from Dashboard
- [x] Google Calendar OAuth backend (calendar.ts, calendarOAuth.ts) already built
- [x] Settings page already has Connect Google Calendar UI per member
- [x] Events sync to Google Calendar on creation via createCalendarEvent helper
- [x] GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET added via secrets — active on publish

## Phase 29: Bug Fixes
- [x] Fix Google Calendar OAuth 404: align redirect URI in calendarOAuth.ts to use /api/calendar/callback (not /calendar-callback)

## Phase 30: Google Calendar Connection Status Fix
- [x] Fix: getAuthUrl was not including state param (token + memberId) in Google OAuth URL — callback couldn't identify which member to save the token for
- [x] Fix: calendarOAuth.ts was building redirectUri from req.protocol+host (internal container URL) instead of the public domain — token exchange was failing with redirect_uri_mismatch
- [x] Fix: Settings page was not invalidating household query after OAuth redirect — stale members data showed "not connected" even after successful token save
- [x] Add per-member ConnectCalendarButton component that fetches its own auth URL with correct memberId in state
- [x] Add error logging to exchangeCodeForTokens for easier future debugging
- [x] Settings now invalidates household.getByToken on mount and on calendarConnected redirect

## Phase 31: UX Improvements (QA feedback)
- [x] Dismissed suggestions: remove the section from Settings entirely — it's noisy and not useful as a permanent list. Keep the dismissal learning logic but don't surface it in Settings.
- [x] Add "Responsibilities" concept: permanent/recurring mental load items that always weigh on an owner (not completable tasks). New DB table: responsibilities. Shown on Dashboard in a separate collapsible section per person. Counted in load score.
- [x] Auto-generate responsibilities from household rhythm when rhythm is saved (AI extracts recurring activities per person as responsibilities).
- [x] Allow manual add/remove of responsibilities from Dashboard or Settings.

## Phase 32: QA fixes
- [x] Responsibilities should count toward BOTH members' load (they are shared household burdens), not just the owner's score
- [x] Fix: offloading a task to partner does not create a Google Calendar event for the new owner
