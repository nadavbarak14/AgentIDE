# Contracts: Mobile Extensions & Projects Relocation

No API contracts needed — this feature is frontend-only. All backend APIs (extension enable/disable, project CRUD, session metadata) already exist and require no changes.

## Existing APIs Used (Unchanged)

- `GET /api/extensions` — list available extensions
- `GET /api/sessions/:id/metadata` — get session metadata including enabled extensions
- `PUT /api/sessions/:id/extensions` — enable/disable extensions for a session
- `GET /api/projects` — list projects (used by projectTree)
- `POST /api/projects` — create project
