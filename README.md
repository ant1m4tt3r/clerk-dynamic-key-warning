# Clerk: React "unique key prop" warning from ClerkProvider's own children

Minimal reproduction for a React key warning that comes from inside
`ClerkProvider` when it is rendered from a Server Component and given a large
prop (here the documented `localization` prop).

On every page load, React logs:

```
Each child in a list should have a unique "key" prop.

Check the render method of `__experimental_CheckoutProvider`. It was passed a child from ClerkProvider.
```

Nothing in this app renders a list — the array is created inside Clerk.

## Run it

```bash
npm install
cp .env.example .env.local   # then put your own pk_test_... in it
npm run dev
```

Open http://localhost:3000 and look at the browser console.

There is no `clerkMiddleware` and no `CLERK_SECRET_KEY` in this reproduction:
the warning is about element creation inside the provider and is independent of
auth state, so a publishable key alone is enough to see it.

## What triggers it

The trigger is a **large prop crossing the RSC boundary**, not the
`localization` prop specifically. In `app/layout.tsx` (a Server Component):

| `<ClerkProvider …>` props                                | Warning? |
| -------------------------------------------------------- | -------- |
| `dynamic localization={ptBR}`  ← current state of this repo | **yes**  |
| `localization={ptBR}` (no `dynamic`)                      | **yes**  |
| `dynamic` alone                                            | no       |
| `localization={{ signIn: { start: { title: "Hi" } } }}`     | no       |

Swapping the large `ptBR` object for a small one silences it, which is what
points at the payload rather than the prop.

On the older `@clerk/nextjs@7.4.0` the warning additionally required `dynamic`
(a large prop alone was not enough). On `7.7.4` the large prop alone does it.
The React Compiler is *not* required — this repo does not enable it.

## Why it happens

`NextClientClerkProvider` (`@clerk/nextjs/dist/esm/app-router/client/ClerkProvider.js`)
renders three **unkeyed** children into `ReactClerkProvider`:

```js
React.createElement(ReactClerkProvider, { ...mergedProps },
  React.createElement(RouterTelemetry, null),
  __internal_scriptsSlot != null ? __internal_scriptsSlot : React.createElement(ClerkScripts, null),
  children
)
```

That three-element array is forwarded as a single `props.children` through
`ClerkProviderBase` → `ClerkContextProvider` → `__experimental_CheckoutProvider`
(`@clerk/shared/react`), where React reconciles it as an array and key-checks
each entry.

The array is unkeyed either way; what the payload size changes is whether React
gets a chance to mark the entries as validated.

**1. Large props make React outline the children into their own rows.** The same
element, serialized two ways (from the flight payload in the page HTML):

```jsonc
// small localization prop — one 1.5 KB row, children inlined as elements
"__internal_scriptsSlot": ["$","$36",null,{…},"$1c","$5a",0],
"children":               ["$","$L5f",null,{…},null,"$5e",1]

// localization={ptBR} — one 74 KB row, children outlined into separate rows
"__internal_scriptsSlot": "$L5a",
"children":               "$L5b"
```

A `$L<id>` reference deserializes to a **lazy** node, not an element. (The last
field of an element tuple is React's `validated` flag — note the scripts slot
ships as `0`.)

**2. `validateChildKeys` can only mark a lazy that has already resolved.** From
`react.development.js`:

```js
function validateChildKeys(node) {
  isValidElement(node)
    ? node._store && (node._store.validated = 1)          // inlined element → marked
    : node.$$typeof === REACT_LAZY_TYPE &&
      ("fulfilled" === node._payload.status
        ? /* mark the resolved element */
        : node._store && (node._store.validated = 1));    // pending → marks the WRAPPER
}
```

When Clerk calls `createElement`, the outlined rows have not arrived yet, so the
lazy is still pending and the mark lands on the wrapper — never on the element
that eventually resolves.

**3. The reconciler resolves the lazy and checks that element.** From
`react-dom-client.development.js`:

```js
case REACT_LAZY_TYPE:
  (child = resolveLazy(child)), warnOnInvalidKey(returnFiber, workInProgress, child, knownKeys);
```

`warnForMissingKey` then sees `!child._store.validated && null == child.key` on
the resolved scripts-slot element (`validated: 0` above) and warns, naming the
reconciling parent (`__experimental_CheckoutProvider`) and the child's `_owner`
(`ClerkProvider`) — which is precisely the message text.

So payload size does not cause the bug, it only exposes it: the latent issue is
the unkeyed array, which is immune to any of this once the children carry keys.

## Suggested fix

Give the children keys where they are created, e.g. in the server provider
(`app-router/server/ClerkProvider.js`):

```js
const scriptsSlot = dynamic ? (
  <Suspense key="clerk-scripts">
    <DynamicClerkScripts … />
  </Suspense>
) : undefined;
```

and/or key the three children in `NextClientClerkProvider`. Keys make the array
immune regardless of how the flight payload is chunked, which is why this is
worth fixing at the source rather than treating it as a payload-size quirk.

The warning is development-only (React strips key validation in production
builds) and appears harmless, but it fires on every page load and reads like an
application bug, which sends people looking through their own components for a
list that does not exist.

## Environment

```
System:
  OS: macOS 26.5
  CPU: (12) arm64 Apple M4 Pro
Binaries:
  Node: 20.19.6
  npm: 10.8.2
Browsers:
  Chrome: 151.0.7922.109
npmPackages:
  @clerk/localizations: ^4.15.1 => 4.15.1
  @clerk/nextjs: ^7.6.4 => 7.7.4
  next: 16.3.0 => 16.3.0
  react: 19.2.6 => 19.2.6
  react-dom: 19.2.6 => 19.2.6
```

Transitively: `@clerk/react` 6.14.1, `@clerk/shared` 4.28.1.
