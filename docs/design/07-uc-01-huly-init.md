# UC-01: `/huly init` — first-time project setup

> Bước 7/10. Size L — multi-step, branching, multi-system. Trace [04](./04-system.md)
> (config/client modules), [06](./06-api.md) (`/huly` command).

## Overview

User chạy `/huly init` trong project cwd → bind cwd → Huly {workspace, project}.
Trigger: first time dùng pi-huly trong repo, hoặc rebind. Outcome: tools auto-
resolve workspace+project từ cwd.

## Actors & Systems

| Actor/System | Vai trò |
|---|---|
| User (cwd) | chạy `/huly init`, nhập creds/project |
| `/huly` command | orchestrate flow |
| CredentialStore | findByName / addWorkspace (id-handle + workspace? field) |
| ConfigStore | bindProject(cwd) |
| ConnectionPool | getClient (verify token) |
| Huly | get_user_profile (verify), list_projects, create_project |

## Sequence (happy path)

```mermaid
sequenceDiagram
    participant U as User (cwd)
    participant C as /huly init
    participant Cr as CredentialStore
    participant P as ConnectionPool
    participant H as Huly
    U->>C: /huly init
    C->>U: prompt workspace name
    U-->>C: name
    C->>Cr: findByName(name)
    alt 0 match
        C->>U: prompt url
        U-->>C: url
        C->>U: prompt auth method (token | email+password)
        U-->>C: method
        alt token
            C->>U: prompt token (secret)
        else email+password
            C->>U: prompt email + password (secret)
        end
        U-->>C: auth
        C->>Cr: addWorkspace(id=name, {url, ...auth})
    else 1 match
        C->>C: reuse id
    else N match (same-name diff-URL)
        C->>U: prompt pick url (list urls)
        U-->>C: chosen
        C->>C: reuse chosen id
    end
    C->>P: getClient(id)
    P->>H: connect + get_user_profile
    H-->>P: user (verify token)
    P-->>C: client
    C->>H: list_projects
    H-->>C: projects[]
    alt link existing
        C->>U: pick project
        U-->>C: project
    else create new
        C->>U: prompt name + identifier
        U-->>C: {name,id}
        C->>H: create_project
    end
    C->>C: ConfigStore.bindProject(cwd, {workspace:id, project})
    C-->>U: status "bound cwd → ws/project, user X"
```

## Error Path

- **token invalid** (AuthError) → retry auth (loop), max 3.
- **Huly unreachable** (ConnectionError) → abort + hint check url/self-host.
- **no projects + create_project fail** → abort.
- **user cancel** → no bind (cwd stays unbound).

## Notes

- id-handle stable; same-name diff-URL disambiguate ONCE tại setup.
- bind persists cwd→{ws,project}; subsequent tool calls auto-resolve (FR-06).
- `findByName` trả array → disambiguate UI chỉ khi >1.
- **auth choice** (FR-20): user chọn token HOẶC email+password khi add workspace;
  api-client `connect` hỗ trợ cả 2.
- transport (ws|rest) = global config.json, KHÔNG chọn per-init.
