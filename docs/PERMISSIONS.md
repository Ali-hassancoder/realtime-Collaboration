# Roles and Permissions

Source of truth: server/src/modules/workspaces/workspace.permissions.js
REST middleware, services and (from Phase 7) Socket.IO handlers all use it.

Roles (highest first): owner > admin > manager ("Project manager") > member > guest.
Roles are workspace-level, stored on WorkspaceMember. Exactly one owner, created with the workspace.

## Matrix
| Action                                   | Owner | Admin | Manager | Member | Guest |
|------------------------------------------|:-----:|:-----:|:-------:|:------:|:-----:|
| workspace:read, member:read              |  Y    |  Y    |  Y      |  Y     |  Y    |
| workspace:update                         |  Y    |  Y    |         |        |       |
| workspace:delete                         |  Y    |       |         |        |       |
| member:invite / update / remove          |  Y    |  Y    |         |        |       |
| project:read                             |  Y    |  Y    |  Y      |  Y     |  Y*   |
| project:create / update / manage_members |  Y    |  Y    |  Y      |        |       |
| project:delete                           |  Y    |  Y    |         |        |       |
| task:read                                |  Y    |  Y    |  Y      |  Y     |  Y*   |
| task:create / update / assign            |  Y    |  Y    |  Y      |  Y     |       |
| task:delete                              |  Y    |  Y    |  Y      |        |       |
| comment: create, edit_own, delete_own    |  Y    |  Y    |  Y      |  Y     |  Y    |
| comment:delete_any                       |  Y    |  Y    |  Y      |        |       |
| message: read, create, edit_own, delete_own | Y  |  Y    |  Y      |  Y     |  Y    |
| message:delete_any                       |  Y    |  Y    |         |        |       |
| document:read                            |  Y    |  Y    |  Y      |  Y     |  Y*   |
| document:edit                            |  Y    |  Y    |  Y      |  Y     |       |
(* guests see only projects they were added to; enforced in Phase 5 via isProjectScoped)

## Rules
- Hierarchy: to change someone's role you must outrank both their current role and the new role.
  Admins therefore cannot manage admins; nobody can touch the owner. Same rule for invites.
- 'owner' cannot be assigned through the API (validation allows only ASSIGNABLE_ROLES).
- "Own" vs "any": use canModify(role, 'comment:delete', isAuthor).
- Unknown roles/actions are denied (including prototype keys like "constructor").
- The server returns `permissions` with each workspace so the client does not re-implement rules.
  Client checks only hide UI; the server always re-checks.

  ## Project enforcement (Phase 5)
project:read/create/update/delete/manage_members are now enforced by project.routes.js.
Guest scoping (isProjectScoped) is enforced in project.service.js (list) and project.middleware.js (single).

## Task enforcement (Phase 6)
task:read/create/update/assign/delete are enforced by task.routes.js. Moves and status changes need task:update.
Setting or changing an assignee also needs task:assign, and the assignee must be on the project team.
Task writes are rejected with 409 PROJECT_ARCHIVED while the project is archived; reads still work.

## Document enforcement (Phase 13)
document:read / document:edit are enforced exclusively over Socket.IO (there is no REST endpoint on the
Project Notes doc). Every doc.subscribe and every doc.update re-checks, against the database:
1. The socket is already in `project:{projectId}` (which itself required a room.join authorization).
2. The caller's WorkspaceMember still resolves to a role that has the required action.
3. If the caller is project-scoped (guest), they are still on the ProjectMember team.
A guest who loses team access mid-session cannot keep editing: the very next doc.update from that
socket is refused with FORBIDDEN (or PROJECT_NOT_FOUND if they were removed entirely). The realtime
layer also emits access.changed on the affected user room, which triggers a client-side room
re-join and therefore a fresh subscribe cycle.