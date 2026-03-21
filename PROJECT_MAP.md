# Project Map

## 1) Frontend (Firebase Hosting)
- Path: `apps/frontend`
- Deploy: Firebase Hosting (`https://cognimail.web.app`)
- Main role: UI, auth, Firestore client, AI call from browser, task/calendar rendering

## 2) Backend API (Vercel)
- Path: `apps/backend-api`
- Deploy: Vercel (`cognimail-backend`)
- Main role: verify Firebase ID token, fetch IMAP, parse metadata, save raw emails/config to Firestore

## 3) Backend Worker Local (Windows)
- Path: `apps/backend-worker`
- Deploy: Local machine only
- Main role: run tray/agent on user PC, pull IMAP periodically, sync to Firestore

## Shared Models
- Path: `packages/shared`
- Main role: common types/schema

