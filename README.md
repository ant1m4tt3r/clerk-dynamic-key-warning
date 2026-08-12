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

That three-element array is then forwarded as a single `props.children` through
`ClerkProviderBase` → `ClerkContextProvider` → `__experimental_CheckoutProvider`
(`@clerk/shared/react`), where React reconciles it as an array child and checks
each element for a key.

Elements normally carry React's "created in a static position" mark, so no
warning is emitted. When the provider's props are large enough that the flight
payload places `children` in a separate chunk, the deserialized element arrives
without that mark, and React reports the unkeyed array — attributing the child
to its owner, `ClerkProvider`.

Inspecting the fiber tree confirms the shape (`CheckoutProvider` holding a
3-element children array, the RSC-deserialized entries having no `_owner`).

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

and/or key the three children in `NextClientClerkProvider`.

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
