# Spike: Effect filesystem watch

- Status: Complete
- Date: 2026-08-18
- Environment: Node.js 24.18.1 on x86_64 Linux, Effect 4.0.0-beta.103, `@effect/platform-node` 4.0.0-beta.103

## Question

Can `lpm dev` use Effect's filesystem service to watch registered package roots recursively and stop cleanly without another watcher library?

## API

`FileSystem.watch(path, { recursive: true })` returns `Stream<WatchEvent, PlatformError>`. Events have `Create`, `Update`, or `Remove` tags and a path relative to the watched root.

`Stream.debounce` can collapse a burst of filesystem events before materialization. Running the stream in the `lpm dev` scope closes the underlying Node watcher when the scope ends.

The watch options expose only `recursive`. They do not support ignored paths.

## Observations

- Recursive watching reported changes in existing nested directories.
- Directories created after the watcher started were watched recursively too.
- A single write produced several events. Consumers must expect duplicates.
- Interrupting the watcher fiber stopped subsequent events.
- Watching a missing root failed immediately with `PlatformError` whose reason was `NotFound`.
- The Node adapter discarded events when Node supplied no filename.
- Create and remove tags were not reliable when the watched root differed from the process working directory. Creating `root.txt` and `existing/nested.txt` produced `Remove` followed by `Update`.

The tag problem comes from the adapter checking the event's relative path against the process working directory when classifying Node's `rename` event. LPM normally runs in the consumer while watching package roots elsewhere, so it cannot rely on the tag.

## Decision

Use `FileSystem.watch(packageRoot, { recursive: true })` for the first `lpm dev` implementation.

Treat every received event as an invalidation signal. Do not branch on the event tag. Ignore events under `.git` and `node_modules`, then debounce the remaining stream and run a complete `npm-packlist` rescan and materialization.

Run one initial materialization when the session starts so correctness does not depend on receiving an event. Let a watch failure end the foreground session with a concrete error. Add no restart loop or periodic scan.

The user owns source build commands. The watcher only observes their output and keeps consumer materializations current.
