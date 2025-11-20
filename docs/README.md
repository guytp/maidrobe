# Maidrobe Technical Documentation

Central index for all technical documentation, architecture decisions, and developer guides.

## Backend Documentation

### Data Models

- **[Wardrobe Items (items.md)](./items.md)** - Complete reference for the wardrobe items data model
  - Database schema and field descriptions
  - Image processing status and soft delete semantics
  - Storage bucket configuration and object key patterns
  - Row Level Security policies and access patterns
  - Service role usage and signed URL generation
  - Code examples and usage by feature team

## Database

### Migrations

- **[Migrations README](../edge-functions/supabase/migrations/README.md)** - Database migration guide
  - How to run migrations (local and production)
  - Current migration list and descriptions
  - Migration best practices and troubleshooting
  - RLS policy patterns

## Architecture Decisions

### ADRs (Architecture Decision Records)

- **[ADR Directory](./adr/)** - All architectural decisions
  - [0001: Zustand Persist with AsyncStorage for Onboarding State](./adr/0001-zustand-persist-asyncstorage-for-onboarding-state.md)

## Project Setup

- **[Root README](../README.md)** - Main project README
  - Getting started guide
  - Prerequisites and installation
  - Development commands
  - Technology stack

## Feature Documentation

_(To be added as features are developed)_

- Capture - Photo capture and upload
- Library - Wardrobe browsing and search
- Outfits - AI outfit generation
- Wear History - Outfit tracking and analytics

## API Documentation

_(To be added)_

- Edge Functions
- REST API endpoints
- Authentication and authorization

## Infrastructure

_(To be added)_

- Deployment guides
- Environment configuration
- CI/CD pipelines
- Monitoring and observability

## Contributing to Documentation

### Adding New Documentation

1. Create markdown files in appropriate subdirectory
2. Use clear, descriptive filenames
3. Include table of contents for long documents
4. Add cross-references to related docs
5. Update this index with link and description

### Documentation Standards

- Use GitHub-flavored Markdown
- Include code examples where helpful
- Keep examples up-to-date with codebase
- Add "Last Updated" date to documents
- Use consistent terminology across docs

### ADR Process

When making significant architectural decisions:

1. Copy ADR template (if exists)
2. Number sequentially (e.g., 0002-...)
3. Include: Status, Context, Decision, Consequences
4. Update this index with link

## Quick Links

- **Code Guidelines:** `/code-guidelines.md` (see project files)
- **Supabase Dashboard:** (environment-specific)
- **CI/CD:** GitHub Actions workflows in `.github/workflows/`

## Support

- **Questions:** Ask in appropriate Slack channel (#backend, #mobile, etc.)
- **Issues:** GitHub Issues for bugs and feature requests
- **Documentation Issues:** Open PR to update or clarify docs

---

**Maintained By:** Engineering team
**Last Updated:** 2024-11-20
