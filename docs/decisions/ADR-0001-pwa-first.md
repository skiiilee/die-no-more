# ADR-0001: Mobile-first PWA

Status: Proposed
Date: 2026-11-05

## Context
The project supports indoor/outdoor plant management with photo capture, AI identification, health analysis, care logs and reminders.
Purpose: personal use by the owner. No commercial distribution is planned. Provider terms are still checked for personal, non-commercial use.

## Proposal
Use a mobile-first PWA built on Next.js and TypeScript, with Supabase for authentication, database and storage.

## Reasons
One codebase for mobile and desktop, web distribution, rapid iteration, and browser camera/upload support.

## Tradeoffs
Push notification support differs across platforms; offline storage and background work have constraints. Native app may be considered later if native-only requirements become critical.

## Decision
Pending user approval and Claude implementation feasibility review.

## Subsequent proposal (2026-11-09)
The owner later specified GitHub Pages hosting for a personal-use web app. See [ADR-0002](ADR-0002-github-pages-static-app.md) for a proposed React + Vite static front end and Supabase Edge Functions architecture. This note does not retroactively mark ADR-0001 as Accepted; the user must approve the replacement architecture.
