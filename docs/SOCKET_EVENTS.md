# Socket Event Contract

Naming: `<resource>.<action>` (e.g. task.updated, message.created).

## Built-in (Phase 1)
- connect / disconnect: no authentication yet, no business data sent. Auth is added in Phase 7.

(Each future event documents: sender, receiver, payload, authorization, persisted?, client behavior.)