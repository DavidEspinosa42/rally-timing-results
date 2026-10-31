# Rally Stage Times

An offline-first web app for rally marshals. A marshal types in a car number
and the time shown by the event's timing equipment; the phone signs each entry
on the spot, so any later change is detectable, and sends the signed records to
a central database when there is a connection.

## Setup

Requires [pnpm](https://pnpm.io) 12 (the version in `packageManager`). pnpm
downloads and uses the Node.js version declared in `package.json`
(`devEngines.runtime`) for the project's scripts.

```sh
pnpm install
pnpm dev                # http://localhost:3000
pnpm build && pnpm start
```

Checks, all of which must pass before a change is done:

```sh
pnpm typecheck          # next typegen, then tsc --noEmit (TypeScript 7)
pnpm lint               # Biome; auto-fix with pnpm lint --write
pnpm test               # Vitest; one file: pnpm test path/to/file.test.ts
```

## Documentation

- [ROADMAP.md](ROADMAP.md): planned work and how to start on it.
- [AGENTS.md](AGENTS.md): instructions for coding agents: commands, layout,
  and the integrity rules every change must keep.
- [docs/domain.md](docs/domain.md): rally terms, the regulations the app
  relies on, and the reference event.
- [docs/landscape.md](docs/landscape.md): existing tools and practices, and
  where this app fits.
- [docs/adr/](docs/adr/): design decisions and why they were made.

## Data policy

This application strictly processes anonymized car numbers and timestamps. It
does not collect, process, or store personal user data, PII, or financial
records. All development relies on generated dummy data.

## Ownership

This is a 100% independent, personal side project. It is not related to,
sponsored by, or developed for any employer or client.

## License

Released under the MIT License. See [LICENSE](LICENSE).

## Not a timing system

This app does not measure time. Marshals manually enter times produced by the
event's existing timing equipment.
